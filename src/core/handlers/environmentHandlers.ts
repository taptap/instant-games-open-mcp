/**
 * Environment Check Handlers
 * Handles environment variable checking and validation
 */

import type { HandlerContext } from '../types/index.js';
import { ApiConfig } from '../network/httpClient.js';
import { getMacTokenStatus, getTokenSourceLabel } from '../utils/handlerHelpers.js';

/**
 * Check environment configuration and authentication status
 */
export async function checkEnvironment(context: HandlerContext): Promise<string> {
  const apiConfig = ApiConfig.getInstance();

  // Use shared authentication check logic
  const { hasMacToken, source } = getMacTokenStatus(context);

  const configStatus = apiConfig.getConfigStatus();

  // Override MAC Token status based on actual source
  if (hasMacToken) {
    const sourceLabel = getTokenSourceLabel(source);
    configStatus['TAPTAP_MCP_MAC_TOKEN'] = `✅ 已配置 ${sourceLabel}`;
  }

  const envInfo = {
    ...configStatus,
    'TAPTAP_PROJECT_PATH': context.projectPath ? '✅ 已配置' : '❌ 未配置 (可选)'
  };

  const envResult = Object.entries(envInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  let statusMessage = '';
  if (hasMacToken) {
    statusMessage = '\n✅ 认证配置完整，可以使用所有功能';
  } else {
    statusMessage = '\n⚠️  MAC Token 未配置\n' +
                   '   📖 文档功能可用（Resources, Prompts, 搜索等）\n' +
                   '   🔐 管理功能需要授权（创建排行榜、列表等）\n\n' +
                   '💡 如需授权，请使用 start_oauth_authorization 工具获取授权链接';
  }

  return `🔧 环境配置检查结果:\n\n${envResult}${statusMessage}`;
}
