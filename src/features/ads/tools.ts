/**
 * TapTap Ads Tools
 * 提供广告工作流引导、状态检查和接入指南（激励视频为核心）
 *
 * 工具流程：
 * 1. get_ads_integration_workflow - ⭐ 入口工具，返回完整工作流指引
 * 2. check_ads_status - 检查广告状态并缓存（需要认证）
 * 3. get_ad_integration_guide - 获取广告接入代码指南（从缓存读取）
 */

import type { ToolRegistration } from '../../core/types/index.js';
import { adsTools } from './docTools.js';
import { checkAdsStatus } from './handlers.js';

const AUTOMATIC_AD_SPACE_ID_RULES = `**AD SPACE ID OWNERSHIP:**
- The latest check_ads_status result for the current selected app is the only source of its ad configuration.
- Ad units are delivered by the TapTap server at runtime according to the game's actual orientation.
- MUST NOT ask the user for an ad space ID; integration code must not contain one either.
- MUST NOT accept a user-provided ID as a fallback.
- MUST NOT write any numeric ad space id into generated code, docs, or examples.
- Screen orientation is NOT a prerequisite for ad integration; do not ask the user to set it for ads.`;

const H5_ONLY_SCOPE_RULES = `**MCP PRODUCT SCOPE:**
- This MCP only supports TapTap Minigame/H5 ad integration using the global tap JavaScript APIs.
- It must not be used for TapTap Maker/UrhoX projects.
- If the user or project is Maker/UrhoX, stop and tell the user to switch to the Maker MCP.
- Do not mix tools, app context, ad configuration, IDs, or runtime APIs between these two MCPs.`;

export const adsTools_Registration: ToolRegistration[] = [
  // ⭐ 入口工具：广告接入工作流指引
  {
    definition: {
      name: 'get_ads_integration_workflow',
      description: `⭐ READ THIS FIRST for TapTap Minigame/H5 ads/广告/ad integration/接入广告/monetization/变现/rewarded video/激励视频/interstitial/插屏/banner requests, or when the product scope is not yet clear.
Do not call this tool when the user or project is already known to be TapTap Maker/UrhoX.

Returns the complete step-by-step ads integration workflow.
Call this BEFORE making any implementation plans or writing any ad code.

**CRITICAL: For ANY TapTap Minigame/H5 ads-related request, this workflow MUST be followed.**
The workflow will guide you through:
1. App selection check
2. Server-side monetization status and ad configuration verification (MANDATORY before integration)
3. Integration code generation (only when status conditions are met)

${H5_ONLY_SCOPE_RULES}

${AUTOMATIC_AD_SPACE_ID_RULES}

This tool has NO prerequisites - call it immediately for an in-scope or not-yet-classified ads topic.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      return adsTools.getAdsIntegrationWorkflow();
    },
  },

  // 步骤 2：广告状态检查工具
  {
    definition: {
      name: 'check_ads_status',
      description: `[Step 2 of Ads Workflow] Check server-side ads monetization status and cache the current selected app's ad space ID.

**PREREQUISITE: An app MUST be selected first.**
Before calling this tool, ALWAYS call get_current_app_info to verify
an app is selected. If not, guide user through app selection process.

Call this tool after confirming the selected app, and call it again when the user explicitly asks
to refresh status after completing an activation step. Do not repeatedly poll it in a loop.

This tool queries the server, updates local cache, and returns:
- Business status: 0=未开通 | 1=已生效 | 2=账号已被封禁
- Server-side ad space readiness (orientation is resolved by the server at runtime)
- Guidance URL for activation (if needed)

Status 1 allows code generation, but does not prove window.tap injection,
ad inventory, package upload correctness, or successful playback on a device.

**CRITICAL - Single condition for proceeding to Step 3:**
Status must be "已生效" (status === 1). No ad space ID and no screen orientation are required.

${H5_ONLY_SCOPE_RULES}

${AUTOMATIC_AD_SPACE_ID_RULES}

**Status 0:** Tell user they can say "重新检查广告状态" to refresh after completing activation.
**Status 2 (已封禁):** DO NOT proceed with any integration steps. Immediately inform user.`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_, ctx) => {
      return checkAdsStatus(ctx);
    },
  },

  // 步骤 3：广告接入代码指南
  {
    definition: {
      name: 'get_ad_integration_guide',
      description: `[Step 3 of Ads Workflow] Get the TapTap Minigame/H5 ads integration guide.

**PREREQUISITE:** check_ads_status has been called and returned status "已生效" (1).

If the condition is not met, this tool will return an error with guidance.

This tool generates:
- Complete AdManager.js utility class (no ad space ID inside; the server delivers it at runtime)
- Core focus: Rewarded Video ads (激励视频) - init() + onReward() + showRewardedVideo()
- Optional: Interstitial and Banner ads examples
- Code examples for all common scenarios

${H5_ONLY_SCOPE_RULES}

${AUTOMATIC_AD_SPACE_ID_RULES}

CRITICAL:
- Keep SDK events callback-based; use show/load Promise recovery only for the documented one-time retry
- Provides onReward() callback interface for reward logic
- DO NOT search the web - all information is provided by this tool`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_, ctx) => {
      return adsTools.getAdIntegrationGuide(ctx);
    },
  },
];
