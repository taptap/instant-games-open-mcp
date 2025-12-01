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
import {
  getAllDevelopersAndApps,
  createDeveloper,
  createAppForDeveloper,
  editAppInfo,
  getAppDetail,
} from '../app/api.js';
import { readAppCache, saveAppCache, type AppCacheInfo } from '../../core/utils/cache.js';
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
 * 基础信息确认逻辑（使用统一缓存系统）
 */
async function confirmInfo(
  projectPath: string,
  developerId?: number,
  appId?: number,
  genre?: string,
  ctx?: ResolvedContext
): Promise<{ success: boolean; message: string; developerId?: number; appId?: number }> {
  // 如果用户提供了开发者身份 ID 和游戏 ID, 直接返回
  if (developerId && appId) {
    return {
      success: true,
      message: '',
      developerId,
      appId,
    };
  }

  // 尝试从缓存读取
  const cached = readAppCache(projectPath);
  if (!developerId && cached?.developer_id) {
    developerId = cached.developer_id;
  }
  if (!appId && cached?.app_id) {
    appId = cached.app_id;
  }

  // 如果都有了，直接返回
  if (developerId && appId) {
    return {
      success: true,
      message: '',
      developerId,
      appId,
    };
  }

  // 2. 游戏信息确认
  let resultMsg = '';
  if (!developerId) {
    const response = await getAllDevelopersAndApps(ctx);
    const results = response.list;

    // 2.1. 开发者身份信息存在
    if (results && results.length > 0) {
      if (results.length === 1 && results[0].levels.length <= 1) {
        // 只有一个开发者身份, 直接选择
        developerId = results[0].developer_id;
        if (results[0].levels.length === 1) {
          appId = results[0].levels[0].app_id;
        }
      } else {
        const msg = MESSAGES.SELECT_DEVELOPER_OR_GAME(results);
        return { success: false, message: msg };
      }
    } else {
      // 2.2. 开发者身份信息不存在, 创建开发者身份
      const createDevResult = await createDeveloper(ctx);
      if (createDevResult && createDevResult.developer_id) {
        developerId = createDevResult.developer_id;

        const appResults = await createAppForDeveloper(
          createDevResult.developer_id,
          undefined,
          genre,
          ctx
        );
        if (appResults && appResults.app_id) {
          appId = appResults.app_id;
          resultMsg = MESSAGES.GAME_TYPE_INFO(appResults.display_app_title);
        }
        return {
          success: true,
          message: resultMsg,
          developerId,
          appId,
        };
      } else {
        return { success: false, message: MESSAGES.CREATE_DEVELOPER_FAILED };
      }
    }
  }

  // 如果有 developerId 但没有游戏, 自动创建一个游戏
  if (developerId && !appId) {
    const appResults = await createAppForDeveloper(developerId, undefined, genre, ctx);
    if (appResults && appResults.app_id) {
      appId = appResults.app_id;
      resultMsg = MESSAGES.GAME_TYPE_INFO(appResults.display_app_title);
    }
  }

  return {
    success: true,
    message: resultMsg,
    developerId,
    appId,
  };
}

/**
 * 收集 H5 游戏信息
 */
export async function handleGatherGameInfo(
  args: {
    gamePath?: string; // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    developerName?: string;
    developerId?: number;
    appId?: number;
    genre?: string;
  },
  ctx?: ResolvedContext
): Promise<string> {
  // 1. 使用通用路径解析器（允许空路径，因为空路径可能意味着当前目录有 index.html）
  const pathResult = resolvePathSafe(args.gamePath, ctx, { allowEmpty: true, checkExists: true });

  // 2. H5 业务特定验证（index.html 检查）
  const validationError = validateH5GamePath(pathResult, true);
  if (validationError) {
    throw new Error(validationError);
  }

  const gamePath = pathResult.resolvedPath!;

  // 基础信息确认
  const confirmResult = await confirmInfo(gamePath, args.developerId, args.appId, args.genre, ctx);

  if (!confirmResult.success) {
    return confirmResult.message;
  }

  // 保存到统一缓存
  const cacheInfo: AppCacheInfo = {
    developer_id: confirmResult.developerId,
    app_id: confirmResult.appId,
  };

  // 获取游戏详情
  if (confirmResult.appId) {
    const appDetail = await getAppDetail(confirmResult.appId);
    if (appDetail) {
      cacheInfo.developer_name = appDetail.developerName;
      cacheInfo.app_title = appDetail.appTitle;
    }
  }

  saveAppCache(cacheInfo, gamePath);

  const msg = MESSAGES.CONFIRM_GAME_INFO(
    gamePath,
    cacheInfo.developer_name || args.developerName,
    cacheInfo.developer_id,
    cacheInfo.app_id,
    cacheInfo.app_title
  );

  return msg;
}

/**
 * 上传 H5 游戏
 */
export async function handleUploadGame(
  args: {
    gamePath?: string; // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    developerName?: string;
    developerId?: number;
    appId?: number;
    appName?: string;
    genre?: string;
  },
  ctx?: ResolvedContext
): Promise<string> {
  // 1. 使用通用路径解析器（允许空路径，上传时不强制 index.html 检查）
  const pathResult = resolvePathSafe(args.gamePath, ctx, { allowEmpty: true, checkExists: true });

  // 2. H5 业务特定验证（上传时不强制要求 index.html，因为可能在后续压缩时检查）
  const validationError = validateH5GamePath(pathResult, false);
  if (validationError) {
    throw new Error(validationError);
  }

  const gamePath = pathResult.resolvedPath!;

  // 从缓存读取或使用传入的参数
  const cacheInfo = readAppCache(gamePath) || {};

  if (args.developerId) {
    cacheInfo.developer_id = args.developerId;
    cacheInfo.developer_name = args.developerName;
  }
  if (args.appId && args.appId !== cacheInfo.app_id) {
    cacheInfo.app_id = args.appId;
    cacheInfo.app_title = args.appName;
  }

  if (!cacheInfo.developer_id || !cacheInfo.app_id) {
    throw new Error(MESSAGES.DEVELOPER_ID_NOT_EXISTS);
  }

  // 保存缓存
  saveAppCache(cacheInfo, gamePath);

  // 生成临时 ZIP 文件路径（独立于 workspace）
  const outputPath = getTempZipPath(gamePath);

  try {
    // 1. 压缩目录
    const archiveSize = await compressDirectory(gamePath, outputPath);
    await logger.info(MESSAGES.COMPRESSION_SUCCESS(archiveSize));

    // 2. 获取上传参数
    let uploadParams: UploadParams;
    try {
      uploadParams = await getH5PackageUploadParams(cacheInfo.app_id, ctx);
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
    await logger.info(MESSAGES.PUBLISH_PARAMS(cacheInfo.app_id, cacheInfo.developer_id, packageId));

    const results = await editAppInfo(
      cacheInfo.app_id, // app_id
      cacheInfo.developer_id, // developer_id
      packageId, // package_id
      undefined, // appName
      args.genre, // genre
      undefined, // description
      undefined, // chatting_label
      undefined, // chatting_number
      undefined, // screen_orientation
      ctx // ctx
    );

    let msg = MESSAGES.GAME_PUBLISH_SUCCESS(results.app_title, cacheInfo.app_id);
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
