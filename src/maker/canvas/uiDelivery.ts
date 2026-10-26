import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
// @ts-expect-error pngjs does not ship declarations.
import pngjs from 'pngjs';
import {
  assembleUiInput,
  type UiAssemblyAsset,
  type UiAssemblyBbox,
  type UiAssemblyInput,
} from '../../../skills/maker-ui-workflow/scripts/assemble-ui-lib.mjs';
import type {
  CanvasUiDelivery,
  CanvasUiDeliveryStatus,
} from '../../../packages/maker-canvas/src/contracts.js';
import { CanvasStoreError } from './model.js';
import type { CanvasDocument } from './model.js';
import { MakerCanvasFiles } from './files.js';
import { prepareUiWorkflowArchives, type UiWorkflowArchive } from './uiWorkflowArchive.js';
import { validateResourceBundle } from './resourceBundle.js';
import { checkMakerPythonEnvironmentAsync } from '../system/python.js';
import { generateResourceMeta } from '../resourceMeta.js';
import { checkUiDocument } from '../uiEditor/documents.js';

const PNG = pngjs.PNG as { sync: { read(bytes: Buffer): { width: number; height: number } } };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const INDEX_ROOT = '.maker/canvases/ui-deliveries';

interface DeliveryIndex {
  version: 1;
  canvasId: string;
  nodeId: string;
  deliveries: CanvasUiDelivery[];
}

interface ArchiveManifest {
  ui: { id: string; bboxSha256: string };
  assets: UiAssemblyAsset[];
  bindings: UiAssemblyInput['bindings'];
  backgroundAssetId?: string;
  missingElementIds: string[];
  unboundCategories: string[];
  artTextBindings?: Array<{ textId: string; path: string }>;
  confirmed: boolean;
}

function fail(message: string, status: number, code: string): never {
  throw new CanvasStoreError(message, status, code);
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function isPng(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_MAGIC);
}

function safeName(value: string, fallback: string): string {
  const name = value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return (/^[A-Za-z]/.test(name) ? name : fallback + (name ? '_' + name : '')).slice(0, 80);
}

/**
 * Local delivery from a confirmed 015 resource archive to an editable UI. Every run writes a
 * new version directory; existing user files and earlier versions are never overwritten.
 */
export class UiDeliveryService {
  private readonly root: string;
  private readonly files: MakerCanvasFiles;

  constructor(projectRoot: string) {
    this.root = fs.realpathSync(projectRoot);
    this.files = new MakerCanvasFiles(this.root);
  }

