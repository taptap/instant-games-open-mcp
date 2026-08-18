# TapTap Maker WorkBuddy Plugin

插件版本：0.0.1。内置 Maker MCP 版本：0.0.30。插件包含本地 MCP runtime、
CLI、工作流 Skills、快捷命令和连接排障文档。启动器优先使用 WorkBuddy 管理的 Node.js，必要时
回退系统 Node.js，不会通过 npm 或 npx 下载和启动 Maker。

在空 workspace 中使用 `/taptap-maker:create-project` 创建新游戏，或使用
`/taptap-maker:sync-project` 同步已有 Maker 游戏。插件复用现有 Maker 鉴权和项目绑定。
