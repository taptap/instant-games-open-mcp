/**
 * Vibrate API Calls
 *
 * NOTE: Vibrate APIs (tap.vibrateShort and tap.vibrateLong) are CLIENT-SIDE ONLY.
 * They are called directly from the game code using the global 'tap' object.
 *
 * This file is kept for consistency with other feature modules, but no server-side
 * API calls are needed for vibrate functionality.
 *
 * Client-side usage:
 * - tap.vibrateShort({ type: 'heavy' | 'medium' | 'light' })
 * - tap.vibrateLong()
 *
 * See docs.ts for complete API documentation.
 */
