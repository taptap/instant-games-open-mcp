#!/usr/bin/env python3
"""Losslessly optimize demo PNG/JPEG files before upload; keep published content-addressed files."""
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'src/maker/demoResources.json'
FILES = ROOT / 'resources/maker-demo'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def pixels(filename):
    with Image.open(filename) as image:
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Animated images require a separate lossless check: ' + str(filename))
        # Verify decoded appearance and color metadata, including fully transparent RGB pixels.
        return (image.size, image.convert('RGBA').tobytes(), image.info.get('icc_profile'),
                image.info.get('gamma'), image.info.get('srgb'), image.info.get('exif'))

def main():
    for tool in ('oxipng', 'jpegtran'):
        if not shutil.which(tool):
            raise RuntimeError('Missing maintenance tool: ' + tool)
    manifest = json.loads(MANIFEST.read_text())
    remap, resources = {}, {}
    before = after = checked = 0
    with tempfile.TemporaryDirectory(prefix='maker-demo-optimize-') as temporary:
        for index, (old_id, entry) in enumerate(manifest['resources'].items(), 1):
            source = FILES / entry['file']
            original = source.read_bytes()
            if digest(original) != old_id or len(original) != entry['size']:
                raise ValueError('Resource identity mismatch: ' + entry['file'])
            result = original
            updated = dict(entry)
            if entry['type'] in ('image/png', 'image/jpeg') and not entry.get('lossless'):
                target = Path(temporary) / entry['file']
                command = (['oxipng', '-o', '2', '--preserve', '--out', str(target), str(source)]
                           if entry['type'] == 'image/png' else
                           ['jpegtran', '-copy', 'all', '-optimize', '-outfile', str(target), str(source)])
                subprocess.run(command, check=True, capture_output=True)
                original_pixels = pixels(source)
                if original_pixels != pixels(target):
                    raise ValueError('Lossless pixel/metadata verification failed: ' + entry['file'])
                candidate = target.read_bytes()
                if len(candidate) < len(original):
                    result = candidate
                updated['lossless'] = {'sourceSize': len(original), 'pixelSha256': digest(original_pixels[1])}
                checked += 1
            new_id = digest(result)
            updated.update(file=new_id + source.suffix, size=len(result), sha256=new_id)
            if new_id != old_id:
                updated.pop('cdn', None)
                destination = FILES / updated['file']
                if not destination.exists():
                    destination.write_bytes(result)
            remap[old_id] = new_id
            resources[new_id] = updated
            before += len(original)
            after += len(result)
            print(f'{index}/{len(manifest["resources"])} {len(original)} -> {len(result)}', flush=True)
    for entry in resources.values():
        if entry.get('thumbnail'):
            entry['thumbnail'] = remap[entry['thumbnail']]
    # Publish new identities before updating references; an interruption never breaks old references.
    manifest['resources'].update(resources)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    def replace(value):
        if isinstance(value, str):
            return remap.get(value, value)
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        if isinstance(value, list):
            return [replace(item) for item in value]
        return value
    for name in ('presetData', 'assetPresetData', 'modelPresetData', 'templateModelData', 'uiWorkflowData'):
        filename = ROOT / 'src/maker/canvas' / (name + '.json')
        filename.write_text(json.dumps(replace(json.loads(filename.read_text())), ensure_ascii=False, indent=2) + '\n')
    manifest['editor'] = replace(manifest['editor'])
    manifest['resources'] = resources
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'imagesChecked': checked, 'bytesBefore': before, 'bytesAfter': after,
                      'savedPercent': round((before-after)*100/before, 2)}))

if __name__ == '__main__':
    main()
