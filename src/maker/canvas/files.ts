import { readDemoResource, demoResourceInfo } from '../demoResources.js';
import {
  exportTemplateArchive,
  readTemplateArchive,
  remapTemplateAssets,
  templateAssetPaths,
} from './templateArchive.js';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { validateFramePairGraph } from './framePair.js';
import path from 'node:path';
import { promisify } from 'node:util';
import { getGitCommand } from '../system/git.js';
import {
  CanvasStoreError,
  emptyDocument,
  starterDocument,
  type CanvasCreateTemplate,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSummary,
} from './model.js';
import { MAX_SEQUENCE_FRAMES } from './sequenceModel.js';
import { STARTER_IMAGE_BASE64 } from './starterImages.js';
import type { FrameSetInfo, SequenceSettings, VideoInfo } from './sequenceModel.js';
import { snapshotCanvasSource, type CanvasSourceSnapshot } from './dependencies.js';
import { parseTemplateFlow } from './templateWorkflow.js';
import {
  createCanvasTemplateModel,
  isBuiltinCanvasTemplate,
  templateCoverSource,
  templateCoverAnimation,
  type CanvasWorkflowTemplate,
} from './templates.js';
import { builtinCanvasTemplates, canvasPresets } from './presets.js';
import { readTemplatePage } from './templateCatalog.js';
import { validateImageAssetsInfo } from './imageAssets.js';
import { validateMergeIcons, mergeIconPrompt } from './mergeIcons.js';

const execFileAsync = promisify(execFile);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELATIVE = /^(?:assets\/image\/canvas-[0-9a-f-]{36}\.(?:png|jpg|webp))$/i;
const RESOURCE_RELATIVE = new RegExp(
  '^[.]maker/canvases/[0-9a-f-]{36}/resources/[0-9a-f-]{36}[.]png$',
  'i'
);
const VIDEO_RELATIVE =
  /^\.maker\/canvases\/[0-9a-f-]{36}\/videos\/video-[0-9a-f-]{36}\.(?:mp4|mov|webm)$/i;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function fail(message: string, status: number, code: string): never {
  throw new CanvasStoreError(message, status, code);
}

