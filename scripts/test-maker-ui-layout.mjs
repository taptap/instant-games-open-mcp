import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import {
  assemble,
  digest,
  layoutDigest,
  layoutFromBbox,
  readAsset,
  run,
} from './assemble-maker-ui.mjs';

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

function bboxInput() {
  const layout = fixture();
  return {
    bbox: {
      version: 1,
      coordinateSpace: 'design-pixels',
      bboxFormat: 'xywh',
      design: layout.design,
      cutSource: { ...layout.design },
      elements: [
        { id: 'E001', name: '按钮', type: 'button', bbox: [40, 80, 100, 50], parent: null },
      ],
      texts: [
        {
          id: 'T001',
          text: '购买',
          bbox: [50, 90, 80, 30],
          parentId: 'E001',
          role: 'button',
          align: 'center',
          color: '#F2D48A',
          bold: true,
          cutout: false,
        },
      ],
    },
    assets: layout.assets,
    bindings: [{ elementId: 'E001', assetId: 'button' }],
  };
}

test('two-pass Bbox assembly preserves positions, Label content, alignment and real editor colors', () => {
  const layout = layoutFromBbox(bboxInput());
  const result = assemble(layout);
  const button = result.ui.children[0];
  assert.equal(button.left, 40);
  assert.equal(button.top, 80);
  const label = button.children[0];
  assert.equal(label.type, 'Label');
  assert.equal(label.left, 10);
  assert.equal(label.top, 10);
  assert.equal(label.text, '购买');
  assert.equal(label.textAlign, 'center');
  assert.equal(label.fontWeight, 'bold');
  assert.deepEqual(label.fontColor, [242, 212, 138, 255]);
  assert.equal(label.color, undefined);
  assert.equal(label.fontSize, 30);
});

test('generated foreground uses a supported image panel and narrow labels fit their box', () => {
  const input = bboxInput();
  input.bbox.elements[0].type = 'icon';
  input.bbox.texts[0].text = '整理背包';
  input.bbox.texts[0].bbox = [50, 90, 80, 30];
  const result = assemble(layoutFromBbox(input));
  const icon = result.ui.children[0];
  assert.equal(icon.type, 'Panel');
  assert.equal(icon.backgroundFit, 'contain');
  assert.equal(icon.children[0].fontSize, 20);
});

test('24 duplicate stars stay at 24 Bbox positions while sharing one image', () => {
  const input = bboxInput();
  input.bbox.texts = [];
  input.bbox.elements = Array.from({ length: 24 }, (_, index) => ({
    id: 'E' + String(index + 1).padStart(3, '0'),
    name: '金色五角星',
    type: 'icon',
    parent: null,
    bbox: [(index % 8) * 30, Math.floor(index / 8) * 30, 20, 20],
    ...(index ? { duplicateOf: 'E001' } : {}),
  }));
  input.bindings = input.bbox.elements.map((element) => ({
    elementId: element.id,
    assetId: 'button',
  }));
  const result = assemble(layoutFromBbox(input));
  assert.equal(result.ui.children.length, 24);
  assert.equal(new Set(result.ui.children.map((node) => node.backgroundImage)).size, 1);
  result.ui.children.forEach((node, index) => {
    assert.equal(node.left, input.bbox.elements[index].bbox[0]);
    assert.equal(node.top, input.bbox.elements[index].bbox[1]);
  });
});

test('Bbox assembly refuses missing bindings, invalid parents, cycles and text-as-cutout', () => {
  for (const failure of ['binding', 'parent', 'cycle', 'text']) {
    const input = bboxInput();
    if (failure === 'binding') input.bindings = [];
    if (failure === 'parent') input.bbox.texts[0].parentId = 'E999';
    if (failure === 'cycle') input.bbox.elements[0].parent = 'E001';
    if (failure === 'text') input.bbox.texts[0].cutout = true;
    assert.throws(() => assemble(layoutFromBbox(input)));
  }
});
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
    const delivered = run(dir, file, out);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(out, delivered.uiFileName))).children[0].children.length,
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

