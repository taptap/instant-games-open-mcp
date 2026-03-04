/**
 * H5 Game Handlers
 * Business logic for H5 game operations (gather info, upload, create, edit, etc.)
 * Uses unified cache system from core/utils/cache.ts
 * Uses common APIs from app/api.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import { MESSAGES } from './messages.js';
import {
  getDebugFeedbacks,
  getH5PackageUploadParams,
  type FeedbackInfo,
  type GetDebugFeedbacksRequest,
  type UploadParams,
} from './api.js';
import { editAppInfo, refreshAppCache } from '../app/api.js';
import { readAppCache } from '../../core/utils/cache.js';
import { logger } from '../../core/utils/logger.js';
import {
  resolvePathSafe,
  resolveWorkPath,
  type PathResolutionResult,
} from '../../core/utils/pathResolver.js';
import { EnvConfig } from '../../core/utils/env.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * H5 游戏特定的错误消息模板
 * 这些消息是 H5 业务特定的，不属于通用 PathResolver
 */
const H5_PATH_ERRORS = {
  NO_INDEX_HTML_PROXY: (relativePath: string) =>
    `❌ 目录 "${relativePath}" 中未找到 index.html

H5 游戏根目录必须包含 index.html 文件。

请确认：
- 是否需要指向子目录？（如 "${relativePath}/public"）
- 构建配置是否正确？

💡 请询问用户确认游戏入口文件位置`,

  NO_INDEX_HTML_LOCAL: (relativePath: string, fullPath: string) =>
    `❌ 目录 "${relativePath}" 中未找到 index.html

解析路径：${fullPath}

H5 游戏根目录必须包含 index.html 文件。`,

  EMPTY_PATH_NO_INDEX_PROXY: () =>
    `❌ 当前目录未找到 index.html

如果游戏构建产物在子目录中，请指定路径，如：
- "dist"（Vite、Vue CLI 默认）
- "build"（Create React App 默认）

如果 index.html 就在项目根目录，请确认用户已完成构建。

💡 请询问用户确认游戏目录位置`,

  EMPTY_PATH_NO_INDEX_LOCAL: (fullPath: string) =>
    `❌ 当前目录未找到 index.html

解析路径：${fullPath}

如果游戏构建产物在子目录中，请指定路径，如 "dist"、"build"。`,
};

/**
 * 验证 H5 游戏路径（包含 index.html 检查）
 *
 * @param pathResult - PathResolver 的解析结果
 * @param requireIndexHtml - 是否需要 index.html
 * @returns 错误消息，如果验证通过则返回 null
 */
function validateH5GamePath(
  pathResult: PathResolutionResult,
  requireIndexHtml: boolean = true
): string | null {
  if (!pathResult.success) {
    return pathResult.error!.userMessage;
  }

  if (!requireIndexHtml) {
    return null;
  }

  const indexPath = path.join(pathResult.resolvedPath!, 'index.html');
  if (!fs.existsSync(indexPath)) {
    // 根据输入类型和模式返回不同的错误消息
    if (pathResult.inputType === 'empty') {
      return pathResult.isProxyMode
        ? H5_PATH_ERRORS.EMPTY_PATH_NO_INDEX_PROXY()
        : H5_PATH_ERRORS.EMPTY_PATH_NO_INDEX_LOCAL(pathResult.resolvedPath!);
    }
    return pathResult.isProxyMode
      ? H5_PATH_ERRORS.NO_INDEX_HTML_PROXY(pathResult.inputPath)
      : H5_PATH_ERRORS.NO_INDEX_HTML_LOCAL(pathResult.inputPath, pathResult.resolvedPath!);
  }

  return null;
}

/**
 * 临时文件根目录（独立于 workspace）
 * 优先级：环境变量 > 默认值
 */
const TEMP_ROOT = EnvConfig.tempDir;

/**
 * 调试反馈下载目录（相对于项目根目录）
 */
const DEBUG_FEEDBACK_ROOT = path.join('logs', 'feed_back');

/**
 * Debug feedback handler args
 */
interface GetDebugFeedbacksArgs {
  limit?: number;
  status?: number;
  fetch_and_mark_processed?: boolean;
  download_assets?: boolean;
}

/**
 * 下载后的本地文件信息
 */
interface DownloadedFeedbackFiles {
  feedbackDir: string;
  feedbackJsonPath?: string;
  promptPath?: string;
  screenshotPaths: string[];
  logPaths: string[];
  failedDownloads: string[];
}

