/**
 * 统一的环境配置管理
 * 管理所有环境相关的端点和配置
 */

export interface EnvironmentConfig {
  // API 端点
  apiHost: string;
  apiBaseUrl: string;
  
  // OAuth 端点
  authHost: string;
  qrcodeBaseUrl: string;
}

/**
 * 环境配置映射
 */
const ENVIRONMENT_CONFIGS: Record<string, EnvironmentConfig> = {
  production: {
    apiHost: 'agent.tapapis.cn',
    apiBaseUrl: 'https://agent.tapapis.cn',
    authHost: 'accounts.tapapis.cn',
    qrcodeBaseUrl: 'https://www.taptap.cn/tap-qrcode?scene=mcp_auth&code='
  },
  rnd: {
    apiHost: 'agent.api.xdrnd.cn',
    apiBaseUrl: 'https://agent.api.xdrnd.cn',
    authHost: 'oauth.api.xdrnd.cn',
    qrcodeBaseUrl: 'https://www-beta.xdrnd.cn/tap-qrcode?scene=mcp_auth&code='
  }
};

/**
 * 获取环境配置
 */
export function getEnvironmentConfig(environment: string = 'production'): EnvironmentConfig {
  return ENVIRONMENT_CONFIGS[environment] || ENVIRONMENT_CONFIGS.production;
}

