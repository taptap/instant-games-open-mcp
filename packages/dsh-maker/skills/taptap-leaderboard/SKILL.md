---
name: taptap-leaderboard
description: 接入或修改 TapTap 排行榜时使用。触发词：排行榜、榜单、分数提交、submitScores、openLeaderboard、leaderboardManager、getLeaderboardManager。
---

# TapTap 排行榜接入（Maker）

## 硬规则（先读）

- **真相源 = 工程内 `engine-docs/recipes/sdk.md`**（及其中排行榜章节）。写代码前先读它。
- **禁止 web_search 查 TapTap 排行榜 API**。Maker 引擎文档只在工程内，公网没有官方版；网上能搜到的是其它平台（微信小游戏等）的文档，属于错误信息源。
- **`tap` 是全局对象**，由 TapTap 运行时自动提供：**不要 `npm install`、不要 import/require**。

## 范围说明（重要）

- 本 DSH 会话是 **Maker MCP**，只提供**客户端（游戏内）**接入能力。
- **服务端排行榜管理工具（`create_leaderboard`、`list_leaderboards`、`publish_leaderboard` 等）不在此会话中**（它们在独立的 TapTap 开放平台 MCP 里）。若用户需要创建/发布排行榜，说明这一点，并引导到 TapTap 开发者后台或使用配置了那个 MCP 的其它客户端。

## 工作流（客户端接入）

1. 获取实例（无需安装）：
   ```javascript
   const leaderboardManager = tap.getLeaderboardManager();
   ```
2. 提交分数：`leaderboardManager.submitScores({ scores: [{ leaderboardId, score }], ... })`。
3. 读榜单：`leaderboardManager.loadLeaderboardScores(...)` / 读取当前玩家分数 / 读取以玩家为中心的榜单（以工程文档为准的函数名与参数）。
4. 打开榜单界面：`openLeaderboard(...)`（是否可用及形态以工程文档为准）。
5. `leaderboardId` 来自服务端创建的排行榜；代码里不要硬造 id。只信工程内文档，按其中真实签名实现，不凭记忆写参数。

## 常见错误

- `npm install`/`import` TapTap SDK——`tap` 是全局对象。
- 用错平台 API（微信小游戏排行榜等）——以 `engine-docs` 为准。
- 在 Maker MCP 会话里找 `create_leaderboard` 服务端工具——本会话没有，见"范围说明"。
- 把 `docs://leaderboard/*` 当可读资源——DSH 读不了 resources，用本 skill + 工程文档。