/**
 * 获取临时 ZIP 文件路径
 *
 * @param projectPath - 租户标识符（绝对路径）
 * @returns 临时 ZIP 文件的绝对路径
 *
 * @example
 * getTempZipPath('/workspace/user-123/project-456')
 * // => '/tmp/taptap-mcp/temp/user-123/project-456/game-1234567890.zip'
 */
function getTempZipPath(projectPath: string): string {
  // 提取租户标识符（最后两层：userId/projectId）
  let tenantId: string;

  if (path.isAbsolute(projectPath)) {
    const parts = projectPath.split(path.sep).filter(Boolean);
    tenantId = parts.slice(-2).join(path.sep);
  } else {
    tenantId = projectPath;
  }

  // 确保临时目录存在
  const tempDir = path.join(TEMP_ROOT, tenantId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 生成唯一文件名（带时间戳）
  const timestamp = Date.now();
  return path.join(tempDir, `game-${timestamp}.zip`);
}

/**
 * 压缩目录为 ZIP 文件
 */
function compressDirectory(sourcePath: string, outputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('error', (err) => {
      reject(new Error(MESSAGES.CREATE_FILE_STREAM_ERROR(err.message)));
    });

    archive.on('error', (err: Error) => {
      reject(new Error(MESSAGES.COMPRESSION_PROCESS_ERROR(err.message)));
    });

    archive.on('warning', (err: archiver.ArchiverError) => {
      if (err.code === 'ENOENT') {
        console.warn(MESSAGES.ARCHIVE_WARNING(err));
      } else {
        reject(err);
      }
    });

    output.on('close', () => {
      resolve(archive.pointer());
    });

    archive.pipe(output);

    const dirName = path.basename(sourcePath);
    archive.directory(sourcePath, dirName, (entry: archiver.EntryData) => {
      // 过滤不需要的文件
      if (
        entry.name.includes('.secret') ||
        entry.name.includes('.taptap') ||
        entry.name.includes('.taptap-minigame') ||
        entry.name.includes('game.zip') ||
        entry.name.includes('.DS_Store') ||
        entry.name.includes('.git') ||
        entry.name.includes('.gitignore')
      ) {
        return false;
      }
      return entry;
    });

    archive.finalize();
  });
}

/**
 * 上传文件到指定 URL
 */
async function uploadFile(uploadParams: UploadParams, filePath: string): Promise<number> {
  const fileContent = fs.readFileSync(filePath);

  const response = await fetch(uploadParams.url, {
    method: uploadParams.method,
    headers: uploadParams.headers || {},
    body: fileContent,
  });

  if (!response.ok) {
    throw new Error(MESSAGES.UPLOAD_FAILED(response.status));
  }

  await logger.info(MESSAGES.UPLOAD_PACKAGE_SUCCESS);
  return uploadParams.h5_package_id;
}

/**
 * 从缓存获取已选择的 App 信息
 *
 * 设计原则：
 * - App 信息统一从缓存读取（单一状态来源）
 * - 缓存通过 select_app 或 create_app 写入
 * - 如果没有缓存，返回引导消息
 *
 * @param ctx - 请求上下文（包含 projectPath）
 * @returns App 信息或错误消息
 */
function getSelectedAppInfo(ctx?: ResolvedContext): {
  success: boolean;
  message?: string;
  developerId?: number;
  developerName?: string;
  appId?: number;
  appTitle?: string;
  miniappId?: string;
} {
  // 从缓存读取（使用 ctx.projectPath 作为隔离 key）
  const cached = readAppCache(ctx?.projectPath);

  if (!cached?.developer_id || !cached?.app_id) {
    return {
      success: false,
      message: `❌ 尚未选择应用

请先选择要上传的应用：
1. 调用 \`list_developers_and_apps\` 查看可用的开发者和应用
2. 使用 \`select_app\` 选择要使用的应用
3. 然后再调用本工具

💡 如果没有应用，可以使用 \`create_app\` 创建新应用（创建后会自动选中）`,
    };
  }

  return {
    success: true,
    developerId: cached.developer_id,
    developerName: cached.developer_name,
    appId: cached.app_id,
    appTitle: cached.app_title,
    miniappId: cached.miniapp_id,
  };
}

/**
 * 收集 H5 游戏信息
 *
 * 设计说明：
 * - App 信息从缓存读取（通过 select_app 或 create_app 设置）
 * - 不再通过参数传递 developerId/appId
 * - 如果没有选择 App，返回引导消息
 */
