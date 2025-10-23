/**
 * Leaderboard Tools Definitions and Handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../types/index.js';

// Import handlers
import * as leaderboardHandlers from '../../handlers/leaderboardHandlers.js';
import * as appHandlers from '../../handlers/appHandlers.js';
import * as environmentHandlers from '../../handlers/environmentHandlers.js';

// Import tool functions
import { leaderboardTools } from '../../tools/leaderboardTools.js';

/**
 * Tool Definitions (JSON Schema)
 */
export const leaderboardToolDefinitions: Tool[] = [
  // 🎯 Integration Guide
  {
    name: 'get_integration_guide',
    description: '⭐ READ THIS FIRST when user wants to integrate/接入/setup/add leaderboard功能. Returns complete step-by-step workflow. CRITICAL: Emphasizes NO SDK installation - tap is global object. Call this BEFORE making any implementation plans.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // 📱 Information Tools
  {
    name: 'get_current_app_info',
    description: 'Get currently selected app/game information including developer_id, app_id, miniapp_id, and app name. Use this when you need to know which app is being used or to build preview links.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'check_environment',
    description: 'Check environment configuration and user authentication status. Use this to verify if TDS_MCP_MAC_TOKEN and TDS_MCP_CLIENT_ID are configured.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // 🔐 OAuth Tool
  {
    name: 'complete_oauth_authorization',
    description: 'Complete OAuth authorization after user has scanned QR code. Call this after user confirms they have completed authorization in browser. This tool will poll for the authorization result and save the token.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // 📁 App Management
  {
    name: 'list_developers_and_apps',
    description: 'List all developers and their apps/games for the current user. Use this when multiple developers or apps exist and you need to let user/AI choose which one to use.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
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

  // ⚙️ Leaderboard Management
  {
    name: 'create_leaderboard',
    description: 'Create a new leaderboard on TapTap server. Auto-fetches developer_id and app_id if not provided. Returns leaderboard_id for client-side APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Leaderboard title/name (REQUIRED)'
        },
        period_type: {
          type: 'number',
          description: 'Reset period: 1=Always, 2=Daily, 3=Weekly, 4=Monthly (REQUIRED)',
          enum: [1, 2, 3, 4]
        },
        score_type: {
          type: 'number',
          description: 'Score type: 1=Integer, 2=Time (REQUIRED)',
          enum: [1, 2]
        },
        score_order: {
          type: 'number',
          description: 'Score order: 1=Descending (high to low), 2=Ascending (low to high) (REQUIRED)',
          enum: [1, 2]
        },
        calc_type: {
          type: 'number',
          description: 'Calculation type: 1=Sum, 2=Best, 3=Latest (REQUIRED)',
          enum: [1, 2, 3]
        },
        display_limit: {
          type: 'number',
          description: 'Display limit (optional, default 100)'
        },
        period_time: {
          type: 'string',
          description: 'Reset time like "08:00:00" (required if period_type is not 1)'
        }
      },
      required: ['title', 'period_type', 'score_type', 'score_order', 'calc_type']
    }
  },

  {
    name: 'list_leaderboards',
    description: 'List all leaderboards for current app. Auto-fetches developer_id and app_id.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (optional, default 1)'
        },
        page_size: {
          type: 'number',
          description: 'Page size (optional, default 10)'
        }
      }
    }
  },

  {
    name: 'publish_leaderboard',
    description: 'Publish leaderboard or set to whitelist-only mode.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Leaderboard database ID (required)'
        },
        whitelist_only: {
          type: 'boolean',
          description: 'true=whitelist mode, false=public (required)'
        }
      },
      required: ['id', 'whitelist_only']
    }
  },

  {
    name: 'get_user_leaderboard_scores',
    description: 'Get user leaderboard scores. Requires MAC Token authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        leaderboardId: {
          type: 'string',
          description: 'Leaderboard ID'
        },
        limit: {
          type: 'number',
          description: 'Max entries (default 10)'
        }
      }
    }
  }
];

/**
 * Tool Handlers (must match order of definitions above)
 */
export const leaderboardToolHandlers = [
  // get_integration_guide
  async (args: any, context: HandlerContext) => {
    return leaderboardTools.getIntegrationWorkflow();
  },

  // get_current_app_info
  async (args: any, context: HandlerContext) => {
    return leaderboardTools.getCurrentAppInfo();
  },

  // check_environment
  async (args: any, context: HandlerContext) => {
    return environmentHandlers.checkEnvironment(context);
  },

  // complete_oauth_authorization - handled in server.ts (needs access to deviceAuth)
  async (args: any, context: HandlerContext) => {
    throw new Error('This handler is implemented in server.ts');
  },

  // list_developers_and_apps
  async (args: any, context: HandlerContext) => {
    return appHandlers.listDevelopersAndApps(context);
  },

  // select_app
  async (args: any, context: HandlerContext) => {
    return appHandlers.selectApp(args, context);
  },

  // create_leaderboard
  async (args: any, context: HandlerContext) => {
    return leaderboardHandlers.createLeaderboard(args, context);
  },

  // list_leaderboards
  async (args: any, context: HandlerContext) => {
    return leaderboardHandlers.listLeaderboards(args, context);
  },

  // publish_leaderboard
  async (args: any, context: HandlerContext) => {
    return leaderboardHandlers.publishLeaderboard(args, context);
  },

  // get_user_leaderboard_scores
  async (args: any, context: HandlerContext) => {
    return leaderboardHandlers.getUserLeaderboardScores(args, context);
  }
];
