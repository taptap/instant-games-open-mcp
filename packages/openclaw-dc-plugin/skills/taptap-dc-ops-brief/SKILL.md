---
name: taptap-dc-ops-brief
description: 生成 TapTap 当前游戏 DC 运营简报与结论解读（商店/评价/社区）。在 OpenClaw 中使用 bundled raw-data tools 拉原始 JSON，再由 skill 负责解读与行动建议。
---

# TapTap DC 运营简报（OpenClaw Plugin）

## 适用范围

- 面向人群：运营同学、工作室开发者
- 输出目标：用最少认知成本，把 TapTap DC 原始数据变成“结论 + 重点解读 + 下一步建议”
- 数据来源：当前 OpenClaw plugin 提供的 raw tools
- 重要约束：任何写操作（点赞/官方回复）都必须先征得用户许可

## 默认工作流

1. 优先走高层工具
   - 用户说“查游戏数据 / 给我看 TapTap DC / 生成运营简报”时，优先调用 `taptap_dc_quick_brief`
   - 如果用户给了游戏名，直接把 `app_name` 传进去
   - 如果用户给了 `app_id`，直接把 `app_id` 传进去
2. 如果未授权
   - `taptap_dc_quick_brief` 会直接返回授权信息，其中最前面的裸链接和 `details.preferred_auth_url` 都应视为首选授权入口
   - 如果用户当前在手机上对话，优先引导用户直接点击第一条裸链接，不要先强调扫码
   - 如果用户当前在桌面端对话，再引导用户打开授权页直链并扫码或转发到手机
   - 用户确认后调用 `taptap_dc_complete_authorization`
   - 然后再次调用 `taptap_dc_quick_brief`
3. 只有在用户明确要求更细的内容时，才退回到底层工具链
   - `taptap_dc_list_apps`
   - `taptap_dc_select_app`
   - `taptap_dc_get_store_overview`
   - `taptap_dc_get_review_overview`
   - `taptap_dc_get_community_overview`
   - `taptap_dc_get_store_snapshot`
   - `taptap_dc_get_reviews` / `taptap_dc_get_forum_contents`

## 输出要求

输出尽量短，一屏内读完：

1. 结论（3 行内）
2. 关键指标（仅列 5-8 个最相关）
3. 变化与解读（最多 3 点）
4. 建议动作（最多 3 条，且需用户确认后才执行）

## 关键规则

- 这些 plugin tools 返回的是 **raw JSON**，你要自己完成解读，不要把 JSON 原样长篇贴回给用户
- 当授权工具已经返回授权链接时，优先直接复用第一条裸直链；如果文本里链接缺失，就从 `details.preferred_auth_url` 取值，不要直接退化成“去扫二维码”
- `page_view_count` 应写成“详情页访问量（PV）”，不要偷换成别的口径
- `taptap_dc_like_review` / `taptap_dc_reply_review` 只能在用户明确确认后调用
- 如果回复结果里出现 `need_confirmation=true`，必须先把草稿给用户确认，再决定是否带 `confirm_high_risk=true` 重试

## 口径参考

- 指标口径：见 `references/metrics.md`
- 动作判断：见 `references/actions_rubric.md`
