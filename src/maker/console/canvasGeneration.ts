import fs from 'node:fs';
import { validateFramePairVideo } from '../canvas/framePair.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { callRemoteProxyTool } from '../server/mcp.js';
import {
  type RemoteProxyExecutionState,
  RemoteProxyToolCallError,
  RemoteProxyToolResultError,
  getRemoteProxyExecutionState,
} from '../server/proxyAssets.js';
import type { MakerRemoteProxyManager } from '../server/remoteProxyManager.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { snapshotCanvasSource, type CanvasSourceSnapshot } from '../canvas/dependencies.js';
import { ConsoleError } from './types.js';
import { videoTaskTiming } from '../canvas/videoTaskTiming.js';
import {
  acquireVideoSubmission,
  releaseVideoSubmission,
  unfinishedVideo,
  type CanvasVideoBusy,
} from './canvasVideoGate.js';

const videoOperations = new Set<string>();

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
  targetAssetPath?: string;
  remoteStatus?: 'pending' | 'succeeded' | 'failed';
  failureStage?: 'submission' | 'remote' | 'query' | 'download';
  localWaitCanceledAt?: string;
  nextQueryAt?: string;
  sourceSnapshot?: CanvasSourceSnapshot;
  sourceSnapshots?: CanvasSourceSnapshot[];
  parameters?: {
    model?: string;
    resolution?: string;
    targetSize?: string;
    aspectRatio?: string;
    duration?: number;
    ratio?: string;
    userConfirmed?: boolean;
    mode?: 'first_frame' | 'first_last_frame' | 'multi_modal_reference';
  };
  resultAssetPath?: string;
  credits?: number;
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

