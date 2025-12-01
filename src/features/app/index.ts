/**
 * Application Management Feature Module
 * Provides app and developer selection functionality
 */

import type { FeatureModule } from '../../core/types/index.js';
import { appTools } from './tools.js';

/**
 * App Module Definition
 */
export const appModule: FeatureModule = {
  name: 'app',
  tools: appTools,
  resources: [],
};
