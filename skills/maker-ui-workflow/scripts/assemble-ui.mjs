import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const layoutDigest = (layout) => digest(JSON.stringify(layout));
const geometryFields = [
  'id',
  'type',
  'children',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'position',
  'backgroundImage',
  'pressedBackgroundImage',
];

function rect(value, label) {
  assert(
    Array.isArray(value) && value.length === 4 && value.every(Number.isFinite),
    label + ': invalid rect'
  );
  assert(value[2] > 0 && value[3] > 0, label + ': non-positive size');
}

function unique(items, label) {
  assert(Array.isArray(items), label + ': expected array');
  const result = new Map();
  for (const item of items) {
    assert(
      typeof item.id === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id),
      label + ': invalid ID'
    );
    assert(!result.has(item.id), label + ': duplicate ID ' + item.id);
    result.set(item.id, item);
  }
  return result;
}

export function readAsset(project, relative) {
  assert(
    typeof relative === 'string' &&
      relative.startsWith('assets/') &&
      !relative.includes(String.fromCharCode(92)),
    'Expected assets/ path'
  );
  assert(
    !relative.split('/').some((part) => part === '..' || part === '.' || !part),
    'Unsafe asset path'
  );
  const root = fs.realpathSync(project),
    file = fs.realpathSync(path.join(root, relative));
  const rel = path.relative(root, file);
  assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Asset escapes project');
  return fs.readFileSync(file);
}

function verifyImage(project, item) {
  const bytes = readAsset(project, item.path);
  assert.equal(digest(bytes), item.sha256, 'Image changed: ' + item.path);
  const png = PNG.sync.read(bytes);
  assert.equal(png.width, item.width, 'Image width changed: ' + item.path);
  assert.equal(png.height, item.height, 'Image height changed: ' + item.path);
}

