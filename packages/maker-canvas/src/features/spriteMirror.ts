import type {
  CanvasDocument,
  CanvasEdgeKind,
  CanvasNode,
  FrameSetFrame,
  FrameSetInfo,
} from '../contracts.js';
// sprite-gen runs in the conversation; the canvas only reads its files and mirrors outputs as cards.
// Every export is injected into the page via toString(), so each body is self-contained apart from
// calls to the other exports of this module.

/** Canvas-side name rule; sprite-gen itself rejects / \ : a leading '.', '.' and '..'. */
export function isCanvasSpriteName(value: unknown): value is string {
  return typeof value === 'string' && /^[\p{L}\p{N}_-]{1,40}$/u.test(value);
}

/**
 * Normalises a path written by sprite-gen or the Agent to a workspace-relative media path.
 * Accepts `/workspace/...`, workspace-relative `assets/...` / `.build/sprite-gen/...` and paths
 * relative to the sprite work dir (`_gen_images/...`); rejects anything else.
 */
export function canvasSpriteMediaPath(
  value: unknown,
  name: string,
  kind: 'image' | 'video' | 'json'
): string | undefined {
  if (typeof value !== 'string' || !value || value.length > 512) return;
  if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(name)) return;
  let path = value.indexOf('/workspace/') === 0 ? value.slice('/workspace/'.length) : value;
  if (path.indexOf('./') === 0) path = path.slice(2);
  // eslint-disable-next-line no-control-regex
  if (path.charAt(0) === '/' || /[\\:?#%\u0000-\u001f\u007f]/.test(path)) return;
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return;
  if (segments[0] === '_gen_images' || segments[0] === '_gen_videos')
    path = '.build/sprite-gen/' + name + '/' + path;
  else if (
    !(segments[0] === 'assets' || (segments[0] === '.build' && segments[1] === 'sprite-gen'))
  )
    return;
  if (path.split('/').length < 3) return;
  const pattern =
    kind === 'image'
      ? /\.(png|jpe?g|webp)$/i
      : kind === 'video'
        ? /\.(mp4|mov|webm)$/i
        : /\.json$/i;
  return pattern.test(path) ? path : undefined;
}

export interface CanvasSpriteStage {
  label: string;
  /** Group badge state (cardUi canvas-group-state). */
  state: 'empty' | 'loading' | 'waiting' | 'ready' | 'unknown' | 'failed';
  /** True while sprite-gen waits for the user at a gate in the conversation. */
  gate: boolean;
  /** Finished: the page stops polling this section. */
  done: boolean;
}

/** Chinese stage text for the section header, derived from _progress.json state. */
export function canvasSpriteStage(
  status: 'missing' | 'ok' | 'unsupported' | 'error',
  state?: unknown
): CanvasSpriteStage {
  if (status === 'missing')
    return { label: '等待对话开始', state: 'empty', gate: false, done: false };
  if (status === 'error')
    return { label: '读取进度失败', state: 'failed', gate: false, done: false };
  if (status === 'unsupported')
    return { label: '中间过程暂不支持此版本', state: 'unknown', gate: false, done: false };
  if (state === 'done') return { label: '已完成', state: 'ready', gate: false, done: true };
  // [label, gate]; gate states mirror sprite_gen.graph.json kind "gate".
  const stages: Record<string, [string, boolean]> = {
    collect_input: ['填写参数', true],
    preprocess: ['预处理素材', false],
    cutout_review: ['确认抠图', true],
    viewpoint_gen: ['生成视角候选', false],
    viewpoint_select: ['选择视角', true],
    plan: ['确认动画清单', true],
    pose_detect: ['检测姿态', false],
    pose_gen: ['生成姿态候选', false],
    pose_select: ['选择姿态', true],
    video_model: ['选择视频模型', true],
    build_prompt: ['准备视频提示词', false],
    anim_next: ['准备下一个动作', false],
    gen_video: ['生成视频', false],
    video_review: ['确认视频', true],
    to_sprites: ['导出精灵表', false],
    sheet_review: ['确认精灵表', true],
    update_confirm: ['确认更新', true],
  };
  const entry =
    typeof state === 'string' && Object.prototype.hasOwnProperty.call(stages, state)
      ? stages[state]
      : undefined;
  if (!entry) return { label: '进行中', state: 'loading', gate: false, done: false };
  return entry[1]
    ? { label: entry[0] + ' · 待确认', state: 'waiting', gate: true, done: false }
    : { label: entry[0], state: 'loading', gate: false, done: false };
}

/**
 * Builds a frame set from a sprite-gen / TexturePacker spritesheet.json page. Trimmed frames keep
 * their own rect plus sourceSize/spriteSourceSize offsets; frames on related pages are left out
 * (only page 1 is previewed) and `pages` reports the total.
 */
export function canvasSpriteFrameSet(
  sheet: unknown
): { info: FrameSetInfo; image: string; animation: string } | undefined {
  const record = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const integer = (value: unknown, min: number): value is number =>
    Number.isSafeInteger(value) && (value as number) >= min;
  if (!record(sheet) || !record(sheet.meta) || !record(sheet.frames)) return;
  const meta = sheet.meta;
  const size = meta.size;
  if (!record(size) || !integer(size.w, 1) || !integer(size.h, 1) || size.w > 8192 || size.h > 8192)
    return;
  const image = meta.image;
  if (typeof image !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}\.(png|webp)$/i.test(image))
    return;
  const animations = Array.isArray(sheet.animations) ? sheet.animations.filter(record) : [];
  const animation = animations[0];
  const keys: string[] =
    animation && Array.isArray(animation.frames)
      ? animation.frames.filter((key: unknown) => typeof key === 'string')
      : Object.keys(sheet.frames);
  const frames: FrameSetFrame[] = [];
  for (const key of keys) {
    // Keys absent here live on a related page.
    if (!Object.prototype.hasOwnProperty.call(sheet.frames, key)) continue;
    const entry = sheet.frames[key];
    if (!record(entry) || !record(entry.frame) || entry.rotated === true) return;
    const rect = entry.frame;
    if (
      !integer(rect.x, 0) ||
      !integer(rect.y, 0) ||
      !integer(rect.w, 1) ||
      !integer(rect.h, 1) ||
      rect.x + rect.w > size.w ||
      rect.y + rect.h > size.h
    )
      return;
    const frame: FrameSetFrame = {
      index: frames.length,
      time: 0,
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
    };
    const source = entry.sourceSize;
    const placed = entry.spriteSourceSize;
    if (record(source) && record(placed)) {
      if (
        !integer(source.w, 1) ||
        !integer(source.h, 1) ||
        !integer(placed.x, 0) ||
        !integer(placed.y, 0) ||
        placed.x + rect.w > source.w ||
        placed.y + rect.h > source.h
      )
        return;
      if (source.w !== rect.w || source.h !== rect.h || placed.x || placed.y) {
        frame.sourceWidth = source.w;
        frame.sourceHeight = source.h;
        frame.offsetX = placed.x;
        frame.offsetY = placed.y;
      }
    }
    const duration = entry.duration;
    if (
      typeof duration === 'number' &&
      Number.isFinite(duration) &&
      duration > 0 &&
      duration <= 60000
    )
      frame.duration = Math.round(duration);
    frames.push(frame);
    if (frames.length >= 600) break;
  }
  if (!frames.length) return;
  const timed = frames.filter((frame) => frame.duration);
  const declared = animation && animation.fps;
  const fps =
    typeof declared === 'number' && Number.isFinite(declared) && declared > 0 && declared <= 120
      ? declared
      : timed.length
        ? Math.min(
            120,
            Math.max(
              1,
              Math.round(
                100000 / (timed.reduce((sum, frame) => sum + frame.duration!, 0) / timed.length)
              ) / 100
            )
          )
        : 24;
  let elapsed = 0;
  for (const frame of frames) {
    frame.time = Math.round(elapsed) / 1000;
    elapsed += frame.duration || 1000 / fps;
  }
  const columns = Math.ceil(Math.sqrt(frames.length));
  const pages = 1 + (Array.isArray(meta.relatedMultiPacks) ? meta.relatedMultiPacks.length : 0);
  return {
    info: {
      fps,
      frameCount: frames.length,
      width: size.w,
      height: size.h,
      columns,
      rows: Math.ceil(frames.length / columns),
      frames,
      ...(pages > 1 ? { pages } : {}),
    },
    image,
    animation: animation && typeof animation.name === 'string' ? animation.name : '',
  };
}

