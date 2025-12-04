/**
 * Cloud Save Feature Module
 * Documentation for CloudSaveManager and FileSystemManager APIs
 */

import type { FeatureModule } from '../../core/types/index.js';

import { cloudSaveToolsList } from './tools.js';
import { cloudSaveResources } from './resources.js';

/**
 * Cloud Save Module Definition
 *
 * This module provides documentation-only functionality:
 * - 1 Tool: Integration guide for cloud save workflow
 * - 14 Resources: API documentation for CloudSaveManager and FileSystemManager
 *
 * Note: Cloud save is a pure client-side API with no server-side operations.
 */
export const cloudSaveModule: FeatureModule = {
  name: 'cloudSave',

  // All Tools with their handlers (unified format)
  tools: cloudSaveToolsList.map((tool) => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: false, // Documentation tools don't require auth
  })),

  // All Resources with their handlers (unified format)
  resources: cloudSaveResources,
};
