# TapTap Maker × DeepSeek Harness（DSH）插件

本仓库把 TapTap Maker 的本地开发闭环接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
（DSH），分两层交付，由轻到重：

| 层     | 形态        | 入口                                                | 能力                                                                                     |
| ------ | ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **L1** | 零代码配置  | `taptap-maker install --ide dsh`                    | 只把 Maker MCP 注册成一条 `mcp-client` 行（写入 `$DSH_HOME/cordis.patch.yml`），HMR 生效 |
| **L2** | bundle 插件 | `packages/dsh-maker/`（npm 包 `@taptap/dsh-maker`） | MCP + 技能打包，`dsh plugin add` 一键安装，自包含、可分发                                |

本文档说明 **L2 插件**。L1 的实现与配置细节见
[`docs/MAKER.md`](MAKER.md) 的 DSH 章节。

## 为什么是 bundle（而不是手写 patch 或原生工具）

DSH 的插件体系 = **Cordis 插件 + YAML patch 层合成**。`dsh.bundle` 是官方为“可分发插件包”
设计的形态：`dsh plugin --profile <name> add <pkg>` 一条命令完成安装、自动注册图层、HMR 生效，
且与将来的 DSH 插件市场天然兼容。相比 L1 的手写 `mcp-client` 行，bundle 能把“MCP + 技能”作为
一个自包含单元交付、随装随卸，并把路径解析放进 JS 运行时，避免纯 YAML 绑定机器/profile 路径。

本插件刻意**不做**（v1 边界，与 L1 分工清晰）：

- 不写 Maker 业务原生工具（`ctx.tools.register` 自有工具）；
- 不做 UI 卡片 / agent preset / 后台任务 / system-prompt 段等深度集成；
- 不改 Maker MCP 服务端、不动现有 `--ide` / CLI 安装路径；
- 不写 `~/.dsh/AGENTS.md` 用户全局指引（项目级 `AGENTS.md` 已足够）。

## 包结构

```
packages/dsh-maker/
├── package.json               # type:module; dsh.bundle.patch → ./cordis.patch.yml
│                              # main → lib/index.js；peerDeps: cordis + dsh-mcp-client + dsh-skill-filesystem + dsh-shell-env
├── cordis.patch.yml           # 一条 insert：挂本包插件模块（id: taptap-maker）
├── lib/index.js               # 唯一 JS：挂 skill-filesystem（技能）+ mcp-client（MCP）+ 注册 shellEnv CLI 路径
├── skills/                    # SKILL.md（DSH 原生技能格式）
│   ├── taptap-maker-dsh/SKILL.md     # 核心工作流（DSH 专用约束）
│   ├── taptap-ads/SKILL.md           # 广告接入
│   ├── taptap-cloud-save/SKILL.md    # 云存档接入
│   └── taptap-leaderboard/SKILL.md   # 排行榜接入（客户端）
├── assets/taptap-maker.png    # 插件图标（市场展示用）
└── README.md                  # 安装/卸载/验证/排障
```

## 运行机制

`cordis.patch.yml` 只插入一行插件模块：

```yaml
- insert:
    - id: taptap-maker
      name: '@taptap/dsh-maker'
```

插件模块 `lib/index.js` 的 `apply` 在激活时挂两个子插件，并注册一个 shell 环境变量：

1. **技能**：宿主平面 `skill-filesystem` 实例（DSH 官方“repository plugin”模式），配置
   `providerName: maker` + `includeDefaultRoots: false` + `bundledSkillDir: skills/`。它只贡献
   本包自带的指南，与 standard preset 的项目/用户根技能各司其职，不重复扫描。
2. **MCP**：`@deepseek-ai/dsh-mcp-client`，用 `require.resolve('@taptap/maker')` 运行时解析出
   `dist/maker.js`，以 `process.execPath`（绝对 Node）+ 该绝对路径启动。不依赖 npx、不绑定
   profile 路径。
3. **CLI 发现**：通过 `ctx.shellEnv` 注册 `DSH_TAPTAP_MAKER_BIN`（随包 `@taptap/maker` 的
   `bin/taptap-maker` 绝对路径）。DSH 会把该变量注入会话 shell，agent 用
   `node "$DSH_TAPTAP_MAKER_BIN" init` 做一次性初始化，零网络、零路径猜测。

设计上“更贴合 DSH”的取舍：

