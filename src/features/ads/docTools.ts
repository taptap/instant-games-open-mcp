/**
 * TapTap Ads - 文档生成工具
 * 提供分层的广告接入指南（激励视频为核心，其他广告为额外内容）
 */

import {
  getAdManagerCode,
  REWARDED_VIDEO_EXAMPLES,
  INTERSTITIAL_EXAMPLES,
  BANNER_EXAMPLES,
} from './docs.js';
import { getSpaceIdFromCache } from './handlers.js';
import type { ResolvedContext } from '../../core/types/index.js';

/**
 * 获取完整的广告接入指南
 * 默认重点展示激励视频广告，其他广告作为额外内容
 *
 * @param ctx - ResolvedContext（用于读取缓存的广告位ID）
 * @returns 完整的广告接入指南文档
 */
async function getAdIntegrationGuide(ctx: ResolvedContext): Promise<string> {
  // 从缓存读取广告位 ID
  const spaceId = getSpaceIdFromCache(ctx);

  if (!spaceId) {
    return `❌ **无法生成广告接入指南**

请先完成以下步骤：

1. 确保已选择应用（调用 \`get_current_app_info\` 检查）
2. 调用 \`check_ads_status\` 检查广告功能状态
3. 如果状态为"已生效"，广告位 ID 会自动缓存
4. 然后再次调用本工具获取接入指南

**当前问题：** 缓存中未找到有效的广告位 ID，可能原因：
- 广告功能尚未开通（状态非"已生效"）
- 未调用 \`check_ads_status\` 工具
- 应用未选择

请先调用 \`check_ads_status\` 工具。`;
  }

  // 生成 AdManager 代码（使用实际的 space_id）
  const adManagerCode = getAdManagerCode(spaceId);

  return `# 🎮 TapTap 小游戏广告接入指南

## 📌 核心理念

**超简单接入！复制 → 初始化 → 显示**

- ✅ 使用封装好的 AdManager 工具类
- ✅ 核心功能：激励视频广告（最常用）
- ✅ 额外功能：插屏广告、Banner 广告（可选）
- ✅ **你的广告位 ID：\`${spaceId}\`**（已自动配置到代码中）

---

## 🎯 第一部分：激励视频广告（核心，必读）

### 🚀 三步完成激励视频接入

#### 步骤 1️⃣：复制 AdManager.js 到项目

将下面的 AdManager.js 代码复制到你的项目中（如 \`js/AdManager.js\`）

**注意：广告位 ID（${spaceId}）已经内置到代码中，无需手动修改。**

#### 步骤 2️⃣：在游戏启动时初始化

\`\`\`javascript
// main.js 或游戏入口文件
async function initGame() {
  // 初始化广告管理器（会自动获取广告位配置）
  await adManager.init();
  console.log('广告初始化完成');
}

initGame();
\`\`\`

#### 步骤 3️⃣：绑定奖励回调 + 显示广告

\`\`\`javascript
// 绑定奖励回调（用户看完广告后自动调用）
adManager.onReward(() => {
  console.log('用户看完广告，发放奖励');
  player.coins += 100;  // 发放金币
  showRewardMessage('获得 100 金币！');
});

// 在需要的时候显示广告
function onGetCoinsButtonClick() {
  adManager.showRewardedVideo();
}
\`\`\`

### 📦 AdManager.js 完整源码

\`\`\`javascript
${adManagerCode}
\`\`\`

---

### 💡 激励视频广告使用示例（核心场景）

${REWARDED_VIDEO_EXAMPLES}

---

### ⚠️ 核心接口说明

| 方法 | 说明 | 示例 |
|------|------|------|
| \`init()\` | 初始化广告管理器（必须在使用前调用） | \`adManager.init();\` |
| \`onReward(callback)\` | 绑定奖励回调（用户看完广告后自动调用） | \`adManager.onReward(() => { player.coins += 100; });\` |
| \`showRewardedVideo()\` | 显示激励视频广告 | \`adManager.showRewardedVideo();\` |

---

### 🔑 核心逻辑解释

**AdManager 如何判断用户是否看完广告？**

\`\`\`javascript
// 在 AdManager 内部，onClose 回调会接收 res 参数
this.rewardedVideoAd.onClose((res) => {
  if (res.isEnded) {
    // ✅ 用户看完广告，调用你绑定的奖励回调
    this.rewardCallback();
  } else {
    // ⚠️ 用户提前关闭，不发放奖励
  }
});
\`\`\`

**你只需要：**
1. 调用 \`onReward()\` 绑定奖励回调
2. 调用 \`showRewardedVideo()\` 显示广告
3. AdManager 自动判断并调用你的回调

---

## 📦 第二部分：其他广告类型（可选，按需使用）

> ⚠️ **注意**：插屏广告和 Banner 广告使用率较低，仅在用户明确需要时提供。
>
> 如果你只需要激励视频广告，**可以跳过这部分**。

---

### 插屏广告（Interstitial Ad）

**使用场景：** 关卡结束、游戏暂停、返回主菜单等

**特点：**
- 无需预初始化
- 每次创建新实例
- 自动销毁

**代码示例：**

${INTERSTITIAL_EXAMPLES}

**接口说明：**

| 方法 | 说明 | 示例 |
|------|------|------|
| \`showInterstitial()\` | 显示插屏广告（无需预初始化） | \`adManager.showInterstitial();\` |

---

### Banner 广告（Banner Ad）

**使用场景：** 主菜单底部、游戏界面底部等

**特点：**
- 需要先调用 \`initBanner()\` 初始化
- 可以显示/隐藏
- 支持自定义位置和大小

**代码示例：**

${BANNER_EXAMPLES}

**接口说明：**

| 方法 | 说明 | 示例 |
|------|------|------|
| \`initBanner(options)\` | 初始化 Banner 广告 | \`adManager.initBanner({ position: 'bottom' });\` |
| \`showBanner()\` | 显示 Banner 广告 | \`adManager.showBanner();\` |
| \`hideBanner()\` | 隐藏 Banner 广告 | \`adManager.hideBanner();\` |
| \`refreshBanner(options)\` | 刷新 Banner（销毁旧的并创建新的） | \`adManager.refreshBanner();\` |

**配置选项：**

\`\`\`javascript
adManager.initBanner({
  width: 320,              // 可选，默认：屏幕宽度
  height: 100,             // 可选，默认：100
  position: 'bottom'       // 可选，'top' | 'bottom'，默认：'bottom'
});
\`\`\`

---

## ✅ 完成！

### 快速回顾：

**激励视频广告（核心，必须）：**
\`\`\`javascript
await adManager.init();
adManager.onReward(() => { giveReward(); });
adManager.showRewardedVideo();
\`\`\`

**插屏广告（可选）：**
\`\`\`javascript
await adManager.init();
adManager.showInterstitial();
\`\`\`

**Banner 广告（可选）：**
\`\`\`javascript
await adManager.init();
adManager.initBanner();
adManager.showBanner();
adManager.hideBanner();
\`\`\`

---

## 🔍 常见问题

### Q1: 必须使用所有 3 种广告吗？

**A**: 不需要！大部分游戏只使用激励视频广告就足够了。插屏和 Banner 广告是可选的。

### Q2: 可以动态更改奖励回调吗？

**A**: 可以！每次调用 \`onReward()\` 都会更新回调函数，适合多场景使用。

\`\`\`javascript
// 场景 1：复活
function showReviveAd() {
  adManager.onReward(() => player.revive());
  adManager.showRewardedVideo();
}

// 场景 2：金币
function showCoinsAd() {
  adManager.onReward(() => player.coins += 100);
  adManager.showRewardedVideo();
}
\`\`\`

### Q3: 广告加载失败怎么办？

**A**: AdManager 已经内置了错误处理，会在控制台输出详细日志。你可以通过监听 \`onError\` 回调来自定义错误处理（高级用法）。

### Q4: 如何预加载广告？

**A**: AdManager 在 \`init()\` 时会自动获取广告位配置并预加载激励视频广告，无需手动操作。每次播放后也会自动重新加载。

---

## 📚 官方文档链接

更多底层 API 细节，请参考 TapTap 官方文档：
- **激励视频广告**: https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/
- **插屏广告**: https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/interstitial-ad/
- **Banner 广告**: https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/banner-ad/
`;
}

