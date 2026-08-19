---
name: taptap-maker-dsh
description: TapTap Maker 本地开发工作流（DeepSeek Harness 专用）。当用户要求初始化/继续 Maker 本地开发、clone/下载 Maker 项目、查看本地 Maker 状态、构建/提交/预览、诊断或上报 Maker MCP/proxy 故障、拉取/提交/推送、或解决冲突时使用。
---

# TapTap Maker 工作流（DSH）

TapTap Maker 是 TapTap 小游戏的本地开发与构建闭环。本 skill 是工作流层：决定步骤顺序、何时询问用户、用平实语言解释本地状态；CLI 负责一次性初始化；MCP 工具负责高频开发循环。

## DSH 特有约束（必须遵守）

- **无 MCP Roots**：DSH 不广播工作区，每次项目相关的 Maker 工具调用都要**显式传 `target_dir`**（当前游戏工程目录）。不要依赖客户端注入的 workspace。
- **无 MCP Resources**：DSH 只桥接 tools，读不到 `maker://status` 等资源。用工具补位：状态用 `maker_status_lite`，广告用 `get_ad_config`，不要尝试读 `maker://*` 资源。
- **AGENTS.md 已自动加载**：工程根 `AGENTS.md`（含 Maker 管理的策略块）已由 DSH 自动注入为上下文，本 skill 不再重复其中的策略；冲突时以 `AGENTS.md` 为准。
- 其它功能（广告/云存档/排行榜）另有专项 skill：`taptap-ads`、`taptap-cloud-save`、`taptap-leaderboard`，按需加载。

## 职责分工

- **Skill**：用户意图、步骤顺序、是否询问用户、友好解释、失败恢复。
- **CLI（taptap-maker）**：保存 PAT、拉取 app 列表、clone、准备 dev kit、安装/验证 MCP 配置、收集并脱敏上报问题、更新工程 `AGENTS.md` 策略块、运行本地日志 watcher。
- **MCP 工具**：查看 Maker 状态、执行 commit/push/build 闭环。

不要在 shell 里重造 Maker API 或 Git 鉴权，已有 CLI/MCP 工具时直接调用它们。

### CLI 可用性（DSH）

`taptap-maker` CLI 由本插件随包依赖的 `@taptap/maker` 提供，但 profile 的 `node_modules/.bin`
不在会话 shell 的 PATH 上。插件通过 DSH shell-env 暴露了它的绝对路径
`DSH_TAPTAP_MAKER_BIN`，一次性 CLI 操作（init / upgrade / mcp verify / mcp report）一律用：

```bash
node "$DSH_TAPTAP_MAKER_BIN" <subcommand>
```

跨平台且零网络。若该环境变量不存在（例如运行在未装本插件的其它客户端），才退回
`npx -y @taptap/maker@<版本> taptap-maker <cmd>`（版本取本插件 `package.json` 里
`@taptap/maker` 的依赖版本）。

高频开发循环（状态 / 构建 / 提交 / 预览 / 素材）一律用 MCP 工具，不要为这些操作找 CLI。

## 意图 → 工作流

| 用户意图                             | 工作流                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| 初始化 / 配置 / 继续 Maker 本地开发  | 运行 Maker CLI 初始化流程（`taptap-maker init`）                                    |
| clone / 下载 Maker 项目              | 走"初始化流程"，不要直接索要 app_id                                                 |
| 状态 / 是否就绪                      | 调 `maker_status_lite`（传 `target_dir`），再按 `AGENTS.md` 与 remote sync 提示处理 |
| 升级 Maker MCP / 旧项目策略          | 当前项目目录跑 `taptap-maker upgrade`，不要扫描无关 Maker 项目                      |
| 提交 / 推送 / 构建                   | 先检查本地 Git 状态与改动摘要，再调 `maker_build_current_directory`                 |
| 拉取 / 更新                          | 先看本地改动；工作区有未提交内容时，先说明选项再拉取                                |
| 冲突 / 合并失败                      | 解释冲突原因、列出冲突文件、查看冲突 hunk、给出方案并询问后再改                     |
| 构建 / 预览 / 跑一下 / 看效果        | 用 `maker_build_current_directory`（成功后自动拉起本地运行时日志 watcher）          |
| 验证代码 / 跑测试 / lint             | 不触发 Maker 远程构建，除非用户明确要求构建/运行/预览                               |
| MCP 不可用 / proxy 超时 / 服务端错误 | 先证据诊断；疑似 MCP/proxy/客户端/服务缺陷时，询问用户一次后脱敏上报                |

## 新建项目

"创建新项目/创建游戏/新建项目"等是显式创建意图（优先级高于按名匹配已有 app）。当前目录未绑定时引导：`taptap-maker init --create`，有名字则加 `--name "<名字>"`；无名字则询问或建议用当前目录名，不要自行编造。当前目录已绑定 Maker 项目时不要就地新建，让用户另开独立目录。

## 构建 / 提交策略（覆盖通用 Git 流程）

- 绑定 Maker 项目（存在 `.maker-mcp/config.json`）时，提交/推送/构建/预览一律走 `maker_build_current_directory`。
- 不要为 Maker 提交/构建建 feature 分支、task 分支或 PR/MR，不要用通用 git commit/push 作为替代。
- `maker_build_current_directory` 拥有安全门：提交前校验 remote sync，本地落后/分叉/不在 main/无法验证时会阻止。
- 根 `.gitignore` 是必需文件；绑定后若有变化，随游戏改动一起提交并在摘要中说明。
- 多人游戏用 `maker_build_current_directory` 的结构化参数（`entry_client`/`entry_server`/`multiplayer.*`），不要直接改项目 JSON；仅在用户明确提供时发送多人参数。

## MCP 故障恢复与上报

- 工具缺失、进程秒退、`-32000`、`Connection closed`、`command not found` 时，不要依赖 Maker MCP 工具做初始诊断，先从本地配置/shell 输出/客户端日志入手。
- 优先用当前客户端配置里的绝对 command 与有序 args，追加 `mcp verify --json` 复现。
- 先证据定位再修复；不自动改 trust 存储、PATH、cwd、凭证或游戏代码。
- 疑似基础设施缺陷时，向用户询问一次；仅在用户明确同意后，通过 `taptap-maker mcp report --ide dsh --target-dir <项目> --context-stdin --consent --json` 脱敏上报。绝不包含完整对话、源码、PAT/token、完整环境变量。

## 创意素材工具（简要）

`generate_image` / `batch_generate_images` / `edit_image` / `create_video_task` / `query_video_task` / `text_to_music` / `text_to_sound_effect` / `text_to_dialogue` / `create_3d_asset` 等，按各自 tool schema 使用；生成物落在工程 `assets/` 下并保留远程映射。3D 与配音确认类步骤必须先展示预览、等用户确认，不要自动续跑。
