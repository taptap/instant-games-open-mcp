/**
 * Application Management Tools
 * Unified definitions and handlers for app operations
 */

import type { ToolRegistration, HandlerContext } from '../../core/types/index.js';
import * as appHandlers from './handlers.js';
import * as appApi from './api.js';
import { leaderboardTools as leaderboardDocTools } from '../leaderboard/docTools.js';
import * as environmentHandlers from '../../core/handlers/environmentHandlers.js';

/**
 * Application Management Tools
 * Each tool combines its definition and handler in one place
 */
export const appTools: ToolRegistration[] = [
  // 📱 Get Current App Info
  {
    definition: {
      name: 'get_current_app_info',
      description: '[General] Get currently selected app/game information including developer_id, app_id, miniapp_id, and app name. Use this for: 1) Checking current selection, 2) Building preview links, 3) Verifying cached app. Not for H5 upload workflow.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return leaderboardDocTools.getCurrentAppInfo();
    }
  },

  // 📱 Check Environment
  {
    definition: {
      name: 'check_environment',
      description: 'Check environment configuration and user authentication status. Use this to verify if TDS_MCP_MAC_TOKEN and TDS_MCP_CLIENT_ID are configured.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return environmentHandlers.checkEnvironment(context);
    }
  },

  // 🔐 Complete OAuth Authorization
  {
    definition: {
      name: 'complete_oauth_authorization',
      description: 'Complete OAuth authorization after user has scanned QR code. Call this after user confirms they have completed authorization in browser. This tool will poll for the authorization result and save the token.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      // This handler is replaced in server.ts (needs access to deviceAuth)
      throw new Error('This handler is implemented in server.ts');
    }
  },

  // 📁 List Developers and Apps
  {
    definition: {
      name: 'list_developers_and_apps',
      description: '[General App Management] List all developers and their apps/games for the current user. Use this for: 1) Initial exploration of available apps, 2) Switching between apps, 3) General app management (not H5 upload workflow). For H5 game upload, use h5_game_info_gatherer instead.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (_args, context) => {
      // Note: Private parameters are handled at Server layer
      return appHandlers.listDevelopersAndApps(context);
    },
    requiresAuth: true
  },

  // 📁 Select App
  {
    definition: {
      name: 'select_app',
      description: '[General] Select a specific developer and app to use for subsequent operations. This will cache the selection for all modules (leaderboard, H5, etc.). Use this for: 1) General app selection, 2) Switching accounts, 3) After listing with list_developers_and_apps. For H5 upload, you can also pass developerId/appId to h5_game_info_gatherer directly.',
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID to select (required)'
          },
          app_id: {
            type: 'number',
            description: 'App/Game ID to select (required)'
          }
        },
        required: ['developer_id', 'app_id']
      }
    },
    handler: async (args: { developer_id: number; app_id: number }, context) => {
      // Private parameter: _mac_token can be injected by MCP Proxy
      return appHandlers.selectApp(args, context);
    },
    requiresAuth: true
  },

  // 👤 Create Developer
  {
    definition: {
      name: 'create_developer',
      description: 'Create a new unverified developer identity on TapTap platform. Use this when user wants to create a new developer account.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (_args, context) => {
      // Note: Private parameters are handled at Server layer
      const result = await appApi.createDeveloper(context);
      return `✅ 创建开发者身份成功！\n\n` +
             `📋 开发者信息：\n` +
             `- 名称: ${result.developer_name}\n` +
             `- ID: ${result.developer_id}\n\n` +
             `💡 下一步：使用 create_app 创建应用，或使用 select_app 选择此开发者。`;
    },
    requiresAuth: true
  },

  // 🎮 Get App Status
  {
    definition: {
      name: 'get_app_status',
      description: 'Get the review status of an app/game. Use this to check if the app is published, under review, or rejected.',
      inputSchema: {
        type: 'object',
        properties: {
          app_id: {
            type: 'number',
            description: 'App ID to check status for'
          }
        },
        required: ['app_id']
      }
    },
    handler: async (args: { app_id: number }, context) => {
      // Private parameter: _mac_token can be injected by MCP Proxy
      // Note: getAppStatus API doesn't use context, so no need to pass effectiveContext
      const result = await appApi.getAppStatus(args.app_id);
      const statusText = ['未发布', '审核中', '审核失败', '已上线'][result.review_status] || '未知状态';
      return `📋 应用审核状态：${statusText}\n\n` +
             `状态码: ${result.review_status}\n` +
             `- 0: 未发布\n` +
             `- 1: 审核中\n` +
             `- 2: 审核失败\n` +
             `- 3: 已上线`;
    },
    requiresAuth: true
  },

  // 🗑️ Clear Auth Data
  {
    definition: {
      name: 'clear_auth_data',
      description: 'Clear all cached authentication data and app selection. Use this when: 1) MAC Token expired or invalid, 2) Want to switch accounts, 3) Need to reset authentication. This will clear both OAuth token file and app cache.',
      inputSchema: {
        type: 'object',
        properties: {
          clear_token: {
            type: 'boolean',
            description: 'Clear OAuth token file (default: true)'
          },
          clear_cache: {
            type: 'boolean',
            description: 'Clear app selection cache (default: true)'
          }
        }
      }
    },
    handler: async (args: { clear_token?: boolean; clear_cache?: boolean }, context) => {
      return appHandlers.clearAuthData(args, context);
    }
  }
];
