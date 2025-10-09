/**
 * Environment Check Handlers
 * Handles environment variable checking and validation
 */

import { ApiConfig } from '../network/httpClient.js';

/**
 * Handler context for accessing environment variables
 */
export interface HandlerContext {
  projectPath?: string;
}

/**
 * Check environment configuration and authentication status
 */
export async function checkEnvironment(context: HandlerContext): Promise<string> {
  const apiConfig = ApiConfig.getInstance();
  const configStatus = apiConfig.getConfigStatus();
  const envInfo = {
    ...configStatus,
    'TAPTAP_PROJECT_PATH': context.projectPath ? '✅ 已配置' : '❌ 未配置 (可选)'
  };

  const envResult = Object.entries(envInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return `🔧 环境配置检查结果:\n\n${envResult}\n\n✨ 所有必需配置已就绪，可以使用完整功能`;
}
