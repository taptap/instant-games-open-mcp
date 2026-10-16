import type {
  CanvasGenerationAttempt,
  CanvasModelSettings,
  CanvasVideoHistory,
} from '../../../packages/maker-canvas/src/contracts.js';
export type {
  CanvasGenerationAttempt,
  CanvasModelSettings,
  CanvasVideoHistory,
} from '../../../packages/maker-canvas/src/contracts.js';
import {
  cloneDocument,
  emptyDocument,
  starterDocument,
  type CanvasCreateTemplate,
  type CanvasDocument,
  type CanvasSummary,
} from './model.js';
import type { CanvasModelAttempt } from './model3d.js';
import type { CanvasRecognitionAttempt as RecognitionAttempt } from '../../../packages/maker-canvas/src/contracts.js';
import { withCanvasTimeout } from './requestTimeout.js';
import { CanvasStoreError } from './model.js';
import type { CanvasTemplatePage, CanvasWorkflowTemplate } from './templates.js';

import type { CanvasDocumentStore } from '../../../packages/maker-canvas/src/browser.js';
export { dispatchCanvasStoreRequest } from '../../../packages/maker-canvas/src/browser.js';
export type {
  CanvasDocumentStore,
  CanvasStoreResponse,
} from '../../../packages/maker-canvas/src/browser.js';

