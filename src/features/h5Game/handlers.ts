/**
 * H5 Game Handlers
 * Business logic for H5 game operations (gather info, upload, create, edit, etc.)
 * Uses unified cache system from core/utils/cache.ts
 * Uses common APIs from app/api.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import archiver from 'archiver';
import { MESSAGES } from './messages.js';
import { getH5PackageUploadParams, type UploadParams } from './api.js';
import {
  getAllDevelopersAndApps,
  createDeveloper,
  createAppForDeveloper,
  editAppInfo,
  getAppDetail,
  type DeveloperCraftList,
} from '../app/api.js';
import { readAppCache, saveAppCache, type AppCacheInfo } from '../../core/utils/cache.js';
import { logger } from '../../core/utils/logger.js';
import { resolveWorkPath } from '../../core/utils/pathResolver.js';
import { EnvConfig } from '../../core/utils/env.js';

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
  context?: import('../../core/types/index.js').RequestContext
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
    const response = await getAllDevelopersAndApps(context);
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
      const createDevResult = await createDeveloper(context);
      if (createDevResult && createDevResult.developer_id) {
        developerId = createDevResult.developer_id;

        const appResults = await createAppForDeveloper(createDevResult.developer_id, undefined, genre, context);
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
    const appResults = await createAppForDeveloper(developerId, undefined, genre);
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
    gamePath?: string;  // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    developerName?: string;
    developerId?: number;
    appId?: number;
    genre?: string;
  },
  context?: import('../../core/types/index.js').RequestContext
): Promise<string> {
  // 使用统一路径解析器
  const gamePath = resolveWorkPath(args.gamePath, context);

  // 确保目录存在且包含 index.html 文件
  if (!fs.existsSync(gamePath) || !fs.existsSync(path.join(gamePath, 'index.html'))) {
    throw new Error(MESSAGES.GAME_PATH_ERROR(gamePath));
  }

  // 基础信息确认
  const confirmResult = await confirmInfo(
    gamePath,
    args.developerId,
    args.appId,
    args.genre,
    context
  );

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

  let msg = MESSAGES.CONFIRM_GAME_INFO(
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
    gamePath?: string;  // 相对路径，相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
    developerName?: string;
    developerId?: number;
    appId?: number;
    appName?: string;
    genre?: string;
  },
  context?: import('../../core/types/index.js').RequestContext
): Promise<string> {
  // 使用统一路径解析器
  const gamePath = resolveWorkPath(args.gamePath, context);

  // 从缓存读取或使用传入的参数
  let cacheInfo = readAppCache(gamePath) || {};

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

  // 确保源目录存在
  if (!fs.existsSync(gamePath)) {
    throw new Error(MESSAGES.DIRECTORY_NOT_EXISTS(gamePath));
  }

  // 生成临时 ZIP 文件路径（独立于 workspace）
  const outputPath = getTempZipPath(gamePath);

  try {
    // 1. 压缩目录
    const archiveSize = await compressDirectory(gamePath, outputPath);
    await logger.info(MESSAGES.COMPRESSION_SUCCESS(archiveSize));

    // 2. 获取上传参数
    let uploadParams: UploadParams;
    try {
      uploadParams = await getH5PackageUploadParams(cacheInfo.app_id, context);
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
        MESSAGES.FILE_COMPRESSED_UPLOAD_FAILED(error instanceof Error ? error.message : String(error))
      );
    }

    // 4. 发布到 TapTap
    await logger.info(MESSAGES.PUBLISH_PARAMS(cacheInfo.app_id, cacheInfo.developer_id, packageId));

    const results = await editAppInfo(
      cacheInfo.app_id,      // app_id
      cacheInfo.developer_id, // developer_id
      packageId,             // package_id
      undefined,             // appName
      args.genre,            // genre
      undefined,             // description
      undefined,             // chatting_label
      undefined,             // chatting_number
      undefined,             // screen_orientation
      context                // context
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

/**
 * 创建 H5 游戏
 */
export async function handleCreateApp(
  args: {
    developerId?: number;
    appName?: string;
    genre?: string;
  },
  context?: import('../../core/types/index.js').RequestContext
): Promise<string> {
  let developerId = args.developerId;

  if (!developerId) {
    const response = await getAllDevelopersAndApps(context);
    const results = response.list;

    // 开发者身份信息存在
    if (results && results.length > 0) {
      // 只有一个开发者身份，直接选择
      if (results.length === 1) {
        developerId = results[0].developer_id;
      } else {
        return MESSAGES.SELECT_DEVELOPER_FOR_CREATE(results);
      }
    } else {
      // 开发者身份信息不存在，创建开发者身份
      const createDevResult = await createDeveloper(context);
      if (createDevResult && createDevResult.developer_id) {
        developerId = createDevResult.developer_id;
      }
    }
  }

  // 确定开发者身份 id, 创建游戏
  if (!developerId) {
    return MESSAGES.DEVELOPER_ID_NOT_EXISTS;
  }

  const results = await createAppForDeveloper(developerId, args.appName, args.genre, context);
  if (results && results.app_id) {
    return MESSAGES.CREATE_GAME_SUCCESS(
      developerId,
      results.app_id,
      results.app_title,
      results.display_app_title
    );
  } else {
    return MESSAGES.CREATE_GAME_FAILED;
  }
}

/**
 * 编辑 H5 游戏信息
 */
export async function handleEditApp(
  args: {
    developerId?: number;
    appId?: number;
    appName?: string;
    genre?: string;
    description?: string;
    chattingLabel?: string;
    chattingNumber?: string;
    screenOrientation?: number;
  },
  context?: import('../../core/types/index.js').RequestContext
): Promise<string> {
  if (!args.developerId || !args.appId) {
    return MESSAGES.EDIT_GAME_INFO_CONFIRMATION;
  }

  await editAppInfo(
    args.appId,
    args.developerId,
    undefined,                // package_id
    args.appName,
    args.genre,
    args.description,
    args.chattingLabel,
    args.chattingNumber,
    args.screenOrientation,
    context                   // context
  );

  return MESSAGES.EDIT_GAME_INFO_SUCCESS;
}
