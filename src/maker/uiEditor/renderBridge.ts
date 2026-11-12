import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { ConsoleError } from '../console/types.js';
import { readUiEditorAsset } from './assets.js';
import { inspectUiDocument } from './documents.js';

type Device = {
  id: string;
  name: string;
  width: number;
  height: number;
  dpr?: number;
  scale?: number;
  safeArea?: Record<string, number>;
  landscapeSafeArea?: Record<string, number>;
};
export function uiPreviewDevices(): Record<string, Device> {
  const source = readUiEditorAsset('src/config.js');
  if (!source) throw new ConsoleError('缺少编辑器配置，请重新构建。', 500);
  const window = { UrhoxConfig: { DEVICES: {} as Record<string, Device> } };
  runInNewContext(
    source.toString('utf8'),
    { window, location: { search: '?project=' + '0'.repeat(64) }, URLSearchParams },
    { timeout: 1000 }
  );
  return window.UrhoxConfig.DEVICES;
}

export function uiRenderOptions(options: Record<string, unknown>) {
  const allowed = [
    'device',
    'orientation',
    'width',
    'height',
    'dpr',
    'scale',
    'designResolution',
    'safeArea',
    'nativeMenuBottom',
    'componentPreview',
    'id',
    'pointer',
  ];
  if (Object.keys(options).some((key) => !allowed.includes(key)))
    throw new ConsoleError('预览参数包含未知字段。');
  const devices = uiPreviewDevices();
  const deviceId = options.device ?? '1080p';
  if (typeof deviceId !== 'string' || !Object.prototype.hasOwnProperty.call(devices, deviceId))
    throw new ConsoleError('未知设备；使用 ui capabilities 查看设备 ID。');
  const device = devices[deviceId];
  const orientation = options.orientation ?? 'portrait';
  if (!['portrait', 'landscape'].includes(String(orientation)))
    throw new ConsoleError('orientation 必须是 portrait 或 landscape。');
  if ((options.width === undefined) !== (options.height === undefined))
    throw new ConsoleError('自定义尺寸必须同时提供 width 和 height。');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = options[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new ConsoleError(key + ' 超出有效范围 ' + min + '..' + max + '。');
    return value;
  };
  const landscape = orientation === 'landscape';
  const width = number('width', landscape ? device.height : device.width, 240, 4096);
  const height = number('height', landscape ? device.width : device.height, 240, 4096);
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new ConsoleError('尺寸必须是整数。');
  const dpr = number('dpr', device.dpr || 1, 1, 4);
  const scale = options.scale === undefined ? null : number('scale', 1, 0.25, 8);
  let designResolution: { width: number; height: number } | null = null;
  if (options.designResolution !== undefined) {
    const value = options.designResolution as Record<string, unknown> | null;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !['width', 'height'].includes(key)) ||
      ![value.width, value.height].every(
        (size) => typeof size === 'number' && Number.isFinite(size) && size >= 1 && size <= 16384
      )
    )
      throw new ConsoleError('designResolution 必须提供 1..16384 范围内的 width 和 height。');
    if (scale !== null) throw new ConsoleError('designResolution 与固定 scale 不能同时指定。');
    designResolution = { width: value.width as number, height: value.height as number };
  }
  const area =
    options.safeArea ??
    (options.width !== undefined
      ? {}
      : (landscape ? device.landscapeSafeArea : device.safeArea) || {});
  if (
    !area ||
    typeof area !== 'object' ||
    Array.isArray(area) ||
    Object.keys(area).some((key) => !['top', 'right', 'bottom', 'left'].includes(key))
  )
    throw new ConsoleError('safeArea 必须是 top/right/bottom/left 对象。');
  const safeArea = Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].map((key) => {
      const value = (area as Record<string, unknown>)[key] ?? 0;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new ConsoleError('安全区必须是非负有限数值。');
      return [key, value];
    })
  );
  if (safeArea.left + safeArea.right >= width || safeArea.top + safeArea.bottom >= height)
    throw new ConsoleError('安全区必须保留有效内容区域。');
  for (const key of ['id', 'pointer'])
    if (options[key] !== undefined && typeof options[key] !== 'string')
      throw new ConsoleError(key + ' 必须是字符串。');
  if (options.componentPreview !== undefined && typeof options.componentPreview !== 'boolean')
    throw new ConsoleError('componentPreview 必须是布尔值。');
  return {
    device: deviceId,
    width,
    height,
    dpr,
    scale,
    designResolution,
    safeArea,
    nativeMenuBottom: number('nativeMenuBottom', 0, 0, height - 1),
    componentPreview: options.componentPreview === true,
    id: options.id as string | undefined,
    pointer: options.pointer as string | undefined,
  };
}

