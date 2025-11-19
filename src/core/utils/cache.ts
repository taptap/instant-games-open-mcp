/**
 * Local cache utilities for storing app configuration
 *
 * 架构设计：
 * - workspace 目录：用户代码（只读挂载）
 * - 缓存目录：独立于 workspace，可写（通过环境变量配置）
 * - 租户隔离：通过 projectPath（租户标识符）隔离不同租户的缓存
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { getEnv } from './env.js';

/**
 * 缓存根目录（独立于 workspace）
 * 优先级：环境变量 > 默认值
 */
const CACHE_ROOT = getEnv('TAPTAP_MCP_CACHE_DIR') || path.join(os.tmpdir(), 'taptap-mcp', 'cache');

/**
 * Cached application information
 */
export interface AppCacheInfo {
  developer_id?: number;
  developer_name?: string;
  app_id?: number;
  app_title?: string;
  miniapp_id?: string;  // Minigame/H5 预览 ID，用于构建预览链接
  cached_at?: number;
}

/**
 * Get cache file path for minigame leaderboard
 *
 * 设计说明：
 * - projectPath 现在是租户标识符（如 "/workspace/user-123/project-456" 或 "user-123/project-456"）
 * - 缓存文件存储在独立的缓存目录，不在 workspace 中
 * - 支持绝对路径和相对路径（自动提取租户部分）
 *
 * @param projectPath - 租户标识符（绝对路径或相对路径）
 * @returns 缓存文件的绝对路径
 *
 * @example
 * ```typescript
 * // 绝对路径（Proxy 传入）
 * getCachePath('/workspace/user-123/project-456')
 * // => '/tmp/taptap-mcp/cache/user-123/project-456/app.json'
 *
 * // 相对路径（向后兼容）
 * getCachePath('user-123/project-456')
 * // => '/tmp/taptap-mcp/cache/user-123/project-456/app.json'
 *
 * // 全局缓存
 * getCachePath()
 * // => '/tmp/taptap-mcp/cache/global/app.json'
 * ```
 */
export function getCachePath(projectPath?: string): string {
  if (projectPath) {
    // 提取租户标识符（去除 workspace 前缀）
    let tenantId: string;

    if (path.isAbsolute(projectPath)) {
      // 绝对路径：提取最后两层（userId/projectId）
      const parts = projectPath.split(path.sep).filter(Boolean);
      tenantId = parts.slice(-2).join(path.sep);
    } else {
      // 相对路径：直接使用
      tenantId = projectPath;
    }

    // 缓存路径：CACHE_ROOT/tenantId/app.json
    return path.join(CACHE_ROOT, tenantId, 'app.json');
  } else {
    // 全局缓存
    return path.join(CACHE_ROOT, 'global', 'app.json');
  }
}

/**
 * Read cached app information
 */
export function readAppCache(projectPath?: string): AppCacheInfo | null {
  const cachePath = getCachePath(projectPath);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(content) as AppCacheInfo;

    // Validate cache has required fields
    if (cache.developer_id && cache.app_id) {
      return cache;
    }

    return null;
  } catch (error) {
    console.error('Failed to read cache:', error);
    return null;
  }
}

/**
 * Save app information to cache
 */
export function saveAppCache(info: AppCacheInfo, projectPath?: string): void {
  const cachePath = getCachePath(projectPath);
  const cacheDir = path.dirname(cachePath);

  try {
    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Add timestamp
    const cacheData: AppCacheInfo = {
      ...info,
      cached_at: Date.now()
    };

    // Write to file
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
}

/**
 * Clear cached app information
 */
export function clearAppCache(projectPath?: string): void {
  const cachePath = getCachePath(projectPath);

  if (fs.existsSync(cachePath)) {
    try {
      fs.unlinkSync(cachePath);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

/**
 * Check if cache is valid (exists and has required fields)
 */
export function isCacheValid(projectPath?: string): boolean {
  const cache = readAppCache(projectPath);
  return !!(cache && cache.developer_id && cache.app_id);
}