/** Assemble only explicit instance bindings; unused assets remain in the inventory. */
export function assemble(layout, correction = null) {
  assert.equal(layout.version, 1, 'Unsupported layout version');
  assert.equal(layout.coordinateSpace, 'design-pixels', 'Expected design-pixels');
  assert.equal(layout.rectBasis, 'asset-canvas', 'Rects must describe the full placed PNG');
  assert(layout.design && /^[a-f0-9]{64}$/.test(layout.design.sha256), 'Missing source image hash');
  assert(
    Number.isInteger(layout.design.width) &&
      layout.design.width > 0 &&
      Number.isInteger(layout.design.height) &&
      layout.design.height > 0,
    'Invalid design size'
  );
  assert(
    ['recognition', 'reconstruction-backfill'].includes(layout.provenance),
    'Missing coordinate provenance'
  );
  const elements = unique(layout.elements, 'elements'),
    assets = unique(layout.assets, 'assets');
  assert(elements.size > 0 && elements.size <= 5000 && assets.size <= 5000, 'Invalid layout size');
  const roots = layout.elements.filter((item) => item.parentId === null);
  assert.equal(roots.length, 1, 'Expected exactly one root');
  const root = roots[0];
  assert.deepEqual(
    root.rect,
    [0, 0, layout.design.width, layout.design.height],
    'Root must match design'
  );
  const used = new Set(),
    counts = new Map(),
    changes = new Map(),
    byParent = new Map();
  for (const item of layout.elements) {
    rect(item.rect, item.id);
    assert(
      ['Panel', 'Button', 'Label', 'Image'].includes(item.type),
      'Unsupported element type: ' + item.id
    );
    assert(['container', 'image', 'text'].includes(item.render), 'Missing render role: ' + item.id);
    if (item.render === 'image') assert(item.assetId, 'Unresolved image binding: ' + item.id);
    else
      assert(
        item.assetId === undefined && item.pressedAssetId === undefined,
        'Unexpected image binding: ' + item.id
      );
    if (item.type === 'Button' || item.type === 'Image') assert.equal(item.render, 'image');
    if (item.type === 'Label') assert.equal(item.render, 'text');
    if (item.render === 'text') assert.equal(item.type, 'Label');
    assert(
      item.props && typeof item.props === 'object' && !Array.isArray(item.props),
      'Missing props: ' + item.id
    );
    assert(
      !geometryFields.some((key) => Object.hasOwn(item.props, key)),
      'Geometry or image in props: ' + item.id
    );
    assert(
      !['rotate', 'scale', 'translateX', 'translateY', 'transformOrigin'].some((key) =>
        Object.hasOwn(item.props, key)
      ),
      'Transformed coordinates require explicit conversion: ' + item.id
    );
    if (item !== root) assert(elements.has(item.parentId), 'Missing parent: ' + item.id);
    const siblings = byParent.get(item.parentId) || [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
    const refs = [item.assetId, item.pressedAssetId].filter((id) => id !== undefined);
    if (item.pressedAssetId !== undefined)
      assert(item.type === 'Button' && item.assetId, 'State requires button base: ' + item.id);
    for (const id of refs) {
      assert(assets.has(id), 'Missing explicit asset binding: ' + item.id + ' -> ' + id);
      assert(assets.get(id).role === 'bound', 'Reserve asset cannot be placed: ' + id);
      used.add(id);
      if (!counts.has(id)) counts.set(id, new Set());
      counts.get(id).add(item.id);
    }
  }
  for (const asset of assets.values()) {
    assert(['bound', 'reserve'].includes(asset.role), 'Invalid asset role: ' + asset.id);
    assert(
      typeof asset.path === 'string' &&
        asset.path.startsWith('assets/') &&
        !asset.path.includes(String.fromCharCode(92)) &&
        !asset.path.split('/').some((part) => !part || part === '.' || part === '..'),
      'Invalid asset path: ' + asset.id
    );
    assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'Missing asset hash: ' + asset.id);
    assert(
      Number.isInteger(asset.width) &&
        asset.width > 0 &&
        Number.isInteger(asset.height) &&
        asset.height > 0,
      'Invalid asset size'
    );
    if (asset.role === 'bound')
      assert(used.has(asset.id), 'Unused asset must be reserve: ' + asset.id);
  }
  if (correction) {
    assert.equal(correction.version, 1);
    assert.equal(
      correction.layoutSha256,
      layoutDigest(layout),
      'Correction belongs to another layout revision'
    );
    assert(
      correction.review &&
        correction.review.designSha256 === layout.design.sha256 &&
        typeof correction.review.evidence === 'string' &&
        correction.review.evidence.trim(),
      'Missing visual review evidence'
    );
    unique(correction.adjustments, 'adjustments');
    for (const change of correction.adjustments) {
      assert(
        elements.has(change.id) && change.id !== root.id,
        'Unknown/root correction: ' + change.id
      );
      assert.deepEqual(
        change.before,
        elements.get(change.id).rect,
        'Stale correction: ' + change.id
      );
      rect(change.after, change.id);
      assert(
        typeof change.reason === 'string' && change.reason.trim(),
        'Missing correction reason'
      );
      changes.set(change.id, change);
    }
  }
  const visited = new Set(),
    placements = [];
  function build(item, parent, parentRect, depth) {
    assert(depth < 100 && !visited.has(item.id), 'Cyclic or excessively deep layout');
    visited.add(item.id);
    // Uncorrected children follow their parent. Explicit corrections use design coordinates.
    const base = item.rect,
      shiftX = parent ? parentRect[0] - parent.rect[0] : 0;
    const shiftY = parent ? parentRect[1] - parent.rect[1] : 0;
    const target = changes.get(item.id)?.after || [
      base[0] + shiftX,
      base[1] + shiftY,
      base[2],
      base[3],
    ];
    const node = {
      ...item.props,
      type: item.type,
      id: item.id,
      width: target[2],
      height: target[3],
    };
    if (parent)
      Object.assign(node, {
        position: 'absolute',
        left: target[0] - parentRect[0],
        top: target[1] - parentRect[1],
      });
    if (item.assetId) node.backgroundImage = assets.get(item.assetId).path.slice(7);
    if (item.pressedAssetId)
      node.pressedBackgroundImage = assets.get(item.pressedAssetId).path.slice(7);
    const children = byParent.get(item.id);
    if (children?.length)
      node.children = children.map((child) => build(child, item, target, depth + 1));
    placements.push({
      id: item.id,
      parentId: item.parentId,
      before: base,
      after: target,
      reason: changes.get(item.id)?.reason || (shiftX || shiftY ? 'parent adjustment' : null),
    });
    return node;
  }
  const ui = build(root, null, null, 0);
  assert.equal(visited.size, elements.size, 'Disconnected or cyclic elements');
  return {
    ui,
    report: {
      version: 1,
      layoutSha256: layoutDigest(layout),
      provenance: layout.provenance,
      visualReview: correction ? correction.review : null,
      reserveAssets: layout.assets
        .filter((asset) => asset.role === 'reserve')
        .map((asset) => asset.id),
      bindings: Array.from(counts, ([assetId, instances]) => ({
        assetId,
        instances: instances.size,
      })),
      placements,
    },
  };
}

