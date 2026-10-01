import {
  cloneDocument,
  emptyDocument,
  starterDocument,
  type CanvasCreateTemplate,
  type CanvasDocument,
  type CanvasSummary,
} from './model.js';
import { CanvasStoreError } from './model.js';
import type {
  CanvasTemplatePage,
  CanvasTemplateStore,
  CanvasWorkflowTemplate,
} from './templates.js';

export interface CanvasGenerationAttempt {
  id: string;
  canvasId: string;
  kind: 'image' | 'video';
  toolName: 'generate_image' | 'create_video_task';
  status: 'running' | 'pending' | 'succeeded' | 'failed' | 'unknown' | 'canceled';
  prompt: string;
  operation?: 'generate' | 'variant' | 'outpaint';
  taskId?: string;
  sourceImagePath?: string;
  sourceImageId?: string;
  sourceImagePaths?: string[];
  sourceImageIds?: string[];
  referenceImagePaths?: string[];
  targetNodeId?: string;
  resultAssetPath?: string;
  error?: string;
  executionState?: 'not_executed' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

export interface CanvasDocumentStore {
  templates?: CanvasTemplateStore;
  list(): Promise<CanvasSummary[]>;
  load(canvasId: string): Promise<CanvasDocument>;
  create(title?: string, template?: CanvasCreateTemplate): Promise<CanvasDocument>;
  save(document: CanvasDocument): Promise<CanvasDocument>;
  importImage(
    canvasId: string,
    bytes: ArrayBuffer,
    contentType: string
  ): Promise<{ relativePath: string }>;
  importVideo(canvasId: string, file: Blob, contentType: string): Promise<{ relativePath: string }>;
  mediaUrl(assetPath: string): string;
  getActiveCanvasId(): Promise<string | undefined>;
  setActiveCanvasId(canvasId: string): Promise<void>;
  listGeneration(canvasId: string): Promise<CanvasGenerationAttempt[]>;
  generateImage(
    canvasId: string,
    input: {
      prompt: string;
      name?: string;
      targetSize?: string;
      aspectRatio?: string;
      operation?: 'generate' | 'variant' | 'outpaint';
      sourceImagePath?: string;
      sourceImageId?: string;
      sourceImagePaths?: string[];
      sourceImageIds?: string[];
      referenceImagePaths?: string[];
      targetNodeId?: string;
    }
  ): Promise<CanvasGenerationAttempt>;
  createVideo(
    canvasId: string,
    input: {
      prompt: string;
      sourceImagePath: string;
      sourceImageId?: string;
      targetNodeId?: string;
      duration?: number;
    }
  ): Promise<CanvasGenerationAttempt>;
  generationAction(
    canvasId: string,
    attemptId: string,
    action: 'query' | 'retry' | 'cancel'
  ): Promise<CanvasGenerationAttempt>;
}

export interface CanvasStoreResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export async function dispatchCanvasStoreRequest(
  store: CanvasDocumentStore,
  requestPath: string,
  options?: RequestInit
): Promise<CanvasStoreResponse> {
  const success = (value: unknown, status = 200): CanvasStoreResponse => ({
    ok: true,
    status,
    json: async () => value,
  });
  const failure = (caught: unknown): CanvasStoreResponse => {
    const error = caught as Error & { status?: number };
    return { ok: false, status: error.status || 400, json: async () => ({ error: error.message }) };
  };
  try {
    const method = options?.method || 'GET';
    if (requestPath === '/canvases' && method === 'GET') return success(await store.list());
    if (requestPath === '/canvases' && method === 'POST') {
      const body = JSON.parse(String(options?.body || '{}')) as {
        title?: string;
        template?: CanvasCreateTemplate;
      };
      return success(await store.create(body.title, body.template), 201);
    }
    if (requestPath === '/canvases/active' && method === 'GET') {
      return success({ canvasId: await store.getActiveCanvasId() });
    }
    if (requestPath === '/canvases/active' && method === 'PUT') {
      const body = JSON.parse(String(options?.body || '{}')) as { canvasId?: string };
      if (body.canvasId) await store.setActiveCanvasId(body.canvasId);
      return success({ ok: true });
    }
    const match = requestPath.match(
      new RegExp('^/canvases/([0-9a-f-]{36})(/images|/videos)?$', 'i')
    );
    if (!match) throw Object.assign(new Error('Not found.'), { status: 404 });
    if (match[2] === '/images' && method === 'POST') {
      if (!(options?.body instanceof ArrayBuffer)) throw new Error('图片内容无效。');
      const contentType = new Headers(options?.headers).get('content-type') || '';
      return success(await store.importImage(match[1], options.body, contentType), 201);
    }
    if (match[2] === '/videos' && method === 'POST') {
      if (!(options?.body instanceof Blob)) throw new Error('视频内容无效。');
      const contentType = new Headers(options?.headers).get('content-type') || options.body.type;
      return success(await store.importVideo(match[1], options.body, contentType), 201);
    }
    if (!match[2] && method === 'GET') return success(await store.load(match[1]));
    if (!match[2] && method === 'PUT') {
      return success(await store.save(JSON.parse(String(options?.body || '{}')) as CanvasDocument));
    }
    throw Object.assign(new Error('Not found.'), { status: 404 });
  } catch (caught) {
    return failure(caught);
  }
}

export function createBrowserCanvasDocumentStore(
  projectKey: string,
  fetcher: typeof fetch = fetch
): CanvasDocumentStore {
  const base = '/api/projects/' + encodeURIComponent(projectKey);
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetcher(base + path, options);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      const error = new Error(body.error || '请求失败 ' + response.status) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }
    return body as T;
  }
  return {
    templates: {
      prepareTemplate: (id, canvasId) =>
        request<CanvasWorkflowTemplate>('/canvases/templates/' + id + '/prepare', {
          method: 'POST',
          body: JSON.stringify({ canvasId }),
          headers: { 'Content-Type': 'application/json' },
        }),
      listTemplatePage: (page, query) =>
        request<CanvasTemplatePage>(
          '/canvases/templates?page=' + page + '&q=' + encodeURIComponent(query)
        ),
      getTemplate: (id) => request<CanvasWorkflowTemplate>('/canvases/templates/' + id),
      getCover: async (id, revision, signal) => {
        const response = await fetcher(
          base + '/canvases/templates/' + id + '/cover?revision=' + revision,
          { signal }
        );
        if (!response.ok) throw new Error('缩略图加载失败');
        return {
          blob: await response.blob(),
          source: response.headers.get('X-Template-Cover-Source') === '1',
        };
      },
      saveCover: async (id, revision, blob, signal) => {
        await request('/canvases/templates/' + id + '/cover?revision=' + revision, {
          method: 'PUT',
          body: blob,
          signal,
        });
      },
      saveTemplate: (template) =>
        request<CanvasWorkflowTemplate>('/canvases/templates/' + template.id, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(template),
        }),
      deleteTemplate: (id, revision) =>
        request<void>('/canvases/templates/' + id, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision }),
        }),
    },
    list: () => request<CanvasSummary[]>('/canvases'),
    load: (canvasId: string) => request<CanvasDocument>('/canvases/' + canvasId),
    create: (title?: string, template?: CanvasCreateTemplate) =>
      request<CanvasDocument>('/canvases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, template }),
      }),
    save: (document: CanvasDocument) =>
      request<CanvasDocument>('/canvases/' + document.id, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(document),
      }),
    importImage: async (canvasId: string, bytes: ArrayBuffer, contentType: string) => {
      const response = await fetcher(base + '/canvases/' + canvasId + '/images', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: bytes,
      });
      const body = (await response.json().catch(() => ({}))) as {
        relativePath?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || '请求失败 ' + response.status);
      if (typeof body.relativePath !== 'string') throw new Error('导入结果缺少项目相对路径。');
      return { relativePath: body.relativePath };
    },
    importVideo: async (canvasId: string, file: Blob, contentType: string) => {
      const response = await fetcher(base + '/canvases/' + canvasId + '/videos', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: file,
      });
      const body = (await response.json().catch(() => ({}))) as {
        relativePath?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || '请求失败 ' + response.status);
      if (typeof body.relativePath !== 'string') throw new Error('视频导入结果缺少项目相对路径。');
      return { relativePath: body.relativePath };
    },
    mediaUrl: (assetPath: string) => base + '/canvas-media?path=' + encodeURIComponent(assetPath),
    getActiveCanvasId: async () =>
      (await request<{ canvasId?: string }>('/canvases/active')).canvasId,
    setActiveCanvasId: async (canvasId: string) => {
      await request('/canvases/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canvasId }),
      });
    },
    listGeneration: (canvasId: string) =>
      request<CanvasGenerationAttempt[]>('/canvases/' + canvasId + '/generation'),
    generateImage: (canvasId, input) =>
      request<CanvasGenerationAttempt>('/canvases/' + canvasId + '/generation/image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    createVideo: (canvasId, input) =>
      request<CanvasGenerationAttempt>('/canvases/' + canvasId + '/generation/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    generationAction: (canvasId, attemptId, action) =>
      request<CanvasGenerationAttempt>(
        '/canvases/' + canvasId + '/generation/' + attemptId + '/' + action,
        { method: 'POST' }
      ),
  };
}

