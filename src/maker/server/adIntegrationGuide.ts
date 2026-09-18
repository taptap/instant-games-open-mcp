/** MCP resource identifier for the Maker ads integration entry document. */
export const MAKER_ADS_INTEGRATION_GUIDE_URI = 'maker://ads-integration-guide';

/**
 * Return the canonical Maker ads integration workflow for local AI clients.
 */
export function formatMakerAdsIntegrationGuide(): string {
  return `TapTap Maker ads integration guide

Workflow: confirm project -> get ad configuration -> verify remote/local configuration ->
read project SDK docs -> implement ads and rewards -> real-device validation.
These are consecutive steps for Maker/UrhoX, not the separate Minigame/H5 ad workflow.

1. Confirm the intended project directory, binding and primary configs via maker://status.
   If unavailable or pointing elsewhere, call maker_status_lite with explicit target_dir.
   Status does not bind or switch projects; pass the same target_dir to subsequent tools.
2. Call get_ad_config for current activation and configuration; local files are not activation proof.
   Missing app_id/developer_id: call generate_test_qrcode once, then retry get_ad_config.
   If ad.status is not 1, show warning, ad.url and next_action; wait for user action before retrying.
3. Check configuration location: synchronization reported by the remote tool concerns its workspace
   .project/settings.json at @runtime.ad. The local proxy does not write this result to local files.
   settings_path may be remote (e.g. /userspaces/...); never treat it as a local path.
   Request success or synced_at is not local synchronization proof; ad.status=1 is activation only.
   Read the intended local project's .project/settings.json and compare @runtime.ad with the
   returned configuration. If absent, different or unverifiable, pause ad implementation/testing
   and report "remote configuration obtained; local synchronization not verified" with the missing
   evidence. No automatic local sync is provided by this call. Do not copy another project's
   configuration, guess fields, overwrite settings, or pull/build to resolve this automatically.
4. Once configuration is verified, read the advertising section of project-local
   engine-docs/recipes/sdk.md; it is the implementation source of truth, not another game's code
   or a web search. Use sdk:ShowRewardVideoAd; grant rewards only when result.success is true.
5. Verify playback and rewards on a supported real-device environment. Local preview or activation
   success alone does not prove ads work.

Missing primary local configs: stop and report the gap; do not build automatically.
Use maker_build_current_directory only for an explicit build, submit or remote Web preview request.
Local window preview uses CLI and does not authorize commit or push.`;
}
