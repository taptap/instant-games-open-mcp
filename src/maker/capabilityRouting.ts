/**
 * Concise Maker capability index shared by MCP initialization and project policy generation.
 */
export const MAKER_CAPABILITY_ROUTING_INDEX = `TapTap Maker routing index:
- Start or resume Maker work, or diagnose project/MCP readiness: read
  maker://status; use maker_status_lite when resources are unavailable.
- Build, preview, run, submit, or push: after checking project status, use
  maker_build_current_directory.
- Tap flows: test QR -> generate_test_qrcode; ads or ad code -> first check
  Maker project status, then use get_ad_config when primary configs are ready;
  online player feedback, logs, or screenshots -> get_debug_feedbacks.
- Game assets: Maker MCP also provides image, video, music, sound-effect,
  dialogue/voice, and 3D generation tools when exposed.

Follow the selected tool schema and returned next_action.`;
