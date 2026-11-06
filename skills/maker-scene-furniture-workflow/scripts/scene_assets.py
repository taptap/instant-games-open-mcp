"""Bake a reviewed scene recipe into portable assets and optional canvas previews."""
import argparse
import hashlib
import json
import math
import re
import shutil
import zipfile
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def number(value, minimum, maximum, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError('Invalid ' + name)
    return value


def source_path(root, name):
    root = root.resolve()
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError('Sources must be relative to --source-root')
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Missing source or path outside source root: ' + name)
    return path


def box(value, name, bounds=None, integer=False):
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError('Expected xywh: ' + name)
    x, y, w, h = [number(n, -100000, 100000, name) for n in value]
    if w <= 0 or h <= 0 or (integer and any(int(n) != n for n in value)):
        raise ValueError('Invalid dimensions: ' + name)
    if bounds and (x < 0 or y < 0 or x+w > bounds[0] or y+h > bounds[1]):
        raise ValueError('Box outside image: ' + name)
    return value


def pose(progress, motion):
    if progress >= 1:
        return 1., 1., 0.
    growth = 1 - math.exp(-7*progress)*math.cos(13*progress)
    if motion == 'unfurl':
        return 1., max(.03, growth), 0.
    if motion == 'hang':
        return 1., 1., -.25*(1-progress)**2 + .05*math.sin(12*progress)*(1-progress)
    return (max(.04, growth+.15*math.exp(-5*progress)*math.sin(17*progress)),
            max(.03, growth), -.18*math.sin(math.pi*progress)*math.exp(-2*progress))


def load_recipe(root, filename):
    recipe = json.loads(filename.read_text(encoding='utf-8'))
    if recipe.get('version') != 1:
        raise ValueError('Expected recipe version 1')
    size = recipe['size']
    if len(size) != 2 or any(type(n) is not int or not 0 < n <= 8192 for n in size):
        raise ValueError('Invalid scene size')
    for field in ('background', 'reference'):
        with Image.open(source_path(root, recipe[field])) as image:
            if list(image.size) != size:
                raise ValueError(field + ' dimensions differ from scene size')
    objects = recipe['objects']
    if not isinstance(objects, list) or not 1 <= len(objects) <= 200:
        raise ValueError('Expected 1..200 instances')
    specs = {}
    for item in objects:
        ident = item['id']
        if not isinstance(ident, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', ident) or ident.casefold() in specs:
            raise ValueError('Unsafe or duplicate instance ID')
        specs[ident.casefold()] = item
        box(item['bbox'], ident, size, integer=True)
        item.setdefault('speed', 1)
        item.setdefault('parent', None)
        item.setdefault('category', 'furniture')
        number(item['speed'], .01, 100, 'instance speed')
        number(item['start'], 0, 86400, 'start seconds')
        number(item['zIndex'], -100000, 100000, 'zIndex')
        if not item.get('reuseOf'):
            source_path(root, item['source'])
            if item['motion'] not in ('spring', 'rock', 'slide', 'unfurl', 'hang', 'roll', 'sequence'):
                raise ValueError('Unsupported motion: ' + item['motion'])
            if item['motion'] == 'sequence':
                sequence = item['sequence']
                source_path(root, sequence['image'])
                frames = sequence['frames']
                if not isinstance(frames, list) or not 1 <= len(frames) <= 120:
                    raise ValueError('Sequence requires 1..120 explicit frames')
                for frame in frames:
                    number(frame['durationMs'], 1, 86400000, 'frame duration')
                box(item['animationBox'], ident + ' animationBox')
            else:
                number(item['duration'], .05, 6, 'duration seconds')
                number(item.get('fps', 20), 1, 30, 'fps')
                if len(item['pivot']) != 2:
                    raise ValueError('Expected pivot [x, y]')
                for n in item['pivot']:
                    number(n, 0, 1, 'pivot')
    by_id = {item['id']: item for item in objects}
    for item in objects:
        owner = by_id.get(item.get('reuseOf')) if item.get('reuseOf') else item
        if not owner or owner.get('reuseOf') or (owner is not item and not item.get('reuseReason')):
            raise ValueError('Reuse needs a canonical asset and reviewed reason: ' + item['id'])
        if owner is not item:
            for key in ('motion', 'duration', 'pivot', 'sequence', 'fps'):
                if key in item and item[key] != owner.get(key, 20 if key == 'fps' else None):
                    raise ValueError('Reuse cannot redefine animation: ' + item['id'])
            if owner['motion'] == 'sequence':
                box(item['animationBox'], item['id'] + ' animationBox')
        seen = {item['id']}
        parent = item.get('parent')
        while parent is not None:
            if parent not in by_id or parent in seen:
                raise ValueError('Unknown or cyclic support: ' + item['id'])
            if by_id[parent]['zIndex'] >= item['zIndex']:
                raise ValueError('Props must draw above their support: ' + item['id'])
            seen.add(parent)
            parent = by_id[parent].get('parent')
    number(recipe.get('playback', {}).get('speed', 1), .01, 100, 'scene speed')
    return recipe


def static_image(root, spec):
    with Image.open(source_path(root, spec['source'])) as source:
        image = source.convert('RGBA')
    if 'extractRect' in spec:
        x1, y1, x2, y2 = spec['extractRect']
        box([x1, y1, x2-x1, y2-y1], 'extractRect', image.size, integer=True)
        image = image.crop((x1, y1, x2, y2))
    if spec.get('clipPolygon'):
        mask = Image.new('L', image.size)
        points = []
        for x, y in spec['clipPolygon']:
            number(x, 0, 1, 'clip x'); number(y, 0, 1, 'clip y')
            points.append((round(x*image.width), round(y*image.height)))
        ImageDraw.Draw(mask).polygon(points, fill=255)
        image.putalpha(ImageChops.darker(image.getchannel('A'), mask))
    bounds = image.getchannel('A').point(lambda a: 255 if a > 30 else 0).getbbox()
    if not bounds:
        raise ValueError('Empty asset: ' + spec['id'])
    return image.crop(bounds).resize(tuple(spec['bbox'][2:]), Image.Resampling.LANCZOS)


def bake(image, spec):
    duration = round(spec['duration']*1000)
    count = max(2, round(spec['duration']*spec.get('fps', 20)))
    if count > 120:
        raise ValueError('Animation exceeds 120 frames: ' + spec['id'])
    if spec['motion'] == 'roll':
        return bake_roll(image, duration, count)
    if spec['motion'] in ('rock', 'slide'):
        return bake_sway(image, spec, duration, count)
    w, h = image.size
    px, py = spec['pivot']
    positions = []
    for i in range(count):
        sx, sy, dy = pose(i/(count-1), spec['motion'])
        rw, rh = max(1, round(w*sx)), max(1, round(h*sy))
        positions.append((round((w-rw)*px), round((h-rh)*py+dy*h), rw, rh))
    left, top = min(0, min(p[0] for p in positions))-2, min(0, min(p[1] for p in positions))-2
    right, bottom = max(w, max(p[0]+p[2] for p in positions))+2, max(h, max(p[1]+p[3] for p in positions))+2
    size = (right-left, bottom-top)
    if max(size) > 4096:
        raise ValueError('Frame exceeds 4096 pixels: ' + spec['id'])
    frames = []
    for i, (x, y, rw, rh) in enumerate(positions):
        frame = Image.new('RGBA', size)
        frame.alpha_composite(image.resize((rw, rh), Image.Resampling.LANCZOS), (x-left, y-top))
        # Distribute rounding over frames so arbitrary durations remain exact.
        frames.append((frame, round((i+1)*duration/count)-round(i*duration/count)))
    return frames, [-left, -top, w, h]


def sway_pose(t, motion):
    if t >= 1:
        return 1., 1., 0., 0.
    if motion == 'rock':
        growth = 1-(1-min(1, t/.45))**3
        return (1+.04*math.sin(10*t)*math.exp(-4*t),
                .1+.9*growth, 0., 12*(1-t)**2*math.cos(3*math.pi*t))
    growth = 1-(1-min(1, t/.35))**3
    return (.75+.25*growth, .3+.7*growth+.08*math.sin(10*t)*math.exp(-4*t),
            -.3*math.exp(-5*t)*math.cos(3*math.pi*t)*(1-t),
            4*math.exp(-3*t)*math.sin(4*math.pi*t)*(1-t))


def bake_sway(image, spec, duration, count):
    """Bake pivoted rocking/sliding, including rotation in the shared frame bounds."""
    w, h = image.size
    px, py = w*spec['pivot'][0], h*spec['pivot'][1]
    transforms, corners = [], [(0, 0), (w, h)]
    for i in range(count):
        sx, sy, dx, degrees = sway_pose(i/(count-1), spec['motion'])
        angle = math.radians(degrees)
        a, b = math.cos(angle)*sx, -math.sin(angle)*sy
        c, d = math.sin(angle)*sx, math.cos(angle)*sy
        tx, ty = px+dx*w-a*px-b*py, py-c*px-d*py
        transforms.append((a, b, c, d, tx, ty))
        corners.extend((a*x+b*y+tx, c*x+d*y+ty) for x,y in [(0,0),(w,0),(0,h),(w,h)])
    left = math.floor(min(x for x,y in corners))-2
    top = math.floor(min(y for x,y in corners))-2
    size = (math.ceil(max(x for x,y in corners))-left+2,
            math.ceil(max(y for x,y in corners))-top+2)
    if max(size) > 4096:
        raise ValueError('Frame exceeds 4096 pixels: ' + spec['id'])
    frames = []
    for i,(a,b,c,d,tx,ty) in enumerate(transforms):
        frame = Image.new('RGBA', size)
        if i == count-1:
            frame.alpha_composite(image, (-left, -top))
        elif i > 0:
            determinant = a*d-b*c
            # Pillow maps output pixels back to the source, including union padding.
            inverse = (d/determinant, -b/determinant,
                       (d*(left-tx)-b*(top-ty))/determinant,
                       -c/determinant, a/determinant,
                       (-c*(left-tx)+a*(top-ty))/determinant)
            frame = image.transform(size, Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
        frames.append((frame, round((i+1)*duration/count)-round(i*duration/count)))
    return frames, [-left, -top, w, h]


def bake_roll(image, duration, count):
    """Unroll toward image bottom, preserving revealed pixels and the exact final image."""
    w, h = image.size
    padding = max(4, round(h*.48))
    size = (w+4, h+padding+4)
    if max(size) > 4096:
        raise ValueError('Roll frame exceeds 4096 pixels')
    alpha = image.getchannel('A').point(lambda value: 255 if value > 128 else 0)
    frames = []
    for i in range(count):
        frame = Image.new('RGBA', size)
        if i == count-1:
            frame.alpha_composite(image, (2, padding))
        elif i > 0:
            progress = i/(count-1)
            travel = progress*progress*(3-2*progress)
            front = min(h-1, max(1, round(h*travel)))
            frame.alpha_composite(image.crop((0, 0, w, front)), (2, padding))
            remaining = alpha.crop((0, front, w, h)).getbbox()
            if remaining:
                left, _, right, _ = remaining
                # Remaining cloth winds around a shrinking cylinder. Sampling arcs
                # moves its texture while already laid cloth stays fixed in place.
                radius = max(1, round(h*.22*math.sqrt(1-travel)))
                roll_height = 2*radius
                cap_width = min(max(1, round(radius*.5)), max(1, (right-left)//4))
                for row in range(roll_height):
                    theta = math.acos(1-2*(row+.5)/roll_height)
                    source_y = min(h-1, front+round(theta*radius*.35))
                    bounds = alpha.crop((0, source_y, w, source_y+1)).getbbox()
                    if not bounds:
                        continue
                    strip = image.crop((bounds[0], source_y, bounds[2], source_y+1))
                    inset = round(cap_width*(1-math.sin(theta)))
                    strip = strip.resize((max(1, right-left-2*inset), 1), Image.Resampling.BICUBIC)
                    strip = ImageEnhance.Brightness(strip).enhance(.62+.48*math.sin(theta))
                    frame.alpha_composite(strip, (left+2+inset, padding+front-roll_height+row))
                sample_y = min(h-1, front+radius//2)
                sample_bounds = alpha.crop((0, sample_y, w, sample_y+1)).getbbox()
                if not sample_bounds:
                    frames.append((frame, round((i+1)*duration/count)-round(i*duration/count)))
                    continue
                sample_x = min(sample_bounds[2]-1, sample_bounds[0]+max(1, round((sample_bounds[2]-sample_bounds[0])*.04)))
                sample = image.getpixel((sample_x, sample_y))
                color = tuple(round(c*.8) for c in sample[:3])+(255,)
                outline = tuple(round(c*.55) for c in sample[:3])+(255,)
                draw = ImageDraw.Draw(frame)
                for cx in (left+2+cap_width, right+2-cap_width):
                    cy = padding+front-radius
                    draw.ellipse((cx-cap_width, cy-radius, cx+cap_width, cy+radius-1), fill=color, outline=outline)
                    if radius > 4:
                        draw.arc((cx-cap_width//2, cy-radius//2, cx+cap_width//2, cy+radius//2), 30, 330, fill=outline, width=1)
        frames.append((frame, round((i+1)*duration/count)-round(i*duration/count)))
    return frames, [2, padding, w, h]


def extract(root, spec):
    sequence = spec['sequence']
    with Image.open(source_path(root, sequence['image'])) as source:
        atlas = source.convert('RGBA')
    frames = []
    for frame in sequence['frames']:
        x, y, w, h = box(frame['rect'], 'sequence frame', atlas.size, integer=True)
        if frames and frames[0][0].size != (w, h):
            raise ValueError('Sequence frames must have equal untrimmed sizes')
        frames.append((atlas.crop((x, y, x+w, y+h)), frame['durationMs']))
    return frames, None


def preview(frames, folder, ident):
    cell, columns = 256, min(8, len(frames))
    rows = math.ceil(len(frames)/columns)
    sheet = Image.new('RGBA', (columns*cell, rows*cell))
    info, elapsed = [], 0
    for i, (frame, duration) in enumerate(frames):
        thumb = frame.copy(); thumb.thumbnail((cell, cell), Image.Resampling.LANCZOS)
        x, y = i % columns * cell, i // columns * cell
        sheet.alpha_composite(thumb, (x+(cell-thumb.width)//2, y+(cell-thumb.height)//2))
        info.append(dict(index=i, time=elapsed/1000, x=x, y=y, width=cell, height=cell, duration=duration))
        elapsed += duration
    sheet.save(folder/(ident+'.png'))
    return dict(fps=min(30, max(1, 1000*len(frames)/elapsed)), frameCount=len(frames),
                width=sheet.width, height=sheet.height, columns=columns, rows=rows, frames=info)


def export(root, recipe_path, output, preview_dir=None):
    root, recipe_path, output = root.resolve(), recipe_path.resolve(), output.resolve()
    preview_dir = preview_dir.resolve() if preview_dir else None
    recipe = load_recipe(root, recipe_path)
    archive = output.with_name(output.name+'.zip')
    for path in [output, archive] + ([preview_dir] if preview_dir else []):
        if path.exists():
            raise FileExistsError('Choose a new output path: ' + str(path))
    if preview_dir and (preview_dir == output or preview_dir.is_relative_to(output) or output.is_relative_to(preview_dir)):
        raise ValueError('Preview and final output must be separate directories')
    output.mkdir(parents=True)
    incomplete = output/'.incomplete'; incomplete.touch()
    if preview_dir:
        preview_dir.mkdir(parents=True); (preview_dir/'.incomplete').touch()
    (output/'background').mkdir()
    for field in ('background', 'reference'):
        with Image.open(source_path(root, recipe[field])) as image:
            image.convert('RGBA').save(output/'background'/(field+'.png'))
    assets, animations, preview_items = {}, {}, []
    for spec in recipe['objects']:
        if spec.get('reuseOf'):
            continue
        ident = spec['id']
        folder = output/'furniture'/ident
        (folder/'frames').mkdir(parents=True)
        image = static_image(root, spec); image.save(folder/'image.png')
        frames, image_rect = extract(root, spec) if spec['motion'] == 'sequence' else bake(image, spec)
        entries = []
        for i, (frame, duration) in enumerate(frames):
            file = 'frames/frame_%04d.png' % (i+1)
            frame.save(folder/file)
            entries.append(dict(file=file, durationMs=duration))
        data = dict(version=1, frameSize=list(frames[0][0].size), frameCount=len(frames),
                    durationMs=sum(f['durationMs'] for f in entries), loop=False, endBehavior='hold', frames=entries)
        if image_rect:
            data['finalImageRect'] = image_rect
        write_json(folder/'animation.json', data)
        animations[ident] = data
        assets[ident] = dict(id=ident, label=spec.get('label', ident), category=spec['category'],
                            directory='furniture/'+ident, image='furniture/'+ident+'/image.png',
                            animation='furniture/'+ident+'/animation.json')
        if preview_dir:
            preview_items.append(dict(assetId=ident, title=spec.get('label', ident), category=spec['category'],
                                      file=ident+'.png', frameSetInfo=preview(frames, preview_dir, ident)))
    instances = []
    for spec in recipe['objects']:
        asset_id = spec.get('reuseOf', spec['id']); animation = animations[asset_id]
        x, y, w, h = spec['bbox']
        if 'finalImageRect' in animation:
            ox, oy, iw, ih = animation['finalImageRect']; fw, fh = animation['frameSize']
            animation_box = [x-ox*w/iw, y-oy*h/ih, fw*w/iw, fh*h/ih]
        else:
            animation_box = spec['animationBox']
        instances.append(dict(id=spec['id'], assetId=asset_id, label=spec.get('label', spec['id']),
                              imageBox=spec['bbox'], animationBox=animation_box, startMs=round(spec['start']*1000),
                              speed=spec['speed'], parent=spec['parent'], zIndex=spec['zIndex']))
    scene = dict(version=2, size=recipe['size'], coordinates=dict(origin='top-left', unit='px', box='xywh'),
                 viewport=dict(fit='contain', align='center', clip=True),
                 playback=dict(speed=recipe.get('playback', {}).get('speed', 1), autoplay=False, endBehavior='hold'),
                 background='background/background.png', reference='background/reference.png',
                 assets=list(assets.values()), instances=instances)
    write_json(output/'scene.json', scene)
    shutil.copy2(Path(__file__).parent.parent/'references/game-integration.md', output/'README.md')
    for ident, animation in animations.items():
        for frame in animation['frames']:
            with Image.open(output/assets[ident]['directory']/frame['file']) as image:
                if list(image.size) != animation['frameSize'] or image.mode != 'RGBA':
                    raise ValueError('Exported frame mismatch: ' + ident)
                image.load()
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as bundle:
        for file in sorted(output.rglob('*')):
            if file.is_file() and file != incomplete:
                bundle.write(file, file.relative_to(output).as_posix())
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise ValueError('ZIP integrity check failed')
    incomplete.unlink()
    if preview_dir:
        write_json(preview_dir/'manifest.json', dict(items=preview_items))
        (preview_dir/'.incomplete').unlink()
    receipt = dict(directory=str(output), archive=str(archive), uniqueAssets=len(assets), instances=len(instances),
                   frames=sum(a['frameCount'] for a in animations.values()),
                   recipeSha256=hashlib.sha256(recipe_path.read_bytes()).hexdigest())
    print(json.dumps(receipt, ensure_ascii=False))
    return scene


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--preview-dir', type=Path)
    args = parser.parse_args()
    export(args.source_root.resolve(), args.recipe.resolve(), args.output.resolve(),
           args.preview_dir.resolve() if args.preview_dir else None)
