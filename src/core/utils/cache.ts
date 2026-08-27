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
import { execFileSync } from 'node:child_process';
import { EnvConfig } from './env.js';

/**
 * 缓存根目录（独立于 workspace）
 * 优先级：环境变量 > 默认值
 */
const CACHE_ROOT = EnvConfig.cacheDir;
const CACHE_LOCK_RETRY_MS = 10;
const CACHE_READ_LOCK_TIMEOUT_MS = 500;
const CACHE_LOCK_TIMEOUT_MS = 5000;
const CACHE_LOCK_STALE_MS = 30000;
const CACHE_LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

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

  // 广告配置信息（v1.x.x+）
  ad_config_request_id?: string; // 当前广告状态查询 ID，用于跨进程丢弃过期响应
  ad_config?: {
    status: number; // 广告状态：0=未开通, 1=已生效, 2=已封禁
    landscape_space_id?: string; // 横屏广告位ID（type=1）
    portrait_space_id?: string; // 竖屏广告位ID（type=2）
    url?: string; // 引导URL（仅状态非"已生效"时有）
    updated_at: number; // 更新时间戳
    request_id?: string; // 生成此配置的广告状态查询 ID
  };

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

function readAppCacheFile(cachePath: string): AppCacheInfo | null {
  if (!fs.existsSync(cachePath)) return null;

  const content = fs.readFileSync(cachePath, 'utf8');
  const cache = JSON.parse(content) as AppCacheInfo;
  return cache.developer_id && cache.app_id ? cache : null;
}

function readAppCacheForMutation(cachePath: string): AppCacheInfo | null {
  try {
    return readAppCacheFile(cachePath);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isFileSystemError(error, 'ESRCH')) return false;
    return true;
  }
}

interface AppCacheLockOwner {
  pid: number;
  holds_open?: boolean;
  process_start?: string;
}

let currentProcessStartFingerprint: string | null | undefined;

function getProcessStartFingerprint(pid: number): string | null {
  if (process.platform !== 'win32') return null;

  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000,
        windowsHide: true,
      }
    ).trim();
  } catch {
    return null;
  }
}

function getCurrentProcessStartFingerprint(): string | null {
  if (currentProcessStartFingerprint === undefined) {
    currentProcessStartFingerprint = getProcessStartFingerprint(process.pid);
  }
  return currentProcessStartFingerprint;
}

function parseAppCacheLockOwner(content: string): AppCacheLockOwner | null {
  try {
    const parsed = JSON.parse(content) as Partial<AppCacheLockOwner>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Number.isInteger(parsed.pid) &&
      parsed.pid! > 0
    ) {
      return {
        pid: parsed.pid!,
        holds_open: parsed.holds_open === true,
        process_start:
          typeof parsed.process_start === 'string' && parsed.process_start
            ? parsed.process_start
            : undefined,
      };
    }
  } catch {
    // 继续尝试兼容旧版纯数字 PID owner。
  }

  const legacyPid = Number(content);
  if (Number.isInteger(legacyPid) && legacyPid > 0) return { pid: legacyPid };
  return null;
}

function processHoldsAppCacheOwner(owner: AppCacheLockOwner, ownerPath: string): boolean | null {
  if (!owner.holds_open) return null;

  if (process.platform === 'linux') {
    try {
      const expectedPath = fs.realpathSync(ownerPath);
      const fdDir = `/proc/${owner.pid}/fd`;
      for (const fd of fs.readdirSync(fdDir)) {
        try {
          if (fs.realpathSync(path.join(fdDir, fd)) === expectedPath) return true;
        } catch (error) {
          if (!isFileSystemError(error, 'ENOENT')) throw error;
        }
      }
      return false;
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) return false;
      return null;
    }
  }

  if (process.platform === 'darwin') {
    try {
      execFileSync('/usr/sbin/lsof', ['-a', '-p', String(owner.pid), '-Fn', '--', ownerPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000,
      });
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
        return false;
      }
      return null;
    }
  }

  if (process.platform === 'win32' && owner.process_start) {
    const processStart = getProcessStartFingerprint(owner.pid);
    return processStart ? processStart === owner.process_start : null;
  }

  return null;
}

function removeEmptyAppCacheLock(lockPath: string): boolean {
  try {
    fs.rmdirSync(lockPath);
    return true;
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT') || isFileSystemError(error, 'ENOTEMPTY')) {
      return false;
    }
    throw error;
  }
}

function tryRecoverAppCacheLock(lockPath: string): boolean {
  try {
    const ownerFiles = fs.readdirSync(lockPath);
    if (ownerFiles.length === 0) {
      const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs;
      return lockAge > CACHE_LOCK_STALE_MS && removeEmptyAppCacheLock(lockPath);
    }
    if (ownerFiles.length !== 1) return false;

    const ownerPath = path.join(lockPath, ownerFiles[0]);
    const ownerAge = Date.now() - fs.statSync(ownerPath).mtimeMs;
    const owner = parseAppCacheLockOwner(fs.readFileSync(ownerPath, 'utf8'));
    if (owner) {
      if (isProcessAlive(owner.pid)) {
        const holdsOwner = processHoldsAppCacheOwner(owner, ownerPath);
        if (holdsOwner !== false) return false;
      }
    } else if (ownerAge <= CACHE_LOCK_STALE_MS) {
      return false;
    }

    // unlink 是回收旧 owner 的原子抢占点，避免两个回收者误删后来创建的新锁。
    try {
      fs.unlinkSync(ownerPath);
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) return false;
      throw error;
    }
    return removeEmptyAppCacheLock(lockPath);
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) return false;
    throw error;
  }
}

