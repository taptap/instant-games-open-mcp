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
}

/**
 * 获取 token 文件路径
 */
export function getTokenPath(): string {
  const cacheDir = EnvConfig.cacheDir;
  return path.join(cacheDir, 'global', 'oauth-token.json');
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
 * 保存 token 到本地文件
 */
export function saveToken(token: MacToken, options?: TokenStorageOptions): void {
  const tokenPath = getTokenPath();
  
  try {
    const dir = path.dirname(tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const tokenData = {
      ...token,
      saved_at: new Date().toISOString(),
      environment: options?.environment
    };
    
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');
    process.stderr.write(`✅ Token saved to: ${tokenPath}\n`);
  } catch (error) {
    process.stderr.write(`⚠️  Failed to save token: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/**
 * 清除本地 token 文件
 */
export function clearToken(filePath?: string): void {
  const tokenPath = filePath || getTokenPath();
  
  if (fs.existsSync(tokenPath)) {
    try {
      fs.unlinkSync(tokenPath);
      process.stderr.write(`✅ Token cleared: ${tokenPath}\n`);
    } catch (error) {
      process.stderr.write(`⚠️  Failed to clear token: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

