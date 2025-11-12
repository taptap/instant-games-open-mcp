/**
 * Vibrate Feature Module
 * Provides documentation resources for TapTap vibrate APIs
 */

import type { FeatureModule } from '../../core/types/index.js';

// Import from vibrate module
import { vibrateResources } from './resources.js';

/**
 * Vibrate Module Definition
 * Only provides resources (documentation), no tools needed for simple client-side APIs
 */
export const vibrateModule: FeatureModule = {
  name: 'vibrate',

  // No tools - vibrate APIs are simple client-side calls, documentation via resources is sufficient
  tools: [],

  // All Resources with their handlers (unified format)
  resources: vibrateResources
};