export function layoutFromBbox(input) {
  const bbox = input.bbox;
  if (input.ui) {
    assert(
      typeof input.ui.id === 'string' && input.ui.id.length > 0,
      'Missing UI archive identity'
    );
    assert.equal(
      input.ui.bboxSha256,
      digest(JSON.stringify(bbox)),
      'Bbox does not match this UI resource bundle'
    );
  }
  assert(
    bbox &&
      bbox.version === 1 &&
      bbox.coordinateSpace === 'design-pixels' &&
      bbox.bboxFormat === 'xywh',
    'Expected version=1 design-pixels xywh Bbox JSON'
  );
  assert(
    bbox.design &&
      bbox.cutSource &&
      Array.isArray(bbox.elements) &&
      bbox.elements.length > 0 &&
      bbox.elements.length <= 500 &&
      Array.isArray(bbox.texts) &&
      bbox.texts.length <= 1000,
    'Missing Bbox sources or two-pass results'
  );
  for (const image of [bbox.design, bbox.cutSource]) {
    assert(
      typeof image.path === 'string' &&
        /^[a-f0-9]{64}$/.test(image.sha256) &&
        Number.isInteger(image.width) &&
        image.width > 0 &&
        Number.isInteger(image.height) &&
        image.height > 0,
      'Invalid Bbox source identity'
    );
  }
  const elements = unique(bbox.elements, 'bbox.elements');
  const texts = unique(bbox.texts, 'bbox.texts');
  const bindings = new Map();
  assert(input.confirmed !== false, 'UI asset bindings are not confirmed');
  assert(
    Array.isArray(input.bindings) && Array.isArray(input.assets),
    'Explicit assets and bindings are required'
  );
  for (const binding of input.bindings) {
    assert(binding.review !== 'unreviewed', 'Unreviewed UI binding: ' + binding.elementId);
    assert(
      elements.has(binding.elementId) &&
        !bindings.has(binding.elementId) &&
        typeof binding.assetId === 'string',
      'Unknown or duplicate Bbox binding'
    );
    bindings.set(binding.elementId, binding);
  }
  const checkRect = (value, id) => {
    rect(value, id);
    assert(
      value[0] >= 0 &&
        value[1] >= 0 &&
        value[0] + value[2] <= bbox.design.width &&
        value[1] + value[3] <= bbox.design.height,
      'Bbox outside design: ' + id
    );
  };
  const root = {
    id: 'root',
    type: 'Panel',
    parentId: null,
    render: 'container',
    rect: [0, 0, bbox.design.width, bbox.design.height],
    props: {},
  };
  const images = bbox.elements.map((element) => {
    assert(
      /^E[0-9]{3,}$/.test(element.id) &&
        ['icon', 'frame', 'panel', 'button', 'tab', 'title'].includes(element.type) &&
        (element.parent === null || elements.has(element.parent)),
      'Invalid Bbox element'
    );
    checkRect(element.bbox, element.id);
    const binding = bindings.get(element.id);
    assert(binding, 'Missing explicit PNG binding: ' + element.id);
    return {
      id: element.id,
      parentId: element.parent || 'root',
      type:
        element.type === 'button' || element.type === 'tab' || binding.pressedAssetId
          ? 'Button'
          : 'Panel',
      render: 'image',
      rect: [...element.bbox],
      props: { backgroundFit: element.type === 'icon' ? 'contain' : 'fill' },
      assetId: binding.assetId,
      ...(binding.pressedAssetId ? { pressedAssetId: binding.pressedAssetId } : {}),
    };
  });
  const labels = bbox.texts.map((text) => {
    assert(
      /^T[0-9]{3,}$/.test(text.id) &&
        !elements.has(text.id) &&
        typeof text.text === 'string' &&
        text.text.trim() &&
        text.cutout === false &&
        (text.parentId === null || elements.has(text.parentId)) &&
        ['left', 'center', 'right'].includes(text.align) &&
        /^#[a-f0-9]{6}$/i.test(text.color) &&
        typeof text.bold === 'boolean',
      'Invalid Bbox text'
    );
    checkRect(text.bbox, text.id);
    const color = text.color.slice(1);
    // Ink-box height alone can overflow narrow labels. Final font metrics are checked in the editor.
    const lines = text.text.split('\n');
    const widthUnits = Math.max(
      1,
      ...lines.map((line) =>
        Array.from(line).reduce((sum, char) => sum + (char.codePointAt(0) < 128 ? 0.6 : 1), 0)
      )
    );
    return {
      id: text.id,
      parentId: text.parentId || 'root',
      type: 'Label',
      render: 'text',
      rect: [...text.bbox],
      props: {
        text: text.text,
        textAlign: text.align,
        verticalAlign: 'middle',
        fontSize: Math.max(
          1,
          Math.floor(Math.min(text.bbox[3] / lines.length, text.bbox[2] / widthUnits))
        ),
        fontWeight: text.bold ? 'bold' : 'normal',
        fontColor: [
          parseInt(color.slice(0, 2), 16),
          parseInt(color.slice(2, 4), 16),
          parseInt(color.slice(4, 6), 16),
          255,
        ],
      },
    };
  });
  assert.equal(texts.size, labels.length);
  return {
    version: 1,
    coordinateSpace: 'design-pixels',
    rectBasis: 'asset-canvas',
    provenance: 'recognition',
    design: { ...bbox.design },
    assets: input.assets,
    elements: [
      root,
      ...(input.backgroundAssetId
        ? [
            {
              id: 'background',
              parentId: 'root',
              type: 'Image',
              render: 'image',
              rect: [...root.rect],
              props: {},
              assetId: input.backgroundAssetId,
            },
          ]
        : []),
      ...images,
      ...labels,
    ],
  };
}

