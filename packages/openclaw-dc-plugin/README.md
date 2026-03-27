# TapTap DC OpenClaw 插件

这是一个面向 OpenClaw 的 TapTap DC 插件，内置原始数据工具与运营简报 skill。

## 插件能力

- 以 OpenClaw 原生插件方式安装
- 内部启动已发布的 `@mikoto_zero/minigame-open-mcp` 运行时
- 暴露适合 agent / skill 消费的 TapTap DC 原始 JSON 工具
- 覆盖授权、选游戏、商店/评价/社区概览、商店快照、论坛内容、评价列表、点赞与官方回复
- 内置 `taptap-dc-ops-brief`，可把原始数据整理成简洁的运营简报

## 安装

```bash
openclaw plugins install @lotaber_wang/openclaw-dc-plugin
```

## 典型使用流程

1. 调用 `taptap_dc_check_environment`
2. 如果还没授权，调用 `taptap_dc_start_authorization`
3. 打开 `auth_url` 或扫描 `qrcode_url`
4. 完成后调用 `taptap_dc_complete_authorization`
5. 调用 `taptap_dc_list_apps`
6. 调用 `taptap_dc_select_app`
7. 再调用概览类工具，并配合内置 skill 生成简报

## 配置项

可选配置如下：

- `environment`: `production` or `rnd`
- `workspaceRoot`
- `cacheDir`
- `tempDir`
- `logRoot`
- `verbose`

正常情况下，如果内嵌的 TapTap MCP 主包已经带了可用凭据，生产环境不需要额外配置 `client_id` / `client_secret`。
