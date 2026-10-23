import type { CanvasHostCapabilities } from './capabilities.js';
import type { CanvasImageModels } from '../contracts.js';
import type {
  CanvasCreateTemplate,
  CanvasDocument,
  CanvasSummary,
  CanvasGenerationAttempt,
  CanvasModelAttempt,
  CanvasModelSettings,
  CanvasVideoHistory,
  CanvasRecognitionAttempt as RecognitionAttempt,
  CanvasTemplatePage,
  CanvasWorkflowTemplate,
  CanvasTemplateCoverAnimation,
} from '../contracts.js';

export interface CanvasTemplateStore {
  exportTemplate?(id: string, revision: number): Promise<Blob>;
  importTemplate?(zip: Blob): Promise<CanvasWorkflowTemplate>;
  skillUrl?(name: string): string;
  getPreviewImage?(
    id: string,
    revision: number,
    nodeId: string,
    signal?: AbortSignal,
    itemIndex?: number
  ): Promise<Blob>;
  modelPreviewUrl?(id: string, revision: number): string;
  listTemplatePage(page: number, query: string): Promise<CanvasTemplatePage>;
  getTemplate(id: string): Promise<CanvasWorkflowTemplate>;
  getCover(
    id: string,
    revision: number,
    signal?: AbortSignal,
    slot?: number
  ): Promise<{ blob: Blob; source: boolean; animation?: CanvasTemplateCoverAnimation }>;
  saveCover(
    id: string,
    revision: number,
    blob: Blob,
    signal?: AbortSignal,
    slot?: number
  ): Promise<void>;
  saveTemplate(template: CanvasWorkflowTemplate): Promise<CanvasWorkflowTemplate>;
  deleteTemplate(id: string, revision: number): Promise<void>;
  prepareTemplate?(id: string, canvasId: string): Promise<CanvasWorkflowTemplate>;
}

export interface CanvasDocumentStore {
  /** Refresh content identities and the media URLs used for the same bytes. */
  mediaVersions?(paths: string[]): Promise<Record<string, string>>;
  capabilities?: CanvasHostCapabilities;
  modelSettings?(): Promise<CanvasModelSettings>;
  imageModels?(tool: 'generate_image' | 'edit_image'): Promise<CanvasImageModels>;
  recognitionModels?(): Promise<
    Array<{ id: string; model: string; source?: 'local' | 'server' | 'custom' | 'chatgpt-web' }>
  >;
  recognizeUi?(
    canvasId: string,
    input: {
      id: string;
      nodeId: string;
      model: string;
      revision: number;
      width: number;
      height: number;
      allowPaid: boolean;
      recover?: boolean;
    }
  ): Promise<RecognitionAttempt>;
  recognitionStatus?(canvasId: string, id: string): Promise<RecognitionAttempt>;
  modelPreviewUrl?(canvasId: string, nodeId: string): string;
  listModels?(canvasId: string): Promise<CanvasModelAttempt[]>;
  exportModel?(canvasId: string, nodeId: string): Promise<Blob>;
  modelAction?(
    canvasId: string,
    input: {
      nodeId: string;
      action: 'start' | 'query' | 'confirm';
      revision?: number;
      reviewId?: string;
    },
    signal?: AbortSignal
  ): Promise<CanvasModelAttempt>;
  templates?: CanvasTemplateStore;
  videoHistory?(offset?: number, limit?: number): Promise<CanvasVideoHistory>;
  list(): Promise<CanvasSummary[]>;
  load(canvasId: string): Promise<CanvasDocument>;
  create(title?: string, template?: CanvasCreateTemplate): Promise<CanvasDocument>;
  save(document: CanvasDocument): Promise<CanvasDocument>;
  importImage(
    canvasId: string,
    bytes: ArrayBuffer,
    contentType: string,
    purpose?: 'resource'
  ): Promise<{ relativePath: string }>;
  importVideo(canvasId: string, file: Blob, contentType: string): Promise<{ relativePath: string }>;
  mediaUrl(assetPath: string): string;
  imageInfo?(assetPath: string): Promise<{ width: number; height: number } | undefined>;
  getActiveCanvasId(): Promise<string | undefined>;
  setActiveCanvasId(canvasId: string): Promise<void>;
  listGeneration(canvasId: string): Promise<CanvasGenerationAttempt[]>;
  generateImage(
    canvasId: string,
    input: {
      prompt: string;
      cutoutColor?: '#FF00FF' | '#00FF00' | 'transparent';
      name?: string;
      /** Provider from imageModels(); model is omitted for "auto" (host default) and custom APIs. */
      provider?: CanvasImageModels['provider'];
      model?: string;
      resolution?: string;
      targetSize?: string;
      aspectRatio?: string;
      operation?: 'generate' | 'variant' | 'outpaint';
      sourceImagePath?: string;
      sourceImageId?: string;
      sourceImagePaths?: string[];
      sourceImageIds?: string[];
      referenceImagePaths?: string[];
      targetNodeId?: string;
    },
    signal?: AbortSignal
  ): Promise<CanvasGenerationAttempt>;
  createVideo(
    canvasId: string,
    input: {
      prompt: string;
      sourceImagePath: string;
      sourceImageId?: string;
      targetNodeId?: string;
      duration?: number;
    },
    signal?: AbortSignal
  ): Promise<CanvasGenerationAttempt>;
  generationAction(
    canvasId: string,
    attemptId: string,
    action: 'query' | 'retry' | 'cancel',
    signal?: AbortSignal
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
      new RegExp('^/canvases/([0-9a-f-]{36})(/images|/resource-images|/videos)?$', 'i')
    );
    if (!match) throw Object.assign(new Error('Not found.'), { status: 404 });
    if (['/images', '/resource-images'].includes(match[2]) && method === 'POST') {
      if (!(options?.body instanceof ArrayBuffer)) throw new Error('图片内容无效。');
      const contentType = new Headers(options?.headers).get('content-type') || '';
      return success(
        await store.importImage(
          match[1],
          options.body,
          contentType,
          match[2] === '/resource-images' ? 'resource' : undefined
        ),
        201
      );
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
