/**
 * Local cache utilities for storing app configuration
 *
 * 架构设计：
 * - workspace 目录：用户代码（只读挂载）
 * - 缓存目录：独立于 workspace，可写（通过环境变量配置）
 * - 租户隔离：通过 projectPath（租户标识符）隔离不同租户的缓存
 *
 * 缓存隔离策略（v1.14.0+）：
 * - 使用完整路径的 SHA256 hash 前 12 位作为租户 ID
 * - 避免了路径最后两层重复导致的冲突
 * - 在缓存文件中保存原始路径元数据，便于调试
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { EnvConfig } from './env.js';

/**
 * 缓存根目录（独立于 workspace）
 * 优先级：环境变量 > 默认值
 */
const CACHE_ROOT = EnvConfig.cacheDir;

/**
 * 版本信息（线上版本或审核版本）
 * 对应 /level/v1/latest 接口返回的 level 或 upload_level 字段
 */
export interface CachedLevelInfo {
  // 基础标识
  id?: number; // 版本 ID
  app_id: number;
  app_title: string;
  developer_id?: number;
  developer_name?: string;
  miniapp_id?: string;

  // 版本信息
  version?: string;
  status: number; // 版本状态

  // 表单数据（upload_level 特有）
  form_data?: {
    info: {
      title: string;
      description?: string;
      category?: string;
      screen_orientation?: number;
      icon?: string;
      banner?: string;
      screenshots?: string[];
      trial_note?: string;
    };
  };

  // 展示数据（level 特有）
  data?: {
    title: string;
    description?: string;
    category?: string;
    screen_orientation?: number;
    icon?: string;
    banner?: string;
    screenshots?: string[];
    trial_note?: string;
  };
}

/**
 * 缓存元数据（用于调试和追溯）
 */
export interface CacheMetadata {
  source_path: string; // 原始路径（用于调试）
  tenant_id: string; // 计算出的租户 ID
  created_at: number; // 首次创建时间
}

/**
 * Cached application information
 */
export interface AppCacheInfo {
  // 缓存元数据（v1.14.0+）
  _meta?: CacheMetadata;

  // 基础标识信息 (Backward Compatibility)
  developer_id?: number;
  developer_name?: string;
  app_id?: number;
  app_title?: string;
  miniapp_id?: string;

  // 详细版本信息
  level?: CachedLevelInfo; // 线上版本完整详情
  upload_level?: CachedLevelInfo; // 审核版本完整详情

  // 缓存时效控制
  updated_at?: number; // 基础信息更新时间戳
  status_updated_at?: number; // 状态/审核进度更新时间戳

  // 缓存状态标记
  is_stale?: boolean; // 刷新失败时标记数据已陈旧

  cached_at?: number; // Legacy timestamp
}

/**
 * 计算路径的 SHA256 hash 前 12 位作为租户 ID
 *
 * 优点：
 * - 相同路径永远得到相同的 hash（稳定性）
 * - 不同路径几乎不可能冲突（SHA256 的 12 位 = 48 bit，冲突概率极低）
 * - 路径变化时缓存自动失效（符合预期）
 *
 * @example
 * "/Users/mikoto/projects/game-a" → "a1b2c3d4e5f6"
 * "/Users/john/projects/game-a"   → "x7y8z9w0v1u2" (不同！)
 */
function computeTenantId(fullPath: string): string {
  const hash = crypto.createHash('sha256').update(fullPath).digest('hex');
  return hash.substring(0, 12);
}

/**
 * 获取隔离 key（用于计算租户 ID）
 *
 * 优先级：
 * 1. projectPath（SSE + Proxy 模式，由 Proxy 注入）
 * 2. workspaceRoot（stdio / SSE 直连模式，从环境变量或 cwd 获取）
 */
function getIsolationKey(projectPath?: string): string {
  return projectPath || EnvConfig.workspaceRoot;
}

/**
 * Get cache file path for minigame leaderboard
 *
 * 设计说明（v1.14.0+）：
 * - 使用完整路径的 SHA256 hash 前 12 位作为租户 ID
 * - 避免了路径最后两层重复导致的冲突
 * - 缓存隔离策略：
 *   1. SSE + Proxy 模式：使用 projectPath（由 Proxy 注入的租户标识符）
 *   2. stdio / SSE 直连模式：使用 workspaceRoot（项目根目录）
 *
 * @param projectPath - 租户标识符（SSE+Proxy 模式由 Proxy 注入）
 * @returns 缓存文件的绝对路径
 *
 * @example
 * ```typescript
 * // SSE + Proxy 模式：使用 projectPath
 * getCachePath('user-123/project-456')
 * // => '/tmp/taptap-mcp/cache/a1b2c3d4e5f6/app.json'
 *
 * // stdio / SSE 直连模式：使用 workspaceRoot
 * // workspaceRoot = '/Users/mikoto/projects/game-a'
 * getCachePath()
 * // => '/tmp/taptap-mcp/cache/x7y8z9w0v1u2/app.json'
 *
 * // 不同用户，相同项目名，不会冲突
 * // /Users/john/projects/game-a → 不同的 hash
 * ```
 */
export function getCachePath(projectPath?: string): string {
  const isolationKey = getIsolationKey(projectPath);
  const tenantId = computeTenantId(isolationKey);
  return path.join(CACHE_ROOT, tenantId, 'app.json');
}

/**
 * 获取当前的租户 ID（用于日志和调试）
 */
export function getTenantId(projectPath?: string): string {
  const isolationKey = getIsolationKey(projectPath);
  return computeTenantId(isolationKey);
}

/**
 * 获取隔离 key 的原始值（用于元数据）
 */
export function getIsolationKeyValue(projectPath?: string): string {
  return getIsolationKey(projectPath);
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
 *
 * 自动添加元数据用于调试：
 * - source_path: 原始隔离 key
 * - tenant_id: 计算出的租户 ID（hash）
 * - created_at: 首次创建时间
 */
export function saveAppCache(info: AppCacheInfo, projectPath?: string): void {
  const cachePath = getCachePath(projectPath);
  const cacheDir = path.dirname(cachePath);
  const isolationKey = getIsolationKey(projectPath);
  const tenantId = computeTenantId(isolationKey);

  try {
    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 读取现有缓存以保留 created_at
    let existingMeta: CacheMetadata | undefined;
    if (fs.existsSync(cachePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as AppCacheInfo;
        existingMeta = existing._meta;
      } catch {
        // 忽略读取错误
      }
    }

    // 构建缓存数据（包含元数据）
    const cacheData: AppCacheInfo = {
      _meta: {
        source_path: isolationKey,
        tenant_id: tenantId,
        created_at: existingMeta?.created_at || Date.now(),
      },
      ...info,
      cached_at: Date.now(),
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
