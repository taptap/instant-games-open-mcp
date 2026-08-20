# @taptap/dsh-maker

DeepSeek Harness（DSH）插件：把 [TapTap Maker](https://github.com/taptap/instant-games-open-mcp)
的本地开发闭环接入 DSH。

装上后，DSH 会自动获得三样东西：

1. **Maker MCP 工具**（`mcp__taptap-maker__*`）：构建/提交/预览、状态、广告配置、素材生成等；
2. **Maker 技能**：工作流 + 常用功能指南（广告 / 云存档 / 排行榜），并内置“以工程内
   `engine-docs` 为准、禁止网上搜错文档”的防错引导；
3. **可发现的 CLI 路径**：环境变量 `DSH_TAPTAP_MAKER_BIN` 指向随包 `@taptap/maker` 的 CLI，
   一次性 `init`/`agents update`/`mcp report` 用 `node "$DSH_TAPTAP_MAKER_BIN" <cmd>` 零网络执行。

本插件是仓库 DSH 集成的 **L2 形态**（bundle 插件）。它区别于已有的
**L1 形态**（`taptap-maker install --ide dsh` 写入 `$DSH_HOME/cordis.patch.yml`）：
L1 只注册一个裸的 Maker MCP；本插件则把 **MCP + 技能** 打包成可分发、可一键安装、可 HMR 的
DSH bundle。两者不要同时启用，避免同 `serverName` 冲突。已用 L1 时，不要手改 YAML；安装前用
Maker CLI 的结构化命令检查并迁移旧注册：

```bash
npx -y --package @taptap/maker@<maker-version> taptap-maker plugin inspect --client dsh --json
npx -y --package @taptap/maker@<maker-version> taptap-maker plugin migrate --client dsh --confirm --json
```

`<maker-version>` 使用本包 `package.json` 中 `dependencies["@taptap/maker"]` 的精确值；通过 GitHub
Release 安装时直接执行 Release `INSTALL.md` 中已写入对应版本的命令。

## 安装

前置：已安装 DSH（`dsh` 命令）与 [pnpm](https://pnpm.io/)。

```bash
dsh plugin --profile web add \
  'github:taptap/instant-games-open-mcp#path:packages/dsh-maker'
```

headless profile 同理：

```bash
dsh plugin --profile headless add \
  'github:taptap/instant-games-open-mcp#path:packages/dsh-maker'
```

上面的无 ref GitHub 子目录源是 1024Store 使用的市场安装入口，会跟随仓库 `main`。需要安装固定
版本或把链接交给 AI 自动安装时，使用仓库对应的 `dsh-maker-v*` GitHub Release，并按 Release 内的
`INSTALL.md` 下载和校验 tarball。

DSH 会热重载该 patch，无需重启。验证：

```bash
dsh --profile web --dump-config | grep -A 20 'mcp-taptap-maker\|taptap-maker'
```

## 做了什么

插件通过一个 bundle patch 行（`id: taptap-maker`）在激活时挂载两个子插件，并注册一个 shell 环境变量：

- **Maker 技能**：宿主平面 `skill-filesystem` 实例（DSH 官方 repository-plugin 模式），
  `providerName: maker` + `includeDefaultRoots: false` + `bundledSkillDir: skills/`，
  只读挂载本包 `skills/` 目录，与 standard preset 的本地技能各司其职、不重复扫描项目/用户根。
- **Maker MCP**：`@deepseek-ai/dsh-mcp-client`，通过随包依赖 `@taptap/maker` 的
  `dist/maker.js` 启动（**绝对 Node + 包内路径**，`require.resolve` 运行时解析，不依赖 npx、
  不绑定 profile 路径）。
- **CLI 发现**：通过 `ctx.shellEnv` 注册 `DSH_TAPTAP_MAKER_BIN`（随包 `@taptap/maker` 的
  `bin/taptap-maker` 绝对路径），让一次性 CLI 操作零网络、零路径猜测。

### 为什么这样最贴合 DSH

| 决策                                          | 理由                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单 patch 行 + 程序内挂两个子插件              | 入口只有一个模块，路径全部用 `import.meta.url` 运行时计算，任意 profile/安装位置都正确；纯 YAML 写绝对路径会绑定机器/profile                                                                |
| `failOnStartupError` 默认 `false`             | 本插件同时挂技能 + MCP。若 MCP 启动失败用 `true`，会连技能一起 dispose 并拖垮 DSH 启动；用 `false` 则技能仍可用、MCP 由重连自愈（失败仍会打日志，不静默）。L1 裸 MCP 行才用 `true` 快速暴露 |
| 只用 `inject: ["shellEnv"]`                   | 技能/MCP 由两个子插件各自声明 `inject`；本插件只声明它直接使用的 `shellEnv` 服务，不无谓延迟激活                                                                                            |
| 技能走 `skill-filesystem` + `bundledSkillDir` | 零文件复制、装插件即带技能、卸载即消失、HMR 生效，是 DSH 的“仓库插件”一等形态                                                                                                               |
| CLI 走 `ctx.shellEnv`                         | profile 的 `node_modules/.bin` 不在 shell PATH，`shellEnv` 是 DSH 注入会话 shell 的一等通道，比 `npx` 更稳、零网络                                                                          |

## 使用要点（DSH 特有）

- **每次项目相关的 Maker 工具调用都要显式传 `target_dir`**（DSH 不广播 MCP Roots）。
- **DSH 不读 MCP Resources**：用 `maker_status_lite` 看状态、用 `get_ad_config` 查广告配置，
  不要尝试读 `maker://*`。
- 工程根 `AGENTS.md`（含 Maker 管理策略块）由 DSH 自动加载，无需额外操作。
- 一次性初始化（登录 / 选 app / clone）走 `node "$DSH_TAPTAP_MAKER_BIN" init`（该变量由本插件
  注入；若运行在未装本插件的客户端才退回
  `npx -y --package @taptap/maker@<版本> taptap-maker init`）。
  高频开发循环（状态 / 构建 / 提交 / 预览）用 MCP 工具，不要重造 CLI/API。

## 配置（可选覆盖）

在 profile 的 `cordis.patch.yml` 里给插件行加 `config` 即可覆盖（不覆盖则用默认值）：

```yaml
- id: taptap-maker
  config:
    mcp:
      serverName: taptap-maker # 默认 taptap-maker
      toolCallTimeoutMs: 3600000 # 默认 1 小时
      failOnStartupError: false # 默认 false：技能不受 MCP 启动失败影响，重连自愈
      env: {} # 可选：合并进 MCP 子进程环境
      cwd: '' # 默认不写（保持项目无关）
```

## 卸载

```bash
dsh plugin --profile web remove @taptap/dsh-maker
```

## 排障

| 现象                                 | 处理                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `dsh plugin` 报 `pnpm not found`     | 先装 pnpm（或 `npm i -g pnpm`）                                                                        |
| 工具列表没有 `mcp__taptap-maker__*`  | `dsh --profile web --dump-config` 确认 patch 合成；看 DSH 日志里的 `mcp-client(taptap-maker)` 重连信息 |
| 工具调用约 60s 超时                  | 确认生效的是本插件的 1h 超时配置，而非旧的裸 `npx` 行                                                  |
| 广告/云存档等接口用错                | 触发 `taptap-ads`/`taptap-cloud-save` 等技能，读工程内 `engine-docs`，不要网上搜索                     |
| 与 L1 同时存在导致 `serverName` 冲突 | 运行 `plugin inspect --client dsh` 检查，再用 `plugin migrate --client dsh --confirm` 结构化禁用旧注册 |

## 版本兼容

- 依赖 `@deepseek-ai/cordis ^4.0.1` 及配套 `@deepseek-ai/dsh-mcp-client` /
  `dsh-skill-filesystem` / `dsh-shell-env`（`^0.1.0-rc.6`，peer 锁定，随 DSH rc 版本同步升级）。
- Maker MCP 由随包依赖的 `@taptap/maker` 提供；精确版本以本包 `package.json` 的依赖值为准，并与
  仓库 `config/maker-version-policy.json` 的对应渠道一致。升级 Maker 时同步 bump 本包依赖并随
  插件发版。

## 发布与市场

- 正式包由仓库的 `Publish DSH Maker Plugin` workflow 发布到 GitHub Release，不单独发布
  `@taptap/dsh-maker` npm 包。
- 1024Store 使用 GitHub 子目录源
  `github:taptap/instant-games-open-mcp#path:packages/dsh-maker` 安装；对外仓库链接在
  `package.json.repository`。