/** Animation ids whose assets/sprites/<name>/<id>/spritesheet.json may exist. */
export function canvasSpriteSheetIds(progress: unknown, sprite: unknown): string[] {
  const record = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const safe = (value: unknown): value is string =>
    typeof value === 'string' && /^[\p{L}\p{N}_-]{1,64}$/u.test(value);
  const ids: string[] = [];
  const add = (id: unknown) => {
    if (safe(id) && ids.indexOf(id) < 0 && ids.length < 32) ids.push(id);
  };
  if (record(progress) && progress.schema_version === 3 && record(progress.context)) {
    const anims = Array.isArray(progress.context.anims) ? progress.context.anims : [];
    for (const anim of anims)
      if (
        record(anim) &&
        (anim.video_ref || anim.status === 'done' || anim.status === 'video_approved')
      )
        add(anim.id);
  }
  const related = record(sprite) && record(sprite.meta) ? sprite.meta.relatedMultiPacks : undefined;
  if (Array.isArray(related))
    for (const item of related) {
      const match = typeof item === 'string' ? /^([^/]+)\/spritesheet\.json$/.exec(item) : null;
      if (match) add(match[1]);
    }
  return ids;
}

export interface CanvasSpriteMirrorCard {
  key: string;
  type: 'image' | 'video-source' | 'sequence' | 'animation';
  assetPath: string;
  title: string;
  /** Layout row inside the section: 0 prep, 1 viewpoints, 2 poses, 3+ one per animation. */
  row: number;
  /** Mirror key of the card it was produced from, or 'source' for the starting image. */
  parent?: string;
  edgeKind?: CanvasEdgeKind;
  frameSetInfo?: FrameSetInfo;
  /** The card is already on the canvas but its file can no longer be read; shown as 素材丢失. */
  missing?: boolean;
}
export interface CanvasSpriteMirrorPlan {
  status: 'missing' | 'ok' | 'unsupported' | 'error';
  stage: CanvasSpriteStage;
  /** Only a readable v3 progress may remove mirror cards and edges that are no longer produced. */
  authoritative: boolean;
  cards: CanvasSpriteMirrorCard[];
}

