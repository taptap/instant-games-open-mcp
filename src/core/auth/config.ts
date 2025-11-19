/**
 * OAuth 环境配置管理
 * 
 * 所有认证凭据通过环境变量配置：
 * - TAPTAP_MCP_CLIENT_ID: Client ID（用于 OAuth 和 API 签名）
 * - TAPTAP_MCP_CLIENT_SECRET: Client Secret（用于 API 签名）
 */

import { EnvConfig } from '../utils/env.js';

/**
 * OAuth 环境端点配置
 */
export interface HostConfig {
  apiHost: string;
  authHost: string;
  qrcodeBaseUrl: string;
}

/**
 * 环境端点配置（不包含 clientId）
 */
const ENV_ENDPOINTS: Record<string, HostConfig> = {
  production: {
    apiHost: 'agent.tapapis.cn',
    authHost: 'accounts.tapapis.cn',
    qrcodeBaseUrl: 'https://www.taptap.cn/tap-qrcode?scene=mcp_auth&code='
  },
  rnd: {
    apiHost: 'agent.api.xdrnd.cn',
    authHost: 'oauth.api.xdrnd.cn',
    qrcodeBaseUrl: 'https://www-beta.xdrnd.cn/tap-qrcode?scene=mcp_auth&code='
  }
};

/**
 * 获取指定环境的端点配置
 */
export function getHostConfig(environment: string = 'production'): HostConfig {
  return ENV_ENDPOINTS[environment] || ENV_ENDPOINTS.production;
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

