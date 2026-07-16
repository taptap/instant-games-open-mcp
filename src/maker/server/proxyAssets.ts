/**
 * Remote Maker proxy asset post-processing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
const AUDIO_DIALOGUE_REFERENCE_MAX_BYTES = 20 * 1024 * 1024;
const AUDIO_CONFIRM_MAX_BYTES = 1 * 1024 * 1024;
const DEBUG_FEEDBACK_PATH_HINT =
  'Use local_dir/local_log_paths/local_screenshot_paths when they are returned. If only local_candidate_* is present, it is a possible project-relative location and must not be treated as a downloaded local file.';

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
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
  },
};

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
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
  if (options.toolName === 'create_3d_model_task') {
    return rewrite3dModelAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === 'text_to_dialogue') {
    return rewriteTextToDialogueArgs(options.targetDir, options.args);
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
    'text_to_sound_effect',
    'batch_sound_effects',
    'text_to_dialogue',
    'audition_voices_for_character',
    'confirm_character_voice',
    'create_3d_model_task',
    'query_3d_model_task',
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
  if (
    options.toolName === 'text_to_sound_effect' ||
    options.toolName === 'batch_sound_effects' ||
    options.toolName === 'text_to_dialogue'
  ) {
    return await materializeAudioFilesResult(options, options.toolName);
  }
  if (options.toolName === 'confirm_character_voice') {
    return await materializeVoiceConfirmationResult(options);
  }
  if (options.toolName === 'create_3d_model_task' || options.toolName === 'query_3d_model_task') {
    return await materialize3dModelResult(options, options.toolName);
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

async function materializeAudioFilesResult(
  options: {
    targetDir: string;
    payload: Record<string, unknown>;
    now: Date;
    fetchImpl: RemoteProxyFetch;
  },
  toolName: 'text_to_sound_effect' | 'batch_sound_effects' | 'text_to_dialogue'
): Promise<Record<string, unknown>> {
  if (!Array.isArray(options.payload.audio_files)) return options.payload;

  const audioFiles = [];
  for (const rawItem of options.payload.audio_files) {
    if (!isRecord(rawItem)) {
      audioFiles.push(rawItem);
      continue;
    }
    const item = { ...rawItem };
    const audioUrl = stringField(item.audioUrl);
    const kind = stringField(item.kind);
    const expectedDirectory = kind === 'dialogue' ? 'assets/audio/voice' : 'assets/audio/sfx';
    const targetDirectory = stringField(item.targetDirectory);
    const suggestedFileName = stringField(item.suggestedFileName);
    const validationError = validateAudioAssetContract({
      audioUrl,
      kind,
      targetDirectory,
      expectedDirectory,
      suggestedFileName,
      format: stringField(item.format),
      mimeType: stringField(item.mimeType),
    });
    if (validationError) {
      audioFiles.push({
        ...item,
        ...(audioUrl ? { audioUrl } : {}),
        download: { success: false, error: validationError },
      });
      continue;
    }

    const extension = audioExtensionForItem(item, suggestedFileName!);
    const materialized = await materializeAudioAsset({
      targetDir: options.targetDir,
      targetDirectory: expectedDirectory,
      fileName: suggestedFileName!,
      url: audioUrl!,
      extension,
      now: options.now,
      fetchImpl: options.fetchImpl,
    });
    audioFiles.push(
      materialized
        ? persistMaterializedAsset({
            targetDir: options.targetDir,
            toolName,
            payload: item,
            materialized,
            cdnUrl: audioUrl,
            now: options.now,
            extraRegistryFields: { assetKind: 'audio', kind },
          })
        : item
    );
  }

  return { ...options.payload, audio_files: audioFiles };
}

function validateAudioAssetContract(options: {
  audioUrl?: string;
  kind?: string;
  targetDirectory?: string;
  expectedDirectory: string;
  suggestedFileName?: string;
  format?: string;
  mimeType?: string;
}): string | undefined {
  if (!options.audioUrl || !/^https?:\/\//i.test(options.audioUrl)) {
    return 'audioUrl must be an HTTP(S) URL.';
  }
  if (options.kind !== 'sound_effect' && options.kind !== 'dialogue') {
    return 'audio_files item kind is unsupported.';
  }
  if (options.targetDirectory !== options.expectedDirectory) {
    return `targetDirectory must be ${options.expectedDirectory}.`;
  }
  const fileName = options.suggestedFileName;
  if (
    !fileName ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName.includes('\0')
  ) {
    return 'suggestedFileName must be a safe basename.';
  }
  if (path.basename(fileName) !== fileName || fileName.endsWith('.') || fileName.endsWith(' ')) {
    return 'suggestedFileName must be a safe basename.';
  }
  const format = options.format?.toLowerCase();
  const mimeType = options.mimeType?.toLowerCase();
  const extension = path.extname(fileName).toLowerCase();
  const contract = {
    mp3: { mimeType: 'audio/mpeg', extension: '.mp3' },
    wav: { mimeType: 'audio/wav', extension: '.wav' },
    pcm: { mimeType: 'audio/l16', extension: '.pcm' },
    ogg_opus: { mimeType: 'audio/ogg', extension: '.ogg' },
  }[format || ''];
  if (!contract) {
    return 'audio output format is unsupported; format must be one of mp3, wav, pcm, or ogg_opus.';
  }
  if (mimeType !== contract.mimeType || extension !== contract.extension) {
    return `audio output contract mismatch: format ${format} requires mime ${contract.mimeType} and extension ${contract.extension}.`;
  }
  return undefined;
}

function audioExtensionForItem(item: Record<string, unknown>, fileName: string): string {
  const format = stringField(item.format)?.toLowerCase();
  const byFormat: Record<string, string> = {
    mp3: 'mp3',
    wav: 'wav',
    pcm: 'pcm',
    ogg_opus: 'ogg',
    ogg: 'ogg',
    m4a: 'm4a',
    aac: 'aac',
  };
  return byFormat[format || ''] || path.extname(fileName).slice(1).toLowerCase() || 'mp3';
}

async function materializeAudioAsset(options: {
  targetDir: string;
  targetDirectory: string;
  fileName: string;
  url: string;
  extension: string;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<MaterializedAssetResult> {
  const relativeDir = options.targetDirectory;
  const directory = path.join(options.targetDir, ...relativeDir.split('/'));
  try {
    fs.mkdirSync(directory, { recursive: true });
    assertProjectDirectory(options.targetDir, directory);
  } catch (error) {
    return {
      download: {
        success: false,
        error: `Audio target directory is outside the project: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  const baseName = path.basename(options.fileName, path.extname(options.fileName));
  let absolutePath: string | undefined;
  let relativePath: string | undefined;
  for (let index = 1; index <= 9999; index += 1) {
    const suffix = index === 1 ? '' : `_${index}`;
    const candidateName = `${baseName}${suffix}.${options.extension}`;
    const candidate = path.join(directory, candidateName);
    if (!fs.existsSync(candidate)) {
      absolutePath = candidate;
      relativePath = path.posix.join(relativeDir, candidateName);
      break;
    }
  }
  if (!absolutePath || !relativePath) {
    return { download: { success: false, error: 'Unable to allocate a unique audio asset path.' } };
  }
  try {
    const response = await options.fetchImpl(options.url);
    if (!response.ok) {
      return {
        download: { success: false, error: `Asset download failed: HTTP ${response.status}` },
      };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      return { download: { success: false, error: 'Asset download failed: empty response.' } };
    }
    fs.writeFileSync(absolutePath, bytes, { flag: 'wx' });
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

async function materializeVoiceConfirmationResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.payload.success !== true || !isRecord(options.payload.mapping)) {
    return options.payload;
  }
  const mapping = options.payload.mapping;
  const provider = stringField(mapping.provider);
  const characterName =
    stringField(mapping.characterName) || stringField(options.payload.characterName);
  if (!characterName || provider === 'elevenlabs') {
    if (provider !== 'elevenlabs' || !characterName) return options.payload;
    try {
      mergeVoiceMappingFile({
        targetDir: options.targetDir,
        provider: 'elevenlabs',
        characterName,
        mapping,
        now: options.now,
      });
      return options.payload;
    } catch (error) {
      const message = `ElevenLabs voice mapping persistence failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        ...options.payload,
        localPersistenceError: message,
        mappingPersistenceError: message,
      };
    }
  }
  if (provider !== 'doubao' || !isRecord(options.payload.referenceAudio)) {
    return options.payload;
  }

  const referenceAudio = options.payload.referenceAudio;
  const audioUrl = stringField(referenceAudio.audioUrl);
  const targetPath = stringField(referenceAudio.targetPath);
  const pathError = validateDoubaoReferenceTarget(targetPath);
  if (!audioUrl || pathError) {
    return {
      ...options.payload,
      referenceAudio: {
        ...referenceAudio,
        download: { success: false, error: pathError || 'referenceAudio.audioUrl is required.' },
      },
    };
  }

  let bytes: Buffer;
  try {
    const response = await options.fetchImpl(audioUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return {
      ...options.payload,
      referenceAudio: {
        ...referenceAudio,
        download: {
          success: false,
          error: `Reference audio download failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
    };
  }
  if (
    bytes.length === 0 ||
    bytes.length > AUDIO_CONFIRM_MAX_BYTES ||
    !isStructurallyValidMp3(bytes)
  ) {
    return {
      ...options.payload,
      referenceAudio: {
        ...referenceAudio,
        download: {
          success: false,
          error: 'Reference audio must be a non-empty valid MP3 no larger than 1 MiB.',
        },
      },
    };
  }

  try {
    mergeVoiceMappingFile({
      targetDir: options.targetDir,
      provider: 'doubao',
      characterName,
      mapping,
      now: options.now,
      referenceAudio: { targetPath, bytes },
    });
    return {
      ...options.payload,
      referenceAudio: {
        ...referenceAudio,
        localPath: targetPath,
        absolutePath: path.join(options.targetDir, ...targetPath.split('/')),
        download: { success: true },
      },
    };
  } catch (error) {
    return {
      ...options.payload,
      referenceAudio: {
        ...referenceAudio,
        download: {
          success: false,
          error: `Voice mapping transaction failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
    };
  }
}

function validateDoubaoReferenceTarget(targetPath: string | undefined): string | undefined {
  if (!targetPath) return 'referenceAudio.targetPath is required.';
  if (!/^assets\/audio\/voice-reference\/[^/]+\.mp3$/.test(targetPath)) {
    return 'referenceAudio.targetPath must be assets/audio/voice-reference/<basename>.mp3.';
  }
  const base = path.posix.basename(targetPath, '.mp3');
  if (!base || base === '.' || base === '..' || base.includes('\\') || base.includes('\0')) {
    return 'referenceAudio.targetPath contains an unsafe basename.';
  }
  return undefined;
}

function isStructurallyValidMp3(bytes: Buffer): boolean {
  const firstOffset = mp3AudioOffset(bytes);
  if (firstOffset === undefined) return false;
  const first = parseMp3Frame(bytes, firstOffset);
  if (!first) return false;
  const second = parseMp3Frame(bytes, firstOffset + first.length);
  return Boolean(
    second && second.version === first.version && second.sampleRate === first.sampleRate
  );
}

function mp3AudioOffset(bytes: Buffer): number | undefined {
  if (bytes.subarray(0, 3).toString('ascii') !== 'ID3') return 0;
  if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4) return undefined;
  const sizeBytes = bytes.subarray(6, 10);
  if (sizeBytes.some((value) => (value & 0x80) !== 0)) return undefined;
  const size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3];
  const offset = 10 + size + (bytes[3] === 4 && (bytes[5] & 0x10) !== 0 ? 10 : 0);
  return offset <= bytes.length ? offset : undefined;
}

function parseMp3Frame(
  bytes: Buffer,
  offset: number
): { length: number; version: 1 | 2 | 2.5; sampleRate: number } | undefined {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
    return undefined;
  }
  const versionBits = (bytes[offset + 1] >> 3) & 3;
  const version =
    versionBits === 3 ? 1 : versionBits === 2 ? 2 : versionBits === 0 ? 2.5 : undefined;
  if (!version || ((bytes[offset + 1] >> 1) & 3) !== 1) return undefined;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
  const rateIndex = (bytes[offset + 2] >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return undefined;
  const mpeg1Rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Rates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const bitrate = (version === 1 ? mpeg1Rates : mpeg2Rates)[bitrateIndex];
  const baseSampleRate = [44100, 48000, 32000][rateIndex];
  const sampleRate =
    version === 1 ? baseSampleRate : version === 2 ? baseSampleRate / 2 : baseSampleRate / 4;
  const padding = (bytes[offset + 2] >> 1) & 1;
  const length = Math.floor(((version === 1 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding;
  return length > 4 && offset + length <= bytes.length
    ? { length, version, sampleRate }
    : undefined;
}

function mergeVoiceMappingFile(options: {
  targetDir: string;
  provider: 'doubao' | 'elevenlabs';
  characterName: string;
  mapping: Record<string, unknown>;
  now: Date;
  referenceAudio?: { targetPath: string; bytes: Buffer };
}): void {
  const configPath = path.join(
    options.targetDir,
    '.project',
    options.provider === 'doubao' ? 'audio-voice-mapping.json' : 'elevenlabs-voice-mapping.json'
  );
  const referencePath = options.referenceAudio
    ? path.join(options.targetDir, ...options.referenceAudio.targetPath.split('/'))
    : undefined;
  const configDirectory = path.dirname(configPath);
  const referenceDirectory = referencePath ? path.dirname(referencePath) : undefined;
  fs.mkdirSync(configDirectory, { recursive: true });
  assertProjectDirectory(options.targetDir, configDirectory);
  if (referenceDirectory) {
    fs.mkdirSync(referenceDirectory, { recursive: true });
    assertProjectDirectory(options.targetDir, referenceDirectory);
  }
  const oldConfig = snapshotFile(configPath);
  const oldReference = referencePath ? snapshotFile(referencePath) : undefined;
  const existing = readJsonFile(configPath);
  const characters = isRecord(existing?.characters) ? { ...existing.characters } : {};
  const oldCharacter: Record<string, unknown> = isRecord(characters[options.characterName])
    ? characters[options.characterName]
    : {};
  const createdAt = stringField(oldCharacter.created_at) || options.now.toISOString();
  const character = {
    ...oldCharacter,
    ...Object.fromEntries(
      Object.entries(options.mapping).filter(([key]) => key !== 'characterName')
    ),
    provider: options.provider,
    language:
      stringField(options.mapping.language) ||
      stringField(oldCharacter.language) ||
      stringField(existing?.default_language) ||
      'cmn',
    stability:
      typeof options.mapping.stability === 'number'
        ? options.mapping.stability
        : typeof oldCharacter.stability === 'number'
          ? oldCharacter.stability
          : typeof existing?.default_stability === 'number'
            ? existing.default_stability
            : 0.5,
    created_at: createdAt,
    last_used: options.now.toISOString(),
  };
  characters[options.characterName] = character;
  const nextConfig = {
    ...existing,
    version: options.provider === 'doubao' ? 4 : '1.0',
    provider: options.provider,
    default_language: stringField(existing?.default_language) || 'cmn',
    default_stability:
      typeof existing?.default_stability === 'number' ? existing.default_stability : 0.5,
    special_voices: isRecord(existing?.special_voices) ? existing.special_voices : {},
    characters,
  };
  const configBytes = Buffer.from(`${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  const transactionId = randomUUID();
  const configTemp = `${configPath}.${transactionId}.tmp`;
  const referenceTemp = referencePath ? `${referencePath}.${transactionId}.tmp` : undefined;
  try {
    if (referenceTemp && options.referenceAudio) {
      fs.writeFileSync(referenceTemp, options.referenceAudio.bytes, { flag: 'wx' });
      fs.renameSync(referenceTemp, referencePath!);
    }
    fs.writeFileSync(configTemp, configBytes, { flag: 'wx' });
    fs.renameSync(configTemp, configPath);
  } catch (error) {
    try {
      if (fs.existsSync(configTemp)) fs.rmSync(configTemp, { force: true });
      if (referenceTemp && fs.existsSync(referenceTemp)) fs.rmSync(referenceTemp, { force: true });
      restoreFile(configPath, oldConfig);
      if (referencePath) restoreFile(referencePath, oldReference!);
    } catch {
      // Keep the original failure; callers still receive a visible transaction error.
    }
    throw error;
  }
}

type FileSnapshot = { exists: boolean; bytes?: Buffer };

function snapshotFile(filePath: string): FileSnapshot {
  try {
    return { exists: true, bytes: fs.readFileSync(filePath) };
  } catch {
    return { exists: false };
  }
}

function restoreFile(filePath: string, snapshot: FileSnapshot): void {
  if (snapshot.exists && snapshot.bytes) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, snapshot.bytes);
  } else {
    fs.rmSync(filePath, { force: true });
  }
}

function readJsonFile(filePath: string): Record<string, any> | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function materialize3dModelResult(
  options: {
    targetDir: string;
    payload: Record<string, unknown>;
    now: Date;
    fetchImpl: RemoteProxyFetch;
  },
  toolName: 'create_3d_model_task' | 'query_3d_model_task'
): Promise<Record<string, unknown>> {
  if (options.payload.phase === 1) {
    return await materialize3dPreviewResult(options);
  }
  return await materialize3dFinalResult(options, toolName);
}

async function materialize3dPreviewResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (!isRecord(options.payload.preview_urls)) {
    return options.payload;
  }

  let changed = false;
  const previewAssets: Record<string, unknown> = {};
  const taskId = get3dTaskId(options.payload);
  const mode = stringField(options.payload.mode);

  for (const view of THREE_D_MODEL_VIEWS) {
    const url = stringField(options.payload.preview_urls[view]);
    const materialized = await materializeAsset({
      targetDir: options.targetDir,
      url,
      baseName: `${taskId || '3d_model'}_${view}`,
      relativeDir: 'assets/image',
      extension: extensionFromUrl(url) || 'png',
      now: options.now,
      fetchImpl: options.fetchImpl,
    });
    if (!materialized) {
      continue;
    }

    changed = true;
    previewAssets[view] = { ...materialized, cdnUrl: url };
    if ('localPath' in materialized && url) {
      upsertGeneratedAssetRecord(options.targetDir, materialized.localPath, {
        tool: 'create_3d_model_task',
        name: `${taskId || '3d_model'}_${view}`,
        cdnUrl: url,
        previewUrl: url,
        localPath: materialized.localPath,
        absolutePath: materialized.absolutePath,
        createdAt: options.now.toISOString(),
        taskId,
        mode,
        phase: 1,
        view,
      });
    }
  }

  return {
    ...options.payload,
    ...(changed ? { preview_assets: previewAssets } : {}),
    ...create3dPreviewReviewGuidance(),
  };
}

function create3dPreviewReviewGuidance(): Record<string, unknown> {
  return {
    workflow_state: 'awaiting_user_review',
    user_review_required: true,
    next_action:
      'Show the four-view previews to the user and ask whether they approve them or want changes.',
    approval_next_step:
      'If the user approves, continue the original 3D model generation flow by calling create_3d_model_task again with the approved four-view images.',
    revision_next_step:
      'If the user requests changes, call create_3d_model_task again with the requested changes to regenerate the four-view previews before model generation.',
    agent_instruction:
      'Do not stop after phase 1. The 3D model is not complete until the user approves the four-view previews and final model generation finishes.',
  };
}

async function materialize3dFinalResult(
  options: {
    targetDir: string;
    payload: Record<string, unknown>;
    now: Date;
    fetchImpl: RemoteProxyFetch;
  },
  toolName: 'create_3d_model_task' | 'query_3d_model_task'
): Promise<Record<string, unknown>> {
  if (options.payload.status !== 'success') {
    return options.payload;
  }

  let changed = false;
  const nextPayload: Record<string, unknown> = { ...options.payload };
  const taskId = get3dTaskId(options.payload);
  const modelCdnUrl = stringField(options.payload.model_cdn_url);
  const renderedImageUrl = stringField(options.payload.rendered_image_url);
  const mdlConversionError = stringField(options.payload.mdl_conversion_error);

  const modelMaterialized = await materializeAsset({
    targetDir: options.targetDir,
    url: modelCdnUrl,
    baseName: taskId || '3d_model',
    relativeDir: MODEL_ASSET_DIRS[0],
    extension: extensionFromUrl(modelCdnUrl) || 'glb',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  if (modelMaterialized) {
    changed = true;
    nextPayload.modelDownload = modelMaterialized.download;
    if ('localPath' in modelMaterialized) {
      nextPayload.modelLocalPath = modelMaterialized.localPath;
      nextPayload.modelAbsolutePath = modelMaterialized.absolutePath;
      if (modelCdnUrl) {
        upsertGeneratedAssetRecord(options.targetDir, modelMaterialized.localPath, {
          tool: toolName,
          name: taskId,
          assetKind: 'model',
          cdnUrl: modelCdnUrl,
          previewUrl: renderedImageUrl || modelCdnUrl,
          localPath: modelMaterialized.localPath,
          absolutePath: modelMaterialized.absolutePath,
          createdAt: options.now.toISOString(),
          taskId,
          modelCdnUrl,
          renderedImageUrl,
          mdlConversionError,
        });
      }
    }
  }

  const mdlUrl = stringField(options.payload.mdl_cdn_url);
  const mdlMaterialized = await materializeAsset({
    targetDir: options.targetDir,
    url: mdlUrl,
    baseName: taskId || '3d_model',
    relativeDir: MODEL_ASSET_DIRS[0],
    extension: extensionFromUrl(mdlUrl) || 'zip',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  if (mdlMaterialized) {
    changed = true;
    nextPayload.mdlDownload = mdlMaterialized.download;
    if ('localPath' in mdlMaterialized) {
      nextPayload.mdlLocalPath = mdlMaterialized.localPath;
      nextPayload.mdlAbsolutePath = mdlMaterialized.absolutePath;
      let mdlExtractError: string | undefined;
      try {
        extractZip(
          mdlMaterialized.absolutePath,
          path.join(options.targetDir, 'assets'),
          '3D model asset'
        );
        nextPayload.mdlExtracted = true;
        nextPayload.mdlExtractedTo = 'assets';
      } catch (error) {
        mdlExtractError = `3D model asset extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        nextPayload.mdlExtracted = false;
        nextPayload.mdlExtractError = mdlExtractError;
      }
      if (mdlUrl) {
        upsertGeneratedAssetRecord(options.targetDir, mdlMaterialized.localPath, {
          tool: toolName,
          name: taskId,
          assetKind: 'mdl_zip',
          cdnUrl: mdlUrl,
          previewUrl: renderedImageUrl || mdlUrl,
          localPath: mdlMaterialized.localPath,
          absolutePath: mdlMaterialized.absolutePath,
          createdAt: options.now.toISOString(),
          taskId,
          modelCdnUrl,
          renderedImageUrl,
          mdlConversionError,
          mdlExtractError,
        });
      }
    }
  }

  const renderedImageMaterialized = await materializeAsset({
    targetDir: options.targetDir,
    url: renderedImageUrl,
    baseName: `${taskId || '3d_model'}_render`,
    relativeDir: 'assets/image',
    extension: extensionFromUrl(renderedImageUrl) || 'png',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  if (renderedImageMaterialized) {
    changed = true;
    nextPayload.renderedImageDownload = renderedImageMaterialized.download;
    if ('localPath' in renderedImageMaterialized) {
      nextPayload.renderedImageLocalPath = renderedImageMaterialized.localPath;
      nextPayload.renderedImageAbsolutePath = renderedImageMaterialized.absolutePath;
      if (renderedImageUrl) {
        upsertGeneratedAssetRecord(options.targetDir, renderedImageMaterialized.localPath, {
          tool: toolName,
          name: `${taskId || '3d_model'}_render`,
          assetKind: 'render',
          cdnUrl: renderedImageUrl,
          previewUrl: renderedImageUrl,
          localPath: renderedImageMaterialized.localPath,
          absolutePath: renderedImageMaterialized.absolutePath,
          createdAt: options.now.toISOString(),
          taskId,
          modelCdnUrl,
          renderedImageUrl,
          mdlConversionError,
        });
      }
    }
  }

  return changed ? nextPayload : options.payload;
}

function get3dTaskId(payload: Record<string, unknown>): string | undefined {
  return stringField(payload.task_id) || stringField(payload.taskId);
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

  try {
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
  } catch (error) {
    return {
      ...nextPayload,
      registryError: `Generated asset registry persistence failed: ${error instanceof Error ? error.message : String(error)}`,
      localPersistenceError: `Generated asset registry persistence failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

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
    assetKind?: 'model' | 'mdl_zip' | 'render' | 'audio';
    prompt?: string;
    cdnUrl?: string;
    previewUrl?: string;
    localPath?: string;
    absolutePath?: string;
    createdAt?: string;
    taskId?: string;
    mode?: string;
    phase?: number;
    view?: string;
    modelCdnUrl?: string;
    renderedImageUrl?: string;
    mdlConversionError?: string;
    mdlExtractError?: string;
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

function rewrite3dModelAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  const imageOptions = {
    assetDirs: IMAGE_ASSET_DIRS,
    mediaKind: 'image' as const,
    maxBytes: IMAGE_REFERENCE_MAX_BYTES,
  };
  return {
    ...args,
    image: rewriteGeneratedAssetReference(targetDir, args.image, registry, imageOptions),
    front_image: rewriteGeneratedAssetReference(
      targetDir,
      args.front_image,
      registry,
      imageOptions
    ),
    left_image: rewriteGeneratedAssetReference(targetDir, args.left_image, registry, imageOptions),
    back_image: rewriteGeneratedAssetReference(targetDir, args.back_image, registry, imageOptions),
    right_image: rewriteGeneratedAssetReference(
      targetDir,
      args.right_image,
      registry,
      imageOptions
    ),
    confirmed_image_paths: rewrite3dConfirmedImagePaths(
      targetDir,
      args.confirmed_image_paths,
      registry,
      imageOptions
    ),
  };
}

function rewrite3dConfirmedImagePaths(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  options: {
    assetDirs: string[];
    mediaKind: DataUrlMediaKind;
    maxBytes: number;
  }
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    front: rewriteGeneratedAssetReference(targetDir, value.front, registry, options),
    left: rewriteGeneratedAssetReference(targetDir, value.left, registry, options),
    back: rewriteGeneratedAssetReference(targetDir, value.back, registry, options),
    right: rewriteGeneratedAssetReference(targetDir, value.right, registry, options),
  };
}

function rewriteTextToDialogueArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(args.inputs)) {
    return args;
  }
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    inputs: args.inputs.map((value, index) => {
      if (!isRecord(value)) {
        return value;
      }
      if (value.reference_audio !== undefined && value.reference_audio_path !== undefined) {
        throw new Error(
          `inputs[${index}].reference_audio and reference_audio_path are mutually exclusive.`
        );
      }
      if (value.reference_audio === undefined) {
        return value;
      }
      return {
        ...value,
        reference_audio: rewriteAudioReferenceSync({
          targetDir,
          value: value.reference_audio,
          registry,
        }),
      };
    }),
  };
}

/**
 * Asynchronous variant used by callers that need HTTP(S) reference conversion.
 * The legacy synchronous helper remains available for existing MCP callers.
 */
