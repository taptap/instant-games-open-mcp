# TapTap Maker 客户端插件

TapTap Maker 的 Codex 与 WorkBuddy 客户端插件发布页。

- 插件版本：`0.0.1`
- 内置 Maker MCP 版本：`0.0.30`

## 交给 AI 安装

将本页面链接交给 Codex 或 WorkBuddy，并告诉 AI：`安装这个 TapTap Maker 插件`。AI 应根据
当前客户端选择对应安装方式，不要安装独立 npm MCP。

### Codex

```bash
codex plugin marketplace add taptap/instant-games-open-mcp --ref main \
  --sparse .agents/plugins --sparse plugins/taptap-maker
codex plugin add taptap-maker@taptap-maker
```

### WorkBuddy

在插件市场中添加本 GitHub 仓库作为本地市场源，然后安装 `taptap-maker`。如果当前版本暂不
支持 GitHub 市场源，可下载下方 WorkBuddy ZIP 并按客户端的本地插件导入方式安装。

## 下载

- [Codex 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/taptap-maker-codex-plugin-0.0.1.zip)
- [WorkBuddy 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/taptap-maker-workbuddy-plugin-0.0.1.zip)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/SHA256SUMS)

ZIP 是完整的离线 marketplace 包。AI 下载对应 ZIP 和 `SHA256SUMS`、验证 SHA-256 并解压后：

- Codex：执行 `codex plugin marketplace add <解压目录>`，再执行
  `codex plugin add taptap-maker@taptap-maker`。
- WorkBuddy：在 `/plugin` 中把解压目录添加为 marketplace，安装 `taptap-maker`，然后执行
  `/reload-plugins`。

插件内置本地 MCP runtime、CLI、工作流 Skills 和连接排障文档。运行时不会通过 npm 或 npx
下载或启动 Maker 包。

插件会复用现有 Maker 鉴权和项目绑定。首次使用时先通过插件内 CLI 检查旧的独立 Maker MCP；
只有用户明确确认后，才把旧 Codex 注册设置为 `enabled = false`。迁移会保留最新备份并支持恢复，
不会删除旧注册、鉴权、项目绑定或游戏文件。

正常 Maker 开发流程见 `skills/taptap-maker-local/SKILL.md`。
