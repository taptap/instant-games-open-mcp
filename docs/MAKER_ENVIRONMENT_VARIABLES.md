# Maker MCP 环境变量参考

本文档是 TapTap Maker MCP、CLI 和客户端插件环境变量的单一事实来源。新增、重命名或改变
环境变量语义时，必须同时更新本文档和对应测试。普通用户不需要设置大多数变量；没有明确场景时，
应使用代码内默认值、CLI 参数或项目级 `.maker/taptap-maker.local.json`。

## 命名与新增规则

- Maker runtime 新变量统一使用 `TAPTAP_MAKER_*`，不要新增含义相同的短名称。
- `TAPTAP_MCP_*` 只用于仓库内多个 MCP 共享的既有配置，不为 Maker 专属功能新增该前缀变量。
- 宿主注入变量由对应客户端拥有，Maker 只能读取，不能改变其语义。
- 一个变量只表达一个概念。客户端差异使用 `TAPTAP_MAKER_DISTRIBUTION` 的具体值，不再增加
  `IS_PLUGIN`、`DISABLE_NPM_UPDATE` 等重复开关。
- 新变量必须写清设置方、读取方、默认值、是否可持久化和敏感性，并添加行为测试。
- 凭证不得写入插件 manifest、MCP 配置、日志、Issue、命令参数示例或项目文件。

## Runtime 与客户端身份

