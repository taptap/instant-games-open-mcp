/**
 * Application Management Feature Module
 * Provides app and developer selection functionality
 */

import type { ToolRegistration, ResourceRegistration } from '../../core/types/index.js';
import { appTools } from './tools.js';

/**
 * App Module Definition
 */
export const appModule = {
  name: 'app',
  description: 'TapTap Application Management - 开发者和应用选择',

  // All Tools with their handlers (unified format)
  tools: appTools as ToolRegistration[],

  // No resources for app module
  resources: [] as ResourceRegistration[]
};