export async function prepareRemoteProxyToolArgsAsync(options: {
  toolName: string;
  targetDir: string;
  args: Record<string, unknown>;
  fetchImpl?: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.toolName !== 'text_to_dialogue' || !Array.isArray(options.args.inputs)) {
    return prepareRemoteProxyToolArgs(options);
  }
  const fetcher = options.fetchImpl ?? fetch;
  const registry = readGeneratedAssetRegistry(options.targetDir);
  const inputs = await Promise.all(
    options.args.inputs.map(async (value, index) => {
      if (!isRecord(value)) return value;
      if (value.reference_audio !== undefined && value.reference_audio_path !== undefined) {
        throw new Error(
          `inputs[${index}].reference_audio and reference_audio_path are mutually exclusive.`
        );
      }
      if (value.reference_audio === undefined) return value;
      return {
        ...value,
        reference_audio: await rewriteAudioReference({
          targetDir: options.targetDir,
          value: value.reference_audio,
          registry,
          fetchImpl: fetcher,
        }),
      };
    })
  );
  return { ...options.args, inputs };
}

function rewriteAudioReferenceSync(options: {
  targetDir: string;
  value: unknown;
  registry: GeneratedAssetRegistry;
}): string {
  if (typeof options.value !== 'string' || !options.value.trim()) {
    throw new Error('reference_audio must be an audio data URL or local audio file path.');
  }
  const value = options.value.trim();
  if (value.startsWith('data:')) {
    validateAudioDataUrl(value);
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    // The synchronous public API cannot block on fetch. Callers needing HTTP use
    // prepareRemoteProxyToolArgsAsync; keeping this URL unchanged avoids a false claim.
    return value;
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && !value.includes('.') && !value.includes('/')) {
    throw new Error('reference_audio must not be bare base64; provide an audio data URL.');
  }
  const localPath = resolveLocalAssetReference(
    options.targetDir,
    value,
    options.registry,
    AUDIO_ASSET_DIRS
  );
  const absolutePath = resolveLocalAssetAbsolutePath(options.targetDir, {
    value,
    localPath,
  });
  if (!absolutePath) {
    throw new Error(`reference_audio local file was not found: ${value}`);
  }
  const mime = dataUrlMimeForPath(absolutePath, 'audio');
  if (!mime) {
    throw new Error('reference_audio format is unsupported; use MP3, WAV, OGG, M4A, or AAC.');
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size > AUDIO_DIALOGUE_REFERENCE_MAX_BYTES) {
    throw new Error('reference_audio must be a file no larger than 20 MiB.');
  }
  return `data:${mime};base64,${fs.readFileSync(absolutePath).toString('base64')}`;
}

