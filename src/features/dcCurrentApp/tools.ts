/**
 * DC Current App Tools
 */

import type { ToolRegistration } from '../../core/types/index.js';
import * as dcCurrentAppHandlers from './handlers.js';

/**
 * Tool registrations for current-app scoped DC capabilities.
 */
export const dcCurrentAppTools: ToolRegistration[] = [
  {
    definition: {
      name: 'get_current_app_store_overview',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user confirmation. Get store overview metrics for the currently selected app, including page views, downloads, reserves, download requests, and daily trend data for an optional date range.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (
      args: {
        start_date?: string;
        end_date?: string;
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppStoreOverview(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_review_overview',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS verify the selected app context. Get review overview metrics for the currently selected app, including rating summary, rating score, positive/neutral/negative review counts, and trend data for an optional date range.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (
      args: {
        start_date?: string;
        end_date?: string;
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppReviewOverview(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_community_overview',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS verify the selected app context. Get community overview metrics for the currently selected app, including topic count, favorite count, page views, feed count, and trend data for an optional date range.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (
      args: {
        start_date?: string;
        end_date?: string;
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppCommunityOverview(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_store_snapshot',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user confirmation. Get a result-oriented store snapshot for the currently selected app, including app card info, current stats, rating summary, 30-day rating trend, version status, and visibility.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return dcCurrentAppHandlers.getCurrentAppStoreSnapshot(context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_forum_contents',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Read forum contents for the currently selected app only. Use this to inspect the game forum feed before summarizing community topics. This tool is scoped to the selected app and MUST NOT be used for cross-game browsing.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Forum flow type. Default: "feed".',
          },
          sort: {
            type: 'string',
            description: 'Sort mode. Default: "default".',
          },
          from: {
            type: 'number',
            description: 'Pagination start offset. Default: 0.',
          },
          limit: {
            type: 'number',
            description: 'Page size. Default: 10, max: 20.',
            minimum: 1,
            maximum: 20,
          },
          group_label_id: {
            type: 'number',
            description: 'Optional forum sub-group label ID.',
          },
        },
      },
    },
    handler: async (
      args: {
        type?: string;
        sort?: string;
        from?: number;
        limit?: number;
        group_label_id?: number;
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppForumContents(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_reviews',
      description:
        '**PREREQUISITE: An app MUST be selected first.** List reviews for the currently selected app only. Use this before like/reply actions so the user can inspect the review list and confirm the target review_id. Supports sort, pagination, collapsed reviews, and platform filter.',
      inputSchema: {
        type: 'object',
        properties: {
          sort: {
            type: 'string',
            description: 'Review sort mode. Default: "new".',
            enum: ['new', 'hot', 'spent'],
          },
          from: {
            type: 'number',
            description: 'Pagination start offset. Default: 0.',
          },
          limit: {
            type: 'number',
            description: 'Page size. Default: 10, max: 10.',
            minimum: 1,
            maximum: 10,
          },
          is_collapsed: {
            type: 'boolean',
            description: 'Whether to query collapsed reviews.',
          },
          filter_platform: {
            type: 'string',
            description: 'Optional platform filter.',
            enum: ['mobile', 'pc', 'web'],
          },
        },
      },
    },
    handler: async (
      args: {
        sort?: 'new' | 'hot' | 'spent';
        from?: number;
        limit?: number;
        is_collapsed?: boolean;
        filter_platform?: 'mobile' | 'pc' | 'web';
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppReviews(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'like_current_app_review',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Like a specific review for the currently selected app. **IMPORTANT: Before calling this tool, first identify the target review by calling get_current_app_reviews or by showing the exact review to the user, then ASK for confirmation. DO NOT guess the target review_id.** This tool only supports a single review like action.',
      inputSchema: {
        type: 'object',
        properties: {
          review_id: {
            type: 'number',
            description: 'Target review ID to like.',
          },
        },
        required: ['review_id'],
      },
    },
    handler: async (args: { review_id: number }, context) => {
      return dcCurrentAppHandlers.likeCurrentAppReview(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'reply_current_app_review',
      description:
        '**PREREQUISITE: An app MUST be selected first.** Reply to a specific review as the official app identity. **CRITICAL: Always make sure the user has reviewed and approved the reply content before calling this tool.** The server applies risk grading: LOW can be sent directly, MEDIUM/HIGH usually return a draft and need explicit follow-up confirmation. Only set confirm_high_risk=true after the user explicitly approves sending the risky draft.',
      inputSchema: {
        type: 'object',
        properties: {
          review_id: {
            type: 'number',
            description: 'Target review ID to reply to.',
          },
          contents: {
            type: 'string',
            description: 'Official reply content to send.',
          },
          reply_comment_id: {
            type: 'number',
            description: 'Optional comment ID if replying to a specific review reply.',
          },
          confirm_high_risk: {
            type: 'boolean',
            description:
              'Only set to true after the user explicitly confirms sending a MEDIUM/HIGH risk draft.',
          },
        },
        required: ['review_id', 'contents'],
      },
    },
    handler: async (
      args: {
        review_id: number;
        contents: string;
        reply_comment_id?: number;
        confirm_high_risk?: boolean;
      },
      context
    ) => {
      return dcCurrentAppHandlers.replyCurrentAppReview(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_store_overview_raw',
      description:
        '[Raw JSON] Return current-app store overview data as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (args: { start_date?: string; end_date?: string }, context) => {
      return dcCurrentAppHandlers.getCurrentAppStoreOverviewRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_review_overview_raw',
      description:
        '[Raw JSON] Return current-app review overview data as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (args: { start_date?: string; end_date?: string }, context) => {
      return dcCurrentAppHandlers.getCurrentAppReviewOverviewRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_community_overview_raw',
      description:
        '[Raw JSON] Return current-app community overview data as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Optional start date in YYYY-MM-DD format.',
          },
          end_date: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format.',
          },
        },
      },
    },
    handler: async (args: { start_date?: string; end_date?: string }, context) => {
      return dcCurrentAppHandlers.getCurrentAppCommunityOverviewRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_store_snapshot_raw',
      description:
        '[Raw JSON] Return current-app store snapshot data as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return dcCurrentAppHandlers.getCurrentAppStoreSnapshotRaw(context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_forum_contents_raw',
      description:
        '[Raw JSON] Return current-app forum contents as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Forum flow type. Default: "feed".',
          },
          sort: {
            type: 'string',
            description: 'Sort mode. Default: "default".',
          },
          from: {
            type: 'number',
            description: 'Pagination start offset. Default: 0.',
          },
          limit: {
            type: 'number',
            description: 'Page size. Default: 10, max: 20.',
            minimum: 1,
            maximum: 20,
          },
          group_label_id: {
            type: 'number',
            description: 'Optional forum sub-group label ID.',
          },
        },
      },
    },
    handler: async (
      args: {
        type?: string;
        sort?: string;
        from?: number;
        limit?: number;
        group_label_id?: number;
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppForumContentsRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'get_current_app_reviews_raw',
      description:
        '[Raw JSON] Return current-app reviews as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          sort: {
            type: 'string',
            description: 'Review sort mode. Default: "new".',
            enum: ['new', 'hot', 'spent'],
          },
          from: {
            type: 'number',
            description: 'Pagination start offset. Default: 0.',
          },
          limit: {
            type: 'number',
            description: 'Page size. Default: 10, max: 10.',
            minimum: 1,
            maximum: 10,
          },
          is_collapsed: {
            type: 'boolean',
            description: 'Whether to query collapsed reviews.',
          },
          filter_platform: {
            type: 'string',
            description: 'Optional platform filter.',
            enum: ['mobile', 'pc', 'web'],
          },
        },
      },
    },
    handler: async (
      args: {
        sort?: 'new' | 'hot' | 'spent';
        from?: number;
        limit?: number;
        is_collapsed?: boolean;
        filter_platform?: 'mobile' | 'pc' | 'web';
      },
      context
    ) => {
      return dcCurrentAppHandlers.getCurrentAppReviewsRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'like_current_app_review_raw',
      description:
        '[Raw JSON] Like a current-app review and return the structured upstream response.',
      inputSchema: {
        type: 'object',
        properties: {
          review_id: {
            type: 'number',
            description: 'Target review ID to like.',
          },
        },
        required: ['review_id'],
      },
    },
    handler: async (args: { review_id: number }, context) => {
      return dcCurrentAppHandlers.likeCurrentAppReviewRaw(args, context);
    },
    requiresAuth: true,
  },
  {
    definition: {
      name: 'reply_current_app_review_raw',
      description:
        '[Raw JSON] Reply to a current-app review and return the structured upstream response.',
      inputSchema: {
        type: 'object',
        properties: {
          review_id: {
            type: 'number',
            description: 'Target review ID to reply to.',
          },
          contents: {
            type: 'string',
            description: 'Official reply content to send.',
          },
          reply_comment_id: {
            type: 'number',
            description: 'Optional comment ID if replying to a specific review reply.',
          },
          confirm_high_risk: {
            type: 'boolean',
            description:
              'Only set to true after the user explicitly confirms sending a MEDIUM/HIGH risk draft.',
          },
        },
        required: ['review_id', 'contents'],
      },
    },
    handler: async (
      args: {
        review_id: number;
        contents: string;
        reply_comment_id?: number;
        confirm_high_risk?: boolean;
      },
      context
    ) => {
      return dcCurrentAppHandlers.replyCurrentAppReviewRaw(args, context);
    },
    requiresAuth: true,
  },
];
