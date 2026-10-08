import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { assemble, digest, layoutDigest, readAsset, run } from './assemble-maker-ui.mjs';

function fixture() {
  const layout = {
    version: 1,
    coordinateSpace: 'design-pixels',
    rectBasis: 'asset-canvas',
    provenance: 'recognition',
    design: { path: 'assets/design.png', width: 400, height: 800, sha256: 'a'.repeat(64) },
    assets: [
      {
        id: 'button',
        path: 'assets/button.png',
        width: 100,
        height: 50,
        sha256: 'b'.repeat(64),
        role: 'bound',
      },
      {
        id: 'spare',
        path: 'assets/spare.png',
        width: 100,
        height: 50,
        sha256: 'c'.repeat(64),
        role: 'reserve',
      },
    ],
    elements: [
      {
        id: 'root',
        parentId: null,
        type: 'Panel',
        render: 'container',
        rect: [0, 0, 400, 800],
        props: {},
      },
      {
        id: 'panel',
        parentId: 'root',
        type: 'Panel',
        render: 'container',
        rect: [20, 50, 300, 600],
        props: {},
      },
      {
        id: 'first',
        parentId: 'panel',
        type: 'Button',
        render: 'image',
        rect: [40, 80, 100, 50],
        assetId: 'button',
        props: {},
      },
      {
        id: 'caption',
        parentId: 'first',
        type: 'Label',
        render: 'text',
        rect: [50, 90, 80, 30],
        props: { text: 'one' },
      },
      {
        id: 'second',
        parentId: 'panel',
        type: 'Button',
        render: 'image',
        rect: [40, 160, 100, 50],
        assetId: 'button',
        props: {},
      },
    ],
  };
  return layout;
}
function corrections(layout, adjustments) {
  return {
    version: 1,
    layoutSha256: layoutDigest(layout),
    review: { designSha256: layout.design.sha256, evidence: 'screenshots/overlay.png' },
    adjustments,
  };
}

test('repeated assets retain separate instances; reserves never become UI nodes', () => {
  const layout = fixture();
  layout.elements[2].pressedAssetId = 'button';
  const before = JSON.stringify(layout),
    { ui, report } = assemble(layout);
  const [first, second] = ui.children[0].children;
  assert.equal(first.backgroundImage, second.backgroundImage);
  assert.equal(first.top, 30);
  assert.equal(second.top, 110);
  assert.equal(first.children[0].left, 10);
  assert.deepEqual(report.reserveAssets, ['spare']);
  assert.deepEqual(report.bindings, [{ assetId: 'button', instances: 2 }]);
  assert.equal(report.visualReview, null);
  assert.equal(JSON.stringify(layout), before);
});

test('parent corrections carry children; explicit child fixes use design coordinates', () => {
  const layout = fixture();
  const correction = corrections(layout, [
    {
      id: 'panel',
      before: [20, 50, 300, 600],
      after: [30, 70, 300, 600],
      reason: 'frame alignment',
    },
    {
      id: 'second',
      before: [40, 160, 100, 50],
      after: [55, 185, 100, 50],
      reason: 'button alignment',
    },
  ]);
  const { ui, report } = assemble(layout, correction),
    panel = ui.children[0];
  assert.equal(panel.children[0].left, 20);
  assert.equal(panel.children[0].top, 30);
  assert.equal(panel.children[1].left, 25);
  assert.equal(panel.children[1].top, 115);
  assert.deepEqual(report.placements.find((x) => x.id === 'caption').after, [60, 110, 80, 30]);
  assert.deepEqual(layout.elements[1].rect, [20, 50, 300, 600]);
});

test('ambiguous bindings, duplicate identities and impossible hierarchy are rejected', () => {
  let layout = fixture();
  layout.elements[2].assetId = 'spare';
  assert.throws(() => assemble(layout), /Reserve asset/);
  layout = fixture();
  layout.elements[2].assetId = 'missing';
  assert.throws(() => assemble(layout), /Missing explicit asset/);
  layout = fixture();
  delete layout.elements[2].assetId;
  assert.throws(() => assemble(layout), /Unresolved image binding/);
  layout = fixture();
  layout.elements.push({ ...layout.elements[2] });
  assert.throws(() => assemble(layout), /duplicate ID/);
  layout = fixture();
  layout.elements[1].parentId = 'first';
  assert.throws(() => assemble(layout), /Disconnected or cyclic/);
});

test('corrections cannot silently survive source or layout changes', () => {
  const layout = fixture(),
    correction = corrections(layout, []);
  layout.elements[2].rect[0]++;
  assert.throws(() => assemble(layout, correction), /another layout revision/);
  correction.layoutSha256 = layoutDigest(layout);
  correction.review.designSha256 = 'f'.repeat(64);
  assert.throws(() => assemble(layout, correction), /Missing visual review evidence/);
  const stale = corrections(layout, [
    { id: 'first', before: [40, 80, 100, 50], after: [41, 81, 100, 50], reason: 'alignment' },
  ]);
  assert.throws(() => assemble(layout, stale), /Stale correction/);
});

test('geometry cannot be overridden by props or transforms', () => {
  const layout = fixture();
  layout.elements[2].props.left = 100;
  assert.throws(() => assemble(layout), /Geometry or image in props/);
  delete layout.elements[2].props.left;
  layout.elements[2].props.scale = 2;
  assert.throws(() => assemble(layout), /Transformed coordinates/);
});

test('real PNG hashes are checked; output is new-only and assets stay untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-layout-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    const layout = fixture();
    for (const item of [layout.design, ...layout.assets]) {
      const png = new PNG({ width: item.width, height: item.height });
      png.data.fill(255);
      const bytes = PNG.sync.write(png);
      item.sha256 = digest(bytes);
      fs.writeFileSync(path.join(dir, item.path), bytes);
    }
    const file = path.join(dir, 'layout.json'),
      out = path.join(dir, 'output');
    fs.writeFileSync(file, JSON.stringify(layout));
    run(dir, file, out);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(out, 'assembled.ui.json'))).children[0].children.length,
      2
    );
    assert.throws(() => run(dir, file, out), /EEXIST/);
    assert(fs.existsSync(path.join(dir, 'assets/spare.png')));
    fs.appendFileSync(path.join(dir, 'assets/button.png'), 'changed');
    assert.throws(() => run(dir, file, path.join(dir, 'changed')), /Image changed/);
    assert(!fs.existsSync(path.join(dir, 'changed')));
    assert.throws(() => readAsset(dir, 'assets/../layout.json'), /Unsafe asset path/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
