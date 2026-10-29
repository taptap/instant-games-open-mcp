import {
  applySpriteMirror,
  canvasSpriteFrameSet,
  canvasSpriteMediaPath,
  canvasSpriteSheetIds,
  canvasSpriteStage,
  createSpriteSection,
  dismissSpriteMirrors,
  isCanvasSpriteName,
  reconcileSpriteMirror,
  sequenceExportManifest,
} from '../../../../packages/maker-canvas/src/domain.js';
import type { CanvasDocument } from '../../../../packages/maker-canvas/src/contracts.js';

const base = '.build/sprite-gen/hero/';
function progress(state: string, context: Record<string, unknown> = {}) {
  return {
    schema_version: 3,
    sprite_type: 'character',
    state,
    cursor: null,
    context: { sprite_name: 'hero', options: {}, flags: {}, anims: [], ...context },
  };
}
/** Two trimmed 24×32 frames inside a 40×40 source box, as sprite_export.py writes them. */
function trimmedSheet(extraPages = 0) {
  return {
    frames: {
      walk_0001: {
        frame: { x: 0, y: 0, w: 24, h: 32 },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: 8, y: 4, w: 24, h: 32 },
        sourceSize: { w: 40, h: 40 },
        duration: 100,
      },
      walk_0002: {
        frame: { x: 24, y: 0, w: 24, h: 32 },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: 6, y: 4, w: 24, h: 32 },
        sourceSize: { w: 40, h: 40 },
        duration: 150,
      },
    },
    animations: [
      { name: 'walk', frames: ['walk_0001', 'walk_0002', 'walk_0003'], repeat: -1, fps: 8 },
    ],
    meta: {
      image: 'spritesheet.png',
      size: { w: 64, h: 32 },
      ...(extraPages ? { relatedMultiPacks: ['spritesheet-1.json'] } : {}),
    },
  };
}
function documentWithSource(): CanvasDocument {
  return {
    id: 'c1',
    title: '画布',
    revision: 1,
    viewport: { x: 0, y: 0, scale: 1 },
    nodes: [
      {
        id: 'src',
        type: 'image',
        x: 100,
        y: 100,
        width: 200,
        height: 220,
        title: '来源',
        assetPath: 'assets/image/hero.png',
      },
    ],
    edges: [],
  };
}

test('sprite names follow the canvas rule', () => {
  for (const name of ['hero', '勇者_1', 'a-b']) expect(isCanvasSpriteName(name)).toBe(true);
  for (const name of ['', '.', '..', '.hero', 'a/b', 'a\\b', 'a:b', 'a b', 'x'.repeat(41)])
    expect(isCanvasSpriteName(name)).toBe(false);
});

test('candidate paths are normalised and unsafe ones rejected', () => {
  expect(canvasSpriteMediaPath('/workspace/assets/image/vp_1.png', 'hero', 'image')).toBe(
    'assets/image/vp_1.png'
  );
  expect(canvasSpriteMediaPath('assets/image/vp_1.webp', 'hero', 'image')).toBe(
    'assets/image/vp_1.webp'
  );
  expect(canvasSpriteMediaPath('_gen_images/aerial.png', 'hero', 'image')).toBe(
    base + '_gen_images/aerial.png'
  );
  for (const bad of [
    '/etc/passwd.png',
    '/workspace/../secret.png',
    'assets/../secret.png',
    'assets//x.png',
    'assets\\image\\x.png',
    'https://cdn.example.com/x.png',
    'C:/x.png',
    'src/x.png',
    'assets/image/x.txt',
    'assets/image/x.png?v=1',
    42,
    '',
  ])
    expect(canvasSpriteMediaPath(bad, 'hero', 'image')).toBeUndefined();
});