/**
 * Pure reconcile: sprite-gen files in, desired mirror cards out. `missing` lists asset paths the
 * host could not read: a new card is skipped (children link to the nearest ancestor) until its
 * file lands, while a card listed in `existing` stays and is flagged `missing`.
 */
export function reconcileSpriteMirror(input: {
  name: string;
  /** Parsed _progress.json; undefined means 404 (not started). */
  progress?: unknown;
  progressError?: boolean;
  /** Parsed assets/sprites/<name>/sprite.json, if present. */
  sprite?: unknown;
  /** animId → parsed spritesheet.json (page 1). */
  sheets?: Record<string, unknown>;
  dismissed?: string[];
  missing?: string[];
  /** Mirror keys already on the canvas. */
  existing?: string[];
}): CanvasSpriteMirrorPlan {
  const record = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const safe = (value: unknown, max: number): value is string =>
    typeof value === 'string' && value.length <= max && /^[\p{L}\p{N}_-]+$/u.test(value);
  const name = input.name;
  const status: CanvasSpriteMirrorPlan['status'] = input.progressError
    ? 'error'
    : input.progress === undefined
      ? 'missing'
      : record(input.progress) &&
          input.progress.schema_version === 3 &&
          record(input.progress.context)
        ? 'ok'
        : 'unsupported';
  const progress = status === 'ok' ? (input.progress as Record<string, any>) : undefined;
  const stage = canvasSpriteStage(status, progress && progress.state);
  type Raw = Omit<CanvasSpriteMirrorCard, 'parent' | 'edgeKind'> & { parents: string[] };
  const raw: Raw[] = [];
  const push = (card: Omit<Raw, 'assetPath'> & { assetPath: string | undefined }) => {
    if (card.assetPath && !raw.some((item) => item.key === card.key)) raw.push(card as Raw);
  };
  const base = '.build/sprite-gen/' + name + '/';
  const sheets = input.sheets || {};
  const addSheet = (id: string, row: number, parents: string[]) => {
    const sheet = Object.prototype.hasOwnProperty.call(sheets, id) ? sheets[id] : undefined;
    const parsed = sheet === undefined ? undefined : canvasSpriteFrameSet(sheet);
    if (!parsed) return;
    const assetPath = canvasSpriteMediaPath(
      'assets/sprites/' + name + '/' + id + '/' + parsed.image,
      name,
      'image'
    );
    push({
      key: 'sequence:' + id,
      type: 'sequence',
      assetPath,
      title: '序列帧 · ' + id,
      row,
      parents,
      frameSetInfo: parsed.info,
    });
    push({
      key: 'animation:' + id,
      type: 'animation',
      assetPath,
      title: '动画 · ' + id,
      row,
      parents: ['sequence:' + id],
      frameSetInfo: parsed.info,
    });
  };
  if (progress) {
    const context = progress.context;
    const flags = record(context.flags) ? context.flags : {};
    if (progress.state !== 'collect_input') {
      push({
        key: 'cutout_ref',
        type: 'image',
        assetPath: base + '_gen_images/cutout_ref.png',
        title: '抠图参考',
        row: 0,
        parents: ['source'],
      });
      push({
        key: 'cutout',
        type: 'image',
        assetPath: base + '_gen_images/cutout.png',
        title: '抠图',
        row: 0,
        parents: ['cutout_ref', 'source'],
      });
      push({
        key: 'ready',
        type: 'image',
        assetPath: base + '_gen_images/ready.png',
        title: '主参考图',
        row: 0,
        parents: ['cutout', 'cutout_ref', 'source'],
      });
    }
    const viewpoints = Array.isArray(flags.viewpoint_candidates)
      ? flags.viewpoint_candidates
      : typeof flags.viewpoint_candidates === 'string'
        ? [flags.viewpoint_candidates]
        : [];
    viewpoints.slice(0, 12).forEach((candidate: unknown, index: number) => {
      const assetPath = canvasSpriteMediaPath(candidate, name, 'image');
      push({
        key: 'viewpoint:' + assetPath,
        type: 'image',
        assetPath,
        title: '视角候选 ' + (index + 1),
        row: 1,
        parents: ['ready', 'cutout', 'cutout_ref', 'source'],
      });
    });
    const poses: string[] = [];
    const candidates = record(flags.pose_candidates) ? flags.pose_candidates : {};
    for (const pose of Object.keys(candidates))
      if (safe(pose, 40) && poses.length < 8) poses.push(pose);
    const gaps = Array.isArray(flags.pose_gaps) ? flags.pose_gaps : [];
    for (const gap of gaps) {
      const pose = record(gap) ? gap.pose : gap;
      if (safe(pose, 40) && poses.indexOf(pose) < 0 && poses.length < 8) poses.push(pose);
    }
    for (const pose of poses) {
      const list = Object.prototype.hasOwnProperty.call(candidates, pose) ? candidates[pose] : [];
      (Array.isArray(list) ? list : [list])
        .slice(0, 8)
        .forEach((candidate: unknown, index: number) => {
          const assetPath = canvasSpriteMediaPath(candidate, name, 'image');
          push({
            key: 'pose:' + pose + ':' + assetPath,
            type: 'image',
            assetPath,
            title: pose + ' 姿态候选 ' + (index + 1),
            row: 2,
            parents: ['ready', 'source'],
          });
        });
      push({
        key: 'pose-selected:' + pose,
        type: 'image',
        assetPath: base + '_gen_images/' + pose + '.png',
        title: pose + ' 姿态',
        row: 2,
        parents: ['ready', 'source'],
      });
    }
    const anims = (Array.isArray(context.anims) ? context.anims : [])
      .filter((anim: unknown) => record(anim) && safe(anim.id, 64))
      .slice(0, 32);
    anims.forEach((anim: Record<string, any>, index: number) => {
      const id: string = anim.id;
      const row = 3 + index;
      if (anim.video_ref)
        push({
          key: 'video:' + id,
          type: 'video-source',
          // video_ref may be a CDN URL; sprite-gen always lands the local copy here.
          assetPath:
            canvasSpriteMediaPath(anim.video_ref, name, 'video') ||
            base + '_gen_videos/' + id + '/anim.mp4',
          title: '视频 · ' + id,
          row,
          parents: ['ready', 'cutout', 'cutout_ref', 'source'],
        });
      addSheet(id, row, ['video:' + id]);
    });
  } else if (status === 'unsupported') {
    canvasSpriteSheetIds(undefined, input.sprite).forEach((id, index) =>
      addSheet(id, 3 + index, [])
    );
  }
  const dismissed = input.dismissed || [];
  const missing = input.missing || [];
  const existing = input.existing || [];
  const lost = (card: Raw) => missing.indexOf(card.assetPath) >= 0;
  const kept = raw.filter(
    (card) => dismissed.indexOf(card.key) < 0 && (!lost(card) || existing.indexOf(card.key) >= 0)
  );
  const types: Record<string, CanvasSpriteMirrorCard['type']> = { source: 'image' };
  kept.forEach((card) => (types[card.key] = card.type));
  const cards = kept.map((card) => {
    const parent = card.parents.find((key) => Object.prototype.hasOwnProperty.call(types, key));
    const from = parent ? types[parent] : undefined;
    const edgeKind: CanvasEdgeKind | undefined =
      card.type === 'image'
        ? 'image-variant'
        : card.type === 'video-source'
          ? 'image-to-video'
          : card.type === 'sequence' && from === 'video-source'
            ? 'sequence-source'
            : card.type === 'animation' && from === 'sequence'
              ? 'sequence-animation'
              : undefined;
    const result: CanvasSpriteMirrorCard = {
      key: card.key,
      type: card.type,
      assetPath: card.assetPath,
      title: card.title,
      row: card.row,
    };
    if (parent && edgeKind) {
      result.parent = parent;
      result.edgeKind = edgeKind;
    }
    if (card.frameSetInfo) result.frameSetInfo = card.frameSetInfo;
    if (lost(card)) result.missing = true;
    return result;
  });
  return { status, stage, authoritative: status === 'ok', cards };
}

