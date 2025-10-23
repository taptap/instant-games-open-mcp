/**
 * Leaderboard Feature Module
 * All leaderboard-related Tools, Resources, and Handlers in one place
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../types/index.js';

// Import from leaderboard module
import { leaderboardToolDefinitions, leaderboardToolHandlers } from './tools.js';
import { leaderboardResourceDefinitions, leaderboardResourceHandlers } from './resources.js';

/**
 * Tool registration with handlers
 */
export interface ToolRegistration {
  definition: Tool;
  handler: (args: any, context: HandlerContext) => Promise<string>;
  requiresAuth?: boolean;
}

/**
 * Resource registration with handlers
 */
export interface ResourceRegistration {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (args?: any) => Promise<string>;
}

/**
 * Leaderboard Module Definition
 */
export const leaderboardModule = {
  name: 'leaderboard',
  description: 'TapTap Leaderboard功能 - 排行榜创建、管理和文档',

  // All Tools with their handlers
  tools: leaderboardToolDefinitions.map((definition, index) => ({
    definition,
    handler: leaderboardToolHandlers[index],
    requiresAuth: [
      'list_developers_and_apps',
      'select_app',
      'create_leaderboard',
      'list_leaderboards',
      'publish_leaderboard',
      'get_user_leaderboard_scores'
    ].includes(definition.name)
  })) as ToolRegistration[],

  // All Resources with their handlers
  resources: leaderboardResourceDefinitions.map((definition, index) => ({
    ...definition,
    handler: leaderboardResourceHandlers[index]
  })) as ResourceRegistration[]
};
