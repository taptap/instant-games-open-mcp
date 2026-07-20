/**
 * Remote Maker proxy asset post-processing.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { extractZip } from '../cli/devKit.js';

type RemoteProxyToolResult = Awaited<ReturnType<Client['callTool']>>;
type RemoteProxyToolResultWithStructuredContent = RemoteProxyToolResult & {
  structuredContent?: unknown;
};
type RemoteProxyFetch = typeof fetch;
const IMAGE_ASSET_DIRS = ['assets/image'];
const VIDEO_ASSET_DIRS = ['assets/video'];
const AUDIO_ASSET_DIRS = ['assets/audio'];
const MODEL_ASSET_DIRS = ['assets/model'];
const THREE_D_MODEL_VIEWS = ['front', 'left', 'back', 'right'] as const;
const IMAGE_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_TASK_IMAGE_REFERENCE_MAX_BYTES = 30 * 1024 * 1024;
const VIDEO_REFERENCE_MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;
const DEBUG_FEEDBACK_PATH_HINT =
  'Use local_dir/local_log_paths/local_screenshot_paths when they are returned. If only local_candidate_* is present, it is a possible project-relative location and must not be treated as a downloaded local file.';

export const CREATE_3D_ASSET_PROXY_TOOL_NAME = 'create_3d_asset';

type DataUrlMediaKind = 'image' | 'video' | 'audio';

const DATA_URL_MIME_BY_EXTENSION: Record<DataUrlMediaKind, Record<string, string>> = {
  image: {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  },
  video: {
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
  },
  audio: {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  },
};

export class RemoteProxyToolResultError extends Error {
  readonly toolName: string;
  readonly result: RemoteProxyToolResult;

  constructor(toolName: string, result: RemoteProxyToolResult) {
    super(
      [
        `Remote proxy tool ${toolName} returned an error result.`,
        '',
        formatRemoteProxyToolResult(result),
      ].join('\n')
    );
    this.name = 'RemoteProxyToolResultError';
    this.toolName = toolName;
    this.result = result;
  }
}

export function prepareRemoteProxyToolArgs(options: {
  toolName: string;
  targetDir: string;
  args: Record<string, unknown>;
}): Record<string, unknown> {
  if (options.toolName === 'edit_image') {
    return rewriteEditImageAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === 'generate_image') {
    return normalizeImageReferenceAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === 'batch_generate_images') {
    return normalizeBatchImageReferenceAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === 'create_video_task') {
    return rewriteVideoReferenceAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === CREATE_3D_ASSET_PROXY_TOOL_NAME) {
    return rewriteCreate3dAssetArgs(options.targetDir, options.args);
  }
  return options.args;
}

export async function materializeRemoteProxyToolAssets(options: {
  toolName: string;
  targetDir: string;
  result: RemoteProxyToolResult;
  now?: Date;
  fetchImpl?: RemoteProxyFetch;
}): Promise<RemoteProxyToolResult> {
  if (isRemoteProxyToolErrorResult(options.result)) {
    throw new RemoteProxyToolResultError(options.toolName, options.result);
  }

  if (!shouldMaterializeRemoteProxyTool(options.toolName)) {
    return options.result;
  }

  const content = options.result.content;
  if (!Array.isArray(content)) {
    return options.result;
  }

  let changed = false;
  const nextContent = [];
  const structuredPayloads: Record<string, unknown>[] = [];
  for (const item of content) {
    if (!isTextContent(item)) {
      nextContent.push(item);
      continue;
    }

    const parsed = parseJsonObject(item.text);
    if (!parsed) {
      nextContent.push(item);
      continue;
    }

    const nextParsed = await materializeParsedProxyResult({
      toolName: options.toolName,
      targetDir: options.targetDir,
      payload: parsed,
      now: options.now ?? new Date(),
      fetchImpl: options.fetchImpl ?? fetch,
    });
    structuredPayloads.push(nextParsed);
    if (nextParsed === parsed) {
      nextContent.push(item);
      continue;
    }

    changed = true;
    nextContent.push({
      ...item,
      text: JSON.stringify(nextParsed, null, 2),
    });
  }

  const structuredContent =
    structuredPayloads.length === 1 ? structuredPayloads[0] : { results: structuredPayloads };
  if (structuredPayloads.length > 0) {
    return {
      ...options.result,
      ...(changed ? { content: nextContent } : {}),
      structuredContent,
    } as RemoteProxyToolResultWithStructuredContent;
  }

  return changed
    ? ({ ...options.result, content: nextContent } as RemoteProxyToolResult)
    : options.result;
}

function shouldMaterializeRemoteProxyTool(toolName: string): boolean {
  return [
    'generate_image',
    'batch_generate_images',
    'edit_image',
    'create_video_task',
    'query_video_task',
    'text_to_music',
    CREATE_3D_ASSET_PROXY_TOOL_NAME,
    'get_debug_feedbacks',
  ].includes(toolName);
}

function isTextContent(item: unknown): item is { type: 'text'; text: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as { type?: unknown }).type === 'text' &&
    typeof (item as { text?: unknown }).text === 'string'
  );
}

function isRemoteProxyToolErrorResult(result: RemoteProxyToolResult): boolean {
  return Boolean((result as { isError?: unknown }).isError);
}

export function formatRemoteProxyToolResult(result: RemoteProxyToolResult): string {
  return ['remote_result:', indent(formatUnknownForDiagnostics(result))].join('\n');
}

function formatUnknownForDiagnostics(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) || String(value);
  } catch {
    return String(value);
  }
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function materializeParsedProxyResult(options: {
  toolName: string;
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.toolName === 'generate_image') {
    return await materializeSingleImageResult(options, 'generate_image');
  }
  if (options.toolName === 'batch_generate_images') {
    return await materializeBatchImageResult(options);
  }
  if (options.toolName === 'edit_image') {
    return await materializeSingleImageResult(options, 'edit_image');
  }
  if (options.toolName === 'create_video_task' || options.toolName === 'query_video_task') {
    return await materializeVideoResult(options, options.toolName);
  }
  if (options.toolName === 'text_to_music') {
    return await materializeMusicResult(options);
  }
  if (options.toolName === CREATE_3D_ASSET_PROXY_TOOL_NAME) {
    return await materializeCreate3dAssetResult(options);
  }
  if (options.toolName === 'get_debug_feedbacks') {
    return await materializeDebugFeedbackResult(options);
  }
  return options.payload;
}

async function materializeDebugFeedbackResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.payload.success !== true) {
    return options.payload;
  }

  const feedbacks = getDebugFeedbackItems(options.payload);
  const remoteSaveDir = getDebugFeedbackSaveDir(options.payload);
  if (feedbacks.length === 0 && !remoteSaveDir) {
    return options.payload;
  }

  const nextFeedbacks = [];
  for (const feedback of feedbacks) {
    const remoteDir = stringField(feedback.dir);
    const localCandidateDir = remoteDir
      ? resolveDebugFeedbackCandidatePath(options.targetDir, remoteDir)
      : undefined;
    const materialized = await materializeDebugFeedbackArtifacts({
      targetDir: options.targetDir,
      feedback,
      fetchImpl: options.fetchImpl,
    });
    nextFeedbacks.push({
      ...feedback,
      ...(localCandidateDir ? { local_candidate_dir: localCandidateDir } : {}),
      ...materialized,
    });
  }
  const localCandidateSaveDir = remoteSaveDir
    ? resolveDebugFeedbackCandidatePath(options.targetDir, remoteSaveDir)
    : feedbacks.some(hasDebugFeedbackArtifactUrls)
      ? path.join(options.targetDir, 'logs', 'feed_back')
      : undefined;
  const filesVerifiedLocally = nextFeedbacks.some(
    (feedback) => numberField(feedback.artifacts_downloaded) > 0
  );

  return {
    ...replaceDebugFeedbackItems(options.payload, nextFeedbacks),
    local_path_hint: {
      remote_save_dir: remoteSaveDir,
      local_candidate_save_dir: localCandidateSaveDir,
      local_project_dir: options.targetDir,
      files_verified_locally: filesVerifiedLocally,
      note: DEBUG_FEEDBACK_PATH_HINT,
    },
  };
}

async function materializeDebugFeedbackArtifacts(options: {
  targetDir: string;
  feedback: Record<string, unknown>;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  const feedbackId =
    stringField(options.feedback.feedback_id) ??
    (options.feedback.feedback_id != null ? String(options.feedback.feedback_id) : '');
  if (!feedbackId) {
    return {};
  }

  const logUrls = stringArrayField(options.feedback.log_file_urls);
  const screenshotUrls = stringArrayField(options.feedback.screenshots);
  const extraUrls = stringArrayField(options.feedback.download_urls).filter(
    (url) => !logUrls.includes(url) && !screenshotUrls.includes(url)
  );
  if (logUrls.length === 0 && screenshotUrls.length === 0 && extraUrls.length === 0) {
    return {};
  }

  const localDir = path.join(options.targetDir, 'logs', 'feed_back', `feedback_${feedbackId}`);
  const localLogPaths = [];
  const localScreenshotPaths = [];
  const localDownloadPaths = [];
  const errors = [];

  for (const [index, url] of logUrls.entries()) {
    const result = await downloadDebugFeedbackArtifact({
      url,
      directory: path.join(localDir, 'logs'),
      fallbackName: `log_${index + 1}.log`,
      fetchImpl: options.fetchImpl,
    });
    if (result.success) {
      localLogPaths.push(result.path);
    } else {
      errors.push(result.error);
    }
  }

  for (const [index, url] of screenshotUrls.entries()) {
    const result = await downloadDebugFeedbackArtifact({
      url,
      directory: path.join(localDir, 'screenshots'),
      fallbackName: `screenshot_${index + 1}.png`,
      fetchImpl: options.fetchImpl,
    });
    if (result.success) {
      localScreenshotPaths.push(result.path);
    } else {
      errors.push(result.error);
    }
  }

  for (const [index, url] of extraUrls.entries()) {
    const result = await downloadDebugFeedbackArtifact({
      url,
      directory: path.join(localDir, 'downloads'),
      fallbackName: `artifact_${index + 1}`,
      fetchImpl: options.fetchImpl,
    });
    if (result.success) {
      localDownloadPaths.push(result.path);
    } else {
      errors.push(result.error);
    }
  }

  return {
    local_dir: localDir,
    local_log_paths: localLogPaths,
    local_screenshot_paths: localScreenshotPaths,
    local_download_paths: localDownloadPaths,
    artifacts_downloaded:
      localLogPaths.length + localScreenshotPaths.length + localDownloadPaths.length,
    artifact_download_errors: errors,
  };
}

async function downloadDebugFeedbackArtifact(options: {
  url: string;
  directory: string;
  fallbackName: string;
  fetchImpl: RemoteProxyFetch;
}): Promise<{ success: true; path: string } | { success: false; error: string }> {
  try {
    const response = await options.fetchImpl(options.url);
    if (!response.ok) {
      return {
        success: false,
        error: `${options.url}: HTTP ${response.status}`,
      };
    }
    fs.mkdirSync(options.directory, { recursive: true });
    const filePath = allocateDebugFeedbackArtifactPath(
      options.directory,
      options.url,
      options.fallbackName
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, bytes);
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: `${options.url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function allocateDebugFeedbackArtifactPath(
  directory: string,
  url: string,
  fallbackName: string
): string {
  const rawName = fileNameFromUrl(url) || fallbackName;
  const rawExtension = path.extname(rawName);
  const finalExtension =
    rawExtension && rawExtension !== '.' ? rawExtension.replace(/[^A-Za-z0-9.]/g, '_') : '';
  const rawStem = finalExtension ? rawName.slice(0, -rawExtension.length) : rawName;
  const stem = sanitizeAssetBaseName(rawStem);

  for (let index = 1; index <= 9999; index += 1) {
    const suffix = index === 1 ? '' : `_${index}`;
    const candidate = path.join(directory, `${stem}${suffix}${finalExtension}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to allocate debug feedback artifact path for ${stem}${finalExtension}`);
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(path.basename(pathname));
    return name && name !== '/' ? name : undefined;
  } catch {
    return undefined;
  }
}

function hasDebugFeedbackArtifactUrls(feedback: Record<string, unknown>): boolean {
  return (
    stringArrayField(feedback.log_file_urls).length > 0 ||
    stringArrayField(feedback.screenshots).length > 0 ||
    stringArrayField(feedback.download_urls).length > 0
  );
}

function getDebugFeedbackSaveDir(payload: Record<string, unknown>): string | undefined {
  const summary = payload.summary;
  return (
    stringField(payload.save_dir) || (isRecord(summary) ? stringField(summary.save_dir) : undefined)
  );
}

function resolveDebugFeedbackCandidatePath(
  targetDir: string,
  remotePath: string
): string | undefined {
  if (path.isAbsolute(remotePath)) {
    return undefined;
  }
  const trimmedRemotePath = remotePath.replace(/[\\/]+$/, '');
  return path.normalize(path.join(targetDir, trimmedRemotePath || '.'));
}

function replaceDebugFeedbackItems(
  payload: Record<string, unknown>,
  nextFeedbacks: Record<string, unknown>[]
): Record<string, unknown> {
  const summary = payload.summary;
  if (isRecord(summary) && Array.isArray(summary.feedbacks)) {
    return {
      ...payload,
      summary: {
        ...summary,
        feedbacks: nextFeedbacks,
      },
    };
  }
  if (Array.isArray(payload.feedbacks)) {
    return {
      ...payload,
      feedbacks: nextFeedbacks,
    };
  }
  if (Array.isArray(payload.list)) {
    return {
      ...payload,
      list: nextFeedbacks,
    };
  }
  return payload;
}

function getDebugFeedbackItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  const summary = payload.summary;
  if (isRecord(summary) && Array.isArray(summary.feedbacks)) {
    return summary.feedbacks.filter(isRecord);
  }
  if (Array.isArray(payload.feedbacks)) {
    return payload.feedbacks.filter(isRecord);
  }
  if (Array.isArray(payload.list)) {
    return payload.list.filter(isRecord);
  }
  return [];
}

async function materializeSingleImageResult(
  options: {
    targetDir: string;
    payload: Record<string, unknown>;
    now: Date;
    fetchImpl: RemoteProxyFetch;
  },
  toolName: 'generate_image' | 'edit_image'
): Promise<Record<string, unknown>> {
  if (options.payload.success !== true) {
    return options.payload;
  }

  const materialized = await materializeAsset({
    targetDir: options.targetDir,
    url: stringField(options.payload.previewUrl),
    baseName: stringField(options.payload.name),
    relativeDir: 'assets/image',
    extension: 'png',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  return materialized
    ? persistMaterializedAsset({
        targetDir: options.targetDir,
        toolName,
        payload: options.payload,
        materialized,
        cdnUrl: stringField(options.payload.previewUrl),
        now: options.now,
      })
    : options.payload;
}

async function materializeBatchImageResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (!Array.isArray(options.payload.results)) {
    return options.payload;
  }

  const results = [];
  for (const item of options.payload.results) {
    if (!isRecord(item) || item.success !== true) {
      results.push(item);
      continue;
    }
    const materialized = await materializeAsset({
      targetDir: options.targetDir,
      url: stringField(item.previewUrl),
      baseName: stringField(item.name),
      relativeDir: 'assets/image',
      extension: 'png',
      now: options.now,
      fetchImpl: options.fetchImpl,
    });
    results.push(
      materialized
        ? persistMaterializedAsset({
            targetDir: options.targetDir,
            toolName: 'batch_generate_images',
            payload: item,
            materialized,
            cdnUrl: stringField(item.previewUrl),
            now: options.now,
          })
        : item
    );
  }

  return { ...options.payload, results };
}

async function materializeVideoResult(
  options: {
    targetDir: string;
    payload: Record<string, unknown>;
    now: Date;
    fetchImpl: RemoteProxyFetch;
  },
  toolName: 'create_video_task' | 'query_video_task'
): Promise<Record<string, unknown>> {
  if (options.payload.status !== 'succeeded') {
    return options.payload;
  }

  const taskId = stringField(options.payload.task_id);
  const cdnUrl = stringField(options.payload.cdn_url);
  const existing = findExistingMaterializedVideo(options.targetDir, {
    taskId,
    cdnUrl,
  });
  if (existing) {
    return {
      ...options.payload,
      ...existing,
      download: { success: true },
    };
  }

  const materialized = await materializeAsset({
    targetDir: options.targetDir,
    url: cdnUrl,
    baseName: taskId,
    relativeDir: 'assets/video',
    extension: 'mp4',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  return materialized
    ? persistMaterializedAsset({
        targetDir: options.targetDir,
        toolName,
        payload: options.payload,
        materialized,
        cdnUrl: stringField(options.payload.cdn_url),
        now: options.now,
        extraRegistryFields: {
          taskId,
        },
      })
    : options.payload;
}

function findExistingMaterializedVideo(
  targetDir: string,
  options: {
    taskId?: string;
    cdnUrl?: string;
  }
): { localPath: string; absolutePath: string } | undefined {
  if (!options.taskId || !options.cdnUrl) {
    return undefined;
  }

  const registry = readGeneratedAssetRegistry(targetDir);
  for (const record of Object.values(registry)) {
    const localPath = stringField(record.localPath);
    const recordCdnUrl = stringField(record.cdnUrl) || stringField(record.previewUrl);
    if (
      stringField(record.taskId) !== options.taskId ||
      recordCdnUrl !== options.cdnUrl ||
      !localPath.startsWith('assets/video/')
    ) {
      continue;
    }

    const absolutePath = resolveExistingMaterializedAssetPath(targetDir, record, localPath);
    if (absolutePath) {
      return { localPath, absolutePath };
    }
  }

  return undefined;
}

function resolveExistingMaterializedAssetPath(
  targetDir: string,
  record: GeneratedAssetRegistry[string],
  localPath: string
): string | undefined {
  const candidates = [];
  const absolutePath = stringField(record.absolutePath);
  if (absolutePath && path.isAbsolute(absolutePath)) {
    candidates.push(absolutePath);
  }
  candidates.push(path.join(targetDir, ...localPath.split('/')));

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Keep checking the local registry path when an older absolute path is stale.
    }
  }
  return undefined;
}

async function materializeMusicResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.payload.success !== true) {
    return options.payload;
  }

  if (!isRecord(options.payload.music)) {
    return options.payload;
  }

  const music = options.payload.music;
  const materialized = await materializeAsset({
    targetDir: options.targetDir,
    url: stringField(music.audioUrl),
    baseName: stringField(music.title) || stringField(options.payload.taskId),
    relativeDir: 'assets/audio',
    extension: extensionFromUrl(stringField(music.audioUrl)) || 'mp3',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  return materialized
    ? {
        ...options.payload,
        music: persistMaterializedAsset({
          targetDir: options.targetDir,
          toolName: 'text_to_music',
          payload: music,
          materialized,
          cdnUrl: stringField(music.audioUrl),
          now: options.now,
          extraRegistryFields: {
            taskId: stringField(options.payload.taskId),
          },
        }),
      }
    : options.payload;
}

async function materializeCreate3dAssetResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  const payload = isRecord(options.payload.preview)
    ? await materializeCreate3dAssetPreviewResult(options)
    : options.payload;
  // The remote contract emits one primary model delivery instruction for each asset query.
  const modelFile = Array.isArray(payload.model_files)
    ? payload.model_files.find(isRecord)
    : undefined;
  if (!modelFile) {
    return payload;
  }

  const assetId =
    stringField(modelFile.assetId) ||
    stringField(payload.asset_id) ||
    stringField(payload.task_id) ||
    '3d_asset';
  const remoteUrl = stringField(modelFile.modelUrl);
  const format = stringField(modelFile.format)?.toLowerCase();
  const materialization = stringField(modelFile.materialization);
  if (!remoteUrl || !format || !materialization) {
    return {
      ...payload,
      local_delivery: create3dAssetDeliveryFailure(
        assetId,
        remoteUrl,
        format,
        materialization,
        'Invalid create_3d_asset model_files entry.'
      ),
    };
  }

  const existing = findExistingCreate3dAssetDelivery({
    targetDir: options.targetDir,
    assetId,
    remoteUrl,
  });
  if (existing) {
    return {
      ...payload,
      local_delivery: create3dAssetLocalDelivery({
        assetId,
        remoteUrl,
        format,
        materialization,
        materialized: existing,
        reused: true,
      }),
    };
  }

  const materialized = await materializeCreate3dAssetModelFile({
    ...options,
    assetId,
    modelFile,
    remoteUrl,
    format,
    materialization,
  });

  if ('localPath' in materialized) {
    upsertGeneratedAssetRecord(options.targetDir, materialized.localPath, {
      tool: CREATE_3D_ASSET_PROXY_TOOL_NAME,
      name: assetId,
      assetKind: 'model',
      assetId,
      taskId: stringField(payload.task_id),
      cdnUrl: remoteUrl,
      previewUrl: remoteUrl,
      localPath: materialized.localPath,
      absolutePath: materialized.absolutePath,
      createdAt: options.now.toISOString(),
      modelCdnUrl: remoteUrl,
    });
  }

  return {
    ...payload,
    local_delivery: create3dAssetLocalDelivery({
      assetId,
      remoteUrl,
      format,
      materialization,
      materialized,
      reused: false,
    }),
  };
}

async function materializeCreate3dAssetPreviewResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  const preview = options.payload.preview as Record<string, unknown>;
  const assetId = stringField(options.payload.asset_id) || '3d_asset';
  const previewAssets: Record<string, unknown> = {};

  for (const view of THREE_D_MODEL_VIEWS) {
    const url = stringField(preview[view]);
    const materialized = await materializeAsset({
      targetDir: options.targetDir,
      url,
      baseName: `${assetId}_${view}`,
      relativeDir: IMAGE_ASSET_DIRS[0],
      extension: extensionFromUrl(url) || 'png',
      now: options.now,
      fetchImpl: options.fetchImpl,
    });
    if (!materialized) continue;

    previewAssets[view] = { ...materialized, cdnUrl: url };
    if ('localPath' in materialized && url) {
      upsertGeneratedAssetRecord(options.targetDir, materialized.localPath, {
        tool: CREATE_3D_ASSET_PROXY_TOOL_NAME,
        name: `${assetId}_${view}`,
        assetId,
        cdnUrl: url,
        previewUrl: url,
        localPath: materialized.localPath,
        absolutePath: materialized.absolutePath,
        createdAt: options.now.toISOString(),
        view,
      });
    }
  }

  return Object.keys(previewAssets).length > 0
    ? { ...options.payload, preview_assets: previewAssets }
    : options.payload;
}

async function materializeCreate3dAssetModelFile(options: {
  targetDir: string;
  modelFile: Record<string, unknown>;
  assetId: string;
  remoteUrl: string;
  format: string;
  materialization: string;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<MaterializedAssetResult> {
  const targetDirectory = stringField(options.modelFile.targetDirectory);
  const suggestedFileName = stringField(options.modelFile.suggestedFileName);
  const targetAbsolutePath = targetDirectory
    ? resolveProjectRelativePath(options.targetDir, targetDirectory)
    : undefined;
  const modelAssetRoot = path.resolve(options.targetDir, MODEL_ASSET_DIRS[0]);
  if (
    !targetDirectory ||
    !targetAbsolutePath ||
    !isKnownAssetPath(targetDirectory, MODEL_ASSET_DIRS) ||
    !isPathWithinDirectory(modelAssetRoot, targetAbsolutePath) ||
    !suggestedFileName ||
    path.posix.basename(suggestedFileName) !== suggestedFileName ||
    suggestedFileName.includes('\\')
  ) {
    return {
      download: { success: false, error: 'Invalid create_3d_asset local target path.' },
    };
  }

  if (options.materialization === 'copy') {
    return await materializeAssetAtPath({
      url: options.remoteUrl,
      relativePath: path.posix.join(targetDirectory, suggestedFileName),
      targetDir: options.targetDir,
      fetchImpl: options.fetchImpl,
    });
  }

  if (options.materialization !== 'extract') {
    return {
      download: {
        success: false,
        error: `Unsupported create_3d_asset materialization: ${options.materialization}`,
      },
    };
  }

  const archive = await materializeAsset({
    targetDir: options.targetDir,
    url: options.remoteUrl,
    baseName: options.assetId,
    relativeDir: '.maker/assets/downloads',
    extension: path.extname(suggestedFileName).replace(/^\./, '') || 'zip',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  if (!archive || !('localPath' in archive)) {
    return (
      archive ?? {
        download: { success: false, error: 'Missing create_3d_asset model archive.' },
      }
    );
  }

  try {
    fs.mkdirSync(targetAbsolutePath, { recursive: true });
    extractZip(archive.absolutePath, targetAbsolutePath, '3D model asset');
    const entrypointExtension =
      stringField(options.modelFile.entrypointExtension)?.toLowerCase() || '.mdl';
    const entrypoint = findFileByExtension(targetAbsolutePath, entrypointExtension);
    if (!entrypoint) {
      throw new Error(`3D model archive contains no ${entrypointExtension} entrypoint.`);
    }
    const localPath = path.relative(options.targetDir, entrypoint).split(path.sep).join('/');
    return {
      localPath,
      absolutePath: entrypoint,
      download: archive.download,
    };
  } catch (error) {
    return {
      download: {
        success: false,
        error: `3D model asset extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  } finally {
    fs.rmSync(archive.absolutePath, { force: true });
  }
}

async function materializeAssetAtPath(options: {
  targetDir: string;
  relativePath: string;
  url: string;
  fetchImpl: RemoteProxyFetch;
}): Promise<MaterializedAssetResult> {
  const absolutePath = resolveProjectRelativePath(options.targetDir, options.relativePath);
  if (!absolutePath) {
    return { download: { success: false, error: 'Asset target path escapes the project.' } };
  }
  try {
    const response = await options.fetchImpl(options.url);
    if (!response.ok) {
      return {
        download: { success: false, error: `Asset download failed: HTTP ${response.status}` },
      };
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, Buffer.from(await response.arrayBuffer()));
    return { localPath: options.relativePath, absolutePath, download: { success: true } };
  } catch (error) {
    return {
      download: {
        success: false,
        error: `Asset download failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

function findFileByExtension(directory: string, extension: string): string | undefined {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileByExtension(absolutePath, extension);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      return absolutePath;
    }
  }
  return undefined;
}

function findExistingCreate3dAssetDelivery(options: {
  targetDir: string;
  assetId: string;
  remoteUrl: string;
}): Extract<MaterializedAssetResult, { localPath: string }> | undefined {
  const registry = readGeneratedAssetRegistry(options.targetDir);
  const match = Object.entries(registry).find(([, record]) => {
    return (
      record.tool === CREATE_3D_ASSET_PROXY_TOOL_NAME &&
      record.assetId === options.assetId &&
      record.cdnUrl === options.remoteUrl &&
      typeof record.absolutePath === 'string' &&
      fs.existsSync(record.absolutePath)
    );
  });
  if (!match) {
    return undefined;
  }
  const [localPath, record] = match;
  return {
    localPath,
    absolutePath: record.absolutePath as string,
    download: { success: true },
  };
}

function create3dAssetLocalDelivery(options: {
  assetId: string;
  remoteUrl: string;
  format: string;
  materialization: string;
  materialized: MaterializedAssetResult;
  reused: boolean;
}): Record<string, unknown> {
  if (!('localPath' in options.materialized)) {
    return {
      status: 'failed',
      asset_id: options.assetId,
      model: {
        remote_url: options.remoteUrl,
        format: options.format,
        materialization: options.materialization,
        download: options.materialized.download,
      },
    };
  }
  return {
    status: 'success',
    asset_id: options.assetId,
    model: {
      remote_url: options.remoteUrl,
      local_path: options.materialized.localPath,
      absolute_path: options.materialized.absolutePath,
      format: options.format,
      materialization: options.materialization,
      reused: options.reused,
      download: options.materialized.download,
    },
  };
}

function create3dAssetDeliveryFailure(
  assetId: string,
  remoteUrl: string | undefined,
  format: string | undefined,
  materialization: string | undefined,
  error: string
): Record<string, unknown> {
  return {
    status: 'failed',
    asset_id: assetId,
    model: {
      remote_url: remoteUrl,
      format,
      materialization,
      download: { success: false, error },
    },
  };
}

function persistMaterializedAsset(options: {
  targetDir: string;
  toolName: string;
  payload: Record<string, unknown>;
  materialized: MaterializedAssetResult;
  cdnUrl?: string;
  now: Date;
  extraRegistryFields?: Record<string, unknown>;
}): Record<string, unknown> {
  const nextPayload = { ...options.payload, ...options.materialized };
  if (!('localPath' in options.materialized) || !options.cdnUrl) {
    return nextPayload;
  }

  upsertGeneratedAssetRecord(options.targetDir, options.materialized.localPath, {
    tool: options.toolName,
    name: stringField(options.payload.name) || stringField(options.payload.title),
    prompt: stringField(options.payload.prompt),
    cdnUrl: options.cdnUrl,
    previewUrl: options.cdnUrl,
    localPath: options.materialized.localPath,
    absolutePath: options.materialized.absolutePath,
    createdAt: options.now.toISOString(),
    ...options.extraRegistryFields,
  });

  return nextPayload;
}

async function materializeAsset(options: {
  targetDir: string;
  url?: string;
  baseName?: string;
  relativeDir: string;
  extension: string;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<MaterializedAssetResult | undefined> {
  if (!options.url || !options.baseName) {
    return undefined;
  }

  const { absolutePath, relativePath } = createUniqueAssetPath({
    targetDir: options.targetDir,
    relativeDir: options.relativeDir,
    baseName: options.baseName,
    extension: options.extension,
    now: options.now,
  });

  try {
    const response = await options.fetchImpl(options.url);
    if (!response.ok) {
      return {
        download: {
          success: false,
          error: `Asset download failed: HTTP ${response.status}`,
        },
      };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);
    return { localPath: relativePath, absolutePath, download: { success: true } };
  } catch (error) {
    return {
      download: {
        success: false,
        error: `Asset download failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

function createUniqueAssetPath(options: {
  targetDir: string;
  relativeDir: string;
  baseName: string;
  extension: string;
  now: Date;
}): { relativePath: string; absolutePath: string } {
  const stem = `${sanitizeAssetBaseName(options.baseName)}_${formatAssetTimestamp(options.now)}`;

  for (let index = 1; index <= 9999; index += 1) {
    const relativePath = path.posix.join(
      options.relativeDir,
      `${stem}${index === 1 ? '' : `_${index}`}.${options.extension}`
    );
    const absolutePath = path.join(options.targetDir, ...relativePath.split('/'));
    if (!fs.existsSync(absolutePath)) {
      return { relativePath, absolutePath };
    }
  }

  throw new Error(`Unable to allocate unique asset path for ${stem}.${options.extension}`);
}

type MaterializedAssetResult =
  | {
      localPath: string;
      absolutePath: string;
      download: { success: true };
    }
  | {
      download: { success: false; error: string };
    };

type GeneratedAssetRegistry = Record<
  string,
  {
    tool?: string;
    name?: string;
    assetKind?: 'model';
    assetId?: string;
    prompt?: string;
    cdnUrl?: string;
    previewUrl?: string;
    localPath?: string;
    absolutePath?: string;
    createdAt?: string;
    taskId?: string;
    view?: string;
    modelCdnUrl?: string;
  }
>;

function rewriteEditImageAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    image: rewriteGeneratedAssetReference(targetDir, args.image, registry, {
      assetDirs: IMAGE_ASSET_DIRS,
      mediaKind: 'image',
      maxBytes: IMAGE_REFERENCE_MAX_BYTES,
    }),
    reference_images: Array.isArray(args.reference_images)
      ? args.reference_images.map((item) =>
          rewriteGeneratedAssetReference(targetDir, item, registry, {
            assetDirs: IMAGE_ASSET_DIRS,
            mediaKind: 'image',
            maxBytes: IMAGE_REFERENCE_MAX_BYTES,
          })
        )
      : args.reference_images,
  };
}

function normalizeImageReferenceAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    image: rewriteGeneratedAssetReference(targetDir, args.image, registry, {
      assetDirs: IMAGE_ASSET_DIRS,
      mediaKind: 'image',
      maxBytes: IMAGE_REFERENCE_MAX_BYTES,
    }),
    reference_image: rewriteGeneratedAssetReference(targetDir, args.reference_image, registry, {
      assetDirs: IMAGE_ASSET_DIRS,
      mediaKind: 'image',
      maxBytes: IMAGE_REFERENCE_MAX_BYTES,
    }),
    reference_images: Array.isArray(args.reference_images)
      ? args.reference_images.map((item) =>
          rewriteGeneratedAssetReference(targetDir, item, registry, {
            assetDirs: IMAGE_ASSET_DIRS,
            mediaKind: 'image',
            maxBytes: IMAGE_REFERENCE_MAX_BYTES,
          })
        )
      : args.reference_images,
  };
}

function normalizeBatchImageReferenceAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(args.images)) {
    return args;
  }
  return {
    ...args,
    images: args.images.map((item) =>
      isRecord(item) ? normalizeImageReferenceAssetArgs(targetDir, item) : item
    ),
  };
}

function rewriteVideoReferenceAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    images: rewriteUrlObjectArray(targetDir, args.images, registry, {
      assetDirs: IMAGE_ASSET_DIRS,
      mediaKind: 'image',
      maxBytes: VIDEO_TASK_IMAGE_REFERENCE_MAX_BYTES,
    }),
    videos: rewriteUrlObjectArray(targetDir, args.videos, registry, {
      assetDirs: VIDEO_ASSET_DIRS,
      mediaKind: 'video',
      maxBytes: VIDEO_REFERENCE_MAX_BYTES,
    }),
    audios: rewriteUrlObjectArray(targetDir, args.audios, registry, {
      assetDirs: AUDIO_ASSET_DIRS,
      mediaKind: 'audio',
      maxBytes: AUDIO_REFERENCE_MAX_BYTES,
    }),
  };
}

function rewriteCreate3dAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (!isRecord(args.payload) || !isRecord(args.payload.images)) {
    return args;
  }

  const registry = readGeneratedAssetRegistry(targetDir);
  const imageOptions = {
    assetDirs: IMAGE_ASSET_DIRS,
    mediaKind: 'image' as const,
    maxBytes: IMAGE_REFERENCE_MAX_BYTES,
  };
  const images = args.payload.images;
  return {
    ...args,
    payload: {
      ...args.payload,
      images: {
        ...images,
        front: rewriteGeneratedAssetReference(targetDir, images.front, registry, imageOptions),
        left: rewriteGeneratedAssetReference(targetDir, images.left, registry, imageOptions),
        back: rewriteGeneratedAssetReference(targetDir, images.back, registry, imageOptions),
        right: rewriteGeneratedAssetReference(targetDir, images.right, registry, imageOptions),
      },
    },
  };
}

function rewriteUrlObjectArray(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  options: {
    assetDirs: string[];
    mediaKind: DataUrlMediaKind;
    maxBytes: number;
  }
): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) =>
    isRecord(item)
      ? {
          ...item,
          url: rewriteGeneratedAssetReference(targetDir, item.url, registry, options),
        }
      : item
  );
}

function rewriteGeneratedAssetReference(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  options: {
    assetDirs: string[];
    mediaKind: DataUrlMediaKind;
    maxBytes: number;
  }
): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return value;
  }

  const localPath = resolveLocalAssetReference(targetDir, value, registry, options.assetDirs);
  const cdnUrl = localPath
    ? registry[localPath]?.cdnUrl || registry[localPath]?.previewUrl
    : undefined;
  if (cdnUrl) {
    return cdnUrl;
  }

  const dataUrl = localAssetReferenceToDataUrl({
    targetDir,
    value,
    localPath,
    mediaKind: options.mediaKind,
    maxBytes: options.maxBytes,
  });
  return dataUrl || value;
}

function resolveLocalAssetReference(
  targetDir: string,
  value: string,
  registry: GeneratedAssetRegistry,
  assetDirs: string[]
): string | undefined {
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return undefined;
  }

  const key = normalizeAssetRegistryKey(targetDir, value);
  if (key && registry[key]) {
    return key;
  }
  if (key && isKnownAssetPath(key, assetDirs)) {
    return key;
  }
  if (!isBareAssetName(value)) {
    return undefined;
  }

  return (
    findRegistryAssetByName(value, registry, assetDirs) ||
    findLocalAssetByName(targetDir, value, assetDirs)
  );
}

function findRegistryAssetByName(
  value: string,
  registry: GeneratedAssetRegistry,
  assetDirs: string[]
): string | undefined {
  const matches = Object.entries(registry).filter(([localPath, record]) => {
    if (!isKnownAssetPath(localPath, assetDirs)) {
      return false;
    }
    const basename = path.posix.basename(localPath);
    const stem = basename.replace(/\.[^.]+$/, '');
    return basename === value || stem === value || record.name === value || record.taskId === value;
  });
  matches.sort(([, left], [, right]) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    return rightTime - leftTime;
  });
  return matches[0]?.[0];
}

function findLocalAssetByName(
  targetDir: string,
  value: string,
  assetDirs: string[]
): string | undefined {
  const hasExtension = Boolean(path.extname(value));
  const candidates: Array<{ localPath: string; mtimeMs: number }> = [];

  for (const assetDir of assetDirs) {
    const absoluteDir = path.join(targetDir, ...assetDir.split('/'));
    let entries: string[];
    try {
      entries = fs.readdirSync(absoluteDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const stem = entry.replace(/\.[^.]+$/, '');
      if (hasExtension ? entry !== value : stem !== value && !stem.startsWith(`${value}_`)) {
        continue;
      }
      const absolutePath = path.join(absoluteDir, entry);
      try {
        candidates.push({
          localPath: path.posix.join(assetDir, entry),
          mtimeMs: fs.statSync(absolutePath).mtimeMs,
        });
      } catch {
        // Ignore files that disappear during lookup.
      }
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.localPath;
}

function isKnownAssetPath(relativePath: string, assetDirs: string[]): boolean {
  if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    return false;
  }
  return assetDirs.some(
    (assetDir) => relativePath === assetDir || relativePath.startsWith(`${assetDir}/`)
  );
}

function isBareAssetName(value: string): boolean {
  return !value.includes('/') && !value.includes('\\');
}

function localAssetReferenceToDataUrl(options: {
  targetDir: string;
  value: string;
  localPath?: string;
  mediaKind: DataUrlMediaKind;
  maxBytes: number;
}): string | undefined {
  const absolutePath = resolveLocalAssetAbsolutePath(options.targetDir, {
    value: options.value,
    localPath: options.localPath,
  });
  if (!absolutePath) {
    return undefined;
  }

  const mime = dataUrlMimeForPath(absolutePath, options.mediaKind);
  if (!mime) {
    return undefined;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return undefined;
  }
  if (!stat.isFile() || stat.size > options.maxBytes) {
    return undefined;
  }

  const bytes = fs.readFileSync(absolutePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function resolveLocalAssetAbsolutePath(
  targetDir: string,
  options: {
    value: string;
    localPath?: string;
  }
): string | undefined {
  const candidates = [];
  if (options.localPath) {
    const localPath = resolveProjectRelativePath(targetDir, options.localPath);
    if (localPath) {
      candidates.push(localPath);
    }
  }
  if (path.isAbsolute(options.value)) {
    candidates.push(options.value);
  } else {
    const localPath = resolveProjectRelativePath(targetDir, options.value);
    if (localPath) {
      candidates.push(localPath);
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolveProjectRelativePath(targetDir: string, value: string): string | undefined {
  const root = path.resolve(targetDir);
  const absolutePath = path.resolve(root, value);
  const relativePath = path.relative(root, absolutePath);
  const escapesRoot =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);
  if (!escapesRoot) {
    return absolutePath;
  }
  return undefined;
}

function isPathWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(candidatePath));
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function dataUrlMimeForPath(filePath: string, mediaKind: DataUrlMediaKind): string | undefined {
  return DATA_URL_MIME_BY_EXTENSION[mediaKind][path.extname(filePath).toLowerCase()];
}

function upsertGeneratedAssetRecord(
  targetDir: string,
  localPath: string,
  record: GeneratedAssetRegistry[string]
): void {
  const registry = readGeneratedAssetRegistry(targetDir);
  registry[localPath] = record;
  const registryPath = getGeneratedAssetRegistryPath(targetDir);
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

function readGeneratedAssetRegistry(targetDir: string): GeneratedAssetRegistry {
  const registryPath = getGeneratedAssetRegistryPath(targetDir);
  if (!fs.existsSync(registryPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return isRecord(parsed) ? (parsed as GeneratedAssetRegistry) : {};
  } catch {
    return {};
  }
}

function getGeneratedAssetRegistryPath(targetDir: string): string {
  return path.join(targetDir, '.maker', 'assets', 'generated-assets.json');
}

function normalizeAssetRegistryKey(targetDir: string, value: string): string | undefined {
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return undefined;
  }
  const relative = path.isAbsolute(value) ? path.relative(targetDir, value) : value;
  return relative.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => Boolean(stringField(item)))
    : [];
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sanitizeAssetBaseName(value: string): string {
  const sanitized = replaceControlCharacters(value)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/[. ]+$/g, '');
  const safeName = sanitized || 'asset';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safeName) ? `_${safeName}` : safeName;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
}

function formatAssetTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function extensionFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).replace(/^\./, '').toLowerCase();
    return extension || undefined;
  } catch {
    return undefined;
  }
}