export function createBrowserCanvasDocumentStore(
  projectKey: string,
  fetcher: typeof fetch = fetch
): CanvasDocumentStore {
  type RecognitionResponse = RecognitionAttempt & {
    server?: {
      cut: { image: { width: number; height: number }; error?: { retryable?: boolean } };
      text?: { error?: { retryable?: boolean } };
    };
  };
  function recognitionResult(response: RecognitionResponse): RecognitionAttempt {
    const { server, ...attempt } = response;
    return {
      ...attempt,
      ...(server &&
      !(
        attempt.status === 'failed' &&
        [server.cut, server.text].some((step) => step?.error?.retryable === false)
      )
        ? { recovery: { width: server.cut.image.width, height: server.cut.image.height } }
        : {}),
    };
  }
  const base = '/api/projects/' + encodeURIComponent(projectKey);
  const mediaVersions = new Map<string, string>();
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    if (!options?.signal && (options?.method === 'PUT' || !options?.method))
      return withCanvasTimeout((signal) => request<T>(path, { ...options, signal }));
    const response = await fetcher(base + path, options);
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      executionState?: string;
    };
    if (!response.ok) {
      const error = new Error(body.error || '请求失败 ' + response.status) as Error & {
        status: number;
        code?: string;
        executionState?: string;
      };
      error.status = response.status;
      error.code = body.code;
      error.executionState = body.executionState;
      throw error;
    }
    return body as T;
  }
  return {
    videoHistory: (offset = 0, limit = 30) =>
      request<CanvasVideoHistory>('/canvases/video-history?offset=' + offset + '&limit=' + limit),
    modelSettings: async () => {
      const response = await fetcher(
        '/api/settings/models?project=' + encodeURIComponent(projectKey)
      );
      const body = await response.json();
      if (!response.ok) throw new Error('模型设置读取失败，请检查控制台设置。');
      return body as CanvasModelSettings;
    },
    imageModels: (tool) => request('/canvases/image-models?tool=' + encodeURIComponent(tool)),
    recognitionModels: () => request('/canvases/recognition-models'),
    recognizeUi: (canvasId, input) =>
      request<RecognitionResponse>('/canvases/' + canvasId + '/recognition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(375000),
      }).then(recognitionResult),
    recognitionStatus: (canvasId, id) =>
      request<RecognitionResponse>('/canvases/' + canvasId + '/recognition/' + id, {
        signal: AbortSignal.timeout(375000),
      }).then(recognitionResult),
    listModels: (canvasId) => request<CanvasModelAttempt[]>('/canvases/' + canvasId + '/models'),
    modelPreviewUrl: (canvasId, nodeId) =>
      '/canvas-model-preview?project=' +
      encodeURIComponent(projectKey) +
      '&canvas=' +
      encodeURIComponent(canvasId) +
      '&node=' +
      encodeURIComponent(nodeId),
    exportModel: async (canvasId, nodeId) => {
      const response = await fetcher(
        base + '/canvases/' + canvasId + '/models/export?nodeId=' + encodeURIComponent(nodeId),
        { signal: AbortSignal.timeout(60000) }
      );
      if (!response.ok) throw new Error((await response.json()).error || '模型导出失败。');
      return response.blob();
    },
    modelAction: (canvasId, input, signal) =>
      request<CanvasModelAttempt>('/canvases/' + canvasId + '/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      }),
    templates: {
      exportTemplate: async (id, revision) => {
        const response = await fetcher(
          base + '/canvases/templates/' + id + '/export?revision=' + revision
        );
        if (!response.ok) throw new Error((await response.json()).error || '模板导出失败');
        return response.blob();
      },
      importTemplate: (zip) =>
        request<CanvasWorkflowTemplate>('/canvases/templates/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: zip,
        }),
      skillUrl: (name) =>
        '/?page=documents&project=' +
        encodeURIComponent(projectKey) +
        '&skill=' +
        encodeURIComponent(name),
      getPreviewImage: async (id, revision, nodeId, signal, itemIndex) => {
        const response = await fetcher(
          base +
            '/canvases/templates/' +
            id +
            '/preview-image?revision=' +
            revision +
            '&node=' +
            encodeURIComponent(nodeId) +
            (itemIndex === undefined ? '' : '&item=' + itemIndex),
          { signal }
        );
        if (!response.ok) throw new Error('预览图片加载失败');
        return response.blob();
      },
      modelPreviewUrl: (id, revision) =>
        '/canvas-model-preview?project=' +
        encodeURIComponent(projectKey) +
        '&template=' +
        encodeURIComponent(id) +
        '&revision=' +
        revision +
        '&mode=template',
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
      getCover: async (id, revision, signal, slot = 0) => {
        const response = await fetcher(
          base + '/canvases/templates/' + id + '/cover?revision=' + revision + '&slot=' + slot,
          { signal }
        );
        if (!response.ok) throw new Error('缩略图加载失败');
        return {
          blob: await response.blob(),
          source: response.headers.get('X-Template-Cover-Source') === '1',
          animation:
            JSON.parse(response.headers.get('X-Template-Cover-Animation') || 'null') || undefined,
        };
      },
      saveCover: async (id, revision, blob, signal, slot = 0) => {
        await request(
          '/canvases/templates/' + id + '/cover?revision=' + revision + '&slot=' + slot,
          {
            method: 'PUT',
            body: blob,
            signal,
          }
        );
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
    importImage: async (
      canvasId: string,
      bytes: ArrayBuffer,
      contentType: string,
      purpose?: 'resource'
    ) => {
      const body = await withCanvasTimeout((signal) =>
        request<{ relativePath?: string }>(
          '/canvases/' + canvasId + (purpose === 'resource' ? '/resource-images' : '/images'),
          { method: 'POST', headers: { 'content-type': contentType }, body: bytes, signal }
        )
      );
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
    async mediaVersions(paths) {
      const result: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 3) {
        await Promise.all(
          paths.slice(i, i + 3).map(async (path) => {
            const value = await request<{ version: string }>(
              '/canvases/media-version?path=' + encodeURIComponent(path)
            );
            result[path] = value.version;
          })
        );
      }
      for (const [path, version] of Object.entries(result)) mediaVersions.set(path, version);
      return result;
    },
    mediaUrl: (assetPath: string) =>
      base +
      '/canvas-media?path=' +
      encodeURIComponent(assetPath) +
      (mediaVersions.has(assetPath) ? '&version=' + mediaVersions.get(assetPath) : ''),
    imageInfo: (assetPath: string) =>
      request('/canvases/image-info?path=' + encodeURIComponent(assetPath)),
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
    generateImage: (canvasId, input, signal) =>
      request<CanvasGenerationAttempt>('/canvases/' + canvasId + '/generation/image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      }),
    createVideo: (canvasId, input, signal) =>
      request<CanvasGenerationAttempt>('/canvases/' + canvasId + '/generation/video', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      }),
    generationAction: (canvasId, attemptId, action, signal) =>
      request<CanvasGenerationAttempt>(
        '/canvases/' + canvasId + '/generation/' + attemptId + '/' + action,
        { method: 'POST', signal }
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