test('stage labels follow progress.state and gates ask for the conversation', () => {
  expect(canvasSpriteStage('missing').label).toBe('等待对话开始');
  expect(canvasSpriteStage('unsupported').label).toBe('中间过程暂不支持此版本');
  expect(canvasSpriteStage('ok', 'viewpoint_select')).toMatchObject({
    label: '选择视角 · 待确认',
    gate: true,
    done: false,
  });
  expect(canvasSpriteStage('ok', 'gen_video')).toMatchObject({ label: '生成视频', gate: false });
  expect(canvasSpriteStage('ok', 'done')).toMatchObject({ label: '已完成', done: true });
  expect(canvasSpriteStage('ok', 'constructor').label).toBe('进行中');
});

test('cold start: 404 progress has no cards and is not authoritative', () => {
  const plan = reconcileSpriteMirror({ name: 'hero' });
  expect(plan).toMatchObject({ status: 'missing', authoritative: false, cards: [] });
  expect(plan.stage.label).toBe('等待对话开始');
  const doc = documentWithSource();
  const section = createSpriteSection(doc, 'src', 'hero', 'character', 'sec', 1)!;
  doc.nodes.push({
    id: 'old',
    type: 'image',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    title: 'old',
    sectionId: section.id,
    assetPath: base + '_gen_images/ready.png',
    mirror: { source: 'sprite-gen', name: 'hero', key: 'ready' },
  });
  applySpriteMirror(doc, 'sec', plan, () => 'x');
  expect(doc.nodes.some((node) => node.id === 'old')).toBe(true);
});

test('mid-flow progress yields prep, viewpoint and pose cards linked in order', () => {
  const plan = reconcileSpriteMirror({
    name: 'hero',
    progress: progress('pose_select', {
      flags: {
        viewpoint_candidates: [
          '/workspace/assets/image/vp_1.png',
          'assets/image/vp_2.png',
          '../x.png',
        ],
        pose_candidates: { aerial: ['assets/image/aerial_1.png', 'assets/image/aerial_2.png'] },
        pose_gaps: [{ pose: 'aerial' }],
      },
    }),
    missing: [base + '_gen_images/cutout.png'],
  });
  expect(plan).toMatchObject({ status: 'ok', authoritative: true });
  expect(plan.stage.label).toBe('选择姿态 · 待确认');
  const byKey = Object.fromEntries(plan.cards.map((card) => [card.key, card]));
  expect(Object.keys(byKey)).toEqual([
    'cutout_ref',
    'ready',
    'viewpoint:assets/image/vp_1.png',
    'viewpoint:assets/image/vp_2.png',
    'pose:aerial:assets/image/aerial_1.png',
    'pose:aerial:assets/image/aerial_2.png',
    'pose-selected:aerial',
  ]);
  expect(byKey.cutout_ref).toMatchObject({ parent: 'source', edgeKind: 'image-variant', row: 0 });
  // cutout.png is missing, so ready links to the nearest available ancestor.
  expect(byKey.ready).toMatchObject({
    parent: 'cutout_ref',
    assetPath: base + '_gen_images/ready.png',
  });
  expect(byKey['viewpoint:assets/image/vp_1.png']).toMatchObject({ parent: 'ready', row: 1 });
  expect(byKey['pose-selected:aerial']).toMatchObject({
    assetPath: base + '_gen_images/aerial.png',
    parent: 'ready',
    row: 2,
  });
});

test('per-animation video and sheet become video → sequence → animation', () => {
  const state = progress('sheet_review', {
    anims: [
      {
        id: 'walk',
        play_type: 'loop',
        action: '走',
        status: 'pending',
        video_ref: 'https://cdn/x.mp4',
      },
      { id: 'idle', play_type: 'loop', action: '站', status: 'pending', video_ref: null },
    ],
  });
  state.cursor = 'walk' as never;
  expect(canvasSpriteSheetIds(state, undefined)).toEqual(['walk']);
  const plan = reconcileSpriteMirror({
    name: 'hero',
    progress: state,
    sheets: { walk: trimmedSheet() },
  });
  const byKey = Object.fromEntries(plan.cards.map((card) => [card.key, card]));
  expect(byKey['video:walk']).toMatchObject({
    type: 'video-source',
    assetPath: base + '_gen_videos/walk/anim.mp4',
    parent: 'ready',
    edgeKind: 'image-to-video',
  });
  expect(byKey['sequence:walk']).toMatchObject({
    type: 'sequence',
    assetPath: 'assets/sprites/hero/walk/spritesheet.png',
    parent: 'video:walk',
    edgeKind: 'sequence-source',
  });
  expect(byKey['animation:walk']).toMatchObject({
    parent: 'sequence:walk',
    edgeKind: 'sequence-animation',
  });
  expect(byKey['video:idle']).toBeUndefined();
});

