/**
 * Ads Feature Module
 * Provides tools and resources for TapTap Ads APIs (Rewarded Video, Interstitial, Banner)
 * Tools and resources use enhanced descriptions to guide AI to use local docs instead of web search
 */

import type { FeatureModule } from '../../core/types/index.js';

// Import from ads module
import { adsTools_Registration } from './tools.js';
import { adsResources } from './resources.js';

/**
 * Ads Module Definition
 * Provides both tools and resources with enhanced descriptions
 * Tools are prioritized - AI should use tools instead of searching the web
 * Resources provide additional documentation access
 *
 * 工具认证需求：
 * - get_ads_integration_workflow: 无需认证（返回静态工作流文本）
 * - check_ads_status: 需要认证（查询服务器）
 * - get_ad_integration_guide: 无需认证（从缓存读取 + 生成文档）
 */
export const adsModule: FeatureModule = {
  name: 'ads',

  tools: adsTools_Registration.map((tool) => ({
    definition: tool.definition,
    handler: tool.handler,
    requiresAuth: tool.definition.name === 'check_ads_status',
  })),

  // Resources with their handlers (unified format)
  // Enhanced descriptions help AI discover and prioritize these resources
  resources: adsResources,
};
