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
import { getAdsActivation } from './handlers.js';
import type { ResolvedContext } from '../../core/types/index.js';

/**
 * 获取完整的广告接入指南
 * 默认重点展示激励视频广告，其他广告作为额外内容
 *
 * @param ctx - ResolvedContext（用于读取缓存的广告开通状态）
 * @returns 完整的广告接入指南文档
 */
async function getAdIntegrationGuide(ctx: ResolvedContext): Promise<string> {
  // 广告位由服务端下发，这里只需要确认广告功能已开通
  const activation = getAdsActivation(ctx);

  if (!activation.activated) {
    return `❌ **无法生成广告接入指南**

请先完成以下步骤：

1. 确保已选择应用（调用 \`get_current_app_info\` 检查）
2. 调用 \`check_ads_status\` 检查广告功能状态
3. 状态为"已生效"后，再次调用本工具获取接入指南

**当前问题：** 缓存中没有可用的广告状态，可能原因：
- 广告功能尚未开通（状态非"已生效"）
- 未调用 \`check_ads_status\` 工具
- 应用未选择

**不要向开发者索要广告位 ID，也不要使用开发者手工提供的 ID。**
广告位由平台按游戏实际方向自动下发，接入代码里不需要任何广告位 ID。

请先调用 \`check_ads_status\` 工具。`;
  }

  const adManagerCode = getAdManagerCode();

  return `# 🎮 TapTap 小游戏广告接入指南

## 📌 核心理念

**超简单接入！复制 → 初始化 → 显示**

- ✅ 使用封装好的 AdManager 工具类
- ✅ 核心功能：激励视频广告（最常用）
- ✅ 额外功能：插屏广告、Banner 广告（可选）
- ✅ **广告位由服务端按游戏方向自动下发**，源码里不需要填广告位 ID

---

## 🎯 第一部分：激励视频广告（核心，必读）

### 🚀 三步完成激励视频接入

#### 步骤 1️⃣：复制 AdManager.js 到项目

将下面的 AdManager.js 代码复制到你的项目中（如 \`js/AdManager.js\`）

**注意：代码里不需要填写广告位 ID，平台会在游戏启动时按实际方向下发对应广告位。**

#### 步骤 2️⃣：在游戏启动时初始化

\`\`\`javascript
// main.js 或游戏入口文件
async function initGame() {
  // 初始化广告管理器（广告位由服务端下发，无需配置）
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

**A**: AdManager 会在 \`show()\` 因广告未就绪而失败时调用 \`load()\`，并在加载完成后重试一次；
重试仍失败时只记录错误，不发放奖励。你也可以通过监听 \`onError\` 回调补充业务提示。

### Q4: 如何预加载广告？

**A**: 广告位由服务端在游戏启动时下发，代码里不需要任何广告位 ID。AdManager 在 \`init()\`
时预加载激励视频广告；如果显示时尚未就绪，会重新加载并只重试一次。

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

## MCP 适用范围

**本流程仅适用于 TapTap 小游戏/H5，不适用于 TapTap Maker/UrhoX。**

- 当前 MCP 使用 TapTap 小游戏/H5 的全局 \`tap\` JavaScript API。
- 如果用户或项目明确属于 Maker/UrhoX，应停止本流程并提示改用 Maker MCP。
- 禁止混用两套 MCP 的工具、应用上下文、广告配置、广告位 ID 或运行时 API。

## ⚠️ 核心原则

**任何 TapTap 小游戏/H5 广告相关操作之前，必须先检查服务端广告变现状态与配置。**

广告状态由 \`check_ads_status\` 从服务器自动查询并缓存。
当前选中应用的本次 \`check_ads_status\` 查询结果是广告配置的唯一来源。
**广告位由平台按游戏实际方向自动下发，接入代码里不需要填写广告位 ID。**
**不要向开发者索要广告位 ID，也不要让开发者手工填写 ID。**
也不要把广告位 ID 写进示例代码或文档；开发者不需要知道它。

---

## 📋 完整步骤

### 步骤 1: 确认应用已选择

**工具**：\`get_current_app_info\`

检查当前是否已选择应用。如果未选择：
1. 调用 \`list_developers_and_apps\` 获取应用列表
2. 展示列表并让用户选择
3. 调用 \`select_app\` 确认选择

### 步骤 2: 检查广告变现状态与服务端配置（必须！）

**工具**：\`check_ads_status\`

此工具会自动查询服务器、更新本地缓存，并返回当前状态及处理指引。

**根据状态执行不同动作：**

| 状态码 | 状态 | AI 应执行的动作 |
|--------|------|----------------|
| 0 | 未开通 | 展示开通链接，**阻止**继续接入。告知用户开通后可再次调用 \`check_ads_status\` 刷新状态 |
| 1 | 已生效 | ✅ 服务器返回横/竖两个广告位配置，工具会缓存开通状态，可直接进入步骤 3 |
| 2 | 已封禁 | 展示封禁警告，**立即阻止**所有后续操作 |

**重要：** 状态为"已生效"即可继续接入。**不需要**让开发者设置横竖屏、也**不需要**匹配或填写广告位 ID——
广告位由平台在游戏启动时按实际方向自动下发。

**能力边界：** \`status=1\` 只表示可以生成接入代码，不代表 \`window.tap\` 已注入，
不代表当前 ZIP 已正确上传，也不代表广告已在真机环境中成功播放。最终播放必须在 TapTap 小游戏/H5
宿主环境中验证。

### 步骤 3: 获取广告接入代码指南

**工具**：\`get_ad_integration_guide\`

**前提条件：** 广告状态为"已生效"（status === 1），且已调用过 \`check_ads_status\`。

此工具会：
- 生成**不含任何广告位 ID** 的完整 AdManager.js 源码（广告位由服务端下发）
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
  状态 1 (已生效) → [步骤3] 调用 get_ad_integration_guide
  状态 2 (已封禁) → 展示警告，阻止所有操作
\`\`\`

## 📝 注意事项

- 在 TapTap 小游戏/H5 宿主中，\`tap\` 由宿主提供；普通浏览器中不能假设该对象存在
- 不要搜索网页，所有文档由 \`get_ad_integration_guide\` 工具提供
- 不要向开发者索要或接受手工提供的广告位 ID
- SDK 事件使用回调；仅在 \`show/load\` 的一次恢复重试中使用 Promise 链
- 核心关注激励视频广告，插屏和 Banner 为可选内容
`;
}

export const adsTools = {
  getAdIntegrationGuide: getAdIntegrationGuide,
  getAdsIntegrationWorkflow,
};
