/**
 * Leaderboard Feature Module
 * All leaderboard-related Tools, Resources, and Handlers in one place
 */

import type { ToolRegistration, ResourceRegistration } from '../../core/types/index.js';

// Import from leaderboard module
import { leaderboardTools } from './tools.js';
import { leaderboardResources } from './resources.js';

/**
 * Leaderboard Module Definition
 */
export const leaderboardModule = {
  name: 'leaderboard',
  description: 'TapTap Leaderboard功能 - 排行榜创建、管理和文档',

  // All Tools with their handlers (unified format)
  tools: leaderboardTools.map(tool => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: [
      'create_leaderboard',
      'list_leaderboards',
      'publish_leaderboard',
      'get_user_leaderboard_scores'
    ].includes(tool.definition.name)
  })) as ToolRegistration[],

  // All Resources with their handlers (unified format)
  resources: leaderboardResources as ResourceRegistration[]
};
