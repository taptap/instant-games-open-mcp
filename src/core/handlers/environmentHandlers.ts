/**
 * Environment Check Handlers
 * Handles environment variable checking and validation
 */

import type { HandlerContext } from '../types/index.js';
import { ApiConfig } from '../network/httpClient.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Check environment configuration and authentication status
 */
export async function checkEnvironment(context: HandlerContext): Promise<string> {
  const apiConfig = ApiConfig.getInstance();

  // Check if token exists (env var OR local file)
  let hasMacToken: boolean = !!(apiConfig.macToken.kid && apiConfig.macToken.mac_key);
  let tokenSource = '';

  if (hasMacToken) {
    tokenSource = '(环境变量)';
  } else {
    // Check if token file exists
    try {
      const tokenPath = path.join(os.homedir(), '.config', 'taptap-minigame', 'token.json');

      if (fs.existsSync(tokenPath)) {
        hasMacToken = true;
        tokenSource = '(本地文件)';
      }
    } catch (error) {
      // Ignore file check errors
    }
  }

  const configStatus = apiConfig.getConfigStatus();

  // Override MAC Token status if found in local file
  if (hasMacToken && tokenSource === '(本地文件)') {
    configStatus['TDS_MCP_MAC_TOKEN'] = `✅ 已配置 ${tokenSource}`;
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
                   '   🔐 管理功能需要授权（创建排行榜、列表等）\n' +
                   '   💡 首次调用管理工具时将自动触发 OAuth 授权流程';
  }

  return `🔧 环境配置检查结果:\n\n${envResult}${statusMessage}`;
}
