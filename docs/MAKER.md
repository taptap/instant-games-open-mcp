# TapTap Maker 本地 MCP

> 本文档描述 Issue #162 的本地 MCP 开发骨架。Server 同学提供的脚本用于说明接口和测试流程，本仓库侧交付 MCP tools，不要求用户流程依赖 CLI。

## 目标

`taptap-maker` 是同一个 npm 包里的 Maker 专用 MCP server 入口：

- 本地通过 cwd 向上查找 `.maker-mcp/config.json` 识别当前 Maker 项目。
- 用户级凭证保存到 `~/.taptap-maker/`。
- Agent 通过 MCP tools 完成登录、JWT 准备、app 选择、clone 和 push。

## 本地测试

不要拉线上 npm 包。修改后在仓库内执行：

```bash
npm test
npm run build
node dist/maker.js status
node dist/maker.js init --project-id demo-project --target /tmp/demo-maker --sce-endpoint http://localhost:5003
```

MCP server 模式：

```bash
node dist/maker.js
```

用 Inspector 测本地构建：

```bash
npx @modelcontextprotocol/inspector node dist/maker.js
```

## MCP 工具流程

在 Codex 新开空目录后，可以用一句“使用 tapmaker 初始化当前目录”触发工具链。Agent 应按下面顺序执行：

```text
maker_status
maker_tap_login_start
用户扫码/打开链接授权
用户输入“已授权”
maker_tap_login_complete
maker_exchange_jwt
maker_list_apps
用户选择 app
maker_clone_to_current_directory
maker_status
```

工具说明：

- `maker_tap_login_start`：申请 TapTap device code，返回授权链接。
- `maker_tap_login_complete`：用户扫码后轮询 Tap token，保存 MAC 认证数据。
- `maker_exchange_jwt`：用 Tap 认证换 Maker JWT；接口未 ready 时内部可读取缓存或 `manual_jwt`，但流程上不能跳过这一步。
- `maker_list_apps`：用 Maker JWT 拉取 app 列表，必须展示给用户选择。
- `maker_clone_to_current_directory`：把选中的 Maker app 仓库拉到当前目录并写 `.maker-mcp/config.json`。
- `maker_configure_remote_proxy`：按 server 测试脚本生成 `proxy_cfg`，写入当前项目 `.mcp.json`，连接远端 `taptap-proxy`。
- `maker_build_current_directory`：用户说“构建 / build / 重新构建游戏”时使用，转发调用远端 `build` tool。
- `maker_submit_current_directory`：用户说“帮我提交”“提交代码”时使用，提交并推送当前 Maker 项目。
- `maker_push_current_directory`：把当前目录改动 commit 并 push 到 Maker git。

## 远端 Proxy 和构建工具

`init_dev_env.py` 里的 `proxy_cfg` 用于连接远端 MCP server，不属于本地 clone/push 流程。Maker 后端地址集中维护在 `src/maker/config.ts` 的环境配置表里，按 `TAPTAP_MCP_ENV` 自动选择：

```text
TAPTAP_MCP_ENV=rnd
TAPTAP_MCP_ENV=production
```

默认构建路径是本地 Maker MCP 直接转发远端 build：

```text
maker_build_current_directory()
```

如需在当前 Maker 项目里直接暴露远端全量 `taptap-proxy` tools，可以执行：

```text
maker_configure_remote_proxy()
```

这个工具会写入：

```text
<current-directory>/.mcp.json
```

配置内容等价于测试脚本中的：

```json
{
  "server": { "url": "<remote-mcp-server-url>", "env": "<rnd-or-production>" },
  "tenant": {
    "project_path": "<app_id>/workspace",
    "user_id": "<jwt.userId>",
    "project_id": "<app_id>"
  },
  "auth": {
    "kid": "<tap kid>",
    "mac_key": "<tap mac_key>",
    "token_type": "mac",
    "mac_algorithm": "hmac-sha-1"
  },
  "options": { "verbose": true }
}
```

写入 `.mcp.json` 后，需要重启 Claude/Codex 对话或重新加载 MCP servers，远端 `taptap-proxy` 暴露的 build/构建 tools 才会出现在工具列表里。

`maker_configure_remote_proxy` 会把 `.mcp.json` 加入当前项目的 `.git/info/exclude`，避免误提交包含认证信息的本地 MCP 配置。

本地工具会复用同一份 `proxy_cfg` 连接远端 MCP server，并转发到远端 `build` tool。默认不要求用户传参：

- `entry` / `scriptsPath` / `entry_client` / `entry_server`：用户未指定时交给远端 build 默认推断。
- `multiplayer`：用户未指定且本地不存在 `.project/settings.json` 时，默认传 `{ "enabled": false }`，用于第一次单机项目构建初始化。
- 如果用户明确说明是多人游戏或给出入口文件，再把对应参数传入。

