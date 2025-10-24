/**
 * Leaderboard Tools
 * Unified definitions and handlers (no more manual sync required!)
 */

import type { ToolRegistration, HandlerContext } from '../../core/types/index.js';

// Import from this module
import * as leaderboardHandlers from './handlers.js';
import { leaderboardTools as leaderboardDocTools } from './docTools.js';

/**
 * Leaderboard Tools
 * Each tool combines its definition and handler in one place
 */
export const leaderboardTools: ToolRegistration[] = [
  // 🎯 Integration Guide
  {
    definition: {
      name: 'get_integration_guide',
      description: '⭐ READ THIS FIRST when user wants to integrate/接入/setup/add leaderboard功能. Returns complete step-by-step workflow. CRITICAL: Emphasizes NO SDK installation - tap is global object. Call this BEFORE making any implementation plans.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (args, context) => {
      return leaderboardDocTools.getIntegrationWorkflow();
    }
  },

  // ⚙️ Create Leaderboard
  {
    definition: {
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
    handler: async (args: {
      title: string;
      period_type: 1 | 2 | 3 | 4;
      score_type: 1 | 2;
      score_order: 1 | 2;
      calc_type: 1 | 2 | 3;
      display_limit?: number;
      period_time?: string;
    }, context) => {
      return leaderboardHandlers.createLeaderboard(args, context);
    }
  },

  // ⚙️ List Leaderboards
  {
    definition: {
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
    handler: async (args: { page?: number; page_size?: number }, context) => {
      return leaderboardHandlers.listLeaderboards(args, context);
    }
  },

  // ⚙️ Publish Leaderboard
  {
    definition: {
      name: 'publish_leaderboard',
      description: 'Publish leaderboard or set to whitelist-only mode.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Leaderboard database ID (required)'
          },
          publish: {
            type: 'boolean',
            description: 'true=publish (public), false=whitelist only (required)'
          }
        },
        required: ['id', 'publish']
      }
    },
    handler: async (args: { id: number; publish: boolean }, context) => {
      return leaderboardHandlers.publishLeaderboard(args, context);
    }
  },

  // ⚙️ Get User Leaderboard Scores
  {
    definition: {
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
    },
    handler: async (args: { leaderboardId?: string; limit?: number }, context) => {
      return leaderboardHandlers.getUserLeaderboardScores(args, context);
    }
  }
];
