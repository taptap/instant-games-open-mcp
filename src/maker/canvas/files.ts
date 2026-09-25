import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { getGitCommand } from '../system/git.js';
import {
  CanvasStoreError,
  starterDocument,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSummary,
} from './model.js';
import { MAX_SEQUENCE_FRAMES } from './sequenceModel.js';
import { STARTER_IMAGE_BASE64 } from './starterImages.js';
import type { FrameSetInfo, SequenceSettings, VideoInfo } from './sequenceModel.js';

const execFileAsync = promisify(execFile);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELATIVE = /^(?:assets\/image\/canvas-[0-9a-f-]{36}\.(?:png|jpg|webp))$/i;
const VIDEO_RELATIVE =
  /^\.maker\/canvases\/[0-9a-f-]{36}\/videos\/video-[0-9a-f-]{36}\.(?:mp4|mov|webm)$/i;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function fail(message: string, status: number, code: string): never {
  throw new CanvasStoreError(message, status, code);
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function numberIn(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label}无效。`, 400, 'INVALID_DOCUMENT');
  }
  return value;
}

function text(value: unknown, max: number, label: string, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max)
    fail(`${label}无效。`, 400, 'INVALID_DOCUMENT');
  return value;
}

export class MakerCanvasFiles {
  readonly root: string;

  constructor(projectRoot: string) {
    const root = fs.realpathSync(projectRoot);
    if (!fs.statSync(root).isDirectory() || fs.lstatSync(projectRoot).isSymbolicLink()) {
      fail('项目路径无效。', 400, 'UNSAFE_PATH');
    }
    this.root = root;
  }

  async list(): Promise<CanvasSummary[]> {
    const folder = this.canvasDir(false);
    if (!folder) return [];
    const names = fs.readdirSync(folder).filter((name) => name.endsWith('.json'));
    const rows: CanvasSummary[] = [];
    for (const name of names) {
      try {
        const id = name.slice(0, -5);
        const document = this.read(id);
        const stat = fs.statSync(this.file(id));
        rows.push({
          id: document.id,
          title: document.title,
          revision: document.revision,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* 损坏的单张画布不挡住其他画布。 */
      }
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async create(title?: string): Promise<CanvasDocument> {
    this.assertStorageShape();
    await this.assertIgnored();
    const document = starterDocument(title);
    const folder = this.ensureDir(path.join(this.root, 'assets', 'image'));
    const written: string[] = [];
    try {
      document.nodes.forEach((node, index) => {
        const name = path.basename(node.assetPath!);
        this.atomicWrite(folder, name, Buffer.from(STARTER_IMAGE_BASE64[index], 'base64'));
        written.push(path.join(folder, name));
      });
      this.write(document);
    } catch (error) {
      for (const filename of written) fs.rmSync(filename, { force: true });
      throw error;
    }
    return document;
  }

  async load(id: string): Promise<CanvasDocument> {
    return this.read(id);
  }

  async getActiveCanvasId(): Promise<string | undefined> {
    const folder = this.canvasDir(false);
    if (!folder) return undefined;
    const filename = path.join(folder, 'active');
    if (!fs.existsSync(filename)) return undefined;
    if (fs.lstatSync(filename).isSymbolicLink())
      fail('活动画布记录不能是符号链接。', 400, 'UNSAFE_PATH');
    const id = fs.readFileSync(filename, 'utf8').trim();
    if (!ID.test(id)) return undefined;
    try {
      this.read(id);
      return id;
    } catch {
      return undefined;
    }
  }

  async setActiveCanvasId(id: string): Promise<void> {
    this.assertStorageShape();
    await this.assertIgnored();
    this.read(id);
    this.atomicWrite(this.canvasDir(true)!, 'active', Buffer.from(id));
  }

  async save(id: string, input: unknown, baseRevision: number): Promise<CanvasDocument> {
    this.assertStorageShape();
    await this.assertIgnored();
    const current = this.read(id);
    if (current.revision !== baseRevision) {
      fail('画布已被其他保存更新。请保留当前编辑，刷新后再合并。', 409, 'CONFLICT');
    }
    const next = this.parse(input, id);
    next.revision = current.revision + 1;
    this.assertAssets(next);
    this.write(next);
    return next;
  }

  async importImage(bytes: Buffer): Promise<{ relativePath: string }> {
    this.assertStorageShape();
    if (bytes.length < 12 || bytes.length > 20 * 1024 * 1024) {
      fail('图片为空或超过 20 MiB。', 413, 'STORAGE_LIMIT');
    }
    const extension = extensionOf(bytes);
    if (!extension) fail('只接受 PNG、JPEG 或 WebP。', 400, 'INVALID_IMAGE');
    const folder = this.ensureDir(path.join(this.root, 'assets', 'image'));
    const name = `canvas-${randomUUID()}.${extension}`;
    const relativePath = `assets/image/${name}`;
    this.atomicWrite(folder, name, bytes);
    return { relativePath };
  }

  async importVideo(
    canvasId: string,
    bytes: Buffer,
    contentType: string
  ): Promise<{ relativePath: string }> {
    this.assertStorageShape();
    await this.assertIgnored();
    await this.load(canvasId);
    if (bytes.length < 12 || bytes.length > MAX_VIDEO_BYTES) {
      fail('视频为空或超过 100 MiB。', 413, 'STORAGE_LIMIT');
    }
    const extension = videoExtension(bytes, contentType);
    if (!extension) fail('只接受 MP4、MOV 或 WebM 视频。', 400, 'INVALID_VIDEO');
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', canvasId, 'videos'));
    const name = 'video-' + randomUUID() + '.' + extension;
    const relativePath = path
      .relative(this.root, path.join(folder, name))
      .split(path.sep)
      .join('/');
    this.atomicWrite(folder, name, bytes);
    return { relativePath };
  }

  readMedia(relativePath: string): { file: string; type: string } {
    if (!RELATIVE.test(relativePath) && !VIDEO_RELATIVE.test(relativePath)) {
      fail('素材路径无效。', 400, 'UNSAFE_PATH');
    }
    const target = path.join(this.root, relativePath);
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) {
      fail('素材不存在或不允许使用链接。', 404, 'UNSAFE_PATH');
    }
    const real = fs.realpathSync(target);
    if (!inside(this.root, real) || !fs.statSync(real).isFile()) {
      fail('素材超出当前项目。', 400, 'UNSAFE_PATH');
    }
    const type = relativePath.endsWith('.png')
      ? 'image/png'
      : relativePath.endsWith('.webp')
        ? 'image/webp'
        : relativePath.endsWith('.jpg')
          ? 'image/jpeg'
          : relativePath.endsWith('.webm')
            ? 'video/webm'
            : relativePath.endsWith('.mov')
              ? 'video/quicktime'
              : 'video/mp4';
    return { file: real, type };
  }

  private assertStorageShape(): void {
    for (const relative of [
      '.maker',
      path.join('.maker', 'canvases'),
      path.join('assets', 'image'),
    ]) {
      const full = path.join(this.root, relative);
      if (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink()) {
        fail('画布或图片目录不能是符号链接。', 400, 'UNSAFE_PATH');
      }
    }
  }

  private async assertIgnored(): Promise<void> {
    let insideRepo = false;
    try {
      const { stdout } = await execFileAsync(
        getGitCommand(),
        ['rev-parse', '--is-inside-work-tree'],
        {
          cwd: this.root,
        }
      );
      insideRepo = stdout.trim() === 'true';
    } catch {
      return;
    }
    if (!insideRepo) return;
    try {
      await execFileAsync(
        getGitCommand(),
        ['check-ignore', '-q', '--', '.maker/canvases/check.json'],
        {
          cwd: this.root,
        }
      );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 1) {
        fail(
          '当前项目的 .maker 目录未被 Git 忽略，已拒绝写入画布，避免本地画布被提交。请先忽略 .maker。画布不会自动修改 .gitignore。',
          409,
          'GITIGNORE_REQUIRED'
        );
      }
      fail('无法确认 .maker 是否被 Git 忽略，已拒绝写入。', 409, 'GITIGNORE_UNKNOWN');
    }
  }

  private canvasDir(create: boolean): string | undefined {
    const relative = path.join('.maker', 'canvases');
    const full = path.join(this.root, relative);
    if (!fs.existsSync(full)) {
      if (!create) return undefined;
      return this.ensureDir(full);
    }
    if (fs.lstatSync(full).isSymbolicLink()) fail('画布目录不能是符号链接。', 400, 'UNSAFE_PATH');
    const real = fs.realpathSync(full);
    if (!inside(this.root, real)) fail('画布目录超出当前项目。', 400, 'UNSAFE_PATH');
    return real;
  }

  private ensureDir(full: string): string {
    const relative = path.relative(this.root, full);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      fail('目标目录超出当前项目。', 400, 'UNSAFE_PATH');
    let current = this.root;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if (fs.existsSync(current)) {
        if (fs.lstatSync(current).isSymbolicLink())
          fail('目标目录不能是符号链接。', 400, 'UNSAFE_PATH');
      } else {
        fs.mkdirSync(current);
      }
    }
    const real = fs.realpathSync(current);
    if (!inside(this.root, real) || fs.lstatSync(current).isSymbolicLink()) {
      fail('目标目录超出当前项目。', 400, 'UNSAFE_PATH');
    }
    return real;
  }

  private file(id: string): string {
    if (!ID.test(id)) fail('画布标识无效。', 400, 'INVALID_ID');
    const folder = this.canvasDir(false);
    if (!folder) fail('画布不存在。', 404, 'NOT_FOUND');
    const target = path.join(folder, `${id}.json`);
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) {
      fail('画布不存在。', 404, 'NOT_FOUND');
    }
    const real = fs.realpathSync(target);
    if (!inside(this.root, real)) fail('画布文件超出当前项目。', 400, 'UNSAFE_PATH');
    return real;
  }

  private read(id: string): CanvasDocument {
    const file = this.file(id);
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.length > 1024 * 1024) fail('画布文档过大。', 413, 'STORAGE_LIMIT');
    return this.parse(JSON.parse(raw), id);
  }

  private write(document: CanvasDocument): void {
    const folder = this.canvasDir(true)!;
    this.atomicWrite(folder, `${document.id}.json`, Buffer.from(JSON.stringify(document)));
  }

  private atomicWrite(folder: string, name: string, bytes: Buffer): void {
    const finalPath = path.join(folder, name);
    if (fs.existsSync(finalPath) && fs.lstatSync(finalPath).isSymbolicLink()) {
      fail('不能覆盖符号链接。', 400, 'UNSAFE_PATH');
    }
    const temporary = path.join(folder, `${randomUUID()}.tmp`);
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    try {
      fs.renameSync(temporary, finalPath);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  private assertAssets(document: CanvasDocument): void {
    for (const node of document.nodes) {
      if (!node.assetPath) continue;
      this.readMedia(node.assetPath);
    }
  }

  private parse(value: unknown, id: string): CanvasDocument {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('画布文档无效。', 400, 'INVALID_DOCUMENT');
    }
    const input = value as Record<string, unknown>;
    if (input.id !== id) fail('画布标识不匹配。', 400, 'INVALID_DOCUMENT');
    const viewport = input.viewport as Record<string, unknown> | undefined;
    if (!viewport || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
      fail('画布文档无效。', 400, 'INVALID_DOCUMENT');
    }
    if (input.nodes.length > 400 || input.edges.length > 800) {
      fail('画布节点过多。', 413, 'STORAGE_LIMIT');
    }
    const nodes = input.nodes.map((item) => this.parseNode(item));
    const nodeIds = new Set<string>();
    for (const node of nodes) {
      if (nodeIds.has(node.id)) fail('画布节点标识重复。', 400, 'INVALID_DOCUMENT');
      nodeIds.add(node.id);
    }
    const edges = input.edges.map((item) => this.parseEdge(item, nodes));
    for (const node of nodes) {
      const sourceId = node.generation?.sourceImageId;
      if (
        sourceId &&
        nodes.some((source) => source.id === sourceId) &&
        !edges.some(
          (edge) => edge.kind === 'image-to-video' && edge.from === sourceId && edge.to === node.id
        )
      ) {
        fail('图生视频结果必须保留对应的图片来源关系。', 400, 'INVALID_EDGE');
      }
    }
    const seen = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of edges) {
      if (edgeIds.has(edge.id)) fail('画布连线标识重复。', 400, 'INVALID_EDGE');
      edgeIds.add(edge.id);
      if (seen.has(edge.to)) fail('一张视频卡只能有一条首帧线。', 400, 'INVALID_EDGE');
      seen.add(edge.to);
    }
    return {
      id,
      title: text(input.title, 80, '标题', '创作画布'),
      revision: numberIn(input.revision, 0, 1_000_000, 'revision'),
      viewport: {
        x: numberIn(viewport.x, -100000, 100000, '视口'),
        y: numberIn(viewport.y, -100000, 100000, '视口'),
        scale: numberIn(viewport.scale, 0.15, 4, '缩放'),
      },
      nodes,
      edges,
    };
  }

  private parseNode(value: unknown): CanvasNode {
    if (!value || typeof value !== 'object') fail('节点无效。', 400, 'INVALID_DOCUMENT');
    const node = value as Record<string, unknown>;
    if (typeof node.id !== 'string' || !ID.test(node.id))
      fail('节点标识无效。', 400, 'INVALID_DOCUMENT');
    if (
      node.type !== 'image' &&
      node.type !== 'video' &&
      node.type !== 'note' &&
      node.type !== 'video-source' &&
      node.type !== 'sequence' &&
      node.type !== 'animation'
    ) {
      fail('节点类型无效。', 400, 'INVALID_DOCUMENT');
    }
    const assetPath =
      node.assetPath === undefined ? undefined : text(node.assetPath, 240, '素材路径');
    if (node.type === 'video-source' && (!assetPath || !VIDEO_RELATIVE.test(assetPath))) {
      fail('视频素材卡必须引用本画布导入的视频。', 400, 'UNSAFE_PATH');
    }
    if (
      (node.type === 'image' || node.type === 'sequence' || node.type === 'animation') &&
      assetPath &&
      !RELATIVE.test(assetPath)
    ) {
      fail('图片素材必须位于当前项目的画布图片目录。', 400, 'UNSAFE_PATH');
    }
    if (
      node.type !== 'image' &&
      node.type !== 'video-source' &&
      node.type !== 'sequence' &&
      node.type !== 'animation' &&
      assetPath
    ) {
      fail('当前节点类型不能保存素材路径。', 400, 'INVALID_DOCUMENT');
    }
    const sourceVideoId =
      node.sourceVideoId === undefined ? undefined : text(node.sourceVideoId, 36, '视频来源标识');
    const sequenceSettings =
      node.sequenceSettings === undefined
        ? undefined
        : this.parseSequenceSettings(node.sequenceSettings);
    const frameSetInfo =
      node.frameSetInfo === undefined ? undefined : this.parseFrameSetInfo(node.frameSetInfo);
    const videoInfo =
      node.videoInfo === undefined ? undefined : this.parseVideoInfo(node.videoInfo);
    let generation: CanvasNode['generation'];
    if (node.generation !== undefined) {
      if (
        !node.generation ||
        typeof node.generation !== 'object' ||
        Array.isArray(node.generation) ||
        !assetPath ||
        (node.type !== 'image' && node.type !== 'video-source')
      ) {
        fail('生成记录只能附在已有结果的图片或视频卡上。', 400, 'INVALID_DOCUMENT');
      }
      const input = node.generation as Record<string, unknown>;
      const sourceImageId =
        input.sourceImageId === undefined
          ? undefined
          : text(input.sourceImageId, 36, '图片来源标识');
      if (sourceImageId && (node.type !== 'video-source' || !ID.test(sourceImageId))) {
        fail('图生视频图片来源无效。', 400, 'INVALID_DOCUMENT');
      }
      generation = {
        prompt: text(input.prompt, 8000, '生成提示词'),
        ...(input.taskId === undefined ? {} : { taskId: text(input.taskId, 160, '生成任务标识') }),
        ...(sourceImageId ? { sourceImageId } : {}),
      };
    }
    if (videoInfo && node.type !== 'video-source')
      fail('只有视频素材卡可以保存视频信息。', 400, 'INVALID_DOCUMENT');
    if (node.type === 'sequence') {
      if (!sourceVideoId || !ID.test(sourceVideoId) || !sequenceSettings) {
        fail('拆帧卡缺少视频来源或处理参数。', 400, 'INVALID_DOCUMENT');
      }
      if (frameSetInfo && !assetPath) fail('帧集信息必须绑定图集文件。', 400, 'INVALID_DOCUMENT');
    } else if (node.type === 'animation') {
      if (!assetPath || !frameSetInfo || sourceVideoId || sequenceSettings) {
        fail('动画卡必须引用已保存的图集和帧索引，不能包含处理草稿。', 400, 'INVALID_DOCUMENT');
      }
    } else if (sourceVideoId || sequenceSettings || frameSetInfo) {
      fail('只有拆帧卡可以保存拆帧状态。', 400, 'INVALID_DOCUMENT');
    }
    return {
      id: node.id,
      type: node.type,
      x: numberIn(node.x, -100000, 100000, '坐标'),
      y: numberIn(node.y, -100000, 100000, '坐标'),
      width: numberIn(node.width, 48, 2000, '尺寸'),
      height: numberIn(node.height, 36, 1600, '尺寸'),
      title: text(node.title, 80, '标题', '未命名'),
      ...(node.text === undefined ? {} : { text: text(node.text, 4000, '文字') }),
      ...(assetPath ? { assetPath } : {}),
      ...(videoInfo ? { videoInfo } : {}),
      ...(sourceVideoId ? { sourceVideoId } : {}),
      ...(sequenceSettings ? { sequenceSettings } : {}),
      ...(frameSetInfo ? { frameSetInfo } : {}),
      ...(generation ? { generation } : {}),
    };
  }

  private parseSequenceSettings(value: unknown): SequenceSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('拆帧参数无效。', 400, 'INVALID_DOCUMENT');
    }
    const settings = value as Record<string, unknown>;
    if (
      typeof settings.cutout !== 'boolean' ||
      typeof settings.pixel !== 'boolean' ||
      typeof settings.backgroundColor !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(settings.backgroundColor) ||
      (settings.fit !== 'contain' && settings.fit !== 'cover' && settings.fit !== 'stretch')
    ) {
      fail('拆帧参数无效。', 400, 'INVALID_DOCUMENT');
    }
    return {
      start: numberIn(settings.start, 0, 86400, '起始时间'),
      end: numberIn(settings.end, 0, 86400, '结束时间'),
      fps: numberIn(settings.fps, 1, 30, '帧率'),
      cutout: settings.cutout,
      backgroundColor: settings.backgroundColor,
      tolerance: numberIn(settings.tolerance, 0, 255, '抠图容差'),
      duplicateThreshold: numberIn(settings.duplicateThreshold, 0.8, 0.999, '重复帧阈值'),
      width: numberIn(settings.width, 1, 2048, '输出宽度'),
      height: numberIn(settings.height, 1, 2048, '输出高度'),
      fit: settings.fit,
      pixel: settings.pixel,
    };
  }

  private parseFrameSetInfo(value: unknown): FrameSetInfo {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('帧集信息无效。', 400, 'INVALID_DOCUMENT');
    }
    const info = value as Record<string, unknown>;
    if (
      !Array.isArray(info.frames) ||
      info.frames.length < 1 ||
      info.frames.length > MAX_SEQUENCE_FRAMES
    ) {
      fail('帧集帧数无效。', 400, 'INVALID_DOCUMENT');
    }
    const frames = info.frames.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('帧集帧信息无效。', 400, 'INVALID_DOCUMENT');
      }
      const frame = value as Record<string, unknown>;
      if (frame.index !== index) fail('帧集帧序号无效。', 400, 'INVALID_DOCUMENT');
      return {
        index,
        time: numberIn(frame.time, 0, 86400, '帧时间'),
        x: numberIn(frame.x, 0, 4096, '帧横坐标'),
        y: numberIn(frame.y, 0, 4096, '帧纵坐标'),
        width: numberIn(frame.width, 1, 2048, '帧宽度'),
        height: numberIn(frame.height, 1, 2048, '帧高度'),
      };
    });
    const frameCount = numberIn(info.frameCount, 1, MAX_SEQUENCE_FRAMES, '帧集帧数');
    const width = numberIn(info.width, 1, 4096, '图集宽度');
    const height = numberIn(info.height, 1, 4096, '图集高度');
    if (
      frameCount !== frames.length ||
      frames.some((frame) => frame.x + frame.width > width || frame.y + frame.height > height)
    ) {
      fail('帧集元数据与图集尺寸不匹配。', 400, 'INVALID_DOCUMENT');
    }
    return {
      fps: numberIn(info.fps, 1, 30, '帧集帧率'),
      frameCount,
      width,
      height,
      columns: numberIn(info.columns, 1, 4096, '图集列数'),
      rows: numberIn(info.rows, 1, 4096, '图集行数'),
      frames,
    };
  }

  private parseVideoInfo(value: unknown): VideoInfo {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('视频信息无效。', 400, 'INVALID_DOCUMENT');
    }
    const info = value as Record<string, unknown>;
    return {
      duration: numberIn(info.duration, 0, 24 * 60 * 60, '视频时长'),
      width: numberIn(info.width, 1, 16384, '视频宽度'),
      height: numberIn(info.height, 1, 16384, '视频高度'),
    };
  }

  private parseEdge(value: unknown, nodes: CanvasNode[]): CanvasEdge {
    if (!value || typeof value !== 'object') fail('连线无效。', 400, 'INVALID_EDGE');
    const edge = value as Record<string, unknown>;
    if (
      edge.kind !== 'first-frame' &&
      edge.kind !== 'image-to-video' &&
      edge.kind !== 'sequence-source' &&
      edge.kind !== 'sequence-animation'
    ) {
      fail('画布连线类型无效。', 400, 'INVALID_EDGE');
    }
    if (
      typeof edge.id !== 'string' ||
      !ID.test(edge.id) ||
      typeof edge.from !== 'string' ||
      typeof edge.to !== 'string'
    ) {
      fail('连线无效。', 400, 'INVALID_EDGE');
    }
    if (edge.from === edge.to) fail('不能把卡片连到自身。', 400, 'INVALID_EDGE');
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (
      edge.kind === 'first-frame' &&
      (!from?.assetPath || from.type !== 'image' || to?.type !== 'video')
    ) {
      fail('首帧线必须从已导入图片连到视频输入卡。', 400, 'INVALID_EDGE');
    }
    if (
      edge.kind === 'sequence-source' &&
      (from?.type !== 'video-source' || to?.type !== 'sequence' || to.sourceVideoId !== from.id)
    ) {
      fail('拆帧关系必须从视频素材卡连到对应流程卡。', 400, 'INVALID_EDGE');
    }
    if (
      edge.kind === 'image-to-video' &&
      (from?.type !== 'image' ||
        !from.assetPath ||
        to?.type !== 'video-source' ||
        !to.assetPath ||
        to.generation?.sourceImageId !== from.id)
    ) {
      fail('图生视频关系必须对应真实结果记录中的来源图片。', 400, 'INVALID_EDGE');
    }
    if (
      edge.kind === 'sequence-animation' &&
      (from?.type !== 'sequence' || !from.frameSetInfo || to?.type !== 'animation')
    ) {
      fail('动画关系必须从已保存帧集连到动画卡。', 400, 'INVALID_EDGE');
    }
    return { id: edge.id, from: edge.from, to: edge.to, kind: edge.kind };
  }
}

function extensionOf(bytes: Buffer): 'png' | 'jpg' | 'webp' | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'webp';
  return undefined;
}

function videoExtension(bytes: Buffer, contentType: string): 'mp4' | 'mov' | 'webm' | undefined {
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  if (type && !['video/mp4', 'video/quicktime', 'video/webm'].includes(type)) return undefined;
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (bytes.subarray(4, 8).toString() !== 'ftyp') return undefined;
  const brand = bytes.subarray(8, 12).toString();
  return type === 'video/quicktime' || brand === 'qt  ' ? 'mov' : 'mp4';
}
