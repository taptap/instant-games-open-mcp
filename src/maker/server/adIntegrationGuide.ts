/** MCP resource identifier for the Maker ads integration entry document. */
export const MAKER_ADS_INTEGRATION_GUIDE_URI = 'maker://ads-integration-guide';

/**
 * Return the canonical Maker ads integration workflow for local AI clients.
 */
export function formatMakerAdsIntegrationGuide(): string {
  return `TapTap Maker ads integration guide

Use the MCP tool and the project engine document as consecutive steps in one workflow. They are
not competing ad integrations.

1. Read maker://status, or call maker_status_lite when resources are unavailable, and confirm the
   primary Maker project configs are initialized.
2. Call get_ad_config before reading ad readiness from any local file or writing ad code. This tool
   checks activation and synchronizes the current ad configuration into
   .project/settings.json at @runtime.ad.
3. If get_ad_config reports that app_id or developer_id is missing, call generate_test_qrcode once
   and then retry get_ad_config. If ad.status is not 1, report warning and ad.url and wait for the
   user to complete the returned action before retrying.
4. After get_ad_config returns a usable configuration, read the project-local engine document
   engine-docs/recipes/sdk.md. Treat that document as the source of truth for Maker ad code and do
   not search the web for an alternative integration.
5. Implement rewarded video ads with sdk:ShowRewardVideoAd as documented there. Grant the reward
   only when result.success is true.

Do not build automatically just because local project configs are missing. Use
maker_build_current_directory only when the user explicitly requests build, submit, or preview.`;
}
