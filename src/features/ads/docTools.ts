import { getAdManagerCode, REWARDED_VIDEO_EXAMPLES } from './docs.js';
import { getCachedPlacements } from './handlers.js';
import type { ResolvedContext } from '../../core/types/context.js';

async function getAdIntegrationGuide(ctx: ResolvedContext): Promise<string> {
  const placements = getCachedPlacements(ctx);
  if (!placements) {
    return `❌ **无法生成广告接入指南**

请确认已选择应用，并调用 \`check_ads_status\`。广告已生效且服务端返回可用的国内激励位后再继续。
如果已开通但没有可用广告位，请核查广告风控或广告位配置。不要向开发者索要广告位 ID。`;
  }

  return `# 🎮 TapTap 小游戏广告接入指南

## 📌 核心理念

**超简单接入！复制 → 初始化 → 显示**

- ✅ 使用封装好的 AdManager 工具类
- ✅ 核心功能：激励视频广告（最常用）
- ✅ MCP 自动写入本应用的激励位，创建广告时按游戏窗口方向选位

---

## 🎯 激励视频广告

### 🚀 三步完成激励视频接入

#### 步骤 1️⃣：复制 AdManager.js 到项目

将下面的 AdManager.js 代码复制到你的项目中（如 \`js/AdManager.js\`）

请在游戏窗口尺寸就绪后初始化。如果服务端只返回一个方向的激励位，仅该方向可以加载。
游戏切换方向后，可在广告关闭后调用 \`destroy()\` 再重新初始化。

#### 步骤 2️⃣：在游戏启动时初始化

\`\`\`javascript
// main.js 或游戏入口文件
async function initGame() {
  await adManager.init();
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
${getAdManagerCode(placements)}
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

## ✅ 完成！

### 快速回顾：

**激励视频广告（核心，必须）：**
\`\`\`javascript
await adManager.init();
adManager.onReward(() => { giveReward(); });
adManager.showRewardedVideo();
\`\`\`

---

## 🔍 常见问题

### Q1: 可以动态更改奖励回调吗？

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

### Q2: 广告加载失败怎么办？

**A**: AdManager 会在 \`show()\` 因广告未就绪而失败时调用 \`load()\`，并在加载完成后重试一次；
重试仍失败时只记录错误，不发放奖励。你也可以通过监听 \`onError\` 回调补充业务提示。

### Q3: 如何预加载广告？

**A**: AdManager 在 \`init()\`
时预加载激励视频广告；如果显示时尚未就绪，会重新加载并只重试一次。

---

## 📚 官方文档链接

更多底层 API 细节，请参考 TapTap 官方文档：
- **激励视频广告**: https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/
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
MCP 将有效激励位写入接入代码，创建广告时按游戏窗口方向选位。后台横竖屏设置无需参与广告检查。
**不要向开发者索要广告位 ID，也不要复用其他应用、历史输出或示例中的 ID。**

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
| 1 | 已生效 | 有可用国内激励位时进入步骤 3；否则暂停，核查广告风控或广告位配置 |
| 2 | 已封禁 | 展示封禁警告，**立即阻止**所有后续操作 |

**能力边界：** \`status=1\` 且有可用激励位表示可以生成接入代码，不代表 \`window.tap\` 已注入，
不代表当前 ZIP 已正确上传，也不代表广告已在真机环境中成功播放。最终播放必须在 TapTap 小游戏/H5
宿主环境中验证。

### 步骤 3: 获取广告接入代码指南

**工具**：\`get_ad_integration_guide\`

**前提条件：** 广告状态为"已生效"（status === 1），且本次 \`check_ads_status\` 已返回可用激励位。

此工具会：
- 生成带当前应用有效激励位的 AdManager.js 源码和激励视频示例。

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
  状态 1 (已生效) → 无可用激励位时暂停，有可用激励位时进入 [步骤3] 调用 get_ad_integration_guide
  状态 2 (已封禁) → 展示警告，阻止所有操作
\`\`\`

## 📝 注意事项

- 在 TapTap 小游戏/H5 宿主中，\`tap\` 由宿主提供；普通浏览器中不能假设该对象存在
- 不要搜索网页，所有文档由 \`get_ad_integration_guide\` 工具提供
- 不要向开发者索要或接受手工提供的广告位 ID
- SDK 事件使用回调；仅在 \`show/load\` 的一次恢复重试中使用 Promise 链
- H5 接入指南仅生成激励视频代码
`;
}

export const adsTools = {
  getAdIntegrationGuide: getAdIntegrationGuide,
  getAdsIntegrationWorkflow,
};