export async function handleGatherGameInfo(
  args: {
    gamePath?: string; // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    genre?: string;
  },
  ctx?: ResolvedContext
): Promise<string> {
  // 1. 从缓存获取已选择的 App 信息
  const appInfo = getSelectedAppInfo(ctx);
  if (!appInfo.success) {
    return appInfo.message!;
  }

  // 2. 使用通用路径解析器（允许空路径，因为空路径可能意味着当前目录有 index.html）
  const pathResult = resolvePathSafe(args.gamePath, ctx, { allowEmpty: true, checkExists: true });

  // 3. H5 业务特定验证（index.html 检查）
  const validationError = validateH5GamePath(pathResult, true);
  if (validationError) {
    throw new Error(validationError);
  }

  const gamePath = pathResult.resolvedPath!;

  // 4. 返回确认信息
  const msg = MESSAGES.CONFIRM_GAME_INFO(
    gamePath,
    appInfo.developerName,
    appInfo.developerId,
    appInfo.appId,
    appInfo.appTitle
  );

  return msg;
}

/**
 * 上传 H5 游戏
 *
 * 设计说明：
 * - App 信息从缓存读取（通过 select_app 或 create_app 设置）
 * - 不再通过参数传递 developerId/appId
 * - 如果没有选择 App，返回引导消息
 */
export async function handleUploadGame(
  args: {
    gamePath?: string; // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    genre?: string;
  },
  ctx?: ResolvedContext
): Promise<string> {
  // 1. 从缓存获取已选择的 App 信息
  const appInfo = getSelectedAppInfo(ctx);
  if (!appInfo.success) {
    return appInfo.message!;
  }

  // 2. 使用通用路径解析器（允许空路径，上传时不强制 index.html 检查）
  const pathResult = resolvePathSafe(args.gamePath, ctx, { allowEmpty: true, checkExists: true });

  // 3. H5 业务特定验证（上传时不强制要求 index.html，因为可能在后续压缩时检查）
  const validationError = validateH5GamePath(pathResult, false);
  if (validationError) {
    throw new Error(validationError);
  }

  const gamePath = pathResult.resolvedPath!;
  const developerId = appInfo.developerId!;
  const appId = appInfo.appId!;

  // 生成临时 ZIP 文件路径（独立于 workspace）
  const outputPath = getTempZipPath(gamePath);

  try {
    // 1. 压缩目录
    const archiveSize = await compressDirectory(gamePath, outputPath);
    await logger.info(MESSAGES.COMPRESSION_SUCCESS(archiveSize));

    // 2. 获取上传参数
    let uploadParams: UploadParams;
    try {
      uploadParams = await getH5PackageUploadParams(appId, ctx);
      await logger.info(MESSAGES.GET_UPLOAD_PARAMS_SUCCESS(uploadParams, outputPath));
    } catch (error) {
      return MESSAGES.COMPRESSED_GET_PARAMS_FAILED(archiveSize, String(error));
    }

    // 3. 上传文件
    let packageId: number;
    try {
      packageId = await uploadFile(uploadParams, outputPath);
    } catch (error) {
      throw new Error(
        MESSAGES.FILE_COMPRESSED_UPLOAD_FAILED(
          error instanceof Error ? error.message : String(error)
        )
      );
    }

    // 4. 发布到 TapTap
    await logger.info(MESSAGES.PUBLISH_PARAMS(appId, developerId, packageId));

    const results = await editAppInfo(
      appId, // app_id
      developerId, // developer_id
      packageId, // package_id
      undefined, // appName
      args.genre, // genre
      undefined, // description
      undefined, // chatting_label
      undefined, // chatting_number
      undefined, // screen_orientation
      undefined, // icon
      undefined, // banner
      undefined, // screenshots
      undefined, // trial_note
      ctx // ctx
    );

    // 5. Refresh App Cache immediately after successful upload
    try {
      await refreshAppCache(ctx?.projectPath, ctx);
    } catch (refreshError) {
      console.warn('Failed to refresh app cache after upload:', refreshError);
    }

    let msg = MESSAGES.GAME_PUBLISH_SUCCESS(results.app_title, appId);
    msg += '\n' + MESSAGES.GAME_TYPE_INFO(results.display_app_title) + '\n';

    return msg;
  } finally {
    // 清理临时文件（无论成功或失败）
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (error) {
        console.error(`[H5Game] Failed to cleanup temp file: ${outputPath}`, error);
      }
    }
  }
}

/**
 * 规范化拉取数量参数
 */
function normalizeDebugFeedbackLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return 3;
  }

  const normalized = Math.floor(limit!);
  if (normalized < 1) return 1;
  if (normalized > 10) return 10;
  return normalized;
}

/**
 * 规范化状态筛选参数
 */
