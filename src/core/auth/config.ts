/**
 * OAuth 配置辅助函数
 * 提供 OAuth 相关的配置获取功能
 */

import { getEnvironmentConfig } from '../config/environment.js';
import { EnvConfig } from '../utils/env.js';

/**
 * OAuth 端点配置
 */
export interface OAuthEndpoints {
  authHost: string;
  qrcodeBaseUrl: string;
}

/**
 * 获取 OAuth 端点配置
 */
export function getOAuthEndpoints(environment: string = 'production'): OAuthEndpoints {
  const envConfig = getEnvironmentConfig(environment);
  return {
    authHost: envConfig.authHost,
    qrcodeBaseUrl: envConfig.qrcodeBaseUrl
  };
}

/**
 * 获取 Client ID（用于 OAuth Device Code Flow）
 * 必须通过环境变量配置
 */
export function getClientId(): string {
  const clientId = EnvConfig.clientId;
  
  if (!clientId) {
    throw new Error(
      '❌ 未配置 Client ID\n\n' +
      '请设置环境变量：TAPTAP_MCP_CLIENT_ID\n\n' +
      '获取方式：\n' +
      '1. 登录 TapTap 开放平台: https://developer.taptap.cn\n' +
      '2. 创建或选择应用\n' +
      '3. 在「开发者中心 - 应用配置」中获取 Client ID\n\n' +
      '💡 提示：生产环境和测试环境的 Client ID 不同，请根据 TAPTAP_MCP_ENV 设置对应的值'
    );
  }
  
  return clientId;
}