function returnedCredits(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function videoTaskError(payload: Record<string, unknown>): string | undefined {
  return (
    stringField(payload.error) ||
    (isRecord(payload.error) ? stringField(payload.error.message) : undefined) ||
    (payload.status === 'failed'
      ? stringField(payload.agent_instruction) || '视频生成失败。'
      : undefined)
  );
}

function resultPayload(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return {};
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
      state: getRemoteProxyExecutionState(error.result) ?? 'unknown',
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
      attempt.credits = returnedCredits(payload.credits);
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

  async createVideo(
    options: {
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
      referenceImagePaths?: string[];
      mode?: string;
    },
    signal?: AbortSignal
  ): Promise<CanvasGenerationAttempt> {
    signal?.throwIfAborted();
    const files = new MakerCanvasFiles(this.projectRoot);
    await files.assertWritableForGeneration();
    signal?.throwIfAborted();
    const document = await files.load(options.canvasId);
    signal?.throwIfAborted();
    const sourceImagePaths = options.sourceImagePaths?.length
      ? options.sourceImagePaths
      : [options.sourceImagePath];
    const sourceImageIds = options.sourceImageIds?.length
      ? options.sourceImageIds
      : options.sourceImageId
        ? [options.sourceImageId]
        : [];
    const model = options.model || '2.0';
    const referenceImagePaths = options.referenceImagePaths || [];
    const imagePaths = [...sourceImagePaths, ...referenceImagePaths];
    const mode =
      options.mode || (imagePaths.length === 1 ? 'first_frame' : 'multi_modal_reference');
    if (!['first_frame', 'first_last_frame', 'multi_modal_reference'].includes(mode))
      throw new Error('视频输入模式无效。');
    if (mode === 'first_frame' && imagePaths.length !== 1)
      throw new Error('首帧模式需要一张图片。');
    if (mode === 'first_last_frame' && imagePaths.length !== 2)
      throw new Error('首尾帧模式需要两张图片，顺序为首帧、尾帧。');
    const duration = options.duration ?? 4;
    const ratio = options.ratio || 'adaptive';
    if (!['2.0', '2.5'].includes(model)) throw new Error('视频模型无效。');
    if (options.resolution && !['480p', '720p'].includes(options.resolution))
      throw new Error('视频分辨率无效。');
    if (!Number.isInteger(duration) || duration < 4 || duration > 8)
      throw new Error('视频时长超出当前模型支持范围。');
    if (!['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(ratio))
      throw new Error('视频比例无效。');
    if (model === '2.5' && mode !== 'multi_modal_reference' && ratio !== 'adaptive')
      throw new Error('Seedance 2.5 首帧生成只能使用自动比例。');
    if (model === '2.5' && options.userConfirmed !== true)
      throw new Error('请先确认视频积分粗估；实际按上游 token 扣费。');
    if (!imagePaths.length || imagePaths.length > (model === '2.5' ? 30 : 9))
      throw new Error('视频参考图数量超出当前模型支持范围。');
    this.assertImageSources(document, sourceImageIds, sourceImagePaths, files);
    for (const referencePath of referenceImagePaths) {
      if (!files.readMedia(referencePath).type.startsWith('image/'))
        throw new Error('视频参考素材必须是图片。');
    }
    if (options.targetNodeId) {
      const target = document.nodes.find((node) => node.id === options.targetNodeId);
      if (!target || (target.type !== 'video' && target.type !== 'video-source')) {
        throw new Error('视频生成目标卡不存在或不是视频输入卡。');
      }
      validateFramePairVideo(document, target.id, mode, sourceImageIds, referenceImagePaths);
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
      referenceImagePaths,
      targetNodeId: options.targetNodeId,
    });
    attempt.sourceImagePath = sourceImagePaths[0];
    attempt.sourceImageId = sourceImageIds[0];
    attempt.sourceSnapshot = snapshotCanvasSource(
      document.nodes.find((node) => node.id === sourceImageIds[0])
    );
    attempt.sourceSnapshots = sourceImageIds.flatMap((id) => {
      const snapshot = snapshotCanvasSource(document.nodes.find((node) => node.id === id));
      return snapshot ? [snapshot] : [];
    });
    attempt.parameters = {
      mode: mode as 'first_frame' | 'first_last_frame' | 'multi_modal_reference',
      model,
      resolution: options.resolution,
      duration,
      ratio,
      userConfirmed: options.userConfirmed,
    };
    attempt.targetAssetPath =
      document.nodes.find((node) => node.id === options.targetNodeId)?.assetPath || '';
    const operationKey = this.operationKey(attempt.id);
    const releaseSubmission = acquireVideoSubmission(this.projectRoot, attempt);
    try {
      this.writeAttempt(attempt);
    } catch (error) {
      releaseSubmission();
      throw error;
    }
    videoOperations.add(operationKey);
    let cancelError: unknown;
    const cancelLocalWait = () => {
      try {
        this.cancel(attempt.id, attempt.canvasId);
      } catch (error) {
        cancelError = error;
      }
    };
    signal?.addEventListener('abort', cancelLocalWait, { once: true });
    try {
      const result = await callRemoteProxyTool({
        targetDir: this.projectRoot,
        name: 'create_video_task',
        manager: this.remoteProxyManager,
        onRawResult: (raw) => this.captureVideoResult(attempt, raw),
        retryExpiredAuth: false,
        args: {
          mode,
          prompt: options.prompt,
          images: imagePaths.map((url, index) => ({
            url,
            role:
              mode === 'first_frame'
                ? 'first_frame'
                : mode === 'first_last_frame'
                  ? index === 0
                    ? 'first_frame'
                    : 'last_frame'
                  : 'reference_image',
          })),
          duration,
          ratio,
          model,
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(options.userConfirmed === true ? { user_confirmed: true } : {}),
          return_last_frame: false,
        },
      });
      this.finishVideoResult(attempt, result, files);
    } catch (error) {
      this.failVideoAttempt(attempt, error, false);
    } finally {
      signal?.removeEventListener('abort', cancelLocalWait);
      videoOperations.delete(operationKey);
      releaseSubmission();
    }
    if (cancelError) throw cancelError;
    return attempt;
  }

  async queryVideo(attemptId: string, canvasId?: string): Promise<CanvasGenerationAttempt> {
    const attempt = this.readAttemptForCanvas(attemptId, canvasId);
    if (attempt.kind !== 'video' || !attempt.taskId)
      throw new Error('该尝试没有可查询的视频任务。');
    if (videoTaskTiming(attempt).queryExpired)
      throw new ConsoleError(
        '已超过提交后 6 小时的查询期限，不能继续查询；历史记录和本地结果仍保留。',
        410
      );
    if (
      (attempt.status === 'pending' || attempt.status === 'canceled') &&
      attempt.nextQueryAt &&
      Date.parse(attempt.nextQueryAt) > Date.now()
    )
      throw new ConsoleError(
        '首次 pending 后需等待 120 秒再查询，请于 ' + attempt.nextQueryAt + ' 后查询原任务。',
        429
      );
    const operationKey = this.operationKey(attempt.id);
    if (videoOperations.has(operationKey))
      throw new ConsoleError('该视频正在提交或查询，请等待当前操作完成。', 409);
    videoOperations.add(operationKey);
    const files = new MakerCanvasFiles(this.projectRoot);
    try {
      await files.assertWritableForGeneration();
      const result = await callRemoteProxyTool({
        targetDir: this.projectRoot,
        name: 'query_video_task',
        manager: this.remoteProxyManager,
        onRawResult: (raw) => this.captureVideoResult(attempt, raw),
        args: { task_id: attempt.taskId, suppress_preview_links: true },
      });
      this.finishVideoResult(attempt, result, files);
      return attempt;
    } catch (error) {
      this.failVideoAttempt(attempt, error, true);
      return attempt;
    } finally {
      videoOperations.delete(operationKey);
    }
  }

  async retry(
    attemptId: string,
    canvasId?: string,
    signal?: AbortSignal
  ): Promise<CanvasGenerationAttempt> {
    signal?.throwIfAborted();
    const previous = this.readAttemptForCanvas(attemptId, canvasId);
    if (previous.kind === 'video' && unfinishedVideo(previous))
      throw new Error(
        '结果未取得或未知，不能自动重试付费生成；有 taskId 可在提交后 6 小时内查询，也可明确生成新视频。'
      );
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
    const operationKey = this.operationKey(previous.id);
    if (videoOperations.has(operationKey))
      throw new ConsoleError('该视频正在操作，请等待完成。', 409);
    videoOperations.add(operationKey);
    try {
      return await this.createVideo(
        {
          canvasId: previous.canvasId,
          prompt: previous.prompt,
          sourceImagePath: previous.sourceImagePath,
          sourceImageId: previous.sourceImageId,
          targetNodeId: previous.targetNodeId,
          sourceImagePaths: previous.sourceImagePaths,
          sourceImageIds: previous.sourceImageIds,
          referenceImagePaths: previous.referenceImagePaths,
          ...previous.parameters,
        },
        signal
      );
    } finally {
      videoOperations.delete(operationKey);
    }
  }

  cancel(attemptId: string, canvasId?: string): CanvasGenerationAttempt {
    const attempt = this.readAttemptForCanvas(attemptId, canvasId);
    const querying = attempt.kind === 'video' && videoOperations.has(this.operationKey(attempt.id));
    const completed = attempt.status === 'succeeded' || attempt.status === 'failed';
    if (completed && attempt.kind !== 'video') return attempt;
    if (attempt.kind === 'video') attempt.localWaitCanceledAt = new Date().toISOString();
    if (querying || !completed) {
      attempt.status = 'canceled';
      attempt.error = attempt.taskId
        ? '已停止本地等待；远端任务可能仍在运行，可使用原 taskId 查询。'
        : '已在本地取消，未确认远端是否已派发。';
    }
    this.touch(attempt);
    this.writeAttempt(attempt);
    if (attempt.kind === 'video') releaseVideoSubmission(this.projectRoot, attempt);
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

  history(
    offset = 0,
    limit = 30
  ): { items: CanvasGenerationAttempt[]; total: number; busy?: CanvasVideoBusy } {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new ConsoleError('历史分页参数无效；limit 必须为 1～50。');
    const attempts = this.list().filter((attempt) => attempt.kind === 'video');
    return {
      items: attempts.slice(offset, offset + limit),
      total: attempts.length,
    };
  }

  private operationKey(id: string): string {
    return path.join(fs.realpathSync(this.projectRoot), id);
  }

  private captureVideoResult(attempt: CanvasGenerationAttempt, result: unknown): void {
    const payload = resultPayload(result);
    const executionState = getRemoteProxyExecutionState(result);
    const taskId = stringField(payload.task_id)?.trim() || undefined;
    if (taskId && attempt.taskId && taskId !== attempt.taskId)
      throw new Error('上游返回的 taskId 与当前视频不一致；保留原 taskId，请人工核实。');
    if (taskId) attempt.taskId = taskId;
    attempt.credits = returnedCredits(payload.credits) ?? attempt.credits;
    if (executionState === 'unknown') {
      attempt.remoteStatus = undefined;
      attempt.executionState = 'unknown';
    } else if (payload.status === 'succeeded' || payload.status === 'failed') {
      attempt.remoteStatus = payload.status;
      attempt.executionState = executionState;
      attempt.nextQueryAt = undefined;
    } else if (
      ['pending', 'running', 'queued', 'processing', 'submitted'].includes(String(payload.status))
    ) {
      attempt.remoteStatus = 'pending';
      attempt.executionState = executionState;
      attempt.nextQueryAt ??= new Date(Date.now() + 120_000).toISOString();
    }
    if (executionState) attempt.executionState = executionState;
    attempt.status =
      attempt.executionState === 'unknown'
        ? 'unknown'
        : attempt.remoteStatus === 'failed'
          ? 'failed'
          : attempt.taskId
            ? 'pending'
            : 'unknown';
    attempt.failureStage = attempt.remoteStatus === 'failed' ? 'remote' : undefined;
    attempt.error = videoTaskError(payload);
    if (!attempt.taskId && attempt.status !== 'failed')
      attempt.error = '响应未返回 taskId，无法查询；可明确生成新视频，不自动重试。';
    this.writeVideoAttempt(attempt);
  }

  private finishVideoResult(
    attempt: CanvasGenerationAttempt,
    result: unknown,
    files: MakerCanvasFiles
  ): void {
    this.captureVideoResult(attempt, result);
    if (attempt.remoteStatus === 'succeeded') {
      if (!attempt.resultAssetPath) {
        const source = stringField(resultPayload(result).localPath);
        if (!source || !source.startsWith('assets/video/'))
          throw new Error(
            '远端视频已完成，但未取得本地素材；请查询原任务重新下载，不能重提付费生成。'
          );
        attempt.resultAssetPath = files.importGeneratedVideo(attempt.canvasId, source);
      }
      attempt.status = 'succeeded';
      attempt.error = undefined;
      attempt.failureStage = undefined;
      this.writeVideoAttempt(attempt);
    }
  }

  private failVideoAttempt(
    attempt: CanvasGenerationAttempt,
    error: unknown,
    querying: boolean
  ): void {
    if (error instanceof RemoteProxyToolResultError) this.captureVideoResult(attempt, error.result);
    const detail = executionError(error);
    if (error instanceof RemoteProxyToolCallError) attempt.executionState = error.executionState;
    if (attempt.executionState === 'unknown') attempt.remoteStatus = undefined;
    attempt.failureStage =
      attempt.remoteStatus === 'succeeded'
        ? 'download'
        : attempt.remoteStatus === 'failed'
          ? 'remote'
          : querying
            ? 'query'
            : 'submission';
    attempt.status =
      attempt.executionState === 'unknown'
        ? 'unknown'
        : attempt.remoteStatus === 'failed' ||
            (attempt.executionState === 'not_executed' && !attempt.taskId)
          ? 'failed'
          : 'unknown';
    attempt.error =
      detail.message +
      (!attempt.taskId && attempt.status === 'unknown'
        ? ' 未取得 taskId，无法查询；可明确生成新视频，不自动重试。'
        : '');
    this.writeVideoAttempt(attempt);
  }

  private writeVideoAttempt(attempt: CanvasGenerationAttempt): void {
    const current = this.readAttempt(attempt.id);
    attempt.localWaitCanceledAt = current.localWaitCanceledAt;
    if (attempt.localWaitCanceledAt && attempt.status === 'pending') attempt.status = 'canceled';
    this.touch(attempt);
    this.writeAttempt(attempt);
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
    if (value.kind === 'video' && value.executionState === 'unknown')
      return { ...value, status: 'unknown', remoteStatus: undefined };
    if (
      value.kind === 'video' &&
      !value.nextQueryAt &&
      (value.status === 'pending' || value.status === 'canceled') &&
      Number.isFinite(Date.parse(value.createdAt))
    )
      value = {
        ...value,
        nextQueryAt: new Date(Date.parse(value.createdAt) + 120_000).toISOString(),
      };
    if (
      value.kind === 'video' &&
      value.status === 'running' &&
      !videoOperations.has(this.operationKey(value.id))
    )
      return {
        ...value,
        status: 'unknown',
        error:
          value.error || '本地等待已中断；有 taskId 可在提交后 6 小时内查询，不自动重试付费生成。',
      };
    const marker = value.error?.indexOf('remote_result:') ?? -1;
    if (value.status === 'failed' && marker >= 0) {
      try {
        const result = JSON.parse(value.error!.slice(marker + 'remote_result:'.length));
        if (getRemoteProxyExecutionState(result) === 'unknown')
          return {
            ...value,
            status: 'unknown',
            executionState: 'unknown',
            remoteStatus: undefined,
          };
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