| 取舍                              | 说明                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 单 patch 行 + 程序内挂子插件      | 入口只有一个模块，路径用 `import.meta.url` 运行时算，任意 profile/安装位置都正确                                                       |
| `failOnStartupError` 默认 `false` | 插件同时挂技能 + MCP；MCP 启动失败若用 `true` 会连技能一起 dispose 并拖垮 DSH 启动，`false` 则技能仍可用、MCP 重连自愈（失败仍打日志） |
| 只声明 `inject: ["shellEnv"]`     | 插件只用 `shellEnv` 服务（技能/MCP 由子插件各自 `inject`），不无谓延迟激活                                                             |
| CLI 走 `ctx.shellEnv`             | profile 的 `node_modules/.bin` 不在 shell PATH，`shellEnv` 是 DSH 注入会话 shell 的一等通道，比 `npx` 稳、零网络                       |

## 安装与卸载

前置：已装 DSH（`dsh`）与 pnpm。

```bash
# 安装（web profile；headless 同理）
dsh plugin --profile web add @taptap/dsh-maker

# 验证
dsh --profile web --dump-config | grep -A 20 'mcp-taptap-maker\|taptap-maker'

# 卸载
dsh plugin --profile web remove @taptap/dsh-maker
```

> 与 L1 冲突：两者都占 `serverName: taptap-maker`。已用 L1（`taptap-maker install --ide dsh`）
> 的用户先运行 `taptap-maker plugin inspect --client dsh --json` 检查，再用
> `taptap-maker plugin migrate --client dsh --confirm --json` 结构化禁用旧注册，不能手改 YAML。

## 配置覆盖

在 profile 的 `cordis.patch.yml` 给插件行加 `config.mcp` 即可覆盖（不覆盖则用默认值）：

```yaml
- id: taptap-maker
  config:
    mcp:
      serverName: taptap-maker # 默认 taptap-maker
      toolCallTimeoutMs: 3600000 # 默认 1 小时
      failOnStartupError: false # 默认 false
      env: # 合并进子进程环境（凭证类放这里）
        TAPTAP_MCP_ENV: production
      cwd: '' # 默认不写（项目无关）
```

## DSH 特有约束（写进技能的硬规则）

- **无 MCP Roots**：每次项目相关工具调用显式传 `target_dir`。
- **无 MCP Resources**：状态用 `maker_status_lite`、广告用 `get_ad_config`，不要读 `maker://*`。
- **env scrub**：子进程不自动继承 `KEY/PASSWORD/SECRET/TOKEN` 与 `DSH_*`，凭证类变量必须写进
  `config.mcp.env`。
- **超时**：DSH 默认每次 `tools/call` 60 秒，Maker 构建/素材会超时，插件已默认 1 小时。

## 分发（GitHub 发版页）

上架 DSH 插件市场之前，用与 Codex/WorkBuddy 相同的方式做 GitHub Release 分发：用户把发版页链接
交给 AI，AI 按页面自动下载、校验、安装。

- **发版页**：`packages/dsh-maker/INSTALL.md`（稳定页，含“给安装 AI 的强制执行指令”、下载链接、
  安装步骤、排障与回滚）。
- **产物**：`npm run maker:dsh-plugin:package` 生成 `taptap-dsh-maker-<version>.tgz`、
  `SHA256SUMS`、`INSTALL.md`、`dsh-maker-release.json` 到 `artifacts/dsh-maker/`。
- **发版**：只手动运行 `.github/workflows/publish-dsh-maker-plugin.yml`。选择 `develop` 发布预览版，
  选择 `main` 发布稳定版；工作流创建 tag `dsh-maker-v<version>` 的 GitHub Release，把 tarball、
  `SHA256SUMS` 上传为附件，`INSTALL.md` 作为 Release 说明。

本地（未发版）分发：跑一次 `npm run maker:dsh-plugin:package`，把 `taptap-dsh-maker-<version>.tgz`

- `SHA256SUMS` 交给测试用户，用户（或其 AI）执行
  `dsh plugin --profile web add <tarball绝对路径>` 即可。

## 版本与发布

- `@taptap/maker` 使用精确版本；手动从 develop 发布预览版时可通过 `maker_version` 输入指定精确
  beta runtime，main 稳定版只读取清单中的稳定 runtime。工作流会先通过 npm 校验该版本确实已
  发布，避免安装时依赖不存在。
- `packages/dsh-maker/` 与 `docs/DSH_PLUGIN.md` 已纳入 `scripts/release-scope.cjs` 的 maker
  归属，只改本插件的提交不会误触发主包发布。
- 发布：从 `packages/dsh-maker/` 执行 `npm publish --access public`。
- 接入 DSH 插件市场：本包已保持标准 bundle 形态 + `assets/taptap-maker.png` 图标，市场开放后
  按规范补充入口字段即可。

## 相关文档

- L1 配置：[`docs/MAKER.md`](MAKER.md)（DSH 章节）