  /** Project-relative path → absolute path inside the project, refusing symbolic links. */
  private projectPath(relative: string): string {
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.includes('\\') ||
      relative.split('/').some((part) => !part || part === '.' || part === '..')
    )
      fail('交付路径无效：' + relative, 400, 'UNSAFE_PATH');
    let current = this.root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        fail('交付路径不能包含符号链接：' + relative, 400, 'UNSAFE_PATH');
    }
    return current;
  }

  private ensureDirectory(relative: string): string {
    const absolute = this.projectPath(relative);
    fs.mkdirSync(absolute, { recursive: true });
    return absolute;
  }

  private writeNew(relative: string, bytes: Buffer): void {
    const absolute = this.projectPath(relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, bytes, { flag: 'wx' });
  }

  private indexPath(canvasId: string, nodeId: string): string {
    return INDEX_ROOT + '/' + canvasId + '_' + nodeId + '.json';
  }

  private readIndex(canvasId: string, nodeId: string): DeliveryIndex {
    const file = this.projectPath(this.indexPath(canvasId, nodeId));
    if (!fs.existsSync(file)) return { version: 1, canvasId, nodeId, deliveries: [] };
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as DeliveryIndex;
    if (value.version !== 1 || value.canvasId !== canvasId || value.nodeId !== nodeId)
      fail('UI 交付记录不匹配。', 409, 'INVALID_DOCUMENT');
    return value;
  }

  private writeIndex(index: DeliveryIndex): void {
    const relative = this.indexPath(index.canvasId, index.nodeId);
    const file = this.projectPath(relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(index, null, 2));
    fs.renameSync(temporary, file);
  }

  /** Cross-process lock: the canvas page and a CLI call cannot assemble the same bundle twice. */
  private lock(canvasId: string, nodeId: string): () => void {
    const file = this.projectPath(INDEX_ROOT + '/' + canvasId + '_' + nodeId + '.lock');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
        return () => fs.rmSync(file, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const owner = Number(fs.readFileSync(file, 'utf8'));
        let alive = false;
        try {
          alive = Number.isInteger(owner) && owner > 0 && process.kill(owner, 0);
        } catch {
          alive = false;
        }
        if (alive) fail('此资源包正在组装 UI，请等待当前操作完成。', 409, 'ASSEMBLY_BUSY');
        fs.rmSync(file, { force: true });
      }
    }
    fail('此资源包正在组装 UI，请稍后重试。', 409, 'ASSEMBLY_BUSY');
  }

  private async document(canvasId: string, nodeId: string): Promise<CanvasDocument> {
    if (!ID.test(canvasId) || !ID.test(nodeId)) fail('画布或资源包标识无效。', 400, 'INVALID_ID');
    const document = await this.files.load(canvasId);
    const bundle = document.nodes.find((node) => node.id === nodeId);
    if (!bundle || bundle.type !== 'resource-bundle')
      fail('请选择 015 分组的 UI 资源包。', 400, 'INVALID_TARGET');
    return document;
  }

  /** Current resources archive of the saved canvas, written if the save did not create it. */
  private async archive(
    document: CanvasDocument,
    nodeId: string
  ): Promise<
    | { reason: string; record?: undefined; manifest?: undefined }
    | { reason?: undefined; record: UiWorkflowArchive; manifest: ArchiveManifest }
  > {
    const readBlob = async (relative: string) =>
      new Blob([fs.readFileSync(this.files.readMedia(relative).file)]);
    const prepared = (await prepareUiWorkflowArchives(document, readBlob)).find(
      (item) => item.record.nodeId === nodeId && item.record.stage === 'resources'
    );
    if (!prepared) {
      let reason = '资源包尚未完整：请先完成全部批次的分离与切图。';
      try {
        validateResourceBundle(document, nodeId, Number.MAX_SAFE_INTEGER);
      } catch (error) {
        reason = (error as Error).message;
      }
      return { reason };
    }
    const exists = this.files
      .listUiArchives(document.id)
      .some((record) => record.directory === prepared.record.directory);
    if (!exists) await this.files.archiveUi(document.id);
    const manifest = JSON.parse(
      fs.readFileSync(this.projectPath(prepared.record.bindingsPath!), 'utf8')
    ) as ArchiveManifest;
    return { record: prepared.record, manifest };
  }

  private unconfirmedReason(manifest: ArchiveManifest): string {
    const parts: string[] = [];
    if (manifest.missingElementIds.length)
      parts.push('缺少素材绑定：' + manifest.missingElementIds.slice(0, 12).join('、'));
    if (manifest.unboundCategories.length)
      parts.push('未绑定或待重新选择的分类：' + manifest.unboundCategories.join('、'));
    const unreviewed = manifest.bindings.filter((item) => item.review === 'unreviewed');
    if (unreviewed.length) parts.push(unreviewed.length + ' 个元素的切图尚未预览确认');
    return (
      (parts.join('；') || '素材尚未全部确认') + '。可直接组装；待复核项写入交付记录和复核提示词。'
    );
  }

  async status(canvasId: string, nodeId: string): Promise<CanvasUiDeliveryStatus> {
    const document = await this.document(canvasId, nodeId);
    const index = this.readIndex(canvasId, nodeId);
    const previous = index.deliveries.map(({ id, archiveRevision, uiFile, createdAt }) => ({
      id,
      archiveRevision,
      uiFile,
      createdAt,
    }));
    const current = await this.archive(document, nodeId);
    if (current.reason !== undefined)
      return { ready: false, code: 'BUNDLE_INCOMPLETE', reason: current.reason, previous };
    const { record, manifest } = current;
    const delivery = [...index.deliveries]
      .reverse()
      .find((item) => item.archiveRevision === record.revision);
    const status: CanvasUiDeliveryStatus = {
      // Unreviewed or missing assets are reported, not blocking: the run must reach the UI.
      ready: true,
      archiveRevision: record.revision,
      previous,
      ...(manifest.confirmed
        ? {}
        : { code: 'ASSETS_UNCONFIRMED', reason: this.unconfirmedReason(manifest) }),
      ...(delivery ? { delivery } : {}),
    };
    if (delivery && delivery.steps.meta !== 'done') {
      const python = await checkMakerPythonEnvironmentAsync();
      status.python = {
        ready: python.ready,
        ...(python.ready ? {} : { message: 'Python 环境未就绪，资源 meta 需要它。' }),
      };
    }
    return status;
  }

  /** Copy the archive into a new project version folder and build the assembly input. */
  private importArchive(
    record: { revision: string; directory: string },
    manifest: ArchiveManifest,
    base: string,
    designPng?: Buffer
  ): UiAssemblyInput {
    const archiveFile = (entry: string) => {
      const absolute = this.projectPath(record.directory + '/' + entry);
      if (!fs.existsSync(absolute)) fail('资源归档缺少文件：' + entry, 409, 'ARCHIVE_INCOMPLETE');
      return fs.readFileSync(absolute);
    };
    const bbox = JSON.parse(archiveFile('bbox.json').toString('utf8')) as UiAssemblyBbox;
    if (sha256(JSON.stringify(bbox)) !== manifest.ui.bboxSha256)
      fail('资源归档的 Bbox 与绑定记录不属于同一版本。', 409, 'ARCHIVE_MISMATCH');
    // Elements without any PNG are left out of this version (children move to the nearest
    // kept parent) instead of stopping the run; delivery.review lists them for repair.
    const missing = new Set(manifest.missingElementIds);
    if (missing.size) {
      const parents = new Map(
        bbox.elements.map((element) => [element.id, (element.parent as string | null) ?? null])
      );
      const kept = (id: unknown): string | null => {
        let current = typeof id === 'string' ? id : null;
        while (current && missing.has(current)) current = parents.get(current) ?? null;
        return current;
      };
      bbox.elements = bbox.elements
        .filter((element) => !missing.has(element.id))
        .map((element) => ({ ...element, parent: kept(element.parent) }));
      bbox.texts = bbox.texts.map((text) => ({ ...text, parentId: kept(text.parentId) }));
      if (!bbox.elements.length) fail('没有任何可组装的素材。', 409, 'BUNDLE_INCOMPLETE');
    }
    const sources = new Map<string, string>();
    for (const [name, image] of [
      ['design', bbox.design],
      ['cut-source', bbox.cutSource],
    ] as const) {
      const bytes = archiveFile(image.path);
      if (sha256(bytes) !== image.sha256)
        fail('资源归档中的参考图已变化：' + image.path, 409, 'ARCHIVE_MISMATCH');
      let png: Buffer = bytes;
      if (!isPng(bytes)) {
        // JPEG/WebP designs stay unchanged upstream; the editor reference needs PNG pixels,
        // sent in memory by the canvas (or read from --design-png) and checked here.
        if (name !== 'design' || !designPng)
          fail(
            (name === 'design' ? '原稿' : '去文字稿') +
              '不是 PNG（' +
              image.path +
              '）。画布「组装 UI」会自动转换；CLI 请用 --design-png 传入同尺寸 PNG。',
            409,
            'NON_PNG_SOURCE'
          );
        png = designPng;
        const decoded = isPng(png) && PNG.sync.read(png);
        if (!decoded || decoded.width !== image.width || decoded.height !== image.height)
          fail('原稿 PNG 与识图原稿尺寸不一致。', 409, 'NON_PNG_SOURCE');
        image.sha256 = sha256(png);
      }
      const target = sources.get(image.path) || base + '/source/' + name + '.png';
      if (!sources.has(image.path)) this.writeNew(target, png);
      sources.set(image.path, target);
      image.path = target;
    }
    const ids = new Map<string, string>();
    const used = new Set<string>();
    const assets: UiAssemblyAsset[] = [];
    const byArchivePath = new Map<string, string>();
    for (const [index, asset] of manifest.assets.entries()) {
      const bytes = archiveFile(asset.path);
      if (sha256(bytes) !== asset.sha256)
        fail('资源归档中的素材已变化：' + asset.path, 409, 'ARCHIVE_MISMATCH');
      const png = PNG.sync.read(bytes);
      if (png.width !== asset.width || png.height !== asset.height)
        fail('素材尺寸与绑定记录不符：' + asset.path, 409, 'ARCHIVE_MISMATCH');
      let id = /^[A-Za-z][A-Za-z0-9_-]*$/.test(asset.id) ? asset.id : safeName(asset.id, 'asset');
      while (used.has(id)) id = id + '_' + index;
      used.add(id);
      ids.set(asset.id, id);
      const folder = asset.role === 'reserve' ? 'reserve' : 'images';
      const target = base + '/' + folder + '/' + id + '.png';
      this.writeNew(target, bytes);
      byArchivePath.set(asset.path, id);
      assets.push({ ...asset, id, path: target });
    }
    const mapId = (id: string | undefined) => (id === undefined ? undefined : ids.get(id) || id);
    const texts = new Set(bbox.texts.map((text) => text.id));
    const artTextBindings = (manifest.artTextBindings || []).map((binding) => {
      if (!texts.has(binding.textId))
        fail(
          '美术字「' +
            binding.textId +
            '」不是当前识图的文字 ID（旧单标题支线）。请用 CLI sync-ui-batches 的 artText 选择对应文字后重新切图。',
          409,
          'ART_TEXT_UNMAPPED'
        );
      const assetId = byArchivePath.get(binding.path);
      if (!assetId)
        fail(
          '美术字「' + binding.textId + '」缺少对应的 PNG 素材记录：' + binding.path,
          409,
          'ART_TEXT_ASSET_MISSING'
        );
      return { textId: binding.textId, assetId };
    });
    // Unreviewed cuts are assembled as they are (recorded in delivery.review, not here).
    const bindings = manifest.bindings
      .filter((binding) => !missing.has(binding.elementId) && binding.assetId)
      .map(({ review: _review, ...binding }) => ({
        ...binding,
        assetId: mapId(binding.assetId),
        ...(binding.pressedAssetId ? { pressedAssetId: mapId(binding.pressedAssetId) } : {}),
      }));
    const backgroundAssetId = mapId(manifest.backgroundAssetId);
    const referenced = new Set([
      ...bindings.flatMap((binding) => [binding.assetId, binding.pressedAssetId]),
      backgroundAssetId,
      ...artTextBindings.map((binding) => binding.assetId),
    ]);
    for (const asset of assets) if (!referenced.has(asset.id)) asset.role = 'reserve';
    return {
      bbox,
      assets,
      bindings,
      ...(backgroundAssetId ? { backgroundAssetId } : {}),
      ...(artTextBindings.length ? { artTextBindings } : {}),
      confirmed: true,
      // Project copies change the Bbox paths; the archive identity was verified above.
      ui: { id: manifest.ui.id, bboxSha256: sha256(JSON.stringify(bbox)) },
    };
  }

  private async finish(delivery: CanvasUiDelivery, signal?: AbortSignal): Promise<void> {
    if (delivery.steps.meta !== 'done') {
      const python = await checkMakerPythonEnvironmentAsync(signal);
      if (!python.ready) {
        delivery.steps.meta = 'blocked';
        delivery.issue = '资源元数据未完成：Python 环境未就绪，请在分组上点「准备 Python 环境」。';
      } else {
        try {
          const result = (await generateResourceMeta(
            { target_dir: this.root, paths: [delivery.directory] },
            signal
          )) as { success?: boolean; results?: Array<{ status?: string }>; error?: string };
          if (result.success === false) throw new Error(result.error || 'meta 生成失败');
          const count = (status: string) =>
            (result.results || []).filter((item) => item.status === status).length;
          delivery.meta = {
            generated: count('generated'),
            preserved: count('preserved'),
            skipped: count('skipped'),
          };
          delivery.steps.meta = 'done';
          delete delivery.issue;
        } catch (error) {
          delivery.steps.meta = 'failed';
          delivery.issue = '资源元数据未完成：' + (error as Error).message.slice(0, 300);
        }
      }
    }
    const tree = JSON.parse(fs.readFileSync(this.projectPath(delivery.uiFile), 'utf8'));
    const check = await checkUiDocument(this.root, delivery.uiFile, tree);
    delivery.check = {
      nodes: check.nodes,
      errors: check.errors,
      warnings: check.warnings,
      messages: check.diagnostics.slice(0, 8).map((item) => item.severity + ': ' + item.message),
    };
    delivery.steps.check = check.errors ? 'failed' : 'passed';
    if (check.errors && !delivery.issue)
      delivery.issue = 'UI 引用检查有 ' + check.errors + ' 个错误：' + delivery.check.messages[0];
  }

  /**
   * Explicit user/AI action. Reuses a complete delivery of the same archive version, resumes
   * meta and check after a partial run, and otherwise assembles into a new version folder.
   */
  async assemble(
    canvasId: string,
    nodeId: string,
    options: {
      newVersion?: boolean;
      designPng?: Buffer;
      signal?: AbortSignal;
      /** Who drives this assembly; a CLI touch marks the version as AI-processed. */
      source?: 'canvas' | 'cli';
    } = {}
  ): Promise<CanvasUiDeliveryStatus> {
    const document = await this.document(canvasId, nodeId);
    const release = this.lock(canvasId, nodeId);
    try {
      const current = await this.archive(document, nodeId);
      if (current.reason !== undefined) fail(current.reason, 409, 'BUNDLE_INCOMPLETE');
      const { record, manifest } = current;
      const index = this.readIndex(canvasId, nodeId);
      let delivery = options.newVersion
        ? undefined
        : [...index.deliveries]
            .reverse()
            .find((item) => item.archiveRevision === record.revision && item.steps.assembled);
      const complete =
        delivery && delivery.steps.meta === 'done' && delivery.steps.check === 'passed';
      if (!delivery) {
        const slug = 'ui015-' + nodeId.slice(0, 8);
        const stem = 'v-' + record.revision.replace(/^assets-/, '').slice(0, 12);
        let version = stem;
        for (let n = 2; fs.existsSync(this.projectPath('assets/ui/' + slug + '/' + version)); n++)
          version = stem + '-' + n;
        const base = 'assets/ui/' + slug + '/' + version;
        this.ensureDirectory(base);
        const input = this.importArchive(record, manifest, base, options.designPng);
        const workflow = '.maker/ui-workflows/' + slug + '/' + version;
        this.writeNew(
          workflow + '/assembly.json',
          Buffer.from(JSON.stringify({ archive: record, canvasId, nodeId, input }, null, 2))
        );
        const output = base + '/ui';
        const summary = assembleUiInput(this.root, input, this.projectPath(output));
        delivery = {
          id: randomUUID(),
          archiveRevision: record.revision,
          uiId: manifest.ui.id,
          directory: base,
          uiFile: output + '/assembled.ui.json',
          referenceFile: output + '/assembled.reference.png',
          createdAt: new Date().toISOString(),
          elements: summary.elements,
          steps: { assembled: true, meta: 'pending', check: 'pending' },
          source: options.source || 'canvas',
          review: {
            unreviewed: manifest.bindings
              .filter((item) => item.review === 'unreviewed')
              .map((item) => item.elementId),
            missing: [...manifest.missingElementIds],
            unbound: [...manifest.unboundCategories],
          },
        };
        index.deliveries.push(delivery);
        this.writeIndex(index);
      } else if (options.source === 'cli' && delivery.source !== 'cli') {
        delivery.source = 'cli';
        this.writeIndex(index);
      }
      if (!complete) {
        await this.finish(delivery, options.signal);
        this.writeIndex(index);
      }
      return { ...(await this.status(canvasId, nodeId)), delivery };
    } finally {
      release();
    }
  }
}
