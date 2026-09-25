# Maker 成就

本地 Maker MCP 把 `achievement` 原样转发给远端 maker-tools。参数和返回都不在本地改写。具体 `op`、必填字段和业务规则以工具描述为准，也就是远端成就工具的契约。

## 调用链路

本地只从 `.maker-mcp/config.json` 读取 `project_id` 和 `user_id`，连同 PAT 换到的 MAC token，转发 `achievement`。远端 maker-tools 再用这些身份定位远端 workspace。`sync_achievements` 以及其它成就操作都由远端读取 `.project/project.json` 里的 `taptap_publish.app_id`、`taptap_publish.developer_id`，并读写远端 `.project/achievements.lock.json`。

本机游戏工程里的 `.project/` 是另一份检出。成就工具不会读它，也不会把 lock 写回本机。`lock_sync.path` 是远端相对路径。

## 本地不做的事

- 不在本地预检 `taptap_publish`。缺身份时由远端返回错误。
- 不把本地图片路径或生图登记改写成 `image_url`。
- 不下载、不写入本机 `.project/achievements.lock.json`。
- 不把远端 `success=false` 改成另一套本地错误。
- 若返回 `success=true`、`remote_applied=true` 且 `lock_sync.synced=false`，平台写入已经成功。只再调用 `sync_achievements`，不要重放原来的写操作。

## 运行时

管理工具可用只说明远端定义可以操作。游戏内解锁和进度要按该项目自己的 Runtime SDK 文档接入。不要编造 Lua API，也不要借用小游戏或 H5 成就 SDK。