test('dismissed keys stay out and their children relink', () => {
  const plan = reconcileSpriteMirror({
    name: 'hero',
    progress: progress('plan'),
    dismissed: ['ready', 'cutout'],
  });
  expect(plan.cards.map((card) => card.key)).toEqual(['cutout_ref']);
  const doc = documentWithSource();
  createSpriteSection(doc, 'src', 'hero', 'character', 'sec', 1);
  let id = 0;
  applySpriteMirror(
    doc,
    'sec',
    reconcileSpriteMirror({ name: 'hero', progress: progress('plan') }),
    () => 'n' + id++
  );
  const ready = doc.nodes.find((node) => node.mirror?.key === 'ready')!;
  expect(dismissSpriteMirrors(doc, [ready.id])).toBe(true);
  expect(doc.nodes.find((node) => node.id === 'sec')!.spriteGen!.dismissed).toEqual(['ready']);
  expect(dismissSpriteMirrors(doc, [ready.id])).toBe(false);
});

test('unknown schema_version mirrors only final sheets from sprite.json', () => {
  const plan = reconcileSpriteMirror({
    name: 'hero',
    progress: { schema_version: 9, state: 'whatever' },
    sprite: { meta: { relatedMultiPacks: ['walk/spritesheet.json', '../x/spritesheet.json'] } },
    sheets: { walk: trimmedSheet() },
  });
  expect(plan).toMatchObject({ status: 'unsupported', authoritative: false });
  expect(plan.stage.label).toBe('中间过程暂不支持此版本');
  expect(plan.cards.map((card) => card.key)).toEqual(['sequence:walk', 'animation:walk']);
  expect(plan.cards[0].parent).toBeUndefined();
});

test('apply lays out new cards, links edges, updates in place and drops stale ones', () => {
  const doc = documentWithSource();
  const section = createSpriteSection(doc, 'src', 'hero', 'character', 'sec', 1)!;
  expect(section).toMatchObject({
    title: '精灵：hero',
    spriteGen: { name: 'hero', sourceId: 'src' },
  });
  expect(doc.nodes[0].sectionId).toBe('sec');
  let id = 0;
  const createId = () => 'n' + id++;
  const first = reconcileSpriteMirror({
    name: 'hero',
    progress: progress('viewpoint_select', {
      flags: { viewpoint_candidates: ['assets/image/vp_1.png'] },
    }),
  });
  expect(applySpriteMirror(doc, 'sec', first, createId)).toBe(true);
  const ready = doc.nodes.find((node) => node.mirror?.key === 'ready')!;
  const viewpoint = doc.nodes.find((node) => node.mirror?.key.startsWith('viewpoint:'))!;
  expect(ready.x).toBeGreaterThan(300);
  // Tree layout: the candidate is one column right of the card it came from, top-aligned.
  expect(viewpoint.x).toBeGreaterThan(ready.x + ready.width);
  expect(viewpoint.y).toBe(ready.y);
  expect(doc.edges).toContainEqual(expect.objectContaining({ to: viewpoint.id, from: ready.id }));
  const section2 = doc.nodes.find((node) => node.id === 'sec')!;
  expect(section2.y + section2.height).toBeGreaterThanOrEqual(viewpoint.y + viewpoint.height);
  expect(applySpriteMirror(doc, 'sec', first, createId)).toBe(false);
  // The viewpoint was chosen and candidates cleared: the candidate card and its edge go away.
  const second = reconcileSpriteMirror({ name: 'hero', progress: progress('plan') });
  expect(applySpriteMirror(doc, 'sec', second, createId)).toBe(true);
  expect(doc.nodes.some((node) => node.id === viewpoint.id)).toBe(false);
  expect(doc.edges.some((edge) => edge.to === viewpoint.id)).toBe(false);
  expect(doc.nodes.find((node) => node.mirror?.key === 'ready')!.id).toBe(ready.id);
});