test('unreviewed bindings refuse assembly and background keeps explicit design bounds', () => {
  const input = bboxInput();
  assert.throws(() => layoutFromBbox({ ...input, confirmed: false }), /not confirmed/);
  input.bindings[0].review = 'unreviewed';
  assert.throws(() => layoutFromBbox(input), /Unreviewed/);
  input.bindings[0].review = 'recorded';
  input.backgroundAssetId = input.assets[1].id;
  const layout = layoutFromBbox(input);
  assert.deepEqual(layout.elements[1].rect, [0, 0, 400, 800]);
  assert.equal(layout.elements[1].assetId, input.backgroundAssetId);
});

test('bundle Bbox identity prevents mixing another revision into assembly', () => {
  const input = bboxInput();
  input.ui = { id: 'test-ui', bboxSha256: digest(JSON.stringify(input.bbox)) };
  assert.doesNotThrow(() => layoutFromBbox(input));
  input.bbox.elements[0].bbox[0] += 1;
  assert.throws(() => layoutFromBbox(input), /does not match/);
});

test('contentRect crops deterministically without changing Bbox or original bytes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-crop-'));
  try {
    fs.mkdirSync(path.join(directory, 'assets'));
    const input = bboxInput();
    for (const item of [input.bbox.design, ...input.assets]) {
      const png = new PNG({ width: item.width, height: item.height });
      png.data.fill(255);
      const bytes = PNG.sync.write(png);
      item.sha256 = digest(bytes);
      fs.writeFileSync(path.join(directory, item.path), bytes);
    }
    input.bbox.cutSource = { ...input.bbox.design };
    input.assets[0].contentRect = [5, 6, 50, 30];
    const original = structuredClone(input.assets[0]);
    const file = path.join(directory, 'input.json');
    fs.writeFileSync(file, JSON.stringify(input));
    const output = path.join(directory, 'assets', 'assembled');
    run(directory, file, output);
    const layout = JSON.parse(fs.readFileSync(path.join(output, 'layout.json')));
    assert.equal(layout.assets[0].width, 50);
    assert.equal(layout.assets[0].height, 30);
    assert.deepEqual(
      layout.elements.find((item) => item.id === 'E001').rect,
      input.bbox.elements[0].bbox
    );
    assert.equal(digest(readAsset(directory, original.path)), original.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Bbox file input produces editable UI, reference and a reusable correction layout', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-bbox-'));
  try {
    fs.mkdirSync(path.join(directory, 'assets'));
    const input = bboxInput();
    for (const item of [input.bbox.design, ...input.assets]) {
      const png = new PNG({ width: item.width, height: item.height });
      png.data.fill(255);
      const bytes = PNG.sync.write(png);
      item.sha256 = digest(bytes);
      fs.writeFileSync(path.join(directory, item.path), bytes);
    }
    input.bbox.cutSource = { ...input.bbox.design };
    const filename = path.join(directory, 'assembly.json');
    fs.writeFileSync(filename, JSON.stringify(input));
    const output = path.join(directory, 'output');
    const delivered = run(directory, filename, output);
    const layout = JSON.parse(fs.readFileSync(path.join(output, 'layout.json'), 'utf8'));
    assert.deepEqual(
      layout.elements.find((element) => element.id === 'T001').rect,
      [50, 90, 80, 30]
    );
    assert(fs.existsSync(path.join(output, delivered.referenceFileName)));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(output, delivered.uiFileName), 'utf8')).children[0]
        .children[0].text,
      '购买'
    );
    input.bbox.cutSource.sha256 = 'f'.repeat(64);
    fs.writeFileSync(filename, JSON.stringify(input));
    assert.throws(() => run(directory, filename, path.join(directory, 'stale')), /Image changed/);
    assert(!fs.existsSync(path.join(directory, 'stale')));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