type RenderJob = {
  id: string;
  project: string;
  createdAt: number;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  action: 'preview' | 'layout';
  file: string;
  revision: string;
  tree: unknown;
  options: ReturnType<typeof uiRenderOptions>;
  worker?: string;
  result?: Record<string, unknown>;
  png?: Buffer;
  error?: string;
};

export class UiRenderBridge {
  private jobs = new Map<string, RenderJob>();
  private pages = new Map<string, { project: string; at: number }>();

  private sweep() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (now - job.createdAt > 120000) this.jobs.delete(id);
      else if (now - job.createdAt > 45000 && ['queued', 'running'].includes(job.state)) {
        job.state = 'failed';
        job.error = '预览超时，请保持编辑器打开后重试。';
        job.tree = undefined;
      }
    }
    for (const [id, page] of this.pages) if (now - page.at > 15000) this.pages.delete(id);
  }

  async submit(project: string, root: string, body: Record<string, unknown>) {
    this.sweep();
    if (!['preview', 'layout'].includes(String(body.action)) || typeof body.file !== 'string')
      throw new ConsoleError('需要 preview/layout 和 UI 文件路径。');
    if (!body.options || typeof body.options !== 'object' || Array.isArray(body.options))
      throw new ConsoleError('预览 options 必须是对象。');
    const options = uiRenderOptions(body.options as Record<string, unknown>);
    const snapshot = await inspectUiDocument(root, body.file, options);
    if (![...this.pages.values()].some((page) => page.project === project))
      throw new ConsoleError(
        'UI 编辑器未连接。请先用 ui open --no-open 获取地址并打开该项目的编辑器，保持页面打开后重试。',
        409
      );
    if (this.jobs.size >= 16) throw new ConsoleError('预览队列已满，请稍后重试。', 429);
    const job: RenderJob = {
      id: randomUUID(),
      project,
      createdAt: Date.now(),
      state: 'queued',
      action: body.action as RenderJob['action'],
      file: body.file,
      revision: snapshot.revision,
      tree: snapshot.tree,
      options,
    };
    this.jobs.set(job.id, job);
    return { id: job.id };
  }

  claim(project: string, pageId: unknown, busy: unknown) {
    this.sweep();
    if (typeof pageId !== 'string' || !/^[a-f0-9-]{36}$/.test(pageId))
      throw new ConsoleError('无效的预览页面 ID。');
    if (this.pages.size >= 64 && !this.pages.has(pageId))
      throw new ConsoleError('预览页面过多。', 429);
    this.pages.set(pageId, { project, at: Date.now() });
    if (busy === true) return {};
    const job = [...this.jobs.values()].find(
      (item) => item.project === project && item.state === 'queued'
    );
    if (!job) return {};
    job.state = 'running';
    job.worker = randomUUID();
    return { id: job.id, worker: job.worker };
  }

  get(project: string, id: string) {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job || job.project !== project)
      throw new ConsoleError('预览不存在或已过期，请重新执行。', 404);
    return job;
  }

  complete(project: string, id: string, body: Record<string, unknown>) {
    const job = this.get(project, id);
    if (job.state !== 'running' || body.worker !== job.worker)
      throw new ConsoleError('预览已结束或执行页面不匹配。', 409);
    if (typeof body.error === 'string') {
      job.state = 'failed';
      job.error = body.error.slice(0, 2000);
    } else {
      if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result))
        throw new ConsoleError('无效的布局结果。');
      if (job.action === 'preview') {
        if (typeof body.png !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.png))
          throw new ConsoleError('缺少 PNG 预览。');
        const png = Buffer.from(body.png, 'base64');
        if (
          png.length > 32 * 1024 * 1024 ||
          png.length < 24 ||
          png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        )
          throw new ConsoleError('PNG 无效或超过 32 MiB。');
        const total = [...this.jobs.values()].reduce(
          (size, entry) => size + (entry.png?.length || 0),
          0
        );
        if (total + png.length > 64 * 1024 * 1024)
          throw new ConsoleError('预览缓存已满，请先读取其他预览结果。', 429);
        job.png = png;
      }
      job.result = body.result as Record<string, unknown>;
      job.state = 'succeeded';
    }
    job.tree = undefined;
    return { ok: true };
  }

  release(project: string, id: string) {
    this.get(project, id);
    this.jobs.delete(id);
    return { ok: true };
  }
}
