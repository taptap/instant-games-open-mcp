import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { checkDemoResources } from './maker-demo-resource-check.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-resource-check-'));
  const bytes = Buffer.from('checked-resource-fixture');
  const id = createHash('sha256').update(bytes).digest('hex');
  const entry = {
    file: id + '.png',
    size: bytes.length,
    sha256: id,
    type: 'image/png',
    cdn: 'https://app-res.tapimg.com/img/fixture.png',
    lossless: { sourceSize: bytes.length + 20, pixelSha256: 'a'.repeat(64) },
  };
  const manifest = { resources: { [id]: entry }, editor: { 'examples/demo.png': id } };
  fs.mkdirSync(path.join(root, 'resources/maker-demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/maker/canvas'), { recursive: true });
  const image = path.join(root, 'resources/maker-demo', entry.file);
  fs.writeFileSync(image, bytes);
  for (const name of [
    'presetData',
    'assetPresetData',
    'modelPresetData',
    'templateModelData',
    'uiWorkflowData',
  ])
    fs.writeFileSync(
      path.join(root, 'src/maker/canvas', name + '.json'),
      JSON.stringify({ resourceId: id })
    );
  function save() {
    fs.writeFileSync(path.join(root, 'src/maker/demoResources.json'), JSON.stringify(manifest));
  }
  save();
  try {
    run({ root, entry, manifest, image, save });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('checked images with CDN pass; maintenance can check before uploading', () =>
  fixture(({ root, entry, save }) => {
    assert.equal(checkDemoResources(root, { requireCdn: true }).resources, 1);
    delete entry.cdn;
    save();
    assert.doesNotThrow(() => checkDemoResources(root));
    assert.throws(() => checkDemoResources(root, { requireCdn: true }), /尚未上传 CDN/);
  }));
test('new or invalid optimization records block release', () =>
  fixture(({ root, entry, save }) => {
    for (const record of [undefined, {}, { sourceSize: 1, pixelSha256: 'a'.repeat(64) }]) {
      entry.lossless = record;
      save();
      assert.throws(() => checkDemoResources(root), /optimize/);
    }
  }));
test('modified bytes cannot reuse an optimization record', () =>
  fixture(({ root, image }) => {
    fs.writeFileSync(image, 'changed');
    assert.throws(() => checkDemoResources(root), /本地文件不匹配/);
  }));
test('missing template, thumbnail and editor references block release', () =>
  fixture(({ root, entry, manifest, save }) => {
    entry.thumbnail = 'missing';
    save();
    assert.throws(() => checkDemoResources(root), /引用缺失/);
    delete entry.thumbnail;
    manifest.editor['examples/demo.png'] = 'missing';
    save();
    assert.throws(() => checkDemoResources(root), /引用缺失/);
  }));
test('official template inline images and unknown resources are rejected', () =>
  fixture(({ root }) => {
    const filename = path.join(root, 'src/maker/canvas/presetData.json');
    for (const data of [
      { resourceId: 'missing' },
      { image: 'data:image/png;base64,AAAA' },
      { base64: 'AAAA' },
    ]) {
      fs.writeFileSync(filename, JSON.stringify(data));
      assert.throws(() => checkDemoResources(root), /引用缺失|内嵌/);
    }
  }));
test('a picture cannot bypass checks by claiming to be a video', () =>
  fixture(({ root, entry, save }) => {
    entry.type = 'video/mp4';
    delete entry.lossless;
    save();
    assert.throws(() => checkDemoResources(root), /媒体类型/);
  }));