export class MemoryCanvasDocumentStore implements CanvasDocumentStore {
  private readonly documents = new Map<string, CanvasDocument>();
  private activeCanvasId?: string;

  async list(): Promise<CanvasSummary[]> {
    return [...this.documents.values()].map(({ id, title, revision }) => ({
      id,
      title,
      revision,
      updatedAt: new Date(0).toISOString(),
    }));
  }
  async load(canvasId: string): Promise<CanvasDocument> {
    const document = this.documents.get(canvasId);
    if (!document) throw new CanvasStoreError('画布不存在。', 404, 'NOT_FOUND');
    return cloneDocument(document);
  }
  async create(title?: string, template: CanvasCreateTemplate = 'empty'): Promise<CanvasDocument> {
    const document = template === 'starter' ? starterDocument(title) : emptyDocument(title);
    this.documents.set(document.id, document);
    return cloneDocument(document);
  }
  async save(document: CanvasDocument): Promise<CanvasDocument> {
    const current = this.documents.get(document.id);
    if (!current) throw new CanvasStoreError('画布不存在。', 404, 'NOT_FOUND');
    if (current.revision !== document.revision)
      throw new CanvasStoreError('画布保存冲突。', 409, 'CONFLICT');
    const saved = cloneDocument(document);
    saved.revision += 1;
    this.documents.set(saved.id, saved);
    return cloneDocument(saved);
  }
  async importImage(): Promise<{ relativePath: string }> {
    return { relativePath: 'assets/image/memory-image.png' };
  }
  async importVideo(): Promise<{ relativePath: string }> {
    return { relativePath: '.maker/canvases/memory/videos/memory-video.mp4' };
  }
  mediaUrl(assetPath: string): string {
    return assetPath;
  }
  async getActiveCanvasId(): Promise<string | undefined> {
    return this.activeCanvasId;
  }
  async setActiveCanvasId(canvasId: string): Promise<void> {
    if (!this.documents.has(canvasId)) throw new CanvasStoreError('画布不存在。', 404, 'NOT_FOUND');
    this.activeCanvasId = canvasId;
  }
  async listGeneration(): Promise<CanvasGenerationAttempt[]> {
    return [];
  }
  async generateImage(): Promise<CanvasGenerationAttempt> {
    throw new Error('Memory canvas store does not call Maker MCP.');
  }
  async createVideo(): Promise<CanvasGenerationAttempt> {
    throw new Error('Memory canvas store does not call Maker MCP.');
  }
  async generationAction(): Promise<CanvasGenerationAttempt> {
    throw new Error('Memory canvas store does not call Maker MCP.');
  }
}