/** New sprite group around the source image; the source card itself moves into it. */
export function createSpriteSection(
  document: CanvasDocument,
  sourceId: string,
  name: string,
  type: 'character' | 'generic',
  id: string,
  now: number
): CanvasNode | undefined {
  const source = document.nodes.find(
    (node) => node.id === sourceId && node.type === 'image' && node.assetPath
  );
  if (!source || !/^[\p{L}\p{N}_-]{1,40}$/u.test(name)) return;
  const section: CanvasNode = {
    id,
    type: 'section',
    x: source.x - 28,
    y: source.y - 68,
    width: Math.max(320, source.width + 56),
    height: Math.max(200, source.height + 96),
    title: '精灵：' + name,
    spriteGen: { name, type, sourceId: source.id, startedAt: now, dismissed: [] },
  };
  document.nodes.push(section);
  source.sectionId = section.id;
  delete source.templatePending;
  return section;
}

/** Records deleted mirror cards on their sprite section so later syncs leave them out. */
export function dismissSpriteMirrors(
  document: CanvasDocument,
  nodeIds: readonly string[]
): boolean {
  let changed = false;
  for (const node of document.nodes) {
    if (nodeIds.indexOf(node.id) < 0 || !node.mirror || node.mirror.source !== 'sprite-gen')
      continue;
    const mirror = node.mirror;
    const section = document.nodes.find(
      (item) =>
        item.type === 'section' &&
        item.spriteGen &&
        item.spriteGen.name === mirror.name &&
        (item.id === node.sectionId || !node.sectionId)
    );
    if (!section || !section.spriteGen || nodeIds.indexOf(section.id) >= 0) continue;
    if (section.spriteGen.dismissed.indexOf(mirror.key) >= 0) continue;
    section.spriteGen.dismissed = section.spriteGen.dismissed.concat(mirror.key).slice(-500);
    changed = true;
  }
  return changed;
}

