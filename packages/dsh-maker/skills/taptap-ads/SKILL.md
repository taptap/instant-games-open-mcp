---
name: taptap-ads
description: 接入或修改 TapTap 广告（激励视频/插屏/横幅）时使用。触发词：广告、激励视频、播放广告、ad id、广告位、ad placement、ShowRewardVideoAd、get_ad_config。
---

# TapTap 广告接入（Maker）

## 硬规则（先读）

- **真相源 = 工程内 `engine-docs/recipes/sdk.md`**（及其中广告章节）。写任何广告代码前先读它。
- **禁止 web_search 查 TapTap 广告 API**。Maker 引擎文档只在工程内，公网没有官方版；网上能搜到的是微信小游戏、其它引擎或旧版文档，属于错误信息源。若用户或任务要求搜索，先说明这一点。
- 广告就绪状态以工具返回为准，不从本地 SDK 文档、`.maker-mcp/config.json` 或运行时回调推断。

## 工作流

1. 调 `maker_status_lite`（传 `target_dir`）确认工程是绑定且初始化的 Maker 项目。
2. 调 `get_ad_config`：它检查激活并同步当前广告配置到 `.project/settings.json` 的 `@runtime.ad`。
3. 若 `get_ad_config` 报缺失 `app_id` 或 `developer_id`：调 `generate_test_qrcode` 一次，再重试 `get_ad_config`。若 `ad.status` 不为 1，提示警告与 `ad.url`，等用户完成返回动作后再重试。
4. 配置可用后，读 `engine-docs/recipes/sdk.md` 的广告章节，按文档实现。激励视频用文档里的 `sdk:ShowRewardVideoAd`；仅在 `result.success === true` 时发放奖励。
5. 只信工具返回与工程内文档，不凭记忆写 API。

## 常见错误

- 用错平台 API（微信小游戏广告、其它引擎广告）——一律以 `engine-docs` 为准。
- 广告配置未就绪就写代码或自动构建——先 `get_ad_config`。
- 尝试读 `maker://ads-integration-guide` 资源——DSH 读不了 resources，用 `get_ad_config` 工具 + 本 skill。
- 本地主配置缺失时仍调用远程工具或反复自动重建——配置可用前保持不可用，只在用户明确构建/提交/预览请求时才构建。
