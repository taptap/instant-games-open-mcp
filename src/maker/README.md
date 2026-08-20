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
- **WorkBuddy Plugin**：内置相同 Maker runtime、CLI 和平台专属工作流，通过共享 CodeBuddy 插件
  规范安装，运行时不依赖外部 npm/npx。

## Codex Plugin

Codex 插件位于 [`plugins/taptap-maker`](../../plugins/taptap-maker)。当前插件版本读取
`config/maker-plugin-version.json`，内置 Maker MCP 版本读取 `config/maker-version-policy.json`。
插件复用用户现有的 Maker 鉴权、项目绑定和游戏文件。

插件首次使用时会检查是否存在旧的独立 Maker MCP。经用户确认后，只会把旧注册设置为
`enabled = false`，不会删除原配置，并支持恢复。插件内初始化必须使用
`taptap-maker init --skip-mcp-install`，避免重复安装 MCP。

Codex 和 WorkBuddy 插件共用 `config/maker-plugin-version.json` 的独立版本号。Maker MCP 自身版本
仍由 `config/maker-version-policy.json` 管理，插件发布不会触发 npm 发布。

插件启动 Maker runtime 时必须设置非空的 `TAPTAP_MAKER_DISTRIBUTION`。该变量非空表示当前
runtime 由插件渠道管理，因此 Maker 不检查或提示 npm 包更新；具体值（如 `codex_plugin`、
`workbuddy_plugin`、`dsh_plugin` 或外部插件自己的标识）只用于识别分发渠道。独立 Maker MCP
不得设置该变量，并继续使用正常的 npm 版本策略。

## WorkBuddy Plugin

WorkBuddy 插件位于
[`plugins/workbuddy/taptap-maker`](../../plugins/workbuddy/taptap-maker)，本地 marketplace 位于
[`.codebuddy-plugin/marketplace.json`](../../.codebuddy-plugin/marketplace.json)。插件提供创建新项目
和同步已有项目两个快捷命令，两者都要求当前 workspace 为空目录。

MCP、快捷命令和插件 CLI 统一通过插件内 `bin/run-node` 启动。它优先使用 WorkBuddy 注入或管理的
Node.js，兼容 Windows 上未配置全局 Node/PATH 的环境；只有 WorkBuddy Node 不可用时才回退系统
Node.js。插件运行时仍完全来自自身 `dist/maker.js`，不下载或调用 npm/npx。

旧 WorkBuddy Maker MCP 通过 `taptap-maker plugin inspect --client workbuddy` 检查；经用户确认后
只设置 `disabled: true`，不删除注册、鉴权、项目绑定或 connector trust。更新使用 WorkBuddy
插件管理器，不运行 npm/npx 或独立 `taptap-maker upgrade`。

初始化或更新 dev-kit 后，WorkBuddy 插件会将 `.installer/skills` 中缺失的项目 Skills 链接到
`.workbuddy/skills/taptap-maker-*`。已有同名 Skill 保持不变，独立 MCP 和其他插件不执行该步骤。

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
npm run maker:workbuddy-plugin:prepare
npm run maker:plugins:package -- --output-dir artifacts/maker-plugins
```

环境变量的完整契约见
[Maker MCP 环境变量参考](../../docs/MAKER_ENVIRONMENT_VARIABLES.md)。新增或修改变量前必须先检查该
文档，避免重复开关和跨层级配置。

Maker 代码位于当前目录，打包入口为 `src/maker/index.ts`，本地 MCP server 位于
`src/maker/server/`，CLI 位于 `src/maker/cli/`。

## 更多文档

- [Maker 完整开发文档](../../docs/MAKER.md)
- [Maker MCP 连接排障](../../docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md)
- [仓库开发规范](../../AGENTS.md)
