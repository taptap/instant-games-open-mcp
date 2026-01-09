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
import { getH5PackageUploadParams, type UploadParams } from './api.js';
import { editAppInfo, refreshAppCache } from '../app/api.js';
import { readAppCache } from '../../core/utils/cache.js';
import { logger } from '../../core/utils/logger.js';
import { resolvePathSafe, type PathResolutionResult } from '../../core/utils/pathResolver.js';
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