| 变量                        | 设置方                      | 取值/默认值                                                                           | 用途与边界                                                                                                                                                                                                          |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAPTAP_MAKER_DISTRIBUTION` | 插件启动器或插件 MCP 配置   | 独立 MCP 不设置；插件使用非空分发标识                                                 | 任意非空值表示 runtime 由插件管理：不执行或提示 npm 包更新。`codex_plugin`、`workbuddy_plugin`、`dsh_plugin` 用于内置客户端专属行为；外部插件使用自己的稳定标识，如 `cindy_plugin`。不得把该变量写入独立 MCP 配置。 |
| `TAPTAP_MCP_CLIENT_IDE`     | MCP 安装器或插件            | `codex`、`cursor`、`claude`、`trae`、`opencode`、`workbuddy`、`dsh`，或外部客户端标识 | 标记当前 MCP 请求来源，用于诊断、配置检查和故障上报。它不表示插件模式，不能替代 `TAPTAP_MAKER_DISTRIBUTION`。                                                                                                       |
| `TAPTAP_MCP_ENV`            | CLI、MCP 配置或内部研发环境 | `production`（默认）或 `rnd`                                                          | 选择 Maker/TapTap 服务环境。面向普通用户和正式插件保持 `production`；项目研发覆盖优先写 `.maker/taptap-maker.local.json`。                                                                                          |
| `TAPTAP_MAKER_HOME`         | 用户、测试或安装器          | `~/.taptap-maker`                                                                     | 覆盖 Maker 用户级存储根目录，包括鉴权、版本缓存、runtime、Python 和崩溃日志。不要在共享插件中固定到项目目录。                                                                                                       |
| `TAPTAP_MAKER_CLIENT_ID`    | 内部联调或构建环境          | 默认按正式版本策略解析                                                                | Maker 登录流程的 client ID 覆盖。普通用户和客户端插件不要设置。                                                                                                                                                     |
| `TAPTAP_MCP_CLIENT_ID`      | 仓库共享认证层或内部联调    | 无                                                                                    | 共享 TapTap client ID；Maker OAuth 仅把它作为既有共享配置使用。优先使用 Maker 自身默认登录流程。                                                                                                                    |

共享认证层仍兼容 `TDS_MCP_ENV`、`TDS_MCP_CLIENT_ID` 和 `TDS_MCP_CLIENT_TOKEN`，分别对应
`TAPTAP_MCP_ENV`、`TAPTAP_MCP_CLIENT_ID` 和 `TAPTAP_MCP_CLIENT_SECRET`。这些名称已废弃，只用于
读取历史环境；新配置和插件不得写入。

插件接入的最小 MCP 子进程环境如下。外部插件不需要伪装成内置客户端：

```json
{
  "TAPTAP_MAKER_DISTRIBUTION": "cindy_plugin",
  "TAPTAP_MCP_CLIENT_IDE": "cindy"
}
```

## 本地工具与诊断

| 变量                                     | 默认值                            | 用途与边界                                                            |
| ---------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `TAPTAP_MAKER_GIT_BIN`                   | `git`                             | 覆盖 Git 可执行文件路径，主要用于 Windows、企业环境或非标准安装位置。 |
| `TAPTAP_MAKER_PYTHON_BIN`                | 自动探测或 Maker 管理的 Python    | 覆盖 Python 可执行文件路径。仅在自动探测不能满足环境要求时设置。      |
| `TAPTAP_MAKER_GIT_RETRY_DELAY_MS`        | `5000`                            | Git 临时网络错误的基础重试延迟，单位毫秒；`0` 只用于测试。            |
| `TAPTAP_MAKER_CRASH_LOG_MAX_BYTES`       | `1048576`                         | `mcp-crash.log` 最大字节数；仅接受正整数。                            |
| `TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES` | `16384`                           | 单条崩溃记录最大字节数；仅接受正整数，且不会超过日志总上限。          |
| `TAPTAP_MAKER_VERSION_POLICY_URL`        | GitHub `main` 上的 Maker 版本策略 | 覆盖 npm 版本策略地址，供测试和发布联调使用。插件模式会跳过该检查。   |

## 服务地址覆盖

以下变量只用于内部研发、测试或应急联调。普通用户、正式插件和用户级 MCP 配置不应设置服务地址。
当前名称优先于兼容旧名称。

| 当前变量                             | 兼容旧变量                     | 用途                                                                                    |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| `TAPTAP_MAKER_API_BASE`              | `MAKER_API_BASE`               | Maker 项目列表和 CLI API base URL。                                                     |
| `TAPTAP_MAKER_PAT_URL`               | `MAKER_PAT_URL`                | Maker PAT 接口 URL。                                                                    |
| `TAPTAP_MAKER_TAP_TOKEN_URL`         | `MAKER_TAP_TOKEN_URL`          | PAT 换取 TapTap token 的接口 URL。                                                      |
| `TAPTAP_MAKER_GIT_BASE`              | `MAKER_GIT_BASE`               | Maker Git 服务 base URL。                                                               |
| `TAPTAP_MAKER_REMOTE_MCP_SERVER_URL` | `TAPTAP_REMOTE_MCP_SERVER_URL` | 远端 Maker MCP server URL。                                                             |
| `TAPTAP_MAKER_WEB_URL`               | `MAKER_WEB_URL`                | Maker 网页和 CLI 登录页面地址。                                                         |
| `SCE_MCP_URL`                        | 无                             | app 数据未返回 `sce_endpoint` 时的内部 SCE endpoint 兜底。不要持久化到用户级 MCP 配置。 |

旧变量只为已存在的内部环境兼容，不得出现在新配置、插件或新文档示例中。

## 凭证兼容变量

正常流程使用 `taptap-maker login` 或 `taptap-maker pat set --pat-stdin`，并由 Maker 用户级存储
保存凭证。以下变量只用于 CI、自动化或应急联调，均属于敏感信息：

| 变量                     | 状态   | 说明                                                      |
| ------------------------ | ------ | --------------------------------------------------------- |
| `MAKER_PAT`              | 兼容   | 非交互 Maker PAT。优先于已保存 PAT，但低于显式 CLI 输入。 |
| `PAT`                    | 旧兼容 | `MAKER_PAT` 的历史短名称。不得用于新集成，名称过于通用。  |
| `MAKER_JWT`              | 兼容   | legacy Maker JWT。只用于仍依赖 JWT 的内部流程。           |
| `JWT`                    | 旧兼容 | `MAKER_JWT` 的历史短名称。不得用于新集成。                |
| `MAKER_JWT_EXCHANGE_URL` | 内部   | legacy TapTap token 换 Maker JWT 的接口地址。             |

`TAPTAP_MCP_CLIENT_SECRET` 是仓库共享认证/构建变量，不属于 Maker 插件配置。它只能存在于受控
构建或内部联调环境，不能进入客户端插件、MCP 配置和日志。

## 项目与基础设施兼容变量

| 变量                    | 状态                         | 说明                                                                                                      |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MAKER_PROJECT_ID`      | 兼容/测试                    | 强制覆盖 MCP 项目标识。正常项目必须从 `.maker-mcp/config.json` 和 MCP Roots/`target_dir` 解析，不应设置。 |
| `DSH_HOME`              | DSH 宿主配置                 | DSH 配置根目录，默认 `~/.dsh`。Maker CLI 用它定位 Cordis patch。                                          |
| `DSH_TAPTAP_MAKER_BIN`  | DSH 插件注入                 | DSH 插件内置 Maker CLI 的绝对路径，供 Agent 执行一次性命令。用户不手动持久化。                            |
| `CODEBUDDY_PLUGIN_ROOT` | WorkBuddy/CodeBuddy 宿主注入 | 当前插件根目录，用于定位 bundle、hook 和启动器。                                                          |
| `WORKBUDDY_EXTRA_PATHS` | WorkBuddy 宿主注入           | WorkBuddy 管理的可执行文件搜索目录；启动器优先从中寻找 Node.js。                                          |
| `WORKBUDDY_CONFIG_DIR`  | WorkBuddy 宿主或测试         | WorkBuddy 配置根目录覆盖。                                                                                |
| `CODEBUDDY_CONFIG_DIR`  | CodeBuddy 兼容宿主           | `WORKBUDDY_CONFIG_DIR` 未设置时的兼容回退。                                                               |