test('tree layout fans siblings out downward and keeps cards the user moved', () => {
  const doc = documentWithSource();
  createSpriteSection(doc, 'src', 'hero', 'character', 'sec', 1);
  let id = 0;
  const createId = () => 'n' + id++;
  const plan = reconcileSpriteMirror({
    name: 'hero',
    progress: progress('viewpoint_select', {
      flags: { viewpoint_candidates: ['assets/image/vp_1.png', 'assets/image/vp_2.png'] },
    }),
  });
  applySpriteMirror(doc, 'sec', plan, createId);
  const key = (prefix: string) => doc.nodes.filter((node) => node.mirror?.key.startsWith(prefix));
  const [chain, ready] = [key('cutout_ref')[0], key('ready')[0]];
  const source = doc.nodes.find((node) => node.id === 'src')!;
  // source → cutout_ref → … → ready stay on one line, left to right.
  expect(chain.y).toBe(source.y);
  expect(chain.x).toBeGreaterThan(source.x + source.width);
  const [first, second] = key('viewpoint:');
  expect(first.x).toBe(second.x);
  expect(first.x).toBeGreaterThan(ready.x + ready.width);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  // A moved card is left alone; a card still at its laid-out spot keeps following the layout.
  first.x += 500;
  const movedX = first.x;
  applySpriteMirror(doc, 'sec', plan, createId);
  expect(first.x).toBe(movedX);
  expect(second.x).toBe(first.mirror!.placed!.x);
});
test('trimmed sheet frames keep their offsets, durations and page count', () => {
  const parsed = canvasSpriteFrameSet(trimmedSheet(1))!;
  expect(parsed.image).toBe('spritesheet.png');
  expect(parsed.info).toMatchObject({ fps: 8, frameCount: 2, width: 64, height: 32, pages: 2 });
  expect(parsed.info.frames).toEqual([
    {
      index: 0,
      time: 0,
      x: 0,
      y: 0,
      width: 24,
      height: 32,
      sourceWidth: 40,
      sourceHeight: 40,
      offsetX: 8,
      offsetY: 4,
      duration: 100,
    },
    {
      index: 1,
      time: 0.1,
      x: 24,
      y: 0,
      width: 24,
      height: 32,
      sourceWidth: 40,
      sourceHeight: 40,
      offsetX: 6,
      offsetY: 4,
      duration: 150,
    },
  ]);
  // Canvas sequence export would drop the offsets, so it refuses trimmed frames.
  expect(() => sequenceExportManifest(parsed.info, 64, 32)).toThrow('裁边偏移');
});

test('untrimmed frames stay plain and invalid sheets are rejected', () => {
  const sheet = trimmedSheet();
  for (const entry of Object.values(sheet.frames)) {
    entry.spriteSourceSize = { x: 0, y: 0, w: 24, h: 32 };
    entry.sourceSize = { w: 24, h: 32 };
  }
  delete (sheet.animations[0] as { fps?: number }).fps;
  const parsed = canvasSpriteFrameSet(sheet)!;
  expect(parsed.info.frames[0].sourceWidth).toBeUndefined();
  expect(parsed.info.fps).toBe(8);
  expect(parsed.info.pages).toBeUndefined();
  expect(
    canvasSpriteFrameSet({ ...sheet, meta: { ...sheet.meta, image: '../x.png' } })
  ).toBeUndefined();
  const outside = trimmedSheet();
  outside.frames.walk_0002.frame.x = 60;
  expect(canvasSpriteFrameSet(outside)).toBeUndefined();
  expect(canvasSpriteFrameSet({ frames: {}, meta: sheet.meta })).toBeUndefined();
});