function acquireAppCacheLock(
  cachePath: string,
  timeoutMs: number = CACHE_LOCK_TIMEOUT_MS
): () => void {
  const cacheDir = path.dirname(cachePath);
  const lockPath = `${cachePath}.lock`;
  const deadline = Date.now() + timeoutMs;
  fs.mkdirSync(cacheDir, { recursive: true });

  for (;;) {
    const ownerToken = crypto.randomUUID();
    const ownerPath = path.join(lockPath, ownerToken);
    let ownerFd: number | undefined;
    try {
      fs.mkdirSync(lockPath);
      try {
        ownerFd = fs.openSync(ownerPath, 'wx');
        const owner: AppCacheLockOwner = {
          pid: process.pid,
          holds_open: true,
          process_start: getCurrentProcessStartFingerprint() ?? undefined,
        };
        fs.writeFileSync(ownerFd, JSON.stringify(owner), 'utf8');
      } catch (error) {
        if (ownerFd !== undefined) {
          fs.closeSync(ownerFd);
          ownerFd = undefined;
        }
        try {
          fs.unlinkSync(ownerPath);
        } catch (cleanupError) {
          if (!isFileSystemError(cleanupError, 'ENOENT')) throw cleanupError;
        }
        try {
          fs.rmdirSync(lockPath);
        } catch (cleanupError) {
          if (
            !isFileSystemError(cleanupError, 'ENOENT') &&
            !isFileSystemError(cleanupError, 'ENOTEMPTY')
          ) {
            throw cleanupError;
          }
        }
        if (isFileSystemError(error, 'ENOENT')) continue;
        throw error;
      }

      return () => {
        if (ownerFd !== undefined) {
          fs.closeSync(ownerFd);
          ownerFd = undefined;
        }
        try {
          fs.unlinkSync(ownerPath);
        } catch (error) {
          if (isFileSystemError(error, 'ENOENT')) return;
          throw error;
        }
        removeEmptyAppCacheLock(lockPath);
      };
    } catch (error) {
      if (!isFileSystemError(error, 'EEXIST')) throw error;

      if (tryRecoverAppCacheLock(lockPath)) continue;

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for app cache lock: ${lockPath}`);
      }
      Atomics.wait(CACHE_LOCK_WAIT_BUFFER, 0, 0, CACHE_LOCK_RETRY_MS);
    }
  }
}

function writeAppCacheFile(
  info: AppCacheInfo,
  cachePath: string,
  isolationKey: string,
  existingMeta?: CacheMetadata
): AppCacheInfo {
  const cacheData: AppCacheInfo = {
    _meta: {
      source_path: isolationKey,
      tenant_id: computeTenantId(isolationKey),
      created_at: existingMeta?.created_at || Date.now(),
    },
    ...info,
    cached_at: Date.now(),
  };

  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  return cacheData;
}

/**
 * 在单个租户缓存的跨进程短事务中执行同步读改写。
 * updater 返回 undefined 表示不修改，null 表示删除缓存。
 */
export function mutateAppCache(
  projectPath: string | undefined,
  updater: (current: AppCacheInfo | null) => AppCacheInfo | null | undefined
): AppCacheInfo | null {
  const cachePath = getCachePath(projectPath);
  const isolationKey = getIsolationKey(projectPath);
  const releaseLock = acquireAppCacheLock(cachePath);

  try {
    const current = readAppCacheForMutation(cachePath);
    const next = updater(current);
    if (next === undefined) return current;
    if (next === null) {
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      return null;
    }
    return writeAppCacheFile(next, cachePath, isolationKey, current?._meta);
  } finally {
    releaseLock();
  }
}

/**
 * Read cached app information
 */
export function readAppCache(projectPath?: string): AppCacheInfo | null {
  const cachePath = getCachePath(projectPath);
  let releaseLock: (() => void) | undefined;

  try {
    releaseLock = acquireAppCacheLock(cachePath, CACHE_READ_LOCK_TIMEOUT_MS);
    return readAppCacheFile(cachePath);
  } catch (error) {
    console.error('Failed to read cache:', error);
    return null;
  } finally {
    releaseLock?.();
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
  try {
    mutateAppCache(projectPath, () => info);
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
}

/**
 * Clear cached app information
 */
export function clearAppCache(projectPath?: string): void {
  try {
    mutateAppCache(projectPath, () => null);
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

/**
 * Check if cache is valid (exists and has required fields)
 */
export function isCacheValid(projectPath?: string): boolean {
  const cache = readAppCache(projectPath);
  return !!(cache && cache.developer_id && cache.app_id);
}
