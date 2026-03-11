/**
 * TapTap Ads Resources
 * 提供 AdManager 完整源码的 Resource（可选）
 */

import type { ResourceRegistration } from '../../core/types/index.js';
import { getAdManagerCode } from './docs.js';

/**
 * Resource 定义
 * 提供 AdManager.js 完整源码，方便 AI 直接访问
 */
export const adsResources: ResourceRegistration[] = [
  {
    uri: 'docs://ads/ad-manager',
    name: 'AdManager.js - Complete Source Code',
    description:
      'Complete AdManager.js utility class source code. Handles all 3 ad types (Rewarded Video, Interstitial, Banner). Copy and use directly in your TapTap minigame project. Focuses on Rewarded Video ads with onReward() callback interface.',
    mimeType: 'text/markdown',
    handler: async () => {
      return `# AdManager.js - 完整源码

## 使用说明

复制下面的代码到你的项目中（如 \`js/AdManager.js\`）

## 源代码

\`\`\`javascript
${getAdManagerCode('请先调用 check_ads_status 获取广告位ID')}
\`\`\`

## 快速使用

\`\`\`javascript
// 1. 初始化
adManager.init();

// 2. 绑定奖励回调
adManager.onReward(() => {
  player.coins += 100;
});

// 3. 显示广告
adManager.showRewardedVideo();  // 激励视频（核心）
adManager.showInterstitial();   // 插屏广告（可选）
adManager.showBanner();         // Banner 广告（可选）
\`\`\`
`;
    },
  },
];
