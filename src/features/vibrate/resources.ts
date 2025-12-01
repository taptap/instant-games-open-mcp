/**
 * Vibrate Resources Definitions and Handlers
 */

import type { ResourceRegistration } from '../../core/types/index.js';
import { vibrateTools } from './docTools.js';

/**
 * Resource 定义数组
 */
const vibrateResourceDefinitions = [
  {
    uri: 'docs://vibrate/overview',
    name: 'Vibrate Complete Overview',
    description: 'Complete overview of all Vibrate APIs',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://vibrate/api/vibrate-short',
    name: 'tap.vibrateShort() API Documentation',
    description:
      'Complete documentation for tap.vibrateShort() API - short vibration (15ms) with intensity levels',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://vibrate/api/vibrate-long',
    name: 'tap.vibrateLong() API Documentation',
    description: 'Complete documentation for tap.vibrateLong() API - long vibration (400ms)',
    mimeType: 'text/markdown',
  },
  {
    uri: 'docs://vibrate/patterns',
    name: 'Vibrate Usage Patterns',
    description: 'Common usage patterns and best practices for vibrate APIs',
    mimeType: 'text/markdown',
  },
];

/**
 * Resource 处理器数组（顺序必须与定义数组一致）
 */
const vibrateResourceHandlers = [
  // docs://vibrate/overview
  async () => vibrateTools.getVibrateOverview(),

  // docs://vibrate/api/vibrate-short
  async () => vibrateTools.getVibrateShort(),

  // docs://vibrate/api/vibrate-long
  async () => vibrateTools.getVibrateLong(),

  // docs://vibrate/patterns
  async () => vibrateTools.getVibratePatterns(),
];

/**
 * Unified resource registrations
 */
export const vibrateResources: ResourceRegistration[] = vibrateResourceDefinitions.map(
  (definition, index) => ({
    ...definition,
    handler: vibrateResourceHandlers[index],
  })
);
