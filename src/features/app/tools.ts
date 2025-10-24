/**
 * Application Management Tools
 * Unified definitions and handlers for app operations
 */

import type { ToolRegistration, HandlerContext } from '../../core/types/index.js';
import * as appHandlers from './handlers.js';
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
      description: 'Get currently selected app/game information including developer_id, app_id, miniapp_id, and app name. Use this when you need to know which app is being used or to build preview links.',
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
      description: 'List all developers and their apps/games for the current user. Use this when multiple developers or apps exist and you need to let user/AI choose which one to use.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return appHandlers.listDevelopersAndApps(context);
    },
    requiresAuth: true
  },

  // 📁 Select App
  {
    definition: {
      name: 'select_app',
      description: 'Select a specific developer and app to use for subsequent operations. This will cache the selection. Use this after listing developers and apps with list_developers_and_apps.',
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
      return appHandlers.selectApp(args, context);
    },
    requiresAuth: true
  }
];
