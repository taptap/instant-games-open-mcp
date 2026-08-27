/**
 * TapTap Ads Resources
 * 为旧客户端保留广告接入 Resource URI
 */

import type { ResourceRegistration } from '../../core/types/index.js';

/**
 * Resource 定义
 * 代码只能在广告位自动查询成功后由 get_ad_integration_guide 生成
 */
export const adsResources: ResourceRegistration[] = [
  {
    uri: 'docs://ads/ad-manager',
    name: 'AdManager.js - Ads Workflow Entry',
    description:
      'Compatibility entry that only supports TapTap Minigame/H5 ad integration and must not be used for TapTap Maker/UrhoX projects. Use get_ads_integration_workflow first; copy-ready AdManager.js code is available only from get_ad_integration_guide after check_ads_status automatically resolves the ad space ID.',
    mimeType: 'text/markdown',
    handler: async () => {
      return `# TapTap 小游戏广告接入入口

这个 Resource 为兼容旧客户端保留，不直接提供带占位广告位 ID 的代码。

**适用范围：本流程仅适用于 TapTap 小游戏/H5，不适用于 TapTap Maker/UrhoX。两套 MCP 的工具、应用上下文、广告配置和运行时 API 不得混用。**

## 正确流程

1. 调用 \`get_ads_integration_workflow\` 获取完整流程。
2. 调用 \`check_ads_status\`，由 MCP 自动查询并缓存广告位 ID。
3. 调用 \`get_ad_integration_guide\` 获取已经注入真实广告位 ID 的代码。

**不要向开发者索要广告位 ID，也不要使用开发者手工提供的 ID 作为兜底。**
`;
    },
  },
];
