/**
 * Concise Maker capability index shared by MCP initialization and project policy generation.
 */
function formatMakerCapabilityRoutingIndex(options: { includeFeedback: boolean }): string {
  return [
    'TapTap Maker routing index:',
    '- Start/resume/status: maker://status; fallback maker_status_lite.',
    '- Build/remote Web preview/submit/push: check status, use maker_build_current_directory.',
    '- Local preview: taptap-maker preview --target-dir; no commit/remote build.',
    '  Requested preview iteration only: status, refresh live game edits. Never revive stopped sessions.',
    '- 打开make mcp控制台: active distribution CLI `console open --target-dir <project> --json`; no web search.',
    '  run-lua-validate: preview validate via taptap-maker-local; network/server projects use --network.',
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
    '- Canvas capabilities/custom workflows/video: active CLI canvas capabilities; follow the canvas.md link in taptap-maker-local.',
    '  For first/last-frame video follow its canvas-video.md link; inspect current mode before setting references.',
    '- Canvas templates (UI/切图/动画/角色/道具/3D): active CLI canvas templates --target-dir PATH --q "keyword".',
    '  Search names/descriptions before declaring a workflow unsupported; read only matching descriptions and Skills.',
    '- 游戏UI/设计稿还原/切图/拼装UI.json: read maker-ui-workflow (path in status).',
    '- Bbox预排/uiAtlasPrelayout: read maker-ui-bbox-workflow; keep reference chain.',
    '- Lua UI提取/转JSON/UI.json检查: read lua-ui-to-json (path in status); preserve gameplay and edits.',
    '  Existing UI edits do not restart generation.',
    '- Resource .meta/UUID: generate_resource_meta; call when needed, never invent UUIDs.',
    '- MCP/proxy infrastructure failure: diagnose, ask once for user consent, then use the',
    "  active client's exact Maker command/args with `mcp report`; never use an unversioned npm package. Do not report expected project or business errors.",
    '',
    'Read matched references only. Follow schema and next_action.',
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
