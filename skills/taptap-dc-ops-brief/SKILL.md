---
name: taptap-dc-ops-brief
description: 生成 TapTap 当前游戏 DC 运营简报与结论解读（商店/评价/社区）。适用于运营或工作室开发者需要快速看曝光/下载/预约等指标、评价与社区走势，并在许可后执行点赞/官方回复评价。
---

# TapTap DC 运营简报（当前游戏）

## 适用范围

- 面向人群：运营同学、工作室开发者
- 输出目标：用最少认知成本，把 DC 数据变成“结论 + 重点解读 + 下一步建议”
- 数据来源：本仓库 TapTap MCP 的 `current-app DC` tools（商店/评价/社区 overview、store snapshot、forum、reviews、like、reply）
- 重要约束：任何写操作（点赞/官方回复）都必须先征得用户许可

## 快速工作流（默认）

1. 自检 MCP 是否可用
   - 优先调用 `check_environment`（若 tools 不可用，见“安装与配置”）
2. 确认当前已选择应用
   - 调用 `get_current_app_info`
   - 若未选择：调用 `list_developers_and_apps`，展示列表并让用户指定，再调用 `select_app`
3. 拉取数据（只读）
   - `get_current_app_store_overview`
   - `get_current_app_review_overview`
   - `get_current_app_community_overview`
   - 需要“结果型快照”时再调用 `get_current_app_store_snapshot`
   - 需要看具体内容时再调用：`get_current_app_reviews`、`get_current_app_forum_contents`
4. 输出“30 秒可读”的简报
   - 结论优先，其次给少量关键指标与解释
   - 指标口径以 `references/metrics.md` 为准
   - 若使用 `page_view_count`，请明确写成“详情页访问量（PV）”，不要简称为“TapTap 曝光量”
5. （可选）给出“是否建议点赞/回复”的动作建议
   - 必须先说明理由与风险
   - 点赞/回复只在用户明确同意后才调用 `like_current_app_review` / `reply_current_app_review`

## 输出格式（默认模板）

输出尽量短，一屏内读完：

1. **结论（3 行内）**
2. **关键指标（仅列 5-8 个最相关）**
3. **变化与解读（最多 3 点）**
4. **建议动作（最多 3 条，且需你确认才执行）**

当用户希望更“报告化”时，允许扩展一段“风险与机会”，仍保持简短。

## 安装与配置（MCP 自检优先）

如果发现无法调用 TapTap MCP tools（例如没有 `check_environment` / tool 列表里缺失），按这个顺序处理：

1. 确认 Codex 已配置 MCP server
   - Codex Desktop 通常使用 `~/.codex/config.toml` 的 `[mcp_servers.*]` 配置
2. 需要新增一个 server（示例名可用 `taptap_mcp`）
   - `command = "npx"`
   - `args = ["-y", "@taptap/minigame-open-mcp@latest"]`
3. 认证与参数
   - **默认线上用法不需要再向用户索要 `TAPTAP_MCP_CLIENT_ID` 或 `TAPTAP_MCP_CLIENT_SECRET`**
   - 发布到 npm 的正式包通常已经内置生产环境所需参数，安装后应先直接尝试 `check_environment`
   - 只有在以下场景才需要额外环境变量：本地开发、自托管、指定 RND 环境、或包维护者明确要求覆盖默认配置
   - 如需显式覆盖，常见变量为：`TAPTAP_MCP_ENV`、`TAPTAP_MCP_CLIENT_ID`、`TAPTAP_MCP_CLIENT_SECRET`
4. 首次授权
   - 走 `start_oauth_authorization` -> 用户扫码 -> `complete_oauth_authorization`

说明：

- 本 skill 在需要时可以自动引导安装与配置，但会尽量先用只读方式自检，避免误改环境。
- **除非明确是开发/自托管场景，否则不要先向用户索要参数；优先假设正式 npm 包可直接安装并完成扫码授权。**

## 点赞与回复（必须征得许可）

### 点赞建议（like_current_app_review）

在以下情况下通常建议点赞（但仍需你确认）：

- 高质量长评、信息密度高
- 合理中立但指出问题且可复现
- 代表性常见疑问（便于“置顶语义”，引导其他用户）

### 官方回复建议（reply_current_app_review）

在以下情况下通常建议回复（但仍需你确认）：

- 负向评价且包含明确可行动信息（bug/性能/兼容/付费争议）
- 评价影响面大（互动高、信息被引用、集中出现同类问题）
- 需要给出“官方口径”或短期缓解方案

回复执行规则（硬约束）：

1. 先生成“回复草稿”（不直接发送）
2. 向用户展示：原评价摘要、拟回复、发送目标（review_id）
3. 用户明确同意后，才调用 `reply_current_app_review`

## 口径参考

- 指标口径与名称映射：见 `references/metrics.md`
- 动作判断 rubric：见 `references/actions_rubric.md`