async function rewriteAudioReference(options: {
  targetDir: string;
  value: unknown;
  registry: GeneratedAssetRegistry;
  fetchImpl: RemoteProxyFetch;
}): Promise<string> {
  if (typeof options.value !== 'string' || !options.value.trim()) {
    throw new Error(
      'reference_audio must be an audio data URL, local audio file path, or HTTP(S) URL.'
    );
  }
  const value = options.value.trim();
  if (value.startsWith('data:')) {
    validateAudioDataUrl(value);
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await options.fetchImpl(value);
    if (!response.ok) throw new Error(`reference_audio download failed: HTTP ${response.status}`);
    const bytes = await readResponseBytesLimited(
      response,
      AUDIO_DIALOGUE_REFERENCE_MAX_BYTES,
      'reference_audio'
    );
    const mime = audioMimeFromResponse(response, value);
    if (!mime) throw new Error('reference_audio URL has an unsupported audio format.');
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  return rewriteAudioReferenceSync(options);
}

async function readResponseBytesLimited(
  response: Response,
  maxBytes: number,
  label: string
): Promise<Buffer> {
  const contentLength = response.headers?.get('content-length');
  if (contentLength) {
    const declaredLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel();
      throw new Error(`${label} must be a non-empty source no larger than 20 MiB.`);
    }
  }
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maxBytes) {
      throw new Error(`${label} must be a non-empty source no larger than 20 MiB.`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    let streamEnded = false;
    while (!streamEnded) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        continue;
      }
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} must be a non-empty source no larger than 20 MiB.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) {
    throw new Error(`${label} must be a non-empty source no larger than 20 MiB.`);
  }
  return Buffer.concat(chunks, total);
}

function validateAudioDataUrl(value: string): void {
  const match = /^data:(audio\/(?:mpeg|wav|ogg|mp4|aac));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(
    value
  );
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw new Error('reference_audio must be a valid audio data URL, not bare base64.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > AUDIO_DIALOGUE_REFERENCE_MAX_BYTES) {
    throw new Error('reference_audio data URL must be no larger than 20 MiB.');
  }
}

function audioMimeFromResponse(response: Response, url: string): string | undefined {
  const contentType = response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType && Object.values(AUDIO_MIME_BY_EXTENSION).includes(contentType))
    return contentType;
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return AUDIO_MIME_BY_EXTENSION[extension];
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

function assertProjectDirectory(targetDir: string, directory: string): void {
  const projectRoot = fs.realpathSync(path.resolve(targetDir));
  const realDirectory = fs.realpathSync(directory);
  const relative = path.relative(projectRoot, realDirectory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('resolved directory escapes the project target directory');
  }
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
  const registryDirectory = path.dirname(registryPath);
  fs.mkdirSync(registryDirectory, { recursive: true });
  assertProjectDirectory(targetDir, registryDirectory);
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
