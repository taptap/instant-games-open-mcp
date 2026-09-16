---
name: taptap-maker
description: >
  TapTap Maker WorkBuddy 本地游戏开发插件。用于创建或同步 Maker 项目、开发 UrhoX 游戏、
  检查项目状态、提交构建、预览运行、生成游戏素材、接入广告、配置测试、查询玩家反馈、
  诊断 Maker MCP，以及管理插件更新和旧 MCP 迁移。
---

# TapTap Maker WorkBuddy 插件

TapTap Maker WorkBuddy 插件为 WorkBuddy 提供完整的 TapTap Maker 游戏本地 AI 开发能力。
插件内置 Maker MCP、CLI、开发 Skills、项目快捷命令、跨平台启动器和连接排障文档，
不需要通过 npm 或 npx 额外下载 Maker。

## 插件信息

- 插件版本：`0.0.3`
- 内置 Maker MCP 版本：`0.0.32`
- 适用客户端：WorkBuddy
- 支持平台：Windows、macOS、Linux
- 内置 runtime：`dist/maker.js`

## 核心能力

### 创建新的 Maker 游戏

使用 `/taptap-maker:create-project` 在空 workspace 中创建新的 Maker 项目。

插件会检查本地开发环境，引导用户登录 TapTap Maker，创建远端项目，拉取游戏代码，
建立本地项目绑定，并安装 Maker AI dev-kit。

### 同步已有 Maker 游戏

使用 `/taptap-maker:sync-project` 查看账号下的 Maker 游戏，并将用户选择的项目同步到
当前空 workspace 中继续开发。

项目必须由用户明确选择，插件不会自动选择 app。

### 本地开发环境检查

插件可以检查和准备：

- Git 环境和远端仓库访问
- Python 环境
- Maker Lua LSP 诊断环境
- Maker 登录和鉴权状态
- 本地项目绑定状态
- AI dev-kit 安装和版本状态
- WorkBuddy workspace 和项目目录状态

### Maker AI Dev Kit

项目初始化后可以使用以下本地开发资料：

- `CLAUDE.md`：Maker 游戏开发主指南
- `examples/`：常见开发示例
- `templates/`：游戏文件和结构模板
- `urhox-libs/`：UrhoX 引擎 API 和能力参考
- `.workbuddy/skills/taptap-maker-*`：项目级 Maker Skills

### 项目状态检查

插件提供：

- `maker://status`：完整项目状态 Resource
- `maker_status_lite`：无法读取 Resource 时的兼容 Tool

可以检查项目绑定、配置文件、Git 状态、远端同步状态、开发环境、AI dev-kit、
MCP runtime、workspace Roots 和当前项目上下文。

### 提交、推送、构建和预览

`maker_build_current_directory` 提供完整的 Maker 开发闭环：

- 检查项目和远端同步状态
- 汇总并提交本地修改
- 推送到 Maker 远端仓库
- 发起远端构建
- 返回构建结果和 Maker URL
- 构建成功后监听本地 runtime 日志
- 返回 Git、鉴权、编译和构建失败的恢复信息

用户提出提交、推送、构建、预览、运行或查看游戏效果时使用该 Tool。

### 多人联机项目

构建 Tool 支持配置：

- 客户端和服务端入口
- 最大玩家数
- 后台匹配
- 匹配信息
- 持久世界

### 图片生成与编辑

- `generate_image`：生成单张图片
- `batch_generate_images`：批量生成图片
- `edit_image`：编辑已有图片

生成结果可以直接保存到当前 Maker 项目，并保留后续编辑所需的素材映射。

### 视频生成

- `create_video_task`：创建视频生成任务
- `query_video_task`：查询任务进度并获取生成结果

支持文本、图片或视频参考素材。长视频或高成本模型会在生成前要求用户确认消耗。

### 音乐和音效生成

- `text_to_music`：生成游戏音乐
- `text_to_sound_effect`：生成单个游戏音效
- `batch_sound_effects`：批量生成游戏音效

### 角色配音

- `audition_voices_for_character`：生成角色声音试听
- `confirm_character_voice`：保存用户选择的角色声音
- `text_to_dialogue`：生成最终角色对白

插件会先让用户试听并选择声音，不会自动确认角色声音。

### 3D 素材生成

`create_3d_asset` 支持：

- 创建 3D 素材任务
- 查询任务进度
- 审核确认后继续生成
- 绑定、贴图、重拓扑和格式转换
- 将模型文件保存到当前 Maker 项目

### TapTap Maker 广告接入

广告相关需求首先读取 `maker://ads-integration-guide`，然后使用 `get_ad_config`
查询当前游戏真实广告状态和配置。

插件可以将有效广告配置同步到 `.project/settings.json` 的 `@runtime.ad`，并返回广告开通状态、
操作链接和下一步指引。

### 测试能力

- `generate_test_qrcode`：生成游戏测试二维码信息
- `add_test_whitelist`：添加测试白名单用户

### 玩家反馈和远端日志

`get_debug_feedbacks` 可以查询当前 Maker 游戏的：

- 玩家提交的游戏故障
- 真机日志
- 玩家上传的截图
- 指定游戏会话的服务端或 Lua 日志

### MCP 连接诊断

插件可以诊断：

- Maker Tools 或 Resources 缺失
- `Connection closed`
- MCP `-32000`、`-32001`、`-32003` 错误
- Node、launcher、command、args 或 PATH 错误
- cwd、workspace Roots 或项目上下文错误
- WorkBuddy MCP 启用和信任问题
- proxy 超时、断线和远端服务错误

详细排障文档位于 `docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md`。

### 故障上报

用户明确同意后，可以通过 Maker CLI 提交经过脱敏的 MCP 故障报告。

报告不会包含 PAT、token、完整聊天、游戏源码、其它 MCP 配置或完整环境变量。

### 旧 MCP 迁移

SessionStart Hook 会只读检查 WorkBuddy 中是否仍启用了旧版独立 Maker MCP。

插件支持：

- 检查旧 MCP 注册状态
- 用户确认后禁用旧注册
- 保存迁移备份和恢复信息
- 卸载插件前恢复由本插件迁移的旧注册

迁移不会删除旧配置、PAT、Maker home、项目绑定或游戏文件。

### 插件更新

插件通过 WorkBuddy `/plugin` 更新，并通过 `/reload-plugins` 重新加载。

插件版 Maker 不使用 npm、npx 或独立 Maker MCP 的升级流程。

## 内置 Skills

- `skills/taptap-maker-plugin-lifecycle/SKILL.md`
  管理首次使用、旧 MCP 迁移、插件更新和卸载恢复。

- `skills/taptap-maker-local/SKILL.md`
  管理项目初始化、本地开发、状态检查、提交构建、Git 同步和故障诊断。

- `skills/taptap-maker-dev-kit-guide/SKILL.md`
  介绍 Maker AI dev-kit、示例、模板和 UrhoX 引擎资料。

- `skills/update-taptap-mcp/SKILL.md`
  指导用户通过 WorkBuddy 更新插件。

## 使用约束

- 创建或同步项目时必须使用空 workspace。
- 项目和 app 必须由用户明确选择。
- 插件模式初始化使用 `--skip-mcp-install`，不重复安装 MCP。
- Maker 提交、推送、构建和预览统一使用 `maker_build_current_directory`。
- 不使用通用 Git 分支或 PR 流程替代 Maker 构建流程。
- 视频费用确认、角色声音选择、3D 审核继续、旧 MCP 迁移和故障上报需要用户明确同意。
- 不删除或泄露 PAT、token、Maker 鉴权、项目绑定和用户游戏文件。