/**
 * 获取广告接入完整工作流指引
 * 无需认证、无前置条件，作为 AI 的入口工具返回文本
 *
 * @returns 完整的广告接入工作流指引
 */
function getAdsIntegrationWorkflow(): string {
  return `# TapTap 广告接入完整工作流

## ⚠️ 核心原则

**任何广告相关操作之前，必须先检查广告 SDK 状态。**

广告状态会缓存在本地，若本地无缓存则需查询服务器。
状态为"未开通"时，用户可主动要求重新查询以获取最新状态。

---

## 📋 完整步骤

### 步骤 1: 确认应用已选择

**工具**：\`get_current_app_info\`

检查当前是否已选择应用。如果未选择：
1. 调用 \`list_developers_and_apps\` 获取应用列表
2. 展示列表并让用户选择
3. 调用 \`select_app\` 确认选择

### 步骤 2: 检查广告 SDK 状态（必须！）

**工具**：\`check_ads_status\`

此工具会自动执行以下逻辑：
- 读取本地缓存中的广告状态
- 若无缓存，自动查询服务器并更新本地缓存
- 返回当前状态及处理指引

**根据状态执行不同动作：**

| 状态码 | 状态 | AI 应执行的动作 |
|--------|------|----------------|
| 0 | 未开通 | 展示开通链接，**阻止**继续接入。告知用户开通后可再次调用 \`check_ads_status\` 刷新状态 |
| 1 | 已生效 | ✅ 服务器返回 ad_spaces 数组（横屏 type=1 / 竖屏 type=2 各一个），工具会自动根据游戏横竖屏设置匹配对应广告位，满足条件后继续步骤 3 |
| 2 | 已封禁 | 展示封禁警告，**立即阻止**所有后续操作 |

**重要：** 状态为"已生效"时，工具会自动完成以下两步校验：
1. ad_spaces 数组非空（否则提示服务端异常）
2. 游戏已设置横竖屏方向（否则提示用户先调用 \`update_app_info\` 设置 screenOrientation）

两步均通过后，自动匹配正确的广告位 ID 并缓存，然后引导调用 \`get_ad_integration_guide\`。

### 步骤 3: 获取广告接入代码指南

**工具**：\`get_ad_integration_guide\`

**前提条件（两个必须同时满足）：**
1. ✅ 广告状态为"已生效"（status === 1）
2. ✅ 广告位 ID（space_id）有效（非空字符串）

此工具会：
- 从缓存读取 space_id
- 生成带有真实广告位 ID 的完整 AdManager.js 源码
- 提供激励视频广告（核心）+ 插屏/Banner（可选）的接入代码和示例

---

## 🔄 状态刷新机制

当广告状态为"未开通"时，用户可能在开发者后台完成操作后
想要刷新状态。此时用户只需说"重新检查广告状态"或类似话语，
AI 应再次调用 \`check_ads_status\` 工具（该工具会强制重新查询服务器并更新缓存）。

**不要自动轮询**，始终由用户主动触发刷新。

---

## ✅ 流程图

\`\`\`
用户提出广告相关需求
    ↓
[步骤1] 检查应用是否已选择
    ↓
[步骤2] 调用 check_ads_status 检查广告状态
    ↓
  状态 0 (未开通) → 展示开通链接，等待用户操作后主动刷新
  状态 1 (已生效) → 检查 space_id 是否有效
      ├── space_id 有效 → [步骤3] 调用 get_ad_integration_guide
      └── space_id 无效 → 提示服务端异常，稍后重试
  状态 2 (已封禁) → 展示警告，阻止所有操作
\`\`\`

## 📝 注意事项

- 客户端无需安装 SDK，tap 是全局对象
- 不要搜索网页，所有文档由 \`get_ad_integration_guide\` 工具提供
- 广告代码中不使用 Promise 风格，遵循 demo 回调模式
- 核心关注激励视频广告，插屏和 Banner 为可选内容
`;
}

export const adsTools = {
  getAdIntegrationGuide: getAdIntegrationGuide,
  getAdsIntegrationWorkflow,
};
