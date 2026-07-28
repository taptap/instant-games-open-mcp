/**
 * Concise Maker capability index shared by MCP initialization and project policy generation.
 */
export const MAKER_CAPABILITY_ROUTING_INDEX = `TapTap Maker routing index:
- Start or resume Maker work, or diagnose project/MCP readiness: read
  maker://status; use maker_status_lite when resources are unavailable.
- Build, preview, run, submit, or push: after checking project status, use
  maker_build_current_directory.
- Ads: read maker://ads-integration-guide before any ad-related work.
- Tap flows: test QR -> generate_test_qrcode; current Maker game's online player feedback
  (including player-submitted game bug reports, real-device game logs, or screenshots), or
  server/Lua logs for a specified game session -> call get_debug_feedbacks only when it is
  exposed by the current Maker tool list.
- Game assets: Maker MCP also provides image, video, music, sound-effect,
  dialogue/voice, and 3D generation tools when exposed.

Follow the selected tool schema and returned next_action.`;
