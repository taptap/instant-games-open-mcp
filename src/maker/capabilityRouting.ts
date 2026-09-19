/**
 * Concise Maker capability index shared by MCP initialization and project policy generation.
 */
function formatMakerCapabilityRoutingIndex(options: { includeFeedback: boolean }): string {
  return [
    'TapTap Maker routing index:',
    '- Start/resume/status: maker://status; fallback maker_status_lite.',
    '- Build/remote Web preview/submit/push: check status, use maker_build_current_directory.',
    '- Local preview: taptap-maker preview --target-dir; no commit/remote build.',
    '  After edits: status; refresh+evidence if alive. Never revive stopped sessions. Clarify ambiguous run intent.',
    '- 打开make mcp控制台: active distribution CLI `console open --target-dir <project> --json`; no web search.',
    '  Console/preview steps: taptap-maker-local.',
    '- Ads: read maker://ads-integration-guide before any ad-related work.',
    options.includeFeedback
      ? "- Tap flows: test QR -> generate_test_qrcode; current Maker game's online player feedback"
      : '',
    options.includeFeedback
      ? '  (bugs, real-device game logs, screenshots), or'
      : '- Tap flows: test QR -> generate_test_qrcode.',
    options.includeFeedback
      ? '  server/Lua logs for a specified game session -> get_debug_feedbacks only when'
      : '',
    options.includeFeedback ? '  exposed by the current Maker tool list.' : '',
    '- Assets: image, video, music, sound-effect, voice, 3D tools when exposed.',
    '- MCP/proxy infrastructure failure: diagnose, ask once for user consent, then use the',
    "  active client's exact Maker command/args with `mcp report`; never use an unversioned npm package. Do not report expected project or business errors.",
    '',
    'Follow schema and next_action.',
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
