# TapTap Maker 客户端插件安装

这是 TapTap Maker 的统一插件安装入口，支持 Codex 和 WorkBuddy。两个插件使用同一版本，
但安装包和客户端配置彼此独立。

- 插件版本：`0.0.3`
- 发布渠道：`main 稳定版`
- 内置 Maker MCP 版本：`0.0.32`

## 给安装 AI 的强制执行指令

用户在当前对话中直接提供本页面链接，即代表用户已明确授权处理当前宿主的 TapTap Maker 插件安装。
读取本页面后先识别当前宿主客户端，再按对应渠道执行：Codex 由安装 AI 自动下载、校验和安装；
WorkBuddy 由用户在宿主插件界面中确认安装，AI 负责清楚引导、等待确认并在重新加载后验证。

- 不要再次询问用户是否开始处理，也不要让用户选择 Codex 或 WorkBuddy 安装包。
- Codex 渠道必须由安装 AI 自动执行，不要只给出安装建议、命令或操作步骤。
- WorkBuddy 渠道需要用户在 `/plugin` 面板中确认安装。AI 必须说明这项宿主 UI 操作、等待用户完成，
  不得在用户确认前声称插件已经安装。
- Codex 使用当前环境可用的终端和宿主插件管理能力完成操作；Windows 使用 PowerShell 的下载、
  `Get-FileHash` 和 `Expand-Archive` 能力，macOS/Linux 使用系统现有的等价工具。
- Codex 完成安装并验证插件已启用后再报告结果。WorkBuddy 必须等待用户确认 UI 安装和重新加载，
  再验证插件状态；无法完成或观察某一步时直接报告具体限制，不要误报成功。

## 给安装 AI 的选择规则

安装前必须先识别自己当前运行在哪个宿主客户端，再选择对应安装渠道：

| 当前宿主客户端             | 安装渠道                                |
| -------------------------- | --------------------------------------- |
| 当前宿主客户端是 Codex     | `taptap-maker-codex-plugin-0.0.3.zip`   |
| 当前宿主客户端是 WorkBuddy | WorkBuddy 官方插件市场中的 TapTap Maker |

必须遵守以下规则：

1. 以当前对话所属的宿主客户端为准。不要根据操作系统、Node.js 环境，或本机是否存在
   `~/.codex`、`~/.workbuddy` 目录来猜测；同一台电脑可能同时安装两个客户端。
2. 无法确认当前宿主客户端时，先检查当前 AI 产品身份、运行时信息和宿主提供的插件管理能力；
   不要让用户代替 AI 完成可自动判断的客户端识别。仍无法识别或客户端不受支持时停止安装并报告
   明确原因，不要猜测或安装错误的包。
3. 一次只安装当前客户端对应的插件，不要同时安装两个插件包。
4. 不要通过 npm 或 npx 安装独立 Maker MCP；客户端插件已包含完整 MCP runtime、CLI 和 Skills。

## 下载

- [Codex 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.3/taptap-maker-codex-plugin-0.0.3.zip)
- [WorkBuddy 市场发布 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.3/taptap-maker-workbuddy-plugin-0.0.3.zip)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v0.0.3/SHA256SUMS)

Codex ZIP 是完整的离线 marketplace 包。Codex 安装 AI 必须同时下载该 ZIP 和 `SHA256SUMS`，
验证 SHA-256 匹配后解压到不会自动清理的固定本地目录；校验失败时停止安装。这个目录是 Codex
本地 marketplace 的来源，只要该 marketplace 仍已配置，就必须保留这个目录。

WorkBuddy 发布 ZIP 只用于插件市场提交，不是本地 marketplace 包。ZIP 根目录直接包含
`.codebuddy-plugin/plugin.json`、`.mcp.json`、`README.md` 和 `SKILL.md`，不包含额外的
`taptap-maker/` 外层目录；所有内容的目录深度最多为两层。普通 WorkBuddy 用户应直接从
WorkBuddy 官方插件市场安装 TapTap Maker。

## 安装所选插件

### Codex

仅当当前宿主是 Codex 时执行：