export function run(project, layoutFile, outputDirectory, correctionFile) {
  const input = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
  const cropped = [];
  if (input.bbox) {
    for (const asset of input.assets || []) {
      verifyImage(project, asset);
      if (!asset.contentRect) continue;
      const box = asset.contentRect;
      assert(
        Array.isArray(box) &&
          box.length === 4 &&
          box.every(Number.isInteger) &&
          box[0] >= 0 &&
          box[1] >= 0 &&
          box[2] > 0 &&
          box[3] > 0 &&
          box[0] + box[2] <= asset.width &&
          box[1] + box[3] <= asset.height,
        'Invalid content rect: ' + asset.id
      );
      if (box[0] === 0 && box[1] === 0 && box[2] === asset.width && box[3] === asset.height)
        continue;
      assert(/^[A-Za-z][A-Za-z0-9_-]*$/.test(asset.id), 'Invalid crop asset ID');
      const relative = path
        .relative(
          fs.realpathSync(project),
          path.join(
            fs.realpathSync(path.dirname(path.resolve(outputDirectory))),
            path.basename(outputDirectory),
            'images',
            asset.id + '.png'
          )
        )
        .split(path.sep)
        .join('/');
      assert(
        relative.startsWith('assets/') && !relative.split('/').includes('..'),
        'Cropped UI output must be inside project assets/'
      );
      const source = PNG.sync.read(readAsset(project, asset.path));
      const target = new PNG({ width: box[2], height: box[3] });
      PNG.bitblt(source, target, ...box, 0, 0);
      const bytes = PNG.sync.write(target);
      cropped.push({ relative, bytes });
      asset.sourceContentRect = [...box];
      asset.sourcePath = asset.path;
      Object.assign(asset, {
        path: relative,
        width: box[2],
        height: box[3],
        sha256: digest(bytes),
      });
      delete asset.contentRect;
    }
  }
  const layout = input.bbox ? layoutFromBbox(input) : input;
  if (input.bbox) verifyImage(project, input.bbox.cutSource);
  const correction = correctionFile ? JSON.parse(fs.readFileSync(correctionFile, 'utf8')) : null;
  const result = assemble(layout, correction);
  for (const item of [layout.design, ...layout.assets])
    if (!cropped.some((crop) => crop.relative === item.path)) verifyImage(project, item);
  // A new output directory prevents overwriting UI files edited by the user.
  fs.mkdirSync(outputDirectory);
  if (cropped.length) fs.mkdirSync(path.join(outputDirectory, 'images'));
  for (const crop of cropped)
    fs.writeFileSync(path.join(project, crop.relative), crop.bytes, { flag: 'wx' });
  for (const [name, value] of [
    ['assembled.ui.json', result.ui],
    ['assembly-map.json', result.report],
    ...(input.bbox ? [['layout.json', layout]] : []),
  ]) {
    fs.writeFileSync(path.join(outputDirectory, name), JSON.stringify(value, null, 2), {
      flag: 'wx',
    });
  }
  fs.copyFileSync(
    path.join(fs.realpathSync(project), layout.design.path),
    path.join(outputDirectory, 'assembled.reference.png'),
    fs.constants.COPYFILE_EXCL
  );
  console.log(
    JSON.stringify({
      outputDirectory,
      elements: layout.elements.length,
      reserveAssets: result.report.reserveAssets.length,
      visualReview: correction ? 'recorded-agent-review' : 'pending',
    })
  );
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(
      process.argv.length === 5 || process.argv.length === 6,
      'Usage: node <skill>/scripts/assemble-ui.mjs <project> <layout.json> <new-output-dir> [corrections.json]'
    );
    run(...process.argv.slice(2));
  } catch (error) {
    console.error('UI 组装未完成：' + error.message);
    process.exitCode = 1;
  }
}
