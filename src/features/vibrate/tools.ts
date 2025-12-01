/**
 * Vibrate Tools
 * Unified definitions and handlers (no more manual sync required!)
 */

import type { ToolRegistration } from '../../core/types/index.js';

// Import from this module
import { vibrateTools as vibrateDocTools } from './docTools.js';

/**
 * Vibrate Tools
 * Each tool combines its definition and handler in one place
 */
export const vibrateTools: ToolRegistration[] = [
  // 🎯 Integration Guide
  {
    definition: {
      name: 'get_vibrate_integration_guide',
      description:
        '⭐ USE THIS TOOL FIRST when user asks about vibrate/振动/震动/vibration/haptic feedback/触觉反馈 functionality, wants to integrate/接入/setup/add/使用 vibrate功能, searches for vibrate API documentation/文档/教程/示例, asks how to use vibrate/vibrateShort/vibrateLong, needs vibration code examples/代码示例, or asks about vibration intensity/震动强度/震动类型. Returns complete step-by-step workflow. CRITICAL: Emphasizes NO SDK installation - tap is global object. Call this BEFORE making any implementation plans.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (args, context) => {
      return vibrateDocTools.getIntegrationWorkflow();
    },
  },
];