function templateSkills(value: unknown): string[] | undefined {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length > 8 ||
    value.some((name) => typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name))
  )
    fail('模板 Skill 名称无效。', 400, 'INVALID_DOCUMENT');
  return [...new Set(value)] as string[];
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

  assertWritable(): void {
    this.assertStorageShape();
  }

  async assertWritableForGeneration(): Promise<void> {
    this.assertStorageShape();
    await this.assertIgnored();
  }

  importGeneratedImage(sourceRelativePath: string): string {
    this.assertStorageShape();
    if (!/^assets\/image\/[^/]+\.(?:png|jpg|jpeg|webp)$/i.test(sourceRelativePath)) {
      fail('生成图片路径无效。', 400, 'UNSAFE_PATH');
    }
    const source = this.safeProjectFile(sourceRelativePath);
    const extension = path.extname(source).toLowerCase().slice(1) || 'png';
    const name = `canvas-${randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
    const folder = this.ensureDir(path.join(this.root, 'assets', 'image'));
    this.atomicWrite(folder, name, fs.readFileSync(source));
    return `assets/image/${name}`;
  }

  importGeneratedVideo(canvasId: string, sourceRelativePath: string): string {
    this.assertStorageShape();
    if (!/^assets\/video\/[^/]+\.(?:mp4|mov|webm)$/i.test(sourceRelativePath)) {
      fail('生成视频路径无效。', 400, 'UNSAFE_PATH');
    }
    const source = this.safeProjectFile(sourceRelativePath);
    if (!ID.test(canvasId)) fail('画布标识无效。', 400, 'INVALID_ID');
    const extension = path.extname(source).toLowerCase().slice(1);
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', canvasId, 'videos'));
    const name = `video-${randomUUID()}.${extension}`;
    this.atomicWrite(folder, name, fs.readFileSync(source));
    return `.maker/canvases/${canvasId}/videos/${name}`;
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

  async listTemplates(): Promise<CanvasWorkflowTemplate[]> {
    this.assertStorageShape();
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', 'templates'));
    return [
      ...builtinCanvasTemplates(),
      ...fs
        .readdirSync(folder)
        .filter(
          (name) =>
            ID.test(name.slice(0, -5)) &&
            name.endsWith('.json') &&
            !isBuiltinCanvasTemplate(name.slice(0, -5))
        )
        .map((name) => this.readTemplate(name.slice(0, -5))),
    ];
  }

  async prepareTemplate(id: string, canvasId: string): Promise<CanvasWorkflowTemplate> {
    this.assertStorageShape();
    await this.assertIgnored();
    await this.load(canvasId);
    const preset = canvasPresets().find((template) => template.id === id);
    if (!preset) fail('预设模板不存在。', 404, 'NOT_FOUND');
    // Retired presets remain readable for existing references, but are absent from the catalog.
    const { assets: _assets, ...definition } = preset;
    const template: CanvasWorkflowTemplate = { ...structuredClone(definition), builtin: true };
    const paths = new Map<string, string>();
    try {
      for (const [source, asset] of Object.entries(preset.assets)) {
        const bytes = await readDemoResource(asset.resourceId);
        const imported =
          asset.type === 'video/mp4'
            ? await this.importVideo(canvasId, bytes, asset.type)
            : await this.importImage(bytes);
        paths.set(source, imported.relativePath);
      }
      for (const node of template.nodes) {
        if (node.assetPath) node.assetPath = paths.get(node.assetPath)!;
        for (const item of node.imageAssetsInfo?.items || [])
          item.assetPath = paths.get(item.assetPath)!;
        if (node.generation?.referenceImagePaths)
          node.generation.referenceImagePaths = node.generation.referenceImagePaths.map(
            (source) => paths.get(source)!
          );
      }
      for (const node of template.nodes) {
        if (node.sourceSnapshot)
          node.sourceSnapshot = snapshotCanvasSource(
            template.nodes.find((source) => source.id === node.sourceSnapshot!.nodeId)
          );
        if (node.sourceSnapshots)
          node.sourceSnapshots = node.sourceSnapshots.flatMap((snapshot) => {
            const oldSource = preset.nodes.find((source) => source.id === snapshot.nodeId);
            const newSource = template.nodes.find((source) => source.id === snapshot.nodeId);
            const next = snapshotCanvasSource(newSource);
            return next
              ? [
                  {
                    ...next,
                    version:
                      snapshot.version === snapshotCanvasSource(oldSource)?.version
                        ? next.version
                        : snapshot.version,
                  },
                ]
              : [];
          });
      }
      const parsed = this.parseTemplate(template);
      this.assertAssets({ nodes: parsed.nodes } as CanvasDocument);
      return { ...parsed, builtin: true };
    } catch (error) {
      for (const imported of paths.values())
        fs.rmSync(this.safeProjectFile(imported), { force: true });
      throw error;
    }
  }

  async listTemplatePage(page = 1, query = '') {
    this.assertStorageShape();
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', 'templates'));
    return readTemplatePage(folder, (id) => this.readTemplate(id), page, query.slice(0, 80));
  }

  getTemplate(id: string): CanvasWorkflowTemplate {
    this.assertStorageShape();
    const preset = canvasPresets().find((template) => template.id === id);
    if (!preset) return this.readTemplate(id);
    const { assets: _assets, ...template } = preset;
    return JSON.parse(JSON.stringify({ ...template, builtin: true }));
  }

  async readTemplatePreviewImage(id: string, revision: number, nodeId: string) {
    const template = this.getTemplate(id);
    if (template.revision !== revision) fail('模板已更新，请刷新列表。', 409, 'CONFLICT');
    const node = template.nodes.find((item) => item.id === nodeId);
    if (!node?.assetPath || !['image', 'sequence', 'animation'].includes(node.type))
      fail('模板没有此预览图片。', 404, 'NOT_FOUND');
    if (template.builtin) {
      const asset = canvasPresets().find((preset) => preset.id === id)!.assets[node.assetPath];
      if (!asset) fail('模板没有此预览图片。', 404, 'NOT_FOUND');
      const resource = demoResourceInfo(asset.resourceId);
      const resourceId = resource.thumbnail || asset.resourceId;
      return { bytes: await readDemoResource(resourceId), type: demoResourceInfo(resourceId).type };
    }
    const media = this.readMedia(node.assetPath);
    if (!media.type.startsWith('image/')) fail('只支持图片预览。', 400, 'INVALID_IMAGE');
    if (fs.statSync(media.file).size > 20 * 1024 * 1024)
      fail('图片超过 20 MiB。', 413, 'STORAGE_LIMIT');
    return { bytes: fs.readFileSync(media.file), type: media.type };
  }

  async readTemplateCover(
    id: string,
    revision: number,
    slot = 0
  ): Promise<{
    bytes: Buffer;
    type: string;
    source: boolean;
    animation?: ReturnType<typeof templateCoverAnimation>;
  }> {
    const template = this.getTemplate(id);
    if (template.revision !== revision) fail('模板已更新，请刷新列表。', 409, 'CONFLICT');
    const sourcePath = templateCoverSource(template, slot);
    if (!sourcePath) fail('模板没有此预览图片。', 404, 'NOT_FOUND');
    const animation = templateCoverAnimation(template, false, slot);
    const relative =
      '.maker/canvases/templates/' + id + '-cover-v3-' + slot + '-' + revision + '.png';
    if (fs.existsSync(path.join(this.root, relative))) {
      const file = this.safeProjectFile(relative);
      if (fs.statSync(file).size > 2 * 1024 * 1024) fail('缩略图过大。', 413, 'STORAGE_LIMIT');
      return {
        bytes: fs.readFileSync(file),
        type: 'image/png',
        source: false,
        animation: templateCoverAnimation(template, true, slot),
      };
    }
    if (template.builtin) {
      const asset = canvasPresets().find((preset) => preset.id === id)!.assets[sourcePath];
      const resource = demoResourceInfo(asset.resourceId);
      const resourceId = (!animation && resource.thumbnail) || asset.resourceId;
      return {
        bytes: await readDemoResource(resourceId),
        type: demoResourceInfo(resourceId).type,
        source: true,
        animation,
      };
    }
    const media = this.readMedia(sourcePath);
    if (fs.statSync(media.file).size > 20 * 1024 * 1024)
      fail('图片超过 20 MiB。', 413, 'STORAGE_LIMIT');
    return { bytes: fs.readFileSync(media.file), type: media.type, source: true, animation };
  }

  saveTemplateCover(id: string, revision: number, bytes: Buffer, slot = 0): void {
    const template = this.getTemplate(id);
    if (template.revision !== revision) fail('模板已更新，请刷新列表。', 409, 'CONFLICT');
    if (!templateCoverSource(template, slot)) fail('模板没有此预览图片。', 404, 'NOT_FOUND');
    const animation = templateCoverAnimation(template, true, slot);
    const width = animation ? Math.min(8, animation.frames.length) * 128 : 768;
    const height = animation ? Math.ceil(animation.frames.length / 8) * 128 : 768;
    if (
      bytes.length < 24 ||
      bytes.length > 2 * 1024 * 1024 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      bytes.readUInt32BE(16) < 1 ||
      bytes.readUInt32BE(16) > width ||
      bytes.readUInt32BE(20) < 1 ||
      bytes.readUInt32BE(20) > height ||
      (animation && (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height))
    )
      fail('缩略图 PNG 尺寸或大小不符合预览规格。', 400, 'INVALID_IMAGE');
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', 'templates'));
    this.atomicWrite(folder, id + '-cover-v3-' + slot + '-' + revision + '.png', bytes);
  }

  private removeTemplateCover(id: string, revision: number): void {
    for (const marker of ['-cover-', '-cover-v2-', '-cover-v3-0-', '-cover-v3-1-']) {
      const relative = '.maker/canvases/templates/' + id + marker + revision + '.png';
      if (fs.existsSync(path.join(this.root, relative)))
        fs.unlinkSync(this.safeProjectFile(relative));
    }
  }

  private readTemplate(id: string): CanvasWorkflowTemplate {
    if (!ID.test(id)) fail('模板标识无效。', 400, 'INVALID_ID');
    const file = this.safeProjectFile('.maker/canvases/templates/' + id + '.json');
    if (fs.statSync(file).size > 1024 * 1024) fail('模板过大。', 413, 'STORAGE_LIMIT');
    return this.parseTemplate(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  private parseTemplate(input: CanvasWorkflowTemplate): CanvasWorkflowTemplate {
    if (!input || !ID.test(input.id)) fail('模板标识无效。', 400, 'INVALID_ID');
    const name = text(input.name, 80, '模板名称').trim();
    if (!name) fail('请输入模板名称。', 400, 'INVALID_DOCUMENT');
    const parsed = this.parse(
      { ...input, title: name, viewport: { x: 0, y: 0, scale: 1 } },
      input.id
    );
    const template = createCanvasTemplateModel(randomUUID).snapshot(
      parsed,
      parsed.nodes.map((node) => node.id),
      name
    );
    const skills = templateSkills(input.skills);
    return {
      ...template,
      id: input.id,
      revision: parsed.revision,
      ...(skills?.length ? { skills } : {}),
    };
  }

  async exportTemplate(id: string, revision: number): Promise<Buffer> {
    if (isBuiltinCanvasTemplate(id))
      fail('请先保存为自定义模板再导出。', 400, 'READ_ONLY_TEMPLATE');
    const template = this.getTemplate(id);
    if (template.revision !== revision) fail('模板已更新，请刷新列表后导出。', 409, 'CONFLICT');
    return exportTemplateArchive(template, (relative) => this.readMedia(relative));
  }

  async importTemplate(bytes: Buffer): Promise<CanvasWorkflowTemplate> {
    const archive = await readTemplateArchive(bytes);
    const template = this.parseTemplate({ ...archive.template, id: randomUUID(), revision: 0 });
    const references = templateAssetPaths(template);
    if (
      references.length !== archive.assets.size ||
      references.some((file) => !archive.assets.has(file))
    )
      fail('模板素材清单不完整或包含无关文件。', 400, 'INVALID_TEMPLATE_ARCHIVE');
    this.assertStorageShape();
    await this.assertIgnored();
    const imported: string[] = [];
    const paths = new Map<string, string>();
    try {
      for (const source of references) {
        const content = archive.assets.get(source)!;
        const video = VIDEO_RELATIVE.test(source);
        const type = source.endsWith('.webm')
          ? 'video/webm'
          : source.endsWith('.mov')
            ? 'video/quicktime'
            : 'video/mp4';
        const destination = video
          ? this.writeVideo(template.id, content, type).relativePath
          : (await this.importImage(content)).relativePath;
        imported.push(destination);
        paths.set(source, destination);
      }
      remapTemplateAssets(template, paths);
      return await this.saveTemplate(template);
    } catch (error) {
      for (const relative of imported) fs.unlinkSync(this.safeProjectFile(relative));
      throw error;
    }
  }

  async saveTemplate(input: CanvasWorkflowTemplate): Promise<CanvasWorkflowTemplate> {
    if (isBuiltinCanvasTemplate(input?.id))
      fail('预设模板不能覆盖，请保存为新模板。', 403, 'READ_ONLY_TEMPLATE');
    this.assertStorageShape();
    await this.assertIgnored();
    const template = this.parseTemplate(input);
    const folder = this.ensureDir(path.join(this.root, '.maker', 'canvases', 'templates'));
    const exists = fs.existsSync(path.join(folder, template.id + '.json'));
    const revision = exists ? this.readTemplate(template.id).revision : 0;
    if (revision !== template.revision)
      fail('模板已被修改或删除，请重新打开模板列表。', 409, 'CONFLICT');
    this.assertAssets({ nodes: template.nodes } as CanvasDocument);
    const saved = { ...template, revision: revision + 1 };
    const bytes = Buffer.from(JSON.stringify(saved));
    if (bytes.length > 1024 * 1024) fail('模板过大。', 413, 'STORAGE_LIMIT');
    this.atomicWrite(folder, template.id + '.json', bytes);
    this.removeTemplateCover(template.id, revision);
    return saved;
  }

  async deleteTemplate(id: string, revision: number): Promise<void> {
    if (isBuiltinCanvasTemplate(id)) fail('预设模板不能删除。', 403, 'READ_ONLY_TEMPLATE');
    this.assertStorageShape();
    const template = this.readTemplate(id);
    if (template.revision !== revision) fail('模板已被修改，请重新打开模板列表。', 409, 'CONFLICT');
    fs.unlinkSync(this.safeProjectFile('.maker/canvases/templates/' + id + '.json'));
    this.removeTemplateCover(id, revision);
  }

  async create(title?: string, template: CanvasCreateTemplate = 'empty'): Promise<CanvasDocument> {
    this.assertStorageShape();
    await this.assertIgnored();
    const sequenceTemplate = template === 'sequence' ? this.findSequenceTemplate(title) : undefined;
    if (template === 'sequence' && !sequenceTemplate) {
      fail(
        '当前项目没有可复用的已保存序列帧示例，请先完成并保存一条序列帧流程。',
        409,
        'TEMPLATE_UNAVAILABLE'
      );
    }
    const document =
      sequenceTemplate ?? (template === 'empty' ? emptyDocument(title) : starterDocument(title));
    const folder =
      template === 'empty' ? undefined : this.ensureDir(path.join(this.root, 'assets', 'image'));
    const written: string[] = [];
    try {
      if (!sequenceTemplate && template !== 'empty') {
        document.nodes.forEach((node, index) => {
          const name = path.basename(node.assetPath!);
          this.atomicWrite(folder!, name, Buffer.from(STARTER_IMAGE_BASE64[index], 'base64'));
          written.push(path.join(folder!, name));
        });
      }
      this.write(document);
    } catch (error) {
      for (const filename of written) fs.rmSync(filename, { force: true });
      if (sequenceTemplate) {
        fs.rmSync(path.join(this.root, '.maker', 'canvases', document.id), {
          recursive: true,
          force: true,
        });
      }
      throw error;
    }
    return document;
  }

  private findSequenceTemplate(title?: string): CanvasDocument | undefined {
    const folder = this.canvasDir(false);
    if (!folder) return undefined;
    const candidates = fs
      .readdirSync(folder)
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map((name) => {
        try {
          const id = name.slice(0, -5);
          const document = this.read(id);
          if (!document.nodes.some((node) => node.type === 'sequence')) return undefined;
          return { document, updatedAt: fs.statSync(path.join(folder, name)).mtimeMs };
        } catch {
          return undefined;
        }
      })
      .filter((value): value is { document: CanvasDocument; updatedAt: number } => Boolean(value))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const source = candidates[0]?.document;
    if (!source) return undefined;

    const sequenceNodes = source.nodes.filter((node) => node.type === 'sequence');
    const sequence = sequenceNodes
      .slice()
      .sort(
        (left, right) =>
          Number(Boolean(right.frameSetInfo && right.assetPath)) -
            Number(Boolean(left.frameSetInfo && left.assetPath)) ||
          left.y - right.y ||
          left.x - right.x ||
          left.id.localeCompare(right.id)
      )[0];
    if (!sequence?.sourceVideoId) return undefined;

    const sourceVideo = source.nodes.find(
      (node) => node.id === sequence.sourceVideoId && node.type === 'video-source'
    );
    if (!sourceVideo) return undefined;

    const keepIds = new Set<string>([sequence.id, sourceVideo.id]);
    const sourceImageIds = source.edges
      .filter((edge) => edge.kind === 'image-to-video' && edge.to === sourceVideo.id)
      .map((edge) => edge.from)
      .filter((id) => source.nodes.some((node) => node.id === id && node.type === 'image'));
    if (sourceVideo.generation?.sourceImageId)
      sourceImageIds.push(sourceVideo.generation.sourceImageId);
    const sourceImageId = sourceImageIds.find((id) =>
      source.nodes.some((node) => node.id === id && node.type === 'image')
    );
    for (const id of sourceImageIds) keepIds.add(id);

    const animationEdge = source.edges.find(
      (edge) => edge.kind === 'sequence-animation' && edge.from === sequence.id
    );
    if (
      animationEdge &&
      source.nodes.some((node) => node.id === animationEdge.to && node.type === 'animation')
    ) {
      keepIds.add(animationEdge.to);
    }

    const sectionIds = new Set(
      source.nodes
        .filter((node) => keepIds.has(node.id) && node.sectionId)
        .map((node) => node.sectionId!)
    );
    sectionIds.forEach((id) => {
      if (source.nodes.some((node) => node.id === id && node.type === 'section')) keepIds.add(id);
    });

    const canvasId = randomUUID();
    const ids = new Map([...keepIds].map((id) => [id, randomUUID()]));
    const videoFolder = this.ensureDir(
      path.join(this.root, '.maker', 'canvases', canvasId, 'videos')
    );
    const nodes = source.nodes
      .filter((node) => keepIds.has(node.id))
      .map((node) => {
        const copy: CanvasNode = JSON.parse(JSON.stringify(node));
        copy.id = ids.get(node.id)!;
        if (copy.sectionId) {
          copy.sectionId = ids.get(copy.sectionId);
          if (!copy.sectionId) delete copy.sectionId;
        }
        if (copy.sourceVideoId) copy.sourceVideoId = ids.get(copy.sourceVideoId);
        if (copy.generation?.sourceImageId) {
          copy.generation.sourceImageId = ids.get(copy.generation.sourceImageId);
          if (!copy.generation.sourceImageId) delete copy.generation.sourceImageId;
        }
        if (copy.generation?.sourceImageIds) {
          copy.generation.sourceImageIds = copy.generation.sourceImageIds.flatMap((id) => {
            const mapped = ids.get(id);
            return mapped ? [mapped] : [];
          });
        }
        if (copy.generationDraft?.sourceImageId) {
          copy.generationDraft.sourceImageId = ids.get(copy.generationDraft.sourceImageId);
          if (!copy.generationDraft.sourceImageId) delete copy.generationDraft.sourceImageId;
        }
        if (copy.generationDraft?.sourceImageIds) {
          copy.generationDraft.sourceImageIds = copy.generationDraft.sourceImageIds.flatMap(
            (id) => {
              const mapped = ids.get(id);
              return mapped ? [mapped] : [];
            }
          );
          if (!copy.generationDraft.sourceImageIds.length)
            delete copy.generationDraft.sourceImageIds;
        }
        if (copy.sourceSnapshot) {
          copy.sourceSnapshot.nodeId =
            ids.get(copy.sourceSnapshot.nodeId) || copy.sourceSnapshot.nodeId;
        }
        for (const snapshot of copy.sourceSnapshots || [])
          snapshot.nodeId = ids.get(snapshot.nodeId) || snapshot.nodeId;
        if (copy.type === 'video-source' && copy.assetPath) {
          const sourceFile = this.readMedia(copy.assetPath).file;
          const extension = path.extname(sourceFile).toLowerCase().slice(1);
          const name = 'video-' + randomUUID() + '.' + extension;
          const destination = path.join(videoFolder, name);
          fs.copyFileSync(sourceFile, destination);
          copy.assetPath = '.maker/canvases/' + canvasId + '/videos/' + name;
        }
        return copy;
      });
    for (const copy of nodes) {
      for (const snapshot of [
        ...(copy.sourceSnapshots || []),
        ...(copy.sourceSnapshot ? [copy.sourceSnapshot] : []),
      ]) {
        const oldSource = source.nodes.find((node) => ids.get(node.id) === snapshot.nodeId);
        const newSource = nodes.find((node) => node.id === snapshot.nodeId);
        if (snapshot.version === snapshotCanvasSource(oldSource)?.version && newSource)
          snapshot.version = snapshotCanvasSource(newSource)!.version;
      }
    }
    const edges = source.edges
      .filter((edge) => keepIds.has(edge.from) && keepIds.has(edge.to))
      .map((edge) => ({
        ...edge,
        id: randomUUID(),
        from: ids.get(edge.from)!,
        to: ids.get(edge.to)!,
      }));
    return {
      id: canvasId,
      title: title?.slice(0, 80) || '序列帧模板画布',
      ...(sourceImageId
        ? {
            templateFlow: {
              imageId: ids.get(sourceImageId)!,
              videoId: ids.get(sourceVideo.id)!,
              sequenceId: ids.get(sequence.id)!,
              ...(animationEdge && ids.has(animationEdge.to)
                ? { animationId: ids.get(animationEdge.to)! }
                : {}),
              duration: Math.min(8, Math.max(4, Math.round(sourceVideo.videoInfo?.duration || 4))),
              stage: 'image' as const,
            },
          }
        : {}),
      revision: 0,
      viewport: { ...source.viewport },
      nodes,
      edges,
    };
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

  async importImage(bytes: Buffer, resourceCanvasId?: string): Promise<{ relativePath: string }> {
    this.assertStorageShape();
    if (bytes.length < 12 || bytes.length > 20 * 1024 * 1024) {
      fail('图片为空或超过 20 MiB。', 413, 'STORAGE_LIMIT');
    }
    const extension = extensionOf(bytes);
    if (!extension) fail('只接受 PNG、JPEG 或 WebP。', 400, 'INVALID_IMAGE');
    if (resourceCanvasId !== undefined) {
      await this.assertIgnored();
      await this.load(resourceCanvasId);
      if (extension !== 'png') fail('资源包只接受 PNG。', 400, 'INVALID_IMAGE');
      const relativePath =
        '.maker/canvases/' + resourceCanvasId + '/resources/' + randomUUID() + '.png';
      const folder = this.ensureDir(path.dirname(path.join(this.root, relativePath)));
      this.atomicWrite(folder, path.basename(relativePath), bytes);
      return { relativePath };
    }
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
    return this.writeVideo(canvasId, bytes, contentType);
  }

  private writeVideo(
    canvasId: string,
    bytes: Buffer,
    contentType: string
  ): { relativePath: string } {
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
    if (
      !RELATIVE.test(relativePath) &&
      !VIDEO_RELATIVE.test(relativePath) &&
      !RESOURCE_RELATIVE.test(relativePath)
    ) {
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

  private safeProjectFile(relativePath: string): string {
    const target = path.join(this.root, relativePath);
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) {
      fail('生成素材不存在或不允许使用链接。', 404, 'UNSAFE_PATH');
    }
    const real = fs.realpathSync(target);
    if (!inside(this.root, real) || !fs.statSync(real).isFile()) {
      fail('生成素材超出当前项目。', 400, 'UNSAFE_PATH');
    }
    return real;
  }

  private assertStorageShape(): void {
    for (const relative of [
      '.maker',
      path.join('.maker', 'canvases'),
      path.join('.maker', 'canvases', 'templates'),
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
          windowsHide: true,
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
          windowsHide: true,
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
      for (const reference of node.generation?.referenceImagePaths || []) this.readMedia(reference);
      for (const item of node.imageAssetsInfo?.items || []) this.readMedia(item.assetPath);
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
    for (const node of nodes) {
      if (!node.sectionId) continue;
      const section = nodes.find((candidate) => candidate.id === node.sectionId);
      if (!section || section.type !== 'section' || node.type === 'section') {
        fail('节点分区归属无效。', 400, 'INVALID_DOCUMENT');
      }
    }
    for (const node of nodes) {
      const sourceId = node.generationDraft?.sourceImageId;
      if (!sourceId) continue;
      const source = nodes.find((candidate) => candidate.id === sourceId);
      if (!source || source.type !== 'image' || !source.assetPath) {
        fail('图片生成草稿必须引用已保存的图片来源。', 400, 'INVALID_DOCUMENT');
      }
    }
    const edges = input.edges.map((item) => this.parseEdge(item, nodes));
    const seen = new Set<string>();
    const edgeIds = new Set<string>();
    for (const edge of edges) {
      if (edgeIds.has(edge.id)) fail('画布连线标识重复。', 400, 'INVALID_EDGE');
      edgeIds.add(edge.id);
      const connection = ['frame-first', 'frame-last'].includes(edge.kind)
        ? edge.to + ':' + edge.kind
        : ['image-to-video', 'first-frame', 'image-variant'].includes(edge.kind)
          ? edge.to + ':' + edge.from
          : edge.to;
      if (seen.has(connection)) fail('画布来源连线不能重复。', 400, 'INVALID_EDGE');
      seen.add(connection);
    }
    try {
      validateFramePairGraph({ nodes, edges });
    } catch (error) {
      fail((error as Error).message, 400, 'INVALID_EDGE');
    }
    if (
      input.deletedGenerationIds !== undefined &&
      (!Array.isArray(input.deletedGenerationIds) ||
        input.deletedGenerationIds.some((value) => typeof value !== 'string' || !ID.test(value)))
    ) {
      fail('已删除生成记录标识无效。', 400, 'INVALID_DOCUMENT');
    }
    return {
      id,
      title: text(input.title, 80, '标题', '创作画布'),
      ...(Array.isArray(input.deletedGenerationIds) && input.deletedGenerationIds.length
        ? { deletedGenerationIds: [...new Set(input.deletedGenerationIds as string[])] }
        : {}),
      revision: numberIn(input.revision, 0, 1_000_000, 'revision'),
      ...(input.templateFlow === undefined
        ? {}
        : { templateFlow: parseTemplateFlow(input.templateFlow, { nodes, edges }) }),
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
      node.type !== 'animation' &&
      node.type !== 'image-assets' &&
      node.type !== 'model-views' &&
      node.type !== 'model' &&
      node.type !== 'section'
    ) {
      fail('节点类型无效。', 400, 'INVALID_DOCUMENT');
    }
    const assetPath =
      node.assetPath === undefined ? undefined : text(node.assetPath, 240, '素材路径');
    if (
      node.videoInputMode !== undefined &&
      (node.videoInputMode !== 'first_last_frame' ||
        !['video', 'video-source'].includes(String(node.type)))
    )
      fail('首尾帧约束只能用于视频卡。', 400, 'INVALID_DOCUMENT');
    let mergeIcons: CanvasNode['mergeIcons'];
    if (node.mergeIcons !== undefined) {
      if (node.type !== 'image') fail('二合图标设置只能用于图片卡。', 400, 'INVALID_DOCUMENT');
      try {
        mergeIcons = validateMergeIcons(node.mergeIcons);
        mergeIconPrompt(mergeIcons);
      } catch (error) {
        fail((error as Error).message, 400, 'INVALID_DOCUMENT');
      }
    }
    let imageAssetsInfo: CanvasNode['imageAssetsInfo'];
    if (node.imageAssetsInfo !== undefined) {
      if (node.type !== 'image-assets')
        fail('只有游戏资产卡可以保存素材列表。', 400, 'INVALID_DOCUMENT');
      try {
        imageAssetsInfo = validateImageAssetsInfo(node.imageAssetsInfo);
      } catch (error) {
        fail((error as Error).message, 400, 'INVALID_DOCUMENT');
      }
    }
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
    if (
      node.modelQuality !== undefined &&
      (node.type !== 'model-views' ||
        !['fast', 'balanced', 'high_quality'].includes(String(node.modelQuality)))
    )
      fail('模型质量档位无效。', 400, 'INVALID_DOCUMENT');
    const sectionId =
      node.sectionId === undefined ? undefined : text(node.sectionId, 36, '分区标识');
    if (
      node.exportDirection !== undefined &&
      !['front', 'back', 'left', 'right'].includes(node.exportDirection as string)
    )
      fail('导出方向无效。', 400, 'INVALID_DOCUMENT');
    if (
      node.templateId !== undefined &&
      (node.type !== 'section' || typeof node.templateId !== 'string' || !ID.test(node.templateId))
    )
      fail('模板分组标识无效。', 400, 'INVALID_DOCUMENT');
    if (node.templateRevision !== undefined)
      numberIn(node.templateRevision, 1, 1_000_000, '模板版本');
    const skills = templateSkills(node.templateSkills);
    if (skills && node.type !== 'section')
      fail('Skill 只能关联模板分组。', 400, 'INVALID_DOCUMENT');
    if (
      node.templatePending !== undefined &&
      (typeof node.templatePending !== 'boolean' || node.type === 'section' || !sectionId)
    )
      fail('模板待处理状态无效。', 400, 'INVALID_DOCUMENT');
    let referenceInput: CanvasNode['referenceInput'];
    if (node.referenceInput !== undefined) {
      const input = node.referenceInput as Record<string, unknown>;
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => key !== 'includeSelf') ||
        typeof input.includeSelf !== 'boolean' ||
        !['image', 'video', 'video-source'].includes(String(node.type)) ||
        (input.includeSelf && (node.type !== 'image' || !assetPath))
      )
        fail(
          '显式参考输入无效；仅图片或视频卡可设置，自身参考需要已保存的图片。',
          400,
          'INVALID_DOCUMENT'
        );
      referenceInput = { includeSelf: input.includeSelf as boolean };
    }
    let sourceSnapshot: CanvasSourceSnapshot | undefined;
    if (node.sourceSnapshot !== undefined) {
      if (
        !node.sourceSnapshot ||
        typeof node.sourceSnapshot !== 'object' ||
        Array.isArray(node.sourceSnapshot) ||
        !['image', 'video-source', 'sequence', 'animation', 'image-assets'].includes(
          String(node.type)
        )
      ) {
        fail(
          '来源快照只能附在派生图片、视频、序列帧、动画或游戏资产卡上。',
          400,
          'INVALID_DOCUMENT'
        );
      }
      const input = node.sourceSnapshot as Record<string, unknown>;
      const nodeId = text(input.nodeId, 36, '来源节点标识');
      const version = text(input.version, 10000, '来源版本');
      if (!ID.test(nodeId) || !version) fail('来源快照无效。', 400, 'INVALID_DOCUMENT');
      sourceSnapshot = { nodeId, version };
    }
    let sourceSnapshots: CanvasSourceSnapshot[] | undefined;
    if (node.sourceSnapshots !== undefined) {
      if (
        !Array.isArray(node.sourceSnapshots) ||
        node.sourceSnapshots.length > 30 ||
        !['image', 'video-source', 'sequence', 'animation'].includes(String(node.type))
      )
        fail('来源快照列表无效。', 400, 'INVALID_DOCUMENT');
      sourceSnapshots = node.sourceSnapshots.map((value) => {
        if (!value || typeof value !== 'object') fail('来源快照无效。', 400, 'INVALID_DOCUMENT');
        const input = value as Record<string, unknown>;
        const nodeId = text(input.nodeId, 36, '来源节点标识');
        const version = text(input.version, 10000, '来源版本');
        if (!ID.test(nodeId) || !version) fail('来源快照无效。', 400, 'INVALID_DOCUMENT');
        return { nodeId, version };
      });
      if (
        new Set(sourceSnapshots.map((snapshot) => snapshot.nodeId)).size !== sourceSnapshots.length
      )
        fail('来源快照重复。', 400, 'INVALID_DOCUMENT');
    }
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
      const sourceImageIds =
        input.sourceImageIds === undefined
          ? undefined
          : Array.isArray(input.sourceImageIds)
            ? input.sourceImageIds.map((sourceId) => text(sourceId, 36, '图片来源标识'))
            : fail('图片来源标识列表无效。', 400, 'INVALID_DOCUMENT');
      const operation =
        input.operation === undefined
          ? undefined
          : input.operation === 'generate' ||
              input.operation === 'variant' ||
              input.operation === 'outpaint'
            ? input.operation
            : fail('图片生成操作无效。', 400, 'INVALID_DOCUMENT');
      if (sourceImageId && !ID.test(sourceImageId)) {
        fail('图生视频图片来源无效。', 400, 'INVALID_DOCUMENT');
      }
      if (sourceImageIds && new Set(sourceImageIds).size !== sourceImageIds.length) {
        fail('图片来源标识不能重复。', 400, 'INVALID_DOCUMENT');
      }
      if (sourceImageIds?.some((id) => !ID.test(id))) {
        fail('图片来源标识列表无效。', 400, 'INVALID_DOCUMENT');
      }
      const referenceImagePaths = input.referenceImagePaths;
      // Image cards stay at 14. Video cards follow Seedance 2.5's 30-image limit;
      // createVideo still rejects a 2.0 request above 9 before any paid call.
      const referenceLimit = node.type === 'video-source' ? 30 : 14;
      if (
        referenceImagePaths !== undefined &&
        (!Array.isArray(referenceImagePaths) ||
          referenceImagePaths.length > referenceLimit ||
          referenceImagePaths.some(
            (value) => typeof value !== 'string' || value.length > 240 || !RELATIVE.test(value)
          ))
      )
        fail('参考图片路径无效。', 400, 'UNSAFE_PATH');
      generation = {
        prompt: text(input.prompt, 8000, '生成提示词'),
        ...(referenceImagePaths === undefined
          ? {}
          : { referenceImagePaths: [...(referenceImagePaths as string[])] }),
        ...(input.parameters === undefined
          ? {}
          : { parameters: this.parseGenerationParameters(input.parameters) }),
        ...(operation ? { operation } : {}),
        ...(input.taskId === undefined ? {} : { taskId: text(input.taskId, 160, '生成任务标识') }),
        ...(input.attemptId === undefined
          ? {}
          : { attemptId: text(input.attemptId, 36, '生成尝试标识') }),
        ...(sourceImageId ? { sourceImageId } : {}),
        ...(sourceImageIds?.length ? { sourceImageIds } : {}),
      };
    }
    let generationDraft: CanvasNode['generationDraft'];
    if (node.generationDraft !== undefined) {
      if (
        (node.type !== 'image' && node.type !== 'video') ||
        assetPath ||
        !node.generationDraft ||
        typeof node.generationDraft !== 'object' ||
        Array.isArray(node.generationDraft)
      ) {
        fail('生成草稿只能附在没有结果素材的图片或视频槽上。', 400, 'INVALID_DOCUMENT');
      }
      const input = node.generationDraft as Record<string, unknown>;
      const operation =
        input.operation === 'generate' ||
        input.operation === 'variant' ||
        input.operation === 'outpaint'
          ? input.operation
          : fail('图片生成草稿操作无效。', 400, 'INVALID_DOCUMENT');
      const sourceImageId =
        input.sourceImageId === undefined
          ? undefined
          : text(input.sourceImageId, 36, '图片来源标识');
      if (sourceImageId && !ID.test(sourceImageId))
        fail('图片生成草稿来源无效。', 400, 'INVALID_DOCUMENT');
      const sourceImageIds =
        input.sourceImageIds === undefined
          ? undefined
          : Array.isArray(input.sourceImageIds)
            ? input.sourceImageIds.map((sourceId) => text(sourceId, 36, '图片来源标识'))
            : fail('图片生成草稿来源列表无效。', 400, 'INVALID_DOCUMENT');
      if (sourceImageIds && new Set(sourceImageIds).size !== sourceImageIds.length)
        fail('图片生成草稿来源不能重复。', 400, 'INVALID_DOCUMENT');
      if (sourceImageIds?.some((id) => !ID.test(id)))
        fail('图片生成草稿来源列表无效。', 400, 'INVALID_DOCUMENT');
      const prompt =
        input.prompt === undefined ? undefined : text(input.prompt, 8000, '生成草稿提示词');
      generationDraft = {
        operation,
        ...(sourceImageId ? { sourceImageId } : {}),
        ...(sourceImageIds?.length ? { sourceImageIds } : {}),
        ...(prompt ? { prompt } : {}),
        ...(input.parameters === undefined
          ? {}
          : { parameters: this.parseGenerationParameters(input.parameters) }),
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
      width: numberIn(node.width, 48, node.type === 'section' ? 100000 : 2000, '尺寸'),
      height: numberIn(node.height, 36, node.type === 'section' ? 100000 : 1600, '尺寸'),
      title: text(node.title, 80, '标题', '未命名'),
      ...(node.modelQuality
        ? { modelQuality: node.modelQuality as CanvasNode['modelQuality'] }
        : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(node.exportDirection
        ? { exportDirection: node.exportDirection as CanvasNode['exportDirection'] }
        : {}),
      ...(node.templateId ? { templateId: node.templateId as string } : {}),
      ...(node.templateRevision ? { templateRevision: node.templateRevision as number } : {}),
      ...(skills?.length ? { templateSkills: skills } : {}),
      ...(node.templatePending ? { templatePending: true } : {}),
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
      ...(sourceSnapshots ? { sourceSnapshots } : {}),
      ...(node.text === undefined ? {} : { text: text(node.text, 4000, '文字') }),
      ...(assetPath ? { assetPath } : {}),
      ...(referenceInput ? { referenceInput } : {}),
      ...(videoInfo ? { videoInfo } : {}),
      ...(node.videoInputMode === 'first_last_frame'
        ? { videoInputMode: 'first_last_frame' as const }
        : {}),
      ...(sourceVideoId ? { sourceVideoId } : {}),
      ...(sequenceSettings ? { sequenceSettings } : {}),
      ...(frameSetInfo ? { frameSetInfo } : {}),
      ...(imageAssetsInfo ? { imageAssetsInfo } : {}),
      ...(mergeIcons ? { mergeIcons } : {}),
      ...(generation ? { generation } : {}),
      ...(generationDraft ? { generationDraft } : {}),
    };
  }

  private parseGenerationParameters(
    value: unknown
  ): NonNullable<CanvasNode['generation']>['parameters'] {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('生成参数无效。', 400, 'INVALID_DOCUMENT');
    const input = value as Record<string, unknown>;
    if (
      input.mode !== undefined &&
      !['first_frame', 'first_last_frame', 'multi_modal_reference'].includes(String(input.mode))
    )
      fail('视频输入模式无效。', 400, 'INVALID_DOCUMENT');
    return {
      ...(input.mode === undefined
        ? {}
        : { mode: input.mode as 'first_frame' | 'first_last_frame' | 'multi_modal_reference' }),
      ...(input.model === undefined ? {} : { model: text(input.model, 80, '模型') }),
      ...(input.resolution === undefined
        ? {}
        : { resolution: text(input.resolution, 20, '分辨率') }),
      ...(input.aspectRatio === undefined
        ? {}
        : { aspectRatio: text(input.aspectRatio, 20, '图片比例') }),
      ...(input.ratio === undefined ? {} : { ratio: text(input.ratio, 20, '视频比例') }),
      ...(input.duration === undefined
        ? {}
        : { duration: numberIn(input.duration, 4, 8, '视频时长') }),
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
      (settings.fit !== 'contain' && settings.fit !== 'cover' && settings.fit !== 'stretch') ||
      (settings.cutoutMode !== undefined &&
        settings.cutoutMode !== 'connected' &&
        settings.cutoutMode !== 'chroma')
    ) {
      fail('拆帧参数无效。', 400, 'INVALID_DOCUMENT');
    }
    return {
      start: numberIn(settings.start, 0, 86400, '起始时间'),
      end: numberIn(settings.end, 0, 86400, '结束时间'),
      fps: numberIn(settings.fps, 1, 30, '帧率'),
      cutout: settings.cutout,
      ...(settings.cutoutMode === undefined
        ? {}
        : { cutoutMode: settings.cutoutMode as 'connected' | 'chroma' }),
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
      edge.kind !== 'image-variant' &&
      edge.kind !== 'sequence-source' &&
      edge.kind !== 'character-views' &&
      edge.kind !== 'views-model' &&
      edge.kind !== 'sequence-animation' &&
      edge.kind !== 'frame-first' &&
      edge.kind !== 'frame-last' &&
      edge.kind !== 'image-assets'
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
      ['frame-first', 'frame-last'].includes(String(edge.kind)) &&
      (from?.type !== 'image' || to?.videoInputMode !== 'first_last_frame')
    )
      fail('首尾帧位置必须引用图片卡。', 400, 'INVALID_EDGE');
    if (edge.kind === 'image-assets' && (from?.type !== 'image' || to?.type !== 'image-assets'))
      fail('游戏资产来源必须为图片图集。', 400, 'INVALID_EDGE');
    if (
      (edge.kind === 'character-views' && (from?.type !== 'image' || to?.type !== 'model-views')) ||
      (edge.kind === 'views-model' && (from?.type !== 'model-views' || to?.type !== 'model'))
    )
      fail('模型依赖必须为角色图片、多视图、模型。', 400, 'INVALID_EDGE');
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
        (!from.assetPath && !from.generationDraft?.sourceImageId) ||
        to?.type !== 'video-source' ||
        !to.assetPath)
    ) {
      fail('图生视频引用必须连接已保存图片或有来源的图片草稿与已保存视频卡。', 400, 'INVALID_EDGE');
    }
    if (
      edge.kind === 'image-variant' &&
      (from?.type !== 'image' ||
        !from.assetPath ||
        to?.type !== 'image' ||
        (!to.referenceInput &&
          (to.assetPath
            ? !to.generation?.sourceImageIds?.includes(from.id) &&
              to.sourceSnapshot?.nodeId !== from.id &&
              !to.sourceSnapshots?.some((snapshot) => snapshot.nodeId === from.id)
            : to.generationDraft?.operation !== 'variant' ||
              to.generationDraft.sourceImageId !== from.id)))
    ) {
      fail('图片派生关系必须对应真实结果或变体草稿中的已保存来源图片。', 400, 'INVALID_EDGE');
    }
    if (
      edge.kind === 'sequence-animation' &&
      (from?.type !== 'sequence' || !from.frameSetInfo || to?.type !== 'animation')
    ) {
      fail('动画关系必须从已保存帧集连到动画卡。', 400, 'INVALID_EDGE');
    }
    let route: CanvasEdge['route'];
    if (edge.route !== undefined) {
      if (!edge.route || typeof edge.route !== 'object' || Array.isArray(edge.route))
        fail('连线位置无效。', 400, 'INVALID_EDGE');
      const offsets = edge.route as Record<string, unknown>;
      route = {
        x: numberIn(offsets.x, -100000, 100000, '连线横向偏移'),
        y: numberIn(offsets.y, -100000, 100000, '连线纵向偏移'),
      };
    }
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      ...(route ? { route } : {}),
    };
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