/**
 * Grows a sprite section in every direction to keep its members inside (28px sides, 68px under the
 * header, as createSpriteSection); never shrinks it. Growing left/up moves its top-left corner.
 */
export function growSpriteSection(document: CanvasDocument, sectionId: string): boolean {
  const section = document.nodes.find((node) => node.id === sectionId && node.type === 'section');
  if (!section) return false;
  const members = document.nodes.filter((node) => node.sectionId === sectionId);
  if (!members.length) return false;
  const edge = (values: number[], pick: (...items: number[]) => number) => pick.apply(null, values);
  const left = Math.min(
    section.x,
    edge(
      members.map((node) => node.x - 28),
      Math.min
    )
  );
  const top = Math.min(
    section.y,
    edge(
      members.map((node) => node.y - 68),
      Math.min
    )
  );
  const right = Math.max(
    section.x + section.width,
    edge(
      members.map((node) => node.x + node.width + 28),
      Math.max
    )
  );
  const bottom = Math.max(
    section.y + section.height,
    edge(
      members.map((node) => node.y + node.height + 28),
      Math.max
    )
  );
  const x = Math.round(left);
  const y = Math.round(top);
  const width = Math.round(Math.min(20000, right - left));
  const height = Math.round(Math.min(20000, bottom - top));
  if (x === section.x && y === section.y && width === section.width && height === section.height)
    return false;
  section.x = x;
  section.y = y;
  section.width = width;
  section.height = height;
  return true;
}

