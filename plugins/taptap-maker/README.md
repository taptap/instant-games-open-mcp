# TapTap Maker 客户端插件安装

这是 TapTap Maker 的统一插件安装入口，支持 Codex 和 WorkBuddy。两个插件使用同一版本，
但安装包和客户端配置彼此独立。

- 插件版本：`0.0.1`
- 内置 Maker MCP 版本：`0.0.30`

## 用户如何安装

把本页面链接交给当前正在使用的 AI，并告诉它：`请按照页面说明安装 TapTap Maker 插件`。

## 给安装 AI 的选择规则

安装前必须先识别自己当前运行在哪个宿主客户端，再选择安装包：

| 当前宿主客户端             | 只能选择的安装包                          |
| -------------------------- | ----------------------------------------- |
| 当前宿主客户端是 Codex     | `taptap-maker-codex-plugin-0.0.1.zip`     |
| 当前宿主客户端是 WorkBuddy | `taptap-maker-workbuddy-plugin-0.0.1.zip` |

必须遵守以下规则：

1. 以当前对话所属的宿主客户端为准。不要根据操作系统、Node.js 环境，或本机是否存在
   `~/.codex`、`~/.workbuddy` 目录来猜测；同一台电脑可能同时安装两个客户端。
2. 无法确认当前宿主客户端时，先询问用户“你现在使用的是 Codex 还是 WorkBuddy？”，得到明确
   回答前不要下载或安装。
3. 一次只安装当前客户端对应的一个 ZIP，不要同时安装两个插件包。
4. 不要通过 npm 或 npx 安装独立 Maker MCP；ZIP 已包含完整 MCP runtime、CLI 和 Skills。

## 下载

- [Codex 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/taptap-maker-codex-plugin-0.0.1.zip)
- [WorkBuddy 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/taptap-maker-workbuddy-plugin-0.0.1.zip)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.1/SHA256SUMS)

ZIP 是完整的离线 marketplace 包。AI 只下载所选 ZIP 和 `SHA256SUMS`，验证 SHA-256 后解压。

## 安装所选插件

### Codex

仅当当前宿主是 Codex 时执行：

1. 执行 `codex plugin marketplace add <解压目录>`。
2. 执行 `codex plugin add taptap-maker@taptap-maker`。
3. 重新加载插件或新建任务，确认 TapTap Maker 插件已启用。

### WorkBuddy

仅当当前宿主是 WorkBuddy 时执行：

1. 在 `/plugin` 中把解压目录添加为 marketplace。
2. 安装 marketplace 中的 `taptap-maker`。
3. 执行 `/reload-plugins`，确认 TapTap Maker 插件已启用。

如果当前客户端既不是 Codex 也不是 WorkBuddy，应告知用户该客户端暂未提供对应安装包，不要把
其中一个 ZIP 当作通用 MCP 包安装。

## 兼容已有 Maker MCP

插件内置本地 MCP runtime、CLI、工作流 Skills 和连接排障文档。运行时不会通过 npm 或 npx
下载或启动 Maker 包。

插件会复用现有 Maker 鉴权和项目绑定。首次使用时会检查旧的独立 Maker MCP；WorkBuddy 通过
SessionStart Hook 做只读检查并提醒 AI。只有用户明确确认后，才把旧 Codex 注册设置为
`enabled = false`，或把旧 WorkBuddy 注册设置为 `disabled: true`。迁移会保留最新备份并支持
恢复，不会删除旧注册、鉴权、项目绑定或游戏文件。

正常 Maker 开发流程见 `skills/taptap-maker-local/SKILL.md`。
