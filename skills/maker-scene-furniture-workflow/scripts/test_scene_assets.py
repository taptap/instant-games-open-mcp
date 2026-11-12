import contextlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw
from scene_assets import bake, export, load_recipe, sway_pose


class SceneAssetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        Image.new('RGBA', (160, 90), 'white').save(self.root/'room.png')
        Image.new('RGBA', (12, 18), 'red').save(self.root/'object.png')
        self.recipe = dict(version=1, size=[160, 90], background='room.png', reference='room.png',
            objects=[dict(id='stool', source='object.png', bbox=[10,20,12,18], motion='spring',
                          duration=.375, pivot=[.5,1], start=0, zIndex=1),
                     dict(id='copy', reuseOf='stool', reuseReason='same shape', bbox=[80,20,24,36],
                          start=.5, speed=2, zIndex=2)])
        self.path = self.root/'recipe.json'

    def save(self):
        self.path.write_text(json.dumps(self.recipe))

    def test_export_dedup_exact_duration_and_scaled_padding(self):
        self.save()
        with contextlib.redirect_stdout(io.StringIO()):
            scene = export(self.root, self.path, self.root/'output', self.root/'preview')
        self.assertEqual(len(scene['assets']), 1)
        animation = json.loads((self.root/'output/furniture/stool/animation.json').read_text())
        self.assertEqual(sum(f['durationMs'] for f in animation['frames']), 375)
        a,b = scene['instances']
        self.assertEqual(b['animationBox'][2], 2*a['animationBox'][2])
        self.assertEqual(b['speed'], 2)
        self.assertEqual(scene['playback']['autoplay'], False)
        self.assertFalse((self.root/'output/.incomplete').exists())
        self.assertTrue((self.root/'output/README.md').is_file())
        self.assertTrue((self.root/'preview/manifest.json').is_file())
        self.assertFalse((self.root/'preview/.incomplete').exists())
        with zipfile.ZipFile(self.root/'output.zip') as bundle:
            self.assertIsNone(bundle.testzip())
            self.assertIn('README.md', bundle.namelist())
            self.assertIn('scene.json', bundle.namelist())
        with self.assertRaises(FileExistsError):
            export(self.root, self.path, self.root/'output')

    def test_rejects_cycles_missing_assets_and_conflicting_reuse(self):
        self.recipe['objects'][0]['parent'] = 'copy'
        self.recipe['objects'][1]['parent'] = 'stool'
        self.save()
        with self.assertRaises(ValueError): load_recipe(self.root, self.path)
        for item in self.recipe['objects']: item.pop('parent')
        self.recipe['objects'][1]['motion'] = 'hang'
        self.save()
        with self.assertRaises(ValueError): load_recipe(self.root, self.path)
        self.recipe['objects'][1].pop('motion')
        self.recipe['objects'][0]['source'] = '../outside.png'
        self.save()
        with self.assertRaises(ValueError): load_recipe(self.root, self.path)

    def test_sequence_is_generic_and_preserves_variable_durations(self):
        Image.new('RGBA', (24,18), 'blue').save(self.root/'atlas.png')
        obj = self.recipe['objects'][0]
        obj.update(motion='sequence', animationBox=[8,18,16,24],
                   sequence=dict(image='atlas.png',frames=[dict(rect=[0,0,12,18],durationMs=60),
                                                           dict(rect=[12,0,12,18],durationMs=130)]))
        self.recipe['objects'][1]['animationBox'] = [76,16,32,48]
        self.save()
        with contextlib.redirect_stdout(io.StringIO()):
            scene = export(self.root,self.path,self.root/'output')
        animation = json.loads((self.root/'output/furniture/stool/animation.json').read_text())
        self.assertEqual(animation['durationMs'], 190)
        self.assertEqual(scene['instances'][1]['animationBox'], [76,16,32,48])

    def test_roll_preserves_laid_texture_and_exact_final_image(self):
        rug = Image.new('RGBA', (120, 80))
        for y in range(80):
            for x in range(120):
                rug.putpixel((x,y), (x*2, y*3, 90, 255))
        frames, rect = bake(rug, dict(motion='roll', duration=1.5, fps=20))
        x,y,w,h = rect
        self.assertEqual(sum(duration for _,duration in frames),1500)
        self.assertIsNone(frames[0][0].getbbox())
        self.assertEqual(len({frame.size for frame,_ in frames}),1)
        middle = frames[len(frames)//2][0]
        self.assertEqual(middle.getpixel((x+30,y+5)),rug.getpixel((30,5)))
        self.assertEqual(middle.getpixel((x+30,y+75))[3],0)
        self.assertEqual(frames[-1][0].crop((x,y,x+w,y+h)).tobytes(),rug.tobytes())

    def test_oval_roll_does_not_use_transparent_black_for_end_caps(self):
        rug = Image.new('RGBA', (120, 40))
        ImageDraw.Draw(rug).ellipse((0,0,119,39), fill=(80,150,190,255))
        frames, _ = bake(rug, dict(motion='roll', duration=1.5, fps=20))
        for frame, _ in frames:
            for r,g,b,a in frame.getdata():
                if a > 128:
                    self.assertGreater(r+g+b, 100)

    def test_sway_keeps_padding_exact_final_pose_and_distinct_motion(self):
        image = Image.new('RGBA', (80, 120), (180, 80, 30, 255))
        ImageDraw.Draw(image).rectangle((0,0,20,25), fill=(255,220,40,255))
        for motion in ('rock', 'slide'):
            frames, rect = bake(image, dict(id='furniture', motion=motion,
                                           duration=1.5, fps=20, pivot=[.5,1]))
            self.assertIsNone(frames[0][0].getbbox())
            self.assertEqual(sum(ms for _,ms in frames), 1500)
            self.assertEqual(len({f.size for f,_ in frames}), 1)
            for frame,_ in frames[1:]:
                x1,y1,x2,y2 = frame.getchannel('A').getbbox()
                self.assertGreater(x1, 0); self.assertGreater(y1, 0)
                self.assertLess(x2, frame.width); self.assertLess(y2, frame.height)
            x,y,w,h = rect
            self.assertEqual(frames[-1][0].crop((x,y,x+w,y+h)).tobytes(), image.tobytes())
        poses = [sway_pose(i/29, 'rock') for i in range(30)]
        self.assertTrue(all(p[2] == 0 for p in poses))
        self.assertGreater(max(p[3] for p in poses), 5)
        self.assertLess(min(p[3] for p in poses), -3)
        slides = [sway_pose(i/29, 'slide') for i in range(30)]
        self.assertLess(min(p[2] for p in slides), -.2)
        self.assertGreater(max(p[2] for p in slides), 0)

    def test_new_motions_validate_and_reuse_cannot_change_them(self):
        for motion in ('rock', 'slide'):
            self.recipe['objects'][0]['motion'] = motion
            self.save()
            self.assertEqual(load_recipe(self.root,self.path)['objects'][0]['motion'],motion)
        self.recipe['objects'][1]['motion'] = 'rock'
        self.save()
        with self.assertRaises(ValueError): load_recipe(self.root,self.path)


if __name__ == '__main__':
    unittest.main()