1. **安装前自动禁用旧 Maker MCP**：先执行
   `node "<解压目录>/plugins/taptap-maker/dist/maker.js" plugin inspect --client codex --json`。
   如果状态为 `active`，告知用户已发现旧 Maker MCP，然后立即执行
   `node "<解压目录>/plugins/taptap-maker/dist/maker.js" plugin migrate --client codex --confirm --json`；
   不要再请求确认。迁移只把旧注册设为 `enabled = false`，不会删除原配置或用户数据。
   记录本次安装中任一次迁移结果；只有某次返回 `action: "disabled"` 且 `changed: true` 时，
   失败回滚才恢复旧注册。迁移命令失败时立即停止，不得进入插件安装。
   状态为 `ambiguous` 时必须在安装前停止。报告重复配置，不要进入插件安装；状态为
   `disabled` 或 `not_found` 时继续。
2. 执行 `codex plugin marketplace add <解压目录>`。
3. 执行 `codex plugin add taptap-maker@taptap-maker`。
4. **安装后必须再次检查**：执行一次幂等迁移，再执行检查：
   `node "<解压目录>/plugins/taptap-maker/dist/maker.js" plugin migrate --client codex --confirm --json`
   和
   `node "<解压目录>/plugins/taptap-maker/dist/maker.js" plugin inspect --client codex --json`。
   只有检查状态为 `disabled` 或 `not_found` 时才算兼容检查通过并进入步骤 5。记录这次迁移结果；
   迁移失败或检查返回 `ambiguous` 时进入步骤 6 执行失败回滚，并报告重复配置。状态仍为
   `active` 时也必须进入步骤 6，不得报告插件可用。
5. 重新加载插件或新建任务，验证 TapTap Maker 插件已启用且 Maker MCP tools 已注册。
6. 如果安装、重新加载或 Maker MCP tools 验证失败，先检查本次插件是否已经安装。已安装时立即执行
   `codex plugin remove taptap-maker@taptap-maker --json`，再用 `codex plugin list --json`
   确认插件不再处于已安装状态。移除失败或插件仍已安装时，不得恢复旧 MCP，避免再次双重启用；
   保持旧 MCP 禁用并报告回滚失败。确认插件未安装后，如果本次安装中任一次迁移实际禁用了旧注册，执行
   `node "<解压目录>/plugins/taptap-maker/dist/maker.js" plugin restore --client codex --confirm --json`
   自动回滚，再报告安装失败。失败回滚属于同一次安装事务，无需再次询问用户；不得恢复原本就已
   禁用、未找到或并非本次迁移的注册。

### WorkBuddy

仅当当前宿主是 WorkBuddy 时执行：

当前发布是 main 稳定版。WorkBuddy 插件市场安装必须由用户在宿主 UI 中确认：

1. 明确告知用户打开 WorkBuddy `/plugin`，在官方插件市场中找到 TapTap Maker。
2. 等待用户在插件面板中确认安装或更新完成；不要代替用户声称已经点击或安装成功。
3. 用户确认安装完成后，引导用户执行 `/reload-plugins`。
4. 重新加载后验证 TapTap Maker 插件已启用且 Maker MCP tools 已注册；无法验证时报告具体限制。

如果当前客户端既不是 Codex 也不是 WorkBuddy，应告知用户该客户端暂未提供对应安装包，不要把
任何客户端插件 ZIP 当作通用 MCP 包安装。

## 兼容已有 Maker MCP

插件内置本地 MCP runtime、CLI、工作流 Skills 和连接排障文档。运行时不会通过 npm 或 npx
下载或启动 Maker 包。

插件会复用现有 Maker 鉴权和项目绑定。Codex 安装请求同时授权兼容迁移：安装 AI 必须在安装前后
检查旧的独立 Maker MCP，并自动把活动注册设置为 `enabled = false`，无需再次确认。WorkBuddy
仍通过 SessionStart Hook 做只读检查并提醒 AI，只有用户明确确认后才把旧注册设置为
`disabled: true`。迁移会保留最新备份并支持恢复，不会删除旧注册、鉴权、项目绑定或游戏文件；
Codex 和 WorkBuddy 在移除插件时恢复旧 MCP，都必须重新取得用户明确确认。Codex 本次安装实际
禁用了旧注册但随后安装失败时，自动恢复该注册作为事务回滚。

正常 Maker 开发流程见 `skills/taptap-maker-local/SKILL.md`。