function normalizeDebugFeedbackStatus(status?: number): 0 | 1 | 2 {
  if (status === 0 || status === 1 || status === 2) {
    return status;
  }
  return 1;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清理文件名，避免路径字符和非法字符
 */
function sanitizeFileName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * 从 URL 推断文件名
 */
function inferFilenameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const rawName = path.basename(decodeURIComponent(parsed.pathname));
    if (rawName && rawName !== '/' && rawName !== '.') {
      return sanitizeFileName(rawName);
    }
  } catch {
    // Ignore URL parse errors and use fallback filename.
  }
  return fallback;
}

/**
 * 获取不冲突的输出路径
 */
function getUniqueFilePath(dirPath: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dirPath, filename);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dirPath, `${base}_${counter}${ext}`);
    counter += 1;
  }

  return candidate;
}

/**
 * 下载远程文件到本地
 */
async function downloadRemoteFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const fileData = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, fileData);
}

/**
 * 获取调试反馈输出根目录
 */
function getDebugFeedbackRootDir(ctx?: ResolvedContext): string {
  const basePath = resolveWorkPath(undefined, ctx);
  return path.join(basePath, DEBUG_FEEDBACK_ROOT);
}

/**
 * 生成 AI 调试上下文文本
 */
function buildDebugPromptContent(
  feedback: FeedbackInfo,
  appInfo: {
    developerId: number;
    appId: number;
    appTitle?: string;
    miniappId?: string;
  },
  files: DownloadedFeedbackFiles
): string {
  const screenshotLines =
    files.screenshotPaths.length > 0
      ? files.screenshotPaths.map((item) => `- ${item}`).join('\n')
      : '- 无截图文件';
  const logLines =
    files.logPaths.length > 0
      ? files.logPaths.map((item) => `- ${item}`).join('\n')
      : '- 无日志文件';

  return `# Debug Feedback Context

## App Info
- app_id: ${appInfo.appId}
- app_title: ${appInfo.appTitle ?? ''}
- developer_id: ${appInfo.developerId}
- miniapp_id: ${appInfo.miniappId ?? ''}

## Feedback Info
- feedback_id: ${feedback.feedback_id}
- version_id: ${feedback.version_id}
- status: ${feedback.status} (${MESSAGES.DEBUG_FEEDBACK_STATUS_TEXT(feedback.status)})
- description: ${feedback.description || '（无描述）'}
- runtime_version: ${feedback.runtime_version || '未知'}
- device_model: ${feedback.device_model || '未知'}
- fps: ${feedback.fps}
- memory_usage_mb: ${feedback.memory_usage_mb}

## Artifacts
### Screenshots
${screenshotLines}

### Log Files
${logLines}

## Suggested Debug Steps
1. First inspect screenshots to reproduce the visual issue.
2. Correlate user description with runtime metrics (fps/memory/device).
3. Inspect log files to identify stack traces, warnings, or timing anomalies.
4. Locate related gameplay logic and create a minimal code fix.
`;
}

/**
 * 下载单条反馈的附件，并写入反馈 JSON 与调试上下文文件
 */
