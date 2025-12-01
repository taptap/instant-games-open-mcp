/**
 * Vibrate Feature Module
 * Provides tools and resources for TapTap vibrate APIs
 * Tools and resources use enhanced descriptions to guide AI to use local docs instead of web search
 */

import type { FeatureModule } from '../../core/types/index.js';

// Import from vibrate module
import { vibrateTools } from './tools.js';
import { vibrateResources } from './resources.js';

/**
 * Vibrate Module Definition
 * Provides both tools and resources with enhanced descriptions
 * Tools are prioritized - AI should use tools instead of searching the web
 * Resources provide additional documentation access
 */
export const vibrateModule: FeatureModule = {
  name: 'vibrate',

  // Tools with explicit "DO NOT search the web" instructions
  // AI should call these tools instead of searching the internet
  tools: vibrateTools.map((tool) => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: false, // Vibrate tools don't require authentication
  })),

  // Resources with their handlers (unified format)
  // Enhanced descriptions help AI discover and prioritize these resources
  resources: vibrateResources,
};
