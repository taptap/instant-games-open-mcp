/**
 * Token 持久化管理
 * 职责：Token 的读取、保存、清除
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { EnvConfig } from '../utils/env.js';
import type { MacToken } from '../types/index.js';

export interface TokenStorageOptions {
  environment?: string;
  userId?: string;      // 用户标识（用于隔离存储）
  projectId?: string;   // 项目标识（可选，用于项目级隔离）
}

/**
 * 获取 token 文件路径（支持用户隔离）
 *
 * @param userId - 用户标识（默认 'local'）
 * @param projectId - 项目标识（可选，用于项目级隔离）
 * @returns Token 文件的绝对路径
 *
 * @example
 * ```typescript
 * getTokenPath('local')
 * // => ~/.taptap-mcp/cache/local/oauth-token.json
 *
 * getTokenPath('user-123')
 * // => ~/.taptap-mcp/cache/user-123/oauth-token.json
 *
 * getTokenPath('user-123', 'project-456')
 * // => ~/.taptap-mcp/cache/user-123/project-456/oauth-token.json
 * ```
 */
export function getTokenPath(userId?: string, projectId?: string): string {
  const cacheDir = EnvConfig.cacheDir;
  const effectiveUserId = userId || 'local';

  if (projectId) {
    // 项目级隔离
    return path.join(cacheDir, effectiveUserId, projectId, 'oauth-token.json');
  } else {
    // 用户级隔离
    return path.join(cacheDir, effectiveUserId, 'oauth-token.json');
  }
}

/**
 * 从环境变量加载 token（优先级最高）
 */
export function loadTokenFromEnv(): MacToken | null {
  const envToken = EnvConfig.macToken;
  if (envToken) {
    try {
      const token = JSON.parse(envToken) as MacToken;
      if (token.kid && token.mac_key) {
        return token;
      }
    } catch (error) {
      process.stderr.write('⚠️  Invalid TAPTAP_MCP_MAC_TOKEN format in environment\n');
    }
  }
  return null;
}

/**
 * 从本地文件加载 token
 */
export function loadTokenFromFile(filePath?: string): MacToken | null {
  const tokenPath = filePath || getTokenPath();
  
  if (fs.existsSync(tokenPath)) {
    try {
      const content = fs.readFileSync(tokenPath, 'utf8');
      const token = JSON.parse(content) as MacToken;
      
      if (token.kid && token.mac_key) {
        return token;
      }
    } catch (error) {
      process.stderr.write(`⚠️  Invalid token file: ${tokenPath}\n`);
    }
  }
  return null;
}

/**
 * 加载 token（优先级：环境变量 > 本地文件）
 */
export function loadToken(filePath?: string): MacToken | null {
  // 1. Try environment variable
  const envToken = loadTokenFromEnv();
  if (envToken) {
    process.stderr.write('✅ Loaded MAC Token from environment variable\n');
    return envToken;
  }
  
  // 2. Try local file
  const fileToken = loadTokenFromFile(filePath);
  if (fileToken) {
    const tokenPath = filePath || getTokenPath();
    process.stderr.write(`✅ Loaded MAC Token from: ${tokenPath}\n`);
    return fileToken;
  }
  
  return null;
}

/**
 * 保存 token 到本地文件（支持用户隔离）
 *
 * @param token - MAC Token to save
 * @param options - Storage options (userId, projectId, environment)
 */
export function saveToken(token: MacToken, options?: TokenStorageOptions): void {
  const { userId, projectId, environment } = options || {};
  const tokenPath = getTokenPath(userId, projectId);

  try {
    const dir = path.dirname(tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tokenData = {
      ...token,
      saved_at: new Date().toISOString(),
      environment,
      user_id: userId,      // 记录用户标识
      project_id: projectId // 记录项目标识（如果有）
    };

    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');
    process.stderr.write(`✅ Token saved to: ${tokenPath}\n`);
  } catch (error) {
    process.stderr.write(`⚠️  Failed to save token: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/**
 * 清除本地 token 文件（支持用户隔离）
 *
 * @param userId - 用户标识（默认 'local'）
 * @param projectId - 项目标识（可选）
 */
export function clearToken(userId?: string, projectId?: string): void {
  const tokenPath = getTokenPath(userId, projectId);

  if (fs.existsSync(tokenPath)) {
    try {
      fs.unlinkSync(tokenPath);
      process.stderr.write(`✅ Token cleared: ${tokenPath}\n`);
    } catch (error) {
      process.stderr.write(`⚠️  Failed to clear token: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  } else {
    process.stderr.write(`ℹ️  No token file found at: ${tokenPath}\n`);
  }
}

