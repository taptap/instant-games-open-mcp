# TapTap Maker WorkBuddy Plugin

插件版本：0.0.3。内置 Maker MCP 版本：0.0.32。插件包含本地 MCP runtime、
CLI、工作流 Skills、快捷命令和连接排障文档。启动器优先使用 WorkBuddy 管理的 Node.js，必要时
回退系统 Node.js，不会通过 npm 或 npx 下载和启动 Maker。

WorkBuddy 会话启动时，插件会只读检查是否仍有独立 Maker MCP 启用。发现冲突后会要求 AI 先向
用户说明风险并取得明确确认，再把旧注册设置为 `disabled: true`；插件不会未经确认修改配置。

在空 workspace 中使用 `/taptap-maker:create-project` 创建新游戏，或使用
`/taptap-maker:sync-project` 同步已有 Maker 游戏。插件复用现有 Maker 鉴权和项目绑定。

初始化或更新 dev-kit 后，插件会把项目内 `.installer/skills` 中的 Skills 补充到
`.workbuddy/skills/taptap-maker-*`。同步只补齐缺失项，不覆盖已有同名 Skill。

正式发布 ZIP 直接以插件根目录作为压缩包根目录，不包含额外的 `taptap-maker/` 或
`plugins/workbuddy/taptap-maker/` 外层目录。WorkBuddy 产物目录深度最多为两层，并在根目录包含
`.codebuddy-plugin/plugin.json`、`.mcp.json`、`README.md` 和 `SKILL.md`。