`HOME`、`USERPROFILE`、`APPDATA`、`PATH`、`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`、
`NPM_CONFIG_CACHE`、`npm_config_cache` 和 `npm_execpath` 是操作系统、代理或 npm 提供的标准变量，
不是 Maker 配置 API。Maker 只读取它们做路径兼容、诊断或显式 npx fallback，不得为其创建 Maker
别名。

## 构建与发布变量

这些变量只供仓库脚本和 CI 使用，不会写入 Maker MCP 或客户端插件运行环境。

| 变量                    | 默认值             | 使用脚本                                                   |
| ----------------------- | ------------------ | ---------------------------------------------------------- |
| `MAKER_PACKAGE_VERSION` | `dev`              | `scripts/bundle-maker.js` 注入 Maker bundle 版本。         |
| `MAKER_BUNDLE_OUTFILE`  | `dist/maker.js`    | 覆盖 Maker bundle 输出路径，插件准备脚本用它生成隔离产物。 |
| `MAKER_VERSION_MODE`    | `auto-last-number` | Maker npm 版本解析模式。                                   |
| `MAKER_MANUAL_VERSION`  | 无                 | `MAKER_VERSION_MODE=manual` 时要求的明确版本。             |
| `MAKER_NPM_TAG`         | `beta`             | Maker npm 发布 tag。                                       |

`GITHUB_REF_NAME` 和 `GITHUB_OUTPUT` 由 GitHub Actions 提供，不属于 Maker 自定义变量。

## 配置优先级

1. 当前命令显式参数或函数参数。
2. 当前名称的环境变量，例如 `TAPTAP_MAKER_API_BASE`。
3. 兼容旧变量，例如 `MAKER_API_BASE`。
4. 项目级 `.maker/taptap-maker.local.json`（仅环境选择）。
5. 代码内 production 默认值。

插件身份是例外：只要 `TAPTAP_MAKER_DISTRIBUTION` 去除首尾空白后非空，就进入插件托管模式；
具体值无法识别时仍应用通用插件行为，但不会猜测客户端专属配置或更新方式。

## 变更检查清单

新增或修改环境变量前必须确认：

1. 现有变量或 CLI 参数不能表达该需求。
2. 名称符合所属层级，且没有与兼容旧变量重复。
3. 默认行为在变量未设置时完全兼容。
4. 敏感值不会进入 argv、日志、诊断、插件产物或 Git。
5. Windows、macOS 和 Linux 的路径/分隔符语义明确。
6. 本文档和 `src/__tests__/makerEnvironmentVariables.test.ts` 已更新。
