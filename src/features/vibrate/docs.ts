/**
 * TapTap Vibrate API Documentation
 * Based on: https://developer.taptap.cn/minigameapidoc/dev/api/device/vibrate/
 */

import type { Documentation } from '../../core/utils/docHelpers.js';

/**
 * Vibrate documentation data
 * Uses the generic Documentation interface from core
 */
export const VIBRATE_DOCUMENTATION: Documentation = {
  title: 'TapTap Vibrate API (Minigame & H5)',
  description: `Complete vibrate functionality for TapTap Minigame and H5 Games, including short and long vibration.

⚠️ IMPORTANT:
- NO npm packages or SDK installation required
- NO imports needed
- The 'tap' object is a GLOBAL object provided by TapTap runtime environment
- All APIs are accessed via: tap.vibrateShort() or tap.vibrateLong()
- Works in TapTap Minigame AND H5 game environments (not in regular web browsers)
- Only works on iPhone 7/7 Plus and above, and Android devices`,

  categories: {
    short_vibration: {
      title: 'Short Vibration',
      description: 'Trigger a short vibration (15ms) with different intensity levels',
      apis: [
        {
          name: 'tap.vibrateShort',
          method: 'tap.vibrateShort({ type, success, fail, complete })',
          description:
            'Make the device vibrate for a short duration (15ms). Only works on iPhone 7/7 Plus and above, and Android devices. Supports Promise style calls.\n\n**Official Documentation**: https://developer.taptap.cn/minigameapidoc/dev/api/device/vibrate/tap.vibrateShort/',
          parameters: {
            type: "string (required) - Vibration intensity: 'heavy', 'medium', or 'light'",
            success: 'function (optional) - Success callback function',
            fail: 'function (optional) - Failure callback function with error message',
            complete:
              'function (optional) - Complete callback function (called after success or failure)',
          },
          returnValue:
            'Promise<void> (when using Promise style) or void (when using callback style)',
          example: `// ⚠️ IMPORTANT: 'tap' is a global object, NO imports needed!
// This works ONLY in TapTap minigame environment

// Method 1: Using Promise style (recommended)
try {
  await tap.vibrateShort({
    type: 'heavy'  // 'heavy', 'medium', or 'light'
  });
  console.log('Vibration triggered successfully');
} catch (error) {
  console.error('Vibration failed:', error);
}

// Method 2: Using callback style
tap.vibrateShort({
  type: 'medium',
  success: function() {
    console.log('Vibration success');
  },
  fail: function(res) {
    console.error('Vibration failed:', res.errMsg);
    // Error: "style is not support" - Current device does not support vibration intensity setting
  },
  complete: function() {
    console.log('Vibration complete');
  }
});

// Example: Different intensity levels
tap.vibrateShort({ type: 'heavy' });   // Strong vibration
tap.vibrateShort({ type: 'medium' });  // Medium vibration
tap.vibrateShort({ type: 'light' });   // Light vibration`,
        },
      ],
    },

    long_vibration: {
      title: 'Long Vibration',
      description: 'Trigger a long vibration (400ms)',
      apis: [
        {
          name: 'tap.vibrateLong',
          method: 'tap.vibrateLong({ success, fail, complete })',
          description:
            'Make the device vibrate for a long duration (400ms). Only works on iPhone 7/7 Plus and above, and Android devices. Supports Promise style calls.\n\n**Official Documentation**: https://developer.taptap.cn/minigameapidoc/dev/api/device/vibrate/tap.vibrateLong/',
          parameters: {
            success: 'function (optional) - Success callback function',
            fail: 'function (optional) - Failure callback function with error message',
            complete:
              'function (optional) - Complete callback function (called after success or failure)',
          },
          returnValue:
            'Promise<void> (when using Promise style) or void (when using callback style)',
          example: `// ⚠️ IMPORTANT: 'tap' is a global object, NO imports needed!
// This works ONLY in TapTap minigame environment

// Method 1: Using Promise style (recommended)
try {
  await tap.vibrateLong();
  console.log('Long vibration triggered successfully');
} catch (error) {
  console.error('Vibration failed:', error);
}

// Method 2: Using callback style
tap.vibrateLong({
  success: function() {
    console.log('Long vibration success');
  },
  fail: function(res) {
    console.error('Vibration failed:', res.errMsg);
  },
  complete: function() {
    console.log('Vibration complete');
  }
});

// Simple usage (Promise style)
await tap.vibrateLong();`,
        },
      ],
    },

    common_scenarios: {
      title: 'Common Usage Scenarios',
      description: 'Common patterns and best practices for using vibrate APIs',
      apis: [
        {
          name: 'Game Feedback Patterns',
          method: 'Various patterns',
          description: 'Common vibration patterns for game feedback',
          example: `// Pattern 1: Button click feedback
function onButtonClick() {
  tap.vibrateShort({ type: 'light' });
}

// Pattern 2: Achievement unlocked
function onAchievementUnlocked() {
  tap.vibrateLong();
}

// Pattern 3: Error feedback
function onError() {
  tap.vibrateShort({ type: 'heavy' });
}

// Pattern 4: Success feedback
function onSuccess() {
  tap.vibrateShort({ type: 'medium' });
}

// Pattern 5: Combo/streak feedback
let comboCount = 0;
function onCombo() {
  comboCount++;
  if (comboCount >= 5) {
    tap.vibrateLong();  // Long vibration for high combo
  } else {
    tap.vibrateShort({ type: 'light' });  // Light vibration for normal combo
  }
}`,
        },
        {
          name: 'Error Handling',
          method: 'Error handling patterns',
          description: 'How to handle vibration errors gracefully',
          example: `// Graceful error handling
async function triggerVibration(type = 'medium') {
  try {
    await tap.vibrateShort({ type });
  } catch (error) {
    // Device may not support vibration
    // Or device may not support intensity setting
    console.warn('Vibration not available:', error);
    // Continue game flow without vibration
  }
}

// Check if vibration is supported (by trying it)
async function isVibrationSupported() {
  try {
    await tap.vibrateShort({ type: 'light' });
    return true;
  } catch {
    return false;
  }
}`,
        },
      ],
    },
  },
};
