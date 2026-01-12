/**
 * Leaderboard Tools
 * Unified definitions and handlers (no more manual sync required!)
 */

import type { ToolRegistration } from '../../core/types/index.js';

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
      name: 'get_leaderboard_integration_guide',
      description:
        '⭐ READ THIS FIRST when user wants to integrate/接入/setup/add leaderboard功能. Returns complete step-by-step workflow. CRITICAL: Emphasizes NO SDK installation - tap is global object. Call this BEFORE making any implementation plans.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, _context) => {
      return leaderboardDocTools.getIntegrationWorkflow();
    },
  },

  // ⚙️ Create Leaderboard
  {
    definition: {
      name: 'create_leaderboard',
      description:
        "**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user's choice. Create a new leaderboard on TapTap server. Auto-fetches developer_id and app_id from selected app. Returns leaderboard_id for client-side APIs.",
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Leaderboard title/name (REQUIRED)',
          },
          period_type: {
            type: 'string',
            description: 'Reset period: "always" (default), "daily", "weekly", "monthly"',
            enum: ['always', 'daily', 'weekly', 'monthly'],
          },
          score_type: {
            type: 'string',
            description: 'Score type: "numeric" (default), "time"',
            enum: ['numeric', 'time'],
          },
          score_order: {
            type: 'string',
            description: 'Score order: "desc" (high to low, default), "asc" (low to high)',
            enum: ['desc', 'asc'],
          },
          calc_type: {
            type: 'string',
            description: 'Calculation type: "sum" (default), "best", "latest"',
            enum: ['sum', 'best', 'latest'],
          },
          display_limit: {
            type: 'number',
            description: 'Display limit (optional, default 100)',
          },
          period_time: {
            type: 'string',
            description: 'Reset time like "08:00:00" (required if period_type is not "always")',
          },
        },
        required: ['title'],
      },
    },
    handler: async (
      args: {
        title: string;
        period_type?: string;
        score_type?: string;
        score_order?: string;
        calc_type?: string;
        display_limit?: number;
        period_time?: string;
      },
      context
    ) => {
      return leaderboardHandlers.createLeaderboard(args, context);
    },
  },

  // ⚙️ List Leaderboards
  {
    definition: {
      name: 'list_leaderboards',
      description:
        "**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user's choice. List all leaderboards for currently selected app. **IMPORTANT: When multiple leaderboards exist, ALWAYS show the complete list to the user and explicitly ASK them which one they want to use - DO NOT automatically choose a leaderboard without user confirmation.**",
      inputSchema: {
        type: 'object',
        properties: {
          page: {
            type: 'number',
            description: 'Page number (optional, default 1)',
          },
          page_size: {
            type: 'number',
            description: 'Page size (optional, default 10)',
          },
        },
      },
    },
    handler: async (args: { page?: number; page_size?: number }, context) => {
      return leaderboardHandlers.listLeaderboards(args, context);
    },
  },

  // ⚙️ Publish Leaderboard
  {
    definition: {
      name: 'publish_leaderboard',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Publish leaderboard or set to whitelist-only mode. Before calling this tool, ensure an app is selected by calling get_current_app_info. **IMPORTANT: If the leaderboard ID is not clear, call list_leaderboards first, show the list to the user, and ASK them which leaderboard they want to publish - DO NOT automatically select a leaderboard.**',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Leaderboard database ID (required)',
          },
          publish: {
            type: 'boolean',
            description: 'true=publish (public), false=whitelist only (required)',
          },
        },
        required: ['id', 'publish'],
      },
    },
    handler: async (args: { id: number; publish: boolean }, context) => {
      return leaderboardHandlers.publishLeaderboard(args, context);
    },
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
            description: 'Leaderboard ID',
          },
          limit: {
            type: 'number',
            description: 'Max entries (default 10)',
          },
        },
      },
    },
    handler: async (args: { leaderboardId?: string; limit?: number }, context) => {
      return leaderboardHandlers.getUserLeaderboardScores(args, context);
    },
  },
];
