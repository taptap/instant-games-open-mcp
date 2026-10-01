import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { callRemoteProxyTool } from '../server/mcp.js';
import {
  type RemoteProxyExecutionState,
  RemoteProxyToolCallError,
  RemoteProxyToolResultError,
} from '../server/proxyAssets.js';
import type { MakerRemoteProxyManager } from '../server/remoteProxyManager.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { snapshotCanvasSource, type CanvasSourceSnapshot } from '../canvas/dependencies.js';

export type CanvasGenerationKind = 'image' | 'video';
export type CanvasGenerationStatus =
  | 'running'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'canceled';

export interface CanvasGenerationAttempt {
  id: string;
  canvasId: string;
  kind: CanvasGenerationKind;
  toolName: 'generate_image' | 'create_video_task';
  status: CanvasGenerationStatus;
  prompt: string;
  operation?: 'generate' | 'variant' | 'outpaint';
  taskId?: string;
  sourceImagePath?: string;
  sourceImageId?: string;
  sourceImagePaths?: string[];
  sourceImageIds?: string[];
  referenceImagePaths?: string[];
  targetNodeId?: string;
  sourceSnapshot?: CanvasSourceSnapshot;
  parameters?: {
    model?: string;
    resolution?: string;
    targetSize?: string;
    aspectRatio?: string;
    duration?: number;
    ratio?: string;
    userConfirmed?: boolean;
  };
  resultAssetPath?: string;
  error?: string;
  executionState?: RemoteProxyExecutionState;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resultPayload(result: unknown): Record<string, unknown> {
  const response = result as { structuredContent?: unknown; content?: unknown };
  const structured = response.structuredContent;
  if (isRecord(structured)) return structured;
  for (const item of Array.isArray(response.content) ? response.content : []) {
    if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') continue;
    try {
      const parsed = JSON.parse(item.text);
      if (isRecord(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return {};
}

function executionError(error: unknown): {
  message: string;
  state?: RemoteProxyExecutionState;
} {
  if (error instanceof RemoteProxyToolCallError)
    return { message: error.message, state: error.executionState };
  if (error instanceof RemoteProxyToolResultError)
    return {
      message: error.message,
      state: resultPayload(error.result).execution_state === 'unknown' ? 'unknown' : 'not_executed',
    };
  return { message: error instanceof Error ? error.message : String(error) };
}

export class CanvasGenerationService {
  private readonly attemptsDir: string;

  constructor(
    private readonly projectRoot: string,
    private readonly remoteProxyManager: MakerRemoteProxyManager
  ) {
    this.attemptsDir = path.join(projectRoot, '.maker', 'canvases', 'attempts');
  }

  async generateImage(options: {
    canvasId: string;
    prompt: string;
    name?: string;
    targetSize?: string;
    aspectRatio?: string;
    model?: string;
    resolution?: string;
    operation?: 'generate' | 'variant' | 'outpaint';
    sourceImagePath?: string;
    sourceImageId?: string;
    sourceImagePaths?: string[];
    sourceImageIds?: string[];
    referenceImagePaths?: string[];
    targetNodeId?: string;
  }): Promise<CanvasGenerationAttempt> {
    const files = new MakerCanvasFiles(this.projectRoot);
    await files.assertWritableForGeneration();
    const document = await files.load(options.canvasId);
    const sourceImagePaths = options.sourceImagePaths?.length
      ? options.sourceImagePaths
      : options.sourceImagePath
        ? [options.sourceImagePath]
        : [];
    const sourceImageIds = options.sourceImageIds?.length
      ? options.sourceImageIds
      : options.sourceImageId
        ? [options.sourceImageId]
        : [];
    const operation = options.operation || (sourceImagePaths.length ? 'variant' : 'generate');
    if (operation !== 'generate' && sourceImagePaths.length === 0) {
      throw new Error('图片变体或扩展画面必须提供来源图片。');
    }
    const referenceImagePaths = options.referenceImagePaths || [];
    if (sourceImagePaths.length + referenceImagePaths.length > 14 || sourceImageIds.length > 14) {
      throw new Error('图片生成最多支持 14 张参考图。');
    }
    if (options.model && !['nanobanana', 'gpt'].includes(options.model))
      throw new Error('图片模型无效。');
    if (options.resolution && !['1K', '2K'].includes(options.resolution))
      throw new Error('图片分辨率无效。');
    if (
      options.aspectRatio &&
      !['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9', '5:4', '4:5'].includes(
        options.aspectRatio
      )
    )
      throw new Error('图片比例无效。');
    if (options.targetSize && !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(options.targetSize))
      throw new Error('图片目标尺寸无效。');
    this.assertImageSources(document, sourceImageIds, sourceImagePaths, files);
    for (const referencePath of referenceImagePaths) {
      if (!files.readMedia(referencePath).type.startsWith('image/'))
        throw new Error('参考图必须是项目内的图片素材。');
    }
    const remoteReferences = [...new Set([...sourceImagePaths, ...referenceImagePaths])];
    if (options.targetNodeId) {
      const target = document.nodes.find((node) => node.id === options.targetNodeId);
      if (!target || target.type !== 'image') {
        throw new Error('图片生成目标卡不存在或不是图片卡。');
      }
    }
    const attempt = this.createAttempt({
      canvasId: options.canvasId,
      kind: 'image',
      toolName: 'generate_image',
      prompt: options.prompt,
      operation,
      sourceImagePath: options.sourceImagePath || sourceImagePaths[0],
      sourceImageId: options.sourceImageId || sourceImageIds[0],
      sourceImagePaths,
      sourceImageIds,
      referenceImagePaths,
      targetNodeId: options.targetNodeId,
    });
    attempt.sourceSnapshot = snapshotCanvasSource(
      document.nodes.find((node) => node.id === sourceImageIds[0])
    );
    attempt.parameters = {
      model: options.model,
      resolution: options.resolution,
      targetSize: options.targetSize,
      aspectRatio: options.aspectRatio,
    };
    this.writeAttempt(attempt);
    try {
      const result = await callRemoteProxyTool({
        targetDir: this.projectRoot,
        name: 'generate_image',
        manager: this.remoteProxyManager,
        args: {
          prompt: options.prompt,
          name: options.name || 'canvas-image',
          target_size: options.targetSize || '1024x1024',
          ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
          ...(options.model ? { model: options.model } : {}),
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(remoteReferences.length ? { reference_images: remoteReferences } : {}),
        },
      });
      const payload = resultPayload(result);
      const source = stringField(payload.localPath);
      if (!source || !source.startsWith('assets/image/'))
        throw new Error('Maker MCP 已返回，但没有可用于画布的本地图片素材。');
      attempt.resultAssetPath = files.importGeneratedImage(source);
      attempt.status = 'succeeded';
      this.touch(attempt);
      this.writeAttempt(attempt);
      return attempt;
    } catch (error) {
      this.failAttempt(attempt, error);
      return attempt;
    }
  }

  async createVideo(options: {
    canvasId: string;
    prompt: string;
    sourceImagePath: string;
    sourceImageId?: string;
    targetNodeId?: string;
    duration?: number;
    model?: string;
    resolution?: string;
    ratio?: string;
    userConfirmed?: boolean;
    sourceImagePaths?: string[];
    sourceImageIds?: string[];
  }): Promise<CanvasGenerationAttempt> {
    const files = new MakerCanvasFiles(this.projectRoot);
    await files.assertWritableForGeneration();
    const document = await files.load(options.canvasId);
    const sourceImagePaths = options.sourceImagePaths?.length
      ? options.sourceImagePaths
      : [options.sourceImagePath];
    const sourceImageIds = options.sourceImageIds?.length
      ? options.sourceImageIds
      : options.sourceImageId
        ? [options.sourceImageId]
        : [];
    const model = options.model || '2.0';
    const duration = options.duration ?? 4;
    const ratio = options.ratio || 'adaptive';
    if (!['2.0', '2.5'].includes(model)) throw new Error('视频模型无效。');
    if (options.resolution && !['480p', '720p'].includes(options.resolution))
      throw new Error('视频分辨率无效。');
    if (!Number.isInteger(duration) || duration < 4 || duration > 8)
      throw new Error('视频时长超出当前模型支持范围。');
    if (!['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(ratio))
      throw new Error('视频比例无效。');
    if (model === '2.5' && sourceImagePaths.length === 1 && ratio !== 'adaptive')
      throw new Error('Seedance 2.5 首帧生成只能使用自动比例。');
    if (model === '2.5' && options.userConfirmed !== true)
      throw new Error('请先确认视频积分粗估；实际按上游 token 扣费。');
    if (!sourceImagePaths.length || sourceImagePaths.length > (model === '2.5' ? 30 : 9))
      throw new Error('视频参考图数量超出当前模型支持范围。');
    this.assertImageSources(document, sourceImageIds, sourceImagePaths, files);
    if (options.targetNodeId) {
      const target = document.nodes.find((node) => node.id === options.targetNodeId);
      if (!target || (target.type !== 'video' && target.type !== 'video-source')) {
        throw new Error('视频生成目标卡不存在或不是视频输入卡。');
      }
    }
    const attempt = this.createAttempt({
      canvasId: options.canvasId,
      kind: 'video',
      toolName: 'create_video_task',
      prompt: options.prompt,
      sourceImagePath: options.sourceImagePath,
      sourceImageId: options.sourceImageId,
      sourceImagePaths,
      sourceImageIds,
      targetNodeId: options.targetNodeId,
    });
    attempt.sourceImagePath = sourceImagePaths[0];
    attempt.sourceImageId = sourceImageIds[0];
    attempt.sourceSnapshot = snapshotCanvasSource(
      document.nodes.find((node) => node.id === sourceImageIds[0])
    );
    attempt.parameters = {
      model,
      resolution: options.resolution,
      duration,
      ratio,
      userConfirmed: options.userConfirmed,
    };
    this.writeAttempt(attempt);
    try {
      const result = await callRemoteProxyTool({
        targetDir: this.projectRoot,
        name: 'create_video_task',
        manager: this.remoteProxyManager,
        args: {
          mode: sourceImagePaths.length === 1 ? 'first_frame' : 'multi_modal_reference',
          prompt: options.prompt,
          images: sourceImagePaths.map((url) => ({
            url,
            role: sourceImagePaths.length === 1 ? 'first_frame' : 'reference_image',
          })),
          duration,
          ratio,
          model,
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(options.userConfirmed === true ? { user_confirmed: true } : {}),
          return_last_frame: false,
        },
      });
      const payload = resultPayload(result);
      attempt.taskId = stringField(payload.task_id);
      attempt.status =
        payload.status === 'succeeded' ? 'succeeded' : attempt.taskId ? 'pending' : 'unknown';
      if (attempt.status === 'unknown') {
        attempt.error = '视频任务尚未完成，但响应没有提供可查询的 taskId。';
      }
      if (attempt.status === 'succeeded') {
        const source = stringField(payload.localPath);
        if (!source || !source.startsWith('assets/video/'))
          throw new Error('视频任务已完成，但没有可用于画布的本地视频素材。');
        attempt.resultAssetPath = files.importGeneratedVideo(options.canvasId, source);
      }
      this.touch(attempt);
      this.writeAttempt(attempt);
      return attempt;
    } catch (error) {
      this.failAttempt(attempt, error);
      return attempt;
    }
  }

  async queryVideo(attemptId: string, canvasId?: string): Promise<CanvasGenerationAttempt> {
    const attempt = this.readAttemptForCanvas(attemptId, canvasId);
    if (attempt.kind !== 'video' || !attempt.taskId)
      throw new Error('该尝试没有可查询的视频任务。');
    const files = new MakerCanvasFiles(this.projectRoot);
    await files.assertWritableForGeneration();
    try {
      const result = await callRemoteProxyTool({
        targetDir: this.projectRoot,
        name: 'query_video_task',
        manager: this.remoteProxyManager,
        args: { task_id: attempt.taskId, suppress_preview_links: true },
      });
      const payload = resultPayload(result);
      attempt.status =
        payload.status === 'succeeded'
          ? 'succeeded'
          : payload.status === 'failed'
            ? 'failed'
            : 'pending';
      attempt.error = stringField(payload.error);
      if (attempt.status === 'succeeded' && !attempt.resultAssetPath) {
        const source = stringField(payload.localPath);
        if (!source || !source.startsWith('assets/video/'))
          throw new Error('查询完成但没有本地视频素材。');
        attempt.resultAssetPath = files.importGeneratedVideo(attempt.canvasId, source);
      }
      this.touch(attempt);
      this.writeAttempt(attempt);
      return attempt;
    } catch (error) {
      this.failAttempt(attempt, error, true);
      return attempt;
    }
  }

  async retry(attemptId: string, canvasId?: string): Promise<CanvasGenerationAttempt> {
    const previous = this.readAttemptForCanvas(attemptId, canvasId);
    if (previous.status === 'unknown') {
      throw new Error('结果未知，不能自动重试；视频任务请先查询原 taskId。');
    }
    if (previous.status !== 'failed') {
      throw new Error('只有明确失败的生成尝试可以重试。');
    }
    if (previous.kind === 'image') {
      return this.generateImage({
        canvasId: previous.canvasId,
        prompt: previous.prompt,
        operation: previous.operation,
        sourceImagePath: previous.sourceImagePath,
        sourceImageId: previous.sourceImageId,
        sourceImagePaths: previous.sourceImagePaths,
        sourceImageIds: previous.sourceImageIds,
        referenceImagePaths: previous.referenceImagePaths,
        targetNodeId: previous.targetNodeId,
        ...previous.parameters,
      });
    }
    if (!previous.sourceImagePath) throw new Error('视频重试缺少来源图片。');
    return this.createVideo({
      canvasId: previous.canvasId,
      prompt: previous.prompt,
      sourceImagePath: previous.sourceImagePath,
      sourceImageId: previous.sourceImageId,
      targetNodeId: previous.targetNodeId,
      sourceImagePaths: previous.sourceImagePaths,
      sourceImageIds: previous.sourceImageIds,
      ...previous.parameters,
    });
  }

  cancel(attemptId: string, canvasId?: string): CanvasGenerationAttempt {
    const attempt = this.readAttemptForCanvas(attemptId, canvasId);
    if (attempt.status === 'succeeded' || attempt.status === 'failed') return attempt;
    attempt.status = 'canceled';
    attempt.error = attempt.taskId
      ? '已停止本地等待；远端任务可能仍在运行，可使用原 taskId 查询。'
      : '已在本地取消，未确认远端是否已派发。';
    this.touch(attempt);
    this.writeAttempt(attempt);
    return attempt;
  }

  list(canvasId?: string): CanvasGenerationAttempt[] {
    if (!fs.existsSync(this.attemptsDir)) return [];
    return fs
      .readdirSync(this.attemptsDir)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        try {
          const value = JSON.parse(
            fs.readFileSync(path.join(this.attemptsDir, name), 'utf8')
          ) as CanvasGenerationAttempt;
          return !canvasId || value.canvasId === canvasId ? [this.normalizeAttempt(value)] : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private createAttempt(
    input: Pick<
      CanvasGenerationAttempt,
      | 'canvasId'
      | 'kind'
      | 'toolName'
      | 'prompt'
      | 'operation'
      | 'sourceImagePath'
      | 'sourceImageId'
      | 'sourceImagePaths'
      | 'sourceImageIds'
      | 'referenceImagePaths'
      | 'targetNodeId'
    >
  ): CanvasGenerationAttempt {
    const now = new Date().toISOString();
    return { id: randomUUID(), ...input, status: 'running', createdAt: now, updatedAt: now };
  }

  private touch(attempt: CanvasGenerationAttempt): void {
    attempt.updatedAt = new Date().toISOString();
  }

  private failAttempt(attempt: CanvasGenerationAttempt, error: unknown, queryFailed = false): void {
    const detail = executionError(error);
    attempt.status = queryFailed || detail.state === 'unknown' ? 'unknown' : 'failed';
    attempt.executionState = detail.state;
    attempt.error = detail.message;
    this.touch(attempt);
    this.writeAttempt(attempt);
  }

  private readAttempt(id: string): CanvasGenerationAttempt {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('生成尝试标识无效。');
    const filename = path.join(this.attemptsDir, id + '.json');
    if (!fs.existsSync(filename) || fs.lstatSync(filename).isSymbolicLink())
      throw new Error('生成尝试不存在。');
    const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as CanvasGenerationAttempt;
    if (value.id !== id) throw new Error('生成尝试标识不匹配。');
    return this.normalizeAttempt(value);
  }

  private normalizeAttempt(value: CanvasGenerationAttempt): CanvasGenerationAttempt {
    const marker = value.error?.indexOf('remote_result:') ?? -1;
    if (value.status === 'failed' && marker >= 0) {
      try {
        const result = JSON.parse(value.error!.slice(marker + 'remote_result:'.length));
        if (resultPayload(result).execution_state === 'unknown')
          return { ...value, status: 'unknown', executionState: 'unknown' };
      } catch {
        return value;
      }
    }
    return value;
  }

  private readAttemptForCanvas(id: string, canvasId?: string): CanvasGenerationAttempt {
    const attempt = this.readAttempt(id);
    if (canvasId && attempt.canvasId !== canvasId) {
      throw new Error('生成尝试不属于当前画布。');
    }
    return attempt;
  }

  private assertImageSources(
    document: Awaited<ReturnType<MakerCanvasFiles['load']>>,
    sourceImageIds: string[],
    sourceImagePaths: string[],
    files: MakerCanvasFiles
  ): void {
    if (sourceImageIds.length !== sourceImagePaths.length) {
      throw new Error('图生任务的来源节点和素材数量不一致。');
    }
    if (new Set(sourceImageIds).size !== sourceImageIds.length) {
      throw new Error('图生任务的来源图片不能重复。');
    }
    sourceImagePaths.forEach((sourceImagePath, index) => {
      const media = files.readMedia(sourceImagePath);
      if (!media.type.startsWith('image/')) {
        throw new Error('图生任务的来源必须是图片素材。');
      }
      const source = document.nodes.find((node) => node.id === sourceImageIds[index]);
      if (!source || source.type !== 'image' || source.assetPath !== sourceImagePath) {
        throw new Error('来源图片与画布节点不匹配。');
      }
    });
  }

  private writeAttempt(attempt: CanvasGenerationAttempt): void {
    fs.mkdirSync(this.attemptsDir, { recursive: true, mode: 0o700 });
    const filename = path.join(this.attemptsDir, attempt.id + '.json');
    const temporary = filename + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(attempt), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, filename);
  }
}