/**
 * Applies a plan to the section in place: adds new mirror cards in a left-to-right tree, updates
 * changed assets and links each new card once; never removes cards or lines (see options.tidy).
 * Returns whether the document changed. A plain sync is not an undo step: callers skip remember().
 */
export function applySpriteMirror(
  document: CanvasDocument,
  sectionId: string,
  plan: CanvasSpriteMirrorPlan,
  createId: () => string,
  /**
   * 重新整理 (a user action): drop the lines into cards the plan lists and every card's layout
   * memory, so lines and the tree layout are rebuilt from the current progress and the group is
   * fitted to its cards. Deleted cards stay deleted; unlisted cards keep their lines.
   */
  options: { tidy?: boolean } = {}
): boolean {
  const section = document.nodes.find((node) => node.id === sectionId && node.type === 'section');
  const sprite = section && section.spriteGen;
  if (!section || !sprite) return false;
  let changed = false;
  const mine = (node: CanvasNode) =>
    Boolean(
      node.mirror &&
        node.mirror.source === 'sprite-gen' &&
        node.mirror.name === sprite.name &&
        node.sectionId === section.id
    );
  if (options.tidy) {
    const listed = plan.cards.map((card) => card.key);
    const cards = document.nodes.filter(mine);
    const from = cards.map((node) => node.id).concat(sprite.sourceId);
    const reset = cards
      .filter((node) => listed.indexOf(node.mirror!.key) >= 0)
      .map((node) => node.id);
    const edges = document.edges.filter(
      (edge) => !(reset.indexOf(edge.to) >= 0 && from.indexOf(edge.from) >= 0)
    );
    if (edges.length !== document.edges.length) {
      document.edges = edges;
      changed = true;
    }
    cards.forEach((node) => {
      if (node.mirror!.placed || node.mirror!.linked) changed = true;
      delete node.mirror!.placed;
      if (reset.indexOf(node.id) >= 0) delete node.mirror!.linked;
    });
  }
  // Only adds: cards sprite-gen no longer lists (e.g. replaced candidates) stay with their lines;
  // the user deletes them by hand if not wanted.
  const existing: Record<string, CanvasNode> = {};
  document.nodes.filter(mine).forEach((node) => (existing[node.mirror!.key] = node));
  const source = document.nodes.find((node) => node.id === sprite.sourceId);
  const origin = source && source.sectionId === section.id ? source : undefined;
  const sizes: Record<string, [number, number]> = {
    image: [180, 240],
    'video-source': [240, 210],
    sequence: [360, 280],
    animation: [260, 300],
  };
  const gapX = 56;
  const gapY = 40;
  const ids: Record<string, string> = {};
  if (source) ids.source = source.id;
  const fresh: Record<string, boolean> = {};
  for (const card of plan.cards) {
    let node = Object.prototype.hasOwnProperty.call(existing, card.key)
      ? existing[card.key]
      : undefined;
    if (node) {
      if (node.assetPath !== card.assetPath) {
        node.assetPath = card.assetPath;
        delete node.assetVersion;
        delete node.imageInfo;
        delete node.videoInfo;
        changed = true;
      }
      if (
        card.frameSetInfo &&
        JSON.stringify(node.frameSetInfo) !== JSON.stringify(card.frameSetInfo)
      ) {
        node.frameSetInfo = JSON.parse(JSON.stringify(card.frameSetInfo));
        changed = true;
      }
    } else {
      const size = sizes[card.type];
      node = {
        id: createId(),
        type: card.type,
        x: 0,
        y: 0,
        width: size[0],
        height: size[1],
        title: card.title,
        sectionId: section.id,
        assetPath: card.assetPath,
        mirror: { source: 'sprite-gen', name: sprite.name, key: card.key },
      };
      if (card.frameSetInfo) node.frameSetInfo = JSON.parse(JSON.stringify(card.frameSetInfo));
      if (card.type === 'sequence' && card.frameSetInfo) {
        const info = card.frameSetInfo;
        const last = info.frames[info.frames.length - 1];
        // Display-only settings so the shared sequence card renders; mirrors never re-run them.
        node.sequenceSettings = {
          start: 0,
          end: Math.round((last.time + (last.duration || 1000 / info.fps) / 1000) * 1000) / 1000,
          fps: info.fps,
          cutout: false,
          backgroundColor: '#000000',
          tolerance: 0,
          duplicateThreshold: 0,
          width: Math.max.apply(
            null,
            info.frames.map((frame) => frame.sourceWidth || frame.width)
          ),
          height: Math.max.apply(
            null,
            info.frames.map((frame) => frame.sourceHeight || frame.height)
          ),
          fit: 'contain',
          pixel: false,
        };
      }
      document.nodes.push(node);
      existing[card.key] = node;
      changed = true;
      fresh[card.key] = true;
    }
    ids[card.key] = node.id;
  }
  Object.keys(existing).forEach((key) => (ids[key] = existing[key].id));
  // Left-to-right tree: each card sits one column right of the card it came from; siblings stack
  // downward in creation order, so new candidates fan out below the ones already there.
  // A card that already has a line from the source or another mirror card keeps it: layout and
  // edges follow that line instead of the plan, so a late intermediate output never rewires it.
  const keyOf: Record<string, string> = {};
  Object.keys(ids).forEach((key) => (keyOf[ids[key]] = key));
  const incoming = (node: CanvasNode) =>
    document.edges.find((edge) => edge.to === node.id && Boolean(keyOf[edge.from]));
  const planned: Record<string, CanvasSpriteMirrorCard> = {};
  plan.cards.forEach((card) => (planned[card.key] = card));
  // Document order = creation order (new cards are pushed last).
  const keys = document.nodes.filter(mine).map((node) => node.mirror!.key);
  const children: Record<string, string[]> = {};
  const roots: string[] = [];
  for (const key of keys) {
    const line = fresh[key] ? undefined : incoming(existing[key]);
    const parent = line ? keyOf[line.from] : planned[key] && planned[key].parent;
    if (parent && parent !== key && (parent === 'source' ? Boolean(origin) : Boolean(ids[parent])))
      (children[parent] = children[parent] || []).push(key);
    else roots.push(key);
  }
  const depth: Record<string, number> = {};
  const widths: number[] = [];
  const measure = (key: string, level: number) => {
    if (depth[key] !== undefined) return;
    depth[key] = level;
    const node = key === 'source' ? source : existing[key];
    if (node) widths[level] = Math.max(widths[level] || 0, node.width);
    (children[key] || []).forEach((child) => measure(child, level + 1));
  };
  const start = origin ? 0 : 1;
  if (origin) measure('source', 0);
  roots.forEach((key) => measure(key, start));
  // Cards only reachable through a loop of user-drawn lines are laid out as extra roots.
  keys.forEach((key) => {
    if (depth[key] === undefined) {
      roots.push(key);
      measure(key, start);
    }
  });
  const columnX = (level: number) => {
    let x = origin ? origin.x : section.x + 28;
    for (let index = start; index < level; index++) x += (widths[index] || 0) + gapX;
    return x;
  };
  // Cards from before the tree layout have no `placed`: lay them out once as well.
  const follows = (node: CanvasNode) => {
    const placed = node.mirror!.placed;
    return Boolean(
      fresh[node.mirror!.key] || !placed || (placed.x === node.x && placed.y === node.y)
    );
  };
  const done: Record<string, boolean> = {};
  const place = (key: string, y: number): number => {
    const node = key === 'source' ? source! : existing[key];
    if (done[key]) return node.y + node.height;
    done[key] = true;
    if (key !== 'source' && follows(node)) {
      const x = Math.round(columnX(depth[key]));
      const top = Math.round(y);
      if (node.x !== x || node.y !== top) {
        node.x = x;
        node.y = top;
        changed = true;
      }
      if (!node.mirror!.placed || node.mirror!.placed.x !== x || node.mirror!.placed.y !== top) {
        node.mirror!.placed = { x, y: top };
        changed = true;
      }
    }
    let cursor = node.y;
    let bottom = node.y + node.height;
    for (const child of children[key] || []) {
      bottom = Math.max(bottom, place(child, cursor));
      cursor = bottom + gapY;
    }
    return bottom;
  };
  let cursor = origin ? origin.y : section.y + 68;
  if (origin) cursor = place('source', origin.y) + gapY;
  for (const key of roots) cursor = place(key, cursor) + gapY;
  // Lines are only ever added: one per card, the first time its parent is on the canvas. Existing
  // lines (including ones the user drew) are never removed or rewired; a removed one is not re-added.
  for (const card of plan.cards) {
    const node = existing[card.key];
    if (node.mirror!.linked) continue;
    if (incoming(node)) {
      node.mirror!.linked = true;
      changed = true;
      continue;
    }
    const from = card.parent && card.edgeKind ? ids[card.parent] : undefined;
    if (!from) continue;
    document.edges.push({ id: createId(), from, to: node.id, kind: card.edgeKind! });
    node.mirror!.linked = true;
    changed = true;
  }
  for (const card of plan.cards) {
    if (card.type !== 'sequence') continue;
    const node = existing[card.key];
    const video = card.parent && card.parent.indexOf('video:') === 0 ? ids[card.parent] : undefined;
    if (video && node.sourceVideoId !== video) {
      node.sourceVideoId = video;
      changed = true;
    } else if (!video && node.sourceVideoId) {
      delete node.sourceVideoId;
      changed = true;
    }
  }
  if (options.tidy) {
    // Fit the group to its cards again (growing alone never shrinks it).
    const members = document.nodes.filter((node) => node.sectionId === section.id);
    if (members.length) {
      const x = Math.round(
        Math.min.apply(
          null,
          members.map((node) => node.x)
        ) - 28
      );
      const y = Math.round(
        Math.min.apply(
          null,
          members.map((node) => node.y)
        ) - 68
      );
      const right =
        Math.max.apply(
          null,
          members.map((node) => node.x + node.width)
        ) + 28;
      const bottom =
        Math.max.apply(
          null,
          members.map((node) => node.y + node.height)
        ) + 28;
      const width = Math.round(Math.min(20000, Math.max(320, right - x)));
      const height = Math.round(Math.min(20000, Math.max(200, bottom - y)));
      if (
        section.x !== x ||
        section.y !== y ||
        section.width !== width ||
        section.height !== height
      )
        changed = true;
      Object.assign(section, { x, y, width, height });
    }
  }
  if (growSpriteSection(document, section.id)) changed = true;
  return changed;
}