async function saveDebugFeedbackFiles(
  feedback: FeedbackInfo,
  appInfo: {
    developerId: number;
    appId: number;
    appTitle?: string;
    miniappId?: string;
  },
  ctx?: ResolvedContext
): Promise<DownloadedFeedbackFiles> {
  const rootDir = getDebugFeedbackRootDir(ctx);
  const feedbackDir = path.join(rootDir, `feedback_${feedback.feedback_id}`);
  ensureDir(feedbackDir);

  const files: DownloadedFeedbackFiles = {
    feedbackDir,
    screenshotPaths: [],
    logPaths: [],
    failedDownloads: [],
  };

  // 1) 保存反馈 JSON
  const feedbackJsonPath = path.join(feedbackDir, 'feedback.json');
  fs.writeFileSync(feedbackJsonPath, JSON.stringify(feedback, null, 2), 'utf-8');
  files.feedbackJsonPath = feedbackJsonPath;

  // 2) 下载截图
  if (feedback.screenshots && feedback.screenshots.length > 0) {
    const screenshotDir = path.join(feedbackDir, 'screenshots');
    ensureDir(screenshotDir);
    for (const [index, screenshotUrl] of feedback.screenshots.entries()) {
      const fallbackName = `screenshot_${index + 1}.png`;
      const filename = inferFilenameFromUrl(screenshotUrl, fallbackName);
      const outputPath = getUniqueFilePath(screenshotDir, filename);
      try {
        await downloadRemoteFile(screenshotUrl, outputPath);
        files.screenshotPaths.push(outputPath);
      } catch (error) {
        files.failedDownloads.push(
          MESSAGES.DEBUG_FEEDBACK_DOWNLOAD_FAILED(
            screenshotUrl,
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    }
  }

  // 3) 下载日志文件
  if (feedback.log_file_urls && feedback.log_file_urls.length > 0) {
    const logDir = path.join(feedbackDir, 'logs');
    ensureDir(logDir);
    for (const [index, logUrl] of feedback.log_file_urls.entries()) {
      const fallbackName = `log_${index + 1}.txt`;
      const filename = inferFilenameFromUrl(logUrl, fallbackName);
      const outputPath = getUniqueFilePath(logDir, filename);
      try {
        await downloadRemoteFile(logUrl, outputPath);
        files.logPaths.push(outputPath);
      } catch (error) {
        files.failedDownloads.push(
          MESSAGES.DEBUG_FEEDBACK_DOWNLOAD_FAILED(
            logUrl,
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    }
  }

  // 4) 写调试上下文 prompt
  const promptPath = path.join(feedbackDir, 'debug_prompt.md');
  const promptContent = buildDebugPromptContent(feedback, appInfo, files);
  fs.writeFileSync(promptPath, promptContent, 'utf-8');
  files.promptPath = promptPath;

  return files;
}

/**
 * 拉取用户调试反馈
 */
export async function handleGetDebugFeedbacks(
  args: GetDebugFeedbacksArgs,
  ctx?: ResolvedContext
): Promise<string> {
  const appInfo = getSelectedAppInfo(ctx);
  if (!appInfo.success) {
    return appInfo.message!;
  }

  const limit = normalizeDebugFeedbackLimit(args.limit);
  const status = normalizeDebugFeedbackStatus(args.status);
  const fetchAndMarkProcessed = args.fetch_and_mark_processed ?? true;
  const downloadAssets = args.download_assets ?? true;

  const request: GetDebugFeedbacksRequest = {
    developer_id: appInfo.developerId!,
    app_id: appInfo.appId!,
    limit,
    status,
    fetch_and_mark_processed: fetchAndMarkProcessed,
  };

  const response = await getDebugFeedbacks(request, ctx);
  const feedbackList = response.list || [];
  const outputRoot = getDebugFeedbackRootDir(ctx);

  if (feedbackList.length === 0) {
    let msg = MESSAGES.DEBUG_FEEDBACK_NO_NEW;
    msg += `\n\n筛选总数：${response.total ?? 0}`;
    msg += `\n应用：${appInfo.appTitle ?? ''} (ID: ${appInfo.appId})`;
    msg += `\n下载目录：${outputRoot}`;
    return msg;
  }

  ensureDir(outputRoot);

  const lines: string[] = [];
  lines.push(
    `成功拉取了 ${feedbackList.length} 条用户反馈${fetchAndMarkProcessed ? '（并已标记为已处理）' : ''}。`
  );
  lines.push(`筛选总数：${response.total ?? feedbackList.length}`);
  lines.push(`应用：${appInfo.appTitle ?? ''} (ID: ${appInfo.appId})`);
  lines.push(`反馈输出目录：${outputRoot}`);
  lines.push('');

  for (const feedback of feedbackList) {
    let files: DownloadedFeedbackFiles = {
      feedbackDir: path.join(outputRoot, `feedback_${feedback.feedback_id}`),
      screenshotPaths: [],
      logPaths: [],
      failedDownloads: [],
    };

    if (downloadAssets) {
      files = await saveDebugFeedbackFiles(
        feedback,
        {
          developerId: appInfo.developerId!,
          appId: appInfo.appId!,
          appTitle: appInfo.appTitle,
          miniappId: appInfo.miniappId,
        },
        ctx
      );
    }

    lines.push(`反馈 #${feedback.feedback_id}`);
    lines.push(`- 描述：${feedback.description || '（无描述）'}`);
    lines.push(`- 设备：${feedback.device_model || '未知设备'}`);
    lines.push(`- FPS：${feedback.fps}`);
    lines.push(`- 内存：${feedback.memory_usage_mb} MB`);
    lines.push(`- 引擎版本：${feedback.runtime_version || '未知'}`);
    lines.push(`- 状态：${MESSAGES.DEBUG_FEEDBACK_STATUS_TEXT(feedback.status)}`);
    lines.push(`- 截图：${feedback.screenshots?.length ?? 0} 张`);
    lines.push(`- 日志文件：${feedback.log_file_urls?.length ?? 0} 个`);
    if (downloadAssets) {
      lines.push(`- 已下载目录：${files.feedbackDir}`);
      if (files.promptPath) {
        lines.push(`- 调试上下文：${files.promptPath}`);
      }
      if (files.failedDownloads.length > 0) {
        lines.push(`- 下载失败：${files.failedDownloads.length} 个`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
