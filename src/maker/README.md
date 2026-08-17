# TapTap Maker MCP

TapTap Maker MCP 是面向 Maker 游戏本地开发的独立能力集合。它提供本地 MCP runtime、CLI、
Skills、项目初始化、素材生成、远端构建和预览流程。

本目录只介绍 Maker MCP。仓库根目录中的 TapTap Open API MCP 是另一套产品能力，两者拥有独立的
入口、版本和发布流程。

## 组成

- **Maker MCP**：提供项目状态、远端构建、图片/音频/视频/3D 素材生成、测试二维码、广告配置和
  玩家反馈等 tools 与 resources。
- **Maker CLI**：负责登录、PAT、项目选择或创建、clone、Python/Lua LSP、AI dev kit 和客户端
  MCP 配置。
- **Maker Skills**：约束 AI 客户端中的初始化、开发、构建、排障和插件迁移工作流。
- **Codex Plugin**：内置 Maker MCP、CLI、Skills 和文档，运行时不依赖外部 npm/npx。

## Codex Plugin

Codex 插件位于 [`plugins/taptap-maker`](../../plugins/taptap-maker)，当前 Maker 版本为
`0.0.30`。插件复用用户现有的 Maker 鉴权、项目绑定和游戏文件。

插件首次使用时会检查是否存在旧的独立 Maker MCP。经用户确认后，只会把旧注册设置为
`enabled = false`，不会删除原配置，并支持恢复。插件内初始化必须使用
`taptap-maker init --skip-mcp-install`，避免重复安装 MCP。

## 独立 CLI

不使用插件时，可以通过独立包启动 Maker CLI：

```bash
npx -y @taptap/maker init
```

常用命令：

```text
taptap-maker init
taptap-maker doctor
taptap-maker apps
taptap-maker login
taptap-maker mcp verify
```

## 开发与验证

在仓库根目录执行：

```bash
npm ci
npm test
npm run build
npm run maker:codex-plugin:prepare
```

Maker 代码位于当前目录，打包入口为 `src/maker/index.ts`，本地 MCP server 位于
`src/maker/server/`，CLI 位于 `src/maker/cli/`。

## 更多文档

- [Maker 完整开发文档](../../docs/MAKER.md)
- [Maker MCP 连接排障](../../docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md)
- [仓库开发规范](../../AGENTS.md)