## 提交和推送约束

当前目录存在 `.maker-mcp/config.json` 时，说明它是 Maker 项目。此时提交/推送请求必须走 Maker MCP 工具：

```text
maker_submit_current_directory()
```

这些用户话术都应触发 Maker 提交工具：

```text
帮我提交
帮我提交代码
帮我提交代码到maker
帮我提交代码到taptap制造
帮我提交代码到tap制造
帮我提交代码到tap
提交并推送
push
```

约束：

- 不走本地通用 Git skill 的任务号规则。
- 不因为当前分支是 `main` 就新建功能分支。
- 不要求用户提供 TAP/Jira/飞书任务号。
- commit message 可以由 MCP 根据变更文件自动生成，也可以由用户显式提供。
- push 被远端拒绝或出现冲突时，不自动建分支；应询问用户是否先 pull/rebase 当前 Maker 远端变更，再重试 push。
- 如果 commit 已完成但 push 失败，工具必须返回 `failed_after_commit`、commit hash、git ahead 状态、失败阶段、exit code、stderr/stdout、错误分类和下一步建议。
- 开发阶段任何 Maker tool 失败都必须暴露具体错误原因，不能只返回“连接断开”或“失败”。

## 环境变量

| 变量                                 | 说明                                              |
| ------------------------------------ | ------------------------------------------------- |
| `TAPTAP_MAKER_HOME`                  | 覆盖用户级 Maker 存储目录，默认 `~/.taptap-maker` |
| `MAKER_PROJECT_ID`                   | MCP server 项目识别的环境变量覆盖                 |
| `MAKER_JWT_EXCHANGE_URL`             | Tap OAuth token 换 Maker JWT 的接口               |
| `TAPTAP_MCP_ENV`                     | Maker 环境选择，`production` 或 `rnd`             |
| `TAPTAP_MAKER_API_BASE`              | 可选：覆盖当前环境的 Maker 项目列表接口 base URL  |
| `TAPTAP_MAKER_PAT_URL`               | 可选：覆盖当前环境的 Maker PAT 换取接口           |
| `TAPTAP_MAKER_GIT_BASE`              | 可选：覆盖当前环境的 Maker git base URL           |
| `TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` | 可选：覆盖当前环境的远端 Maker MCP server URL     |
| `SCE_MCP_URL`                        | 云端 SCE MCP endpoint 默认值                      |

Maker 后端默认地址集中在 `src/maker/config.ts`。兼容旧变量名：`MAKER_API_BASE`、`MAKER_PAT_URL`、`MAKER_GIT_BASE`、`TAPTAP_REMOTE_MCP_SERVER_URL`。新配置优先使用 `TAPTAP_MAKER_*` 前缀。

## 手动 JWT 联调

在 Maker JWT exchange 接口接入前，测试时可以预置 Maker JWT。即使 JWT 是预置的，演示流程仍应保留 Tap 登录和 `maker_exchange_jwt` 两步。APP_ID 不应要求用户手动输入，而是通过 `maker_list_apps` 返回的列表让用户选择。

推荐在 MCP 客户端中按工具流程测试：

```text
maker_exchange_jwt(manual_jwt)
maker_list_apps()
用户选择 app
maker_clone_to_current_directory(app_id)
```

clone/push 默认会按 `TAPTAP_MCP_ENV` 读取 `src/maker/config.ts` 中对应环境的配置。需要临时覆盖时可设置：

```text
TAPTAP_MAKER_API_BASE=<maker-api-base-url>
TAPTAP_MAKER_PAT_URL=<maker-pat-url>
TAPTAP_MAKER_GIT_BASE=<maker-git-base-url>
```

PAT 仍会缓存到 `~/.maker-pat`。

如果 `~/.maker-pat` 已存在，会直接复用；如需重新创建 PAT：

```text
maker_clone_to_current_directory(app_id, force_pat=true)
```

clone 成功后会写：

```text
<current-directory>/.maker-mcp/config.json
```

然后可以调用 `maker_status` 验证 cwd 识别：

```text
maker_status()
```

## 当前边界

- Tap OAuth 复用现有 `src/core/auth`。
- Maker JWT exchange 未稳定时，`maker_exchange_jwt` 先支持缓存 JWT、`manual_jwt` 或 `JWT` / `MAKER_JWT` 环境变量。
- `maker_push_current_directory` 会在当前目录创建 commit 并 push，调用前需要用户明确要求推送。
- 云端 SCE MCP proxy 转发会在 JWT 和 endpoint 契约稳定后接入。
