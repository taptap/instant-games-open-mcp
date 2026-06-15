/**
 * Remote Maker proxy asset post-processing.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { extractZip } from '../cli/devKit.js';

type RemoteProxyToolResult = Awaited<ReturnType<Client['callTool']>>;
type RemoteProxyFetch = typeof fetch;
const IMAGE_ASSET_DIRS = ['assets/image'];
const VIDEO_ASSET_DIRS = ['assets/video'];
const AUDIO_ASSET_DIRS = ['assets/audio'];
const MODEL_ASSET_DIRS = ['assets/model'];
const THREE_D_MODEL_VIEWS = ['front', 'left', 'back', 'right'] as const;

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
  if (options.toolName === 'create_video_task') {
    return rewriteVideoReferenceAssetArgs(options.targetDir, options.args);
  }
  if (options.toolName === 'create_3d_model_task') {
    return rewrite3dModelAssetArgs(options.targetDir, options.args);
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
  if (!shouldMaterializeRemoteProxyTool(options.toolName)) {
    return options.result;
  }

  const content = options.result.content;
  if (!Array.isArray(content)) {
    return options.result;
  }

  let changed = false;
  const nextContent = [];
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
    'text_to_music',
    'create_3d_model_task',
    'query_3d_model_task',
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
  if (options.toolName === 'create_video_task') {
    return await materializeVideoResult(options);
  }
  if (options.toolName === 'text_to_music') {
    return await materializeMusicResult(options);
  }
  if (options.toolName === 'create_3d_model_task' || options.toolName === 'query_3d_model_task') {
    return await materialize3dModelResult(options, options.toolName);
  }
  return options.payload;
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

async function materializeVideoResult(options: {
  targetDir: string;
  payload: Record<string, unknown>;
  now: Date;
  fetchImpl: RemoteProxyFetch;
}): Promise<Record<string, unknown>> {
  if (options.payload.status !== 'succeeded') {
    return options.payload;
  }

  const materialized = await materializeAsset({
    targetDir: options.targetDir,
    url: stringField(options.payload.cdn_url),
    baseName: stringField(options.payload.task_id),
    relativeDir: 'assets/video',
    extension: 'mp4',
    now: options.now,
    fetchImpl: options.fetchImpl,
  });
  return materialized
    ? persistMaterializedAsset({
        targetDir: options.targetDir,
        toolName: 'create_video_task',
        payload: options.payload,
        materialized,
        cdnUrl: stringField(options.payload.cdn_url),
        now: options.now,
        extraRegistryFields: {
          taskId: stringField(options.payload.task_id),
        },
      })
    : options.payload;
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
      extractZip(
        mdlMaterialized.absolutePath,
        path.join(options.targetDir, 'assets'),
        '3D model asset'
      );
      nextPayload.mdlExtracted = true;
      nextPayload.mdlExtractedTo = 'assets';
      if (mdlUrl) {
        upsertGeneratedAssetRecord(options.targetDir, mdlMaterialized.localPath, {
          tool: toolName,
          name: taskId,
          cdnUrl: mdlUrl,
          previewUrl: renderedImageUrl || mdlUrl,
          localPath: mdlMaterialized.localPath,
          absolutePath: mdlMaterialized.absolutePath,
          createdAt: options.now.toISOString(),
          taskId,
          modelCdnUrl,
          renderedImageUrl,
          mdlConversionError,
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
  }
>;

function rewriteEditImageAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    image: rewriteGeneratedAssetReference(targetDir, args.image, registry, IMAGE_ASSET_DIRS),
    reference_images: Array.isArray(args.reference_images)
      ? args.reference_images.map((item) =>
          rewriteGeneratedAssetReference(targetDir, item, registry, IMAGE_ASSET_DIRS)
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
    image: normalizeLocalAssetReference(targetDir, args.image, registry, IMAGE_ASSET_DIRS),
    reference_images: Array.isArray(args.reference_images)
      ? args.reference_images.map((item) =>
          normalizeLocalAssetReference(targetDir, item, registry, IMAGE_ASSET_DIRS)
        )
      : args.reference_images,
  };
}

function rewriteVideoReferenceAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    images: rewriteUrlObjectArray(targetDir, args.images, registry, IMAGE_ASSET_DIRS),
    videos: rewriteUrlObjectArray(targetDir, args.videos, registry, VIDEO_ASSET_DIRS),
    audios: rewriteUrlObjectArray(targetDir, args.audios, registry, AUDIO_ASSET_DIRS),
  };
}

function rewrite3dModelAssetArgs(
  targetDir: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const registry = readGeneratedAssetRegistry(targetDir);
  return {
    ...args,
    image: rewriteGeneratedAssetReference(targetDir, args.image, registry, IMAGE_ASSET_DIRS),
    front_image: rewriteGeneratedAssetReference(
      targetDir,
      args.front_image,
      registry,
      IMAGE_ASSET_DIRS
    ),
    left_image: rewriteGeneratedAssetReference(
      targetDir,
      args.left_image,
      registry,
      IMAGE_ASSET_DIRS
    ),
    back_image: rewriteGeneratedAssetReference(
      targetDir,
      args.back_image,
      registry,
      IMAGE_ASSET_DIRS
    ),
    right_image: rewriteGeneratedAssetReference(
      targetDir,
      args.right_image,
      registry,
      IMAGE_ASSET_DIRS
    ),
    confirmed_image_paths: rewrite3dConfirmedImagePaths(
      targetDir,
      args.confirmed_image_paths,
      registry
    ),
  };
}

function rewrite3dConfirmedImagePaths(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    front: rewriteGeneratedAssetReference(targetDir, value.front, registry, IMAGE_ASSET_DIRS),
    left: rewriteGeneratedAssetReference(targetDir, value.left, registry, IMAGE_ASSET_DIRS),
    back: rewriteGeneratedAssetReference(targetDir, value.back, registry, IMAGE_ASSET_DIRS),
    right: rewriteGeneratedAssetReference(targetDir, value.right, registry, IMAGE_ASSET_DIRS),
  };
}

function rewriteUrlObjectArray(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  assetDirs: string[]
): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) =>
    isRecord(item)
      ? {
          ...item,
          url: rewriteGeneratedAssetReference(targetDir, item.url, registry, assetDirs),
        }
      : item
  );
}

function rewriteGeneratedAssetReference(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  assetDirs: string[]
): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const localPath = resolveLocalAssetReference(targetDir, value, registry, assetDirs);
  const cdnUrl = localPath
    ? registry[localPath]?.cdnUrl || registry[localPath]?.previewUrl
    : undefined;
  return cdnUrl || localPath || value;
}

function normalizeLocalAssetReference(
  targetDir: string,
  value: unknown,
  registry: GeneratedAssetRegistry,
  assetDirs: string[]
): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return resolveLocalAssetReference(targetDir, value, registry, assetDirs) || value;
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

function sanitizeAssetBaseName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'asset';
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
