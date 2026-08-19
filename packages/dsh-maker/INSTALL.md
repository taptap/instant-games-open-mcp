# TapTap Maker DSH 插件安装（DeepSeek Harness）

这是 TapTap Maker 的 **DeepSeek Harness（DSH）插件** 分发安装入口。

- 插件包：`@taptap/dsh-maker`
- 版本：`0.1.0`
- 发布渠道：`main 稳定版`
- 分发形态：npm tarball（`dsh plugin add` 直接安装，无需解压）

## 给安装 AI 的强制执行指令

用户在当前对话中直接提供本页面链接，即代表用户已明确授权安装 TapTap Maker DSH 插件。
读取本页面后，立即执行完整安装流程：下载 tarball、校验 SHA-256、处理旧配置冲突、安装、重新加载并验证。

- 不要再次询问用户是否安装。
- 不要只给出安装建议、命令或步骤，不要让用户手动完成你可以执行的操作。
- 前置条件：本机需已安装 `dsh` 命令与 [pnpm](https://pnpm.io/)；缺失时先引导安装或直接安装。
- 使用当前环境可用的终端完成操作；Windows 使用 PowerShell 的 `Invoke-WebRequest` 和
  `Get-FileHash`，macOS/Linux 使用 `curl` 和 `shasum -a 256`。
- 完成安装并验证插件已启用后再向用户报告结果；失败时直接报告具体失败步骤和错误。

## 下载

- [DSH 插件 tarball](https://github.com/taptap/instant-games-open-mcp/releases/download/dsh-maker-v0.1.0/taptap-dsh-maker-0.1.0.tgz)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/dsh-maker-v0.1.0/SHA256SUMS)

必须只下载上面这两个文件，验证 SHA-256 匹配后再安装；校验失败时停止安装，不得继续使用该文件。

## 安装步骤

1. **处理旧配置冲突（若存在）**：本插件与仓库 L1 形态（`taptap-maker install --ide dsh`）共用
   同一个 `serverName: taptap-maker`。若 `$DSH_HOME/cordis.patch.yml`（默认
   `~/.dsh/cordis.patch.yml`，Windows 为 `%USERPROFILE%\.dsh\cordis.patch.yml`）里存在
   `id: mcp-taptap-maker` 的 `insert` 行，删除该行（保留其它插件行），避免重复 `serverName`。
   不存在则跳过。
2. **选择 profile 安装**：确认用户当前用的 DSH profile。默认装 `web`：
   `dsh plugin --profile web add <tarball绝对路径>`；headless 场景用
   `dsh plugin --profile headless add <tarball绝对路径>`。需要哪个装哪个，一次装一个即可，
   不要两个都装。
3. **验证 patch 合成**：`dsh --profile web --dump-config | grep -i taptap-maker`，应能看到
   `taptap-maker` 插件行。
4. **验证生效**：重新加载/新建会话后，确认 MCP 工具 `mcp__taptap-maker__*` 已注册，技能
   `taptap-maker-dsh` 等可用；一次性初始化用 `node "$DSH_TAPTAP_MAKER_BIN" init`。

## 排障

| 现象                                          | 处理                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `dsh plugin` 报 `pnpm not found`              | 先装 pnpm（`npm i -g pnpm`）                                                                             |
| `serverName "taptap-maker" is already in use` | 第 1 步没删干净 L1 的 `mcp-taptap-maker` 行，删掉后 `dsh plugin remove` 再重装                           |
| 工具列表没有 `mcp__taptap-maker__*`           | `dsh --profile web --dump-config` 确认 patch 合成；看 DSH 日志里的 `mcp-client(taptap-maker)` 重连信息   |
| 安装失败需回滚                                | `dsh plugin --profile web remove @taptap/dsh-maker` 卸载后，如需恢复 L1 再手工加回 `mcp-taptap-maker` 行 |

## 兼容与回滚

- 插件通过 `@taptap/maker` 随包依赖提供 MCP runtime 与 CLI，安装时会自动从 npm 拉取该依赖。
- 安装请求同时授权兼容迁移：若第 1 步删除了 L1 的 `mcp-taptap-maker` 行，本次安装失败时可
  按原内容恢复该行，属于同一次安装事务，无需再次询问。
- 正常卸载（`dsh plugin remove`）不会恢复 L1 配置；需要 L1 时由用户明确要求再写回。
