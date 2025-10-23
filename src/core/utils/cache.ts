/**
 * Local cache utilities for storing app configuration
 * Separate cache file from tapcode-mcp-h5 to avoid conflicts
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

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
 * Uses different directory from tapcode-mcp-h5 to avoid conflicts
 */
export function getCachePath(projectPath?: string): string {
  if (projectPath) {
    // Project-specific cache
    const normalizedPath = projectPath.endsWith('/') ? projectPath : projectPath + '/';
    return path.join(normalizedPath, '.taptap-minigame', 'app.json');
  } else {
    // Global cache in user home directory
    const home = os.homedir();
    return path.join(home, '.config', 'taptap-minigame', 'app.json');
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
