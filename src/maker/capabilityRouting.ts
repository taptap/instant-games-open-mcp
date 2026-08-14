/**
 * Concise Maker capability index shared by MCP initialization and project policy generation.
 */
function formatMakerCapabilityRoutingIndex(options: { includeFeedback: boolean }): string {
  return [
    'TapTap Maker routing index:',
    '- Start or resume Maker work, or diagnose project/MCP readiness: read',
    '  maker://status; use maker_status_lite when resources are unavailable.',
    '- Build, preview, run, submit, or push: after checking project status, use',
    '  maker_build_current_directory.',
    '- Ads: read maker://ads-integration-guide before any ad-related work.',
    options.includeFeedback
      ? "- Tap flows: test QR -> generate_test_qrcode; current Maker game's online player feedback"
      : '',
    options.includeFeedback
      ? '  (including player-submitted game bug reports, real-device game logs, or screenshots), or'
      : '- Tap flows: test QR -> generate_test_qrcode.',
    options.includeFeedback
      ? '  server/Lua logs for a specified game session -> call get_debug_feedbacks only when it is'
      : '',
    options.includeFeedback ? '  exposed by the current Maker tool list.' : '',
    '- Game assets: Maker MCP also provides image, video, music, sound-effect,',
    '  dialogue/voice, and 3D generation tools when exposed.',
    '- MCP/proxy infrastructure failure: diagnose, ask once for user consent, then use the',
    "  active client's exact Maker command/args with `mcp report`; never use an unversioned npm package. Do not report expected project or business errors.",
    '',
    'Follow the selected tool schema and returned next_action.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const MAKER_CAPABILITY_ROUTING_INDEX = formatMakerCapabilityRoutingIndex({
  includeFeedback: true,
});

export const MAKER_PROJECT_POLICY_ROUTING_INDEX = formatMakerCapabilityRoutingIndex({
  includeFeedback: false,
});
