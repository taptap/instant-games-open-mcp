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

export const adsTools_Registration: ToolRegistration[] = [
  // ⭐ 入口工具：广告接入工作流指引
  {
    definition: {
      name: 'get_ads_integration_workflow',
      description: `⭐ READ THIS FIRST when user mentions anything about ads/广告/advertising/ad integration/接入广告/monetization/变现/rewarded video/激励视频/interstitial/插屏/banner.

Returns the complete step-by-step ads integration workflow.
Call this BEFORE making any implementation plans or writing any ad code.

**CRITICAL: For ANY ads-related request, this workflow MUST be followed.**
The workflow will guide you through:
1. App selection check
2. Ads SDK status verification (MANDATORY before any integration)
3. Integration code generation (only when status conditions are met)

This tool has NO prerequisites - call it immediately when ads topic comes up.`,
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
      description: `[Step 2 of Ads Workflow] Check ads SDK activation status and cache ad space ID.

**PREREQUISITE: An app MUST be selected first.**
Before calling this tool, ALWAYS call get_current_app_info to verify
an app is selected. If not, guide user through app selection process.

**When to call this tool:**
- First time: when no ads status exists in local cache
- Refresh: when user explicitly asks to re-check status (e.g. after activating ads in developer console)

**DO NOT auto-poll** - only call when user requests or when no cached status exists.

This tool queries the server, updates local cache, and returns:
- Business status: 0=未开通 | 1=资料审核中 | 2=已生效 | 3=账号已被封禁
- Ad space ID (space_id) - cached when status is "已生效"
- Guidance URL for activation (if needed)

**CRITICAL - Dual condition for proceeding to Step 3:**
Both conditions MUST be met simultaneously:
1. Status must be "已生效" (status === 2)
2. space_id must be valid (non-empty string)
If status is 2 but space_id is empty → server-side issue, tell user to retry later.

**Status 0/1:** Tell user they can say "重新检查广告状态" to refresh after completing activation/review.
**Status 3 (已封禁):** DO NOT proceed with any integration steps. Immediately inform user.`,
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
      description: `[Step 3 of Ads Workflow] Get complete ads integration code guide with actual ad space ID.

**PREREQUISITES (both MUST be met before calling):**
1. check_ads_status has been called and returned status "已生效" (2)
2. A valid space_id was cached by check_ads_status

If either condition is not met, this tool will return an error with guidance.

This tool reads the cached space_id and generates:
- Complete AdManager.js utility class (full source code with YOUR ad space_id)
- Core focus: Rewarded Video ads (激励视频) - init() + onReward() + showRewardedVideo()
- Optional: Interstitial and Banner ads examples
- Code examples for all common scenarios

CRITICAL:
- NO Promise style, follows demo callback pattern
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
