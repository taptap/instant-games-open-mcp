# 本地验证分支同步 main：验收报告

## 结论

- 目标分支：`fix/local-validation-phase-one`；合并前为 `1d4f51f`。
- 同步来源：`origin/main` 的 `62e2ced`，包含预览流程调整 `d810760`（PR #532）。
- 使用 merge 保留双方历史，没有 rebase、强推或修改 main。
- 本次只修改 Maker MCP 仓库，**没有修改、编译或升级 UrhoX 引擎**。
- 常驻预览采用 main 的新流程；一次性 `preview validate` 保留三种模式、旧 Runtime 提示及证据输出。
- 本报告区分“合并正确”“测试通过”和“游戏无错误”，不将三者混为一谈。

## 冲突与处理清单

Git 实际发现 10 个文件冲突：

| 冲突位置                                                        | 处理结果                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/maker/cli/preview.ts`                                      | 将 validate 接入 main 的 `executePreviewOperation`，保留 run、控制台 start、取消及 owner 管理。 |
| `src/maker/cli/commands.ts`、`src/maker/index.ts`               | 帮助同时保留 run/validate，补全 mode、duration 和 tail 参数。                                   |
| `src/__tests__/makerPreview.test.ts`                            | 保留双方测试，并补充两条流程共存与日志集成测试。                                                |
| `AGENTS.md`、`docs/MAKER_LOCAL_PREVIEW.md`                      | 同时保留新预览流程和一次性验证约束，不按整份文件选某一侧。                                      |
| 两套插件各自的 `dist/maker.js` 与 `docs/MAKER_LOCAL_PREVIEW.md` | 用锁文件依赖重新生成，不手改 bundle 或插件文档副本。                                            |

以下是无文本冲突、但需要人工检查的兼容问题：

| 问题                                                                                       | 处理结果                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| main 的常驻预览变为 Node 进程内持有，validate 不能接管该会话                               | 保留项目锁和活动状态检查；测试验证运行中拒绝 validate，owner 停止后可验证。                    |
| main 新增 Lua 文件日志收集，旧 validate 只收 stdout/stderr                                 | validate 复用 `PreviewLuaLog`，结束前排空日志；Lua 错误及收集不完整不能被 PASS 报告掩盖。      |
| stdout/stderr 分块可能切断 Lua 日志路径公告                                                | 按完整行和 UTF-8 解码，并限制缓冲大小；增加分块公告与最终大批日志回归。                        |
| Windows 常驻入口采用环境白名单，validate 尚未同步                                          | 复用同一白名单，显式 `shell:false`、`detached:false`；不增加 WMI 或后台兜底。                  |
| 真机发现 macOS `.app` 的 Lua 日志在 `Contents/Resources/logs/lua`，main 仅识别二进制旁目录 | 增加同一 `.app` 的精确目录白名单；继续拒绝其它 bundle、非 bundle 的 Resources 目录及符号链接。 |
| Skill、README、AGENTS 中笼统的“截图不支持”与本分支能力冲突                                 | 明确为常驻窗口截图不支持；一次性截图由 `preview validate` 提供，插件副本同步生成。             |
| 旧交接文档把 preview 描述成 MCP tool                                                       | 更正为插件内 CLI 子命令；工具列表没有 preview 不代表未安装。旧插件路径标为历史记录。           |

### Skill 历史记录

这里指 `skills/taptap-maker-local/SKILL.md`，不是引擎的 `run-lua-validate`。
main 历史中的 Skill 至少可追溯到 2026-05-22；“不要承诺截图，尚不支持”的说明在
2026-09-20 的 `af61929` 已存在。本次引用的第 5 条英文表述由 2026-09-28 01:59
（北京时间）的 `d810760` 增加。**不是 main 删除了本分支的截图实现，而是两条分支的说明需合并。**

## 验证结果

最终自动化回归已完成；本报告随合并提交交付到 `fix/local-validation-phase-one`。

- 已执行锁文件安装 `npm ci --no-audit --no-fund`，未改依赖或锁文件。
- `npm run build`、`npm run lint` 通过；Codex/WorkBuddy 插件生成通过。
- 全量 Jest：109 个测试套件通过，1793 项通过、3 项跳过、0 项失败；相关 TypeScript 文件格式检查通过。
- 全仓 `tsc --noEmit` 不通过：同一套依赖对 main 和合并结果检查，均为 310 条诊断；
  按文件、错误码与消息比较，没有新增错误。不能宣称全仓类型检查通过。
- 独立静态复核未发现高置信度合并新增问题；不替代实机验证。

## 本机 Runtime 实跑

使用此前验收副本 `/private/tmp/maker-local-validation-acceptance-20260926`（5秒夺宝），
不修改游戏源码，不提交游戏、不远端构建、不上传。

使用仓库生成的 `plugins/taptap-maker/dist/maker.js`，明确指定本机已有 Runtime：

```text
/Users/liangdong/.taptap-maker/runtime/runtime-local-validation-ecb76d388/UrhoXRuntime.app/Contents/MacOS/UrhoXRuntime
```

| 测试                                       | 实际结果                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate --mode validate`                 | PASS，60 帧，结构化报告错误计数为 0。                                                                                                                                                             |
| `validate --mode screenshot`               | PASS，真实 PNG 688×1224。                                                                                                                                                                         |
| `validate --mode both`                     | 全量单测同时运行期间一轮因 105.667ms 帧耗时超过引擎 100ms 门槛返回 FAIL；单测结束后独立复测 PASS，200 帧、错误计数 0、最大帧耗时 92.72ms。两轮报告和 PNG 分别保留，不认定并发负载是已证实的原因。 |
| 合并分支 `preview run --duration-ms 10000` | 能启动、停止并确认进程退出，但资源缺失导致 FAIL，不算游戏验收通过。                                                                                                                               |
| 原 main 同 Runtime、同游戏的 `preview run` | 同样 FAIL，且额外出现启动资源缺失，证明不能归因于本次 merge 新增。                                                                                                                                |
| 游戏文件保护                               | scripts、assets、.project 运行前后 SHA-256 一致。                                                                                                                                                 |

### 保留的问题与边界

1. `Cube/Day/DaySpecularHDR_QualityLow.dds` 缺失在旧报告、main 对照及合并结果中均存在；
   不过滤或伪装为已修复，本次不改引擎资源包。
2. 引擎 validate 的报告覆盖范围与 preview run 的全程日志检查不同：
   结构化报告 PASS 不等于启动日志零错误，更不等于完整玩法通过。
3. 帧耗时门槛导致的 FAIL 保留原文，不调高阈值、不改成 PASS；单独复测也不覆盖首次失败。
4. Windows 环境选择与流程逻辑已自动化测试，**Windows 实际 Runtime、宿主强杀及杀软兼容未在本机验收**。
5. 没有修改本机已安装插件缓存或切换其它 AI 会话；分支源码更新不等于另一个会话自动加载新包。

## 明天从哪里验收

本轮原始证据已另存到固定目录，不受 Maker 最近三轮证据清理影响：

```text
/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/
```

该目录包含每次命令的 stdout JSON、stderr、runtime.log、prepare.log、引擎报告和 PNG；
`summary.json` 记录实际命令、退出码、游戏文件摘要。
`main-run` 是原 main 对照；`run` 是合并分支；`both` 保留帧耗时失败轮；
`both-retry` 和 `retry-summary.json` 保留独立复测通过轮。

直接查看本机证据：

- [独立复测截图](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/both-retry/e710c892-f849-4929-9ae0-c8ad34e32d55.png)：已看图确认是游戏菜单，非 loading 页面；未代替逐关玩法测试。
- [独立复测 Runtime 日志](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/both-retry/runtime.log)。
- [独立复测命令与结果](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/retry-summary.json)。
- [整轮实跑与 main 对照](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/summary.json)。
- [全量 Jest 原始结果](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/jest-final.json)。
- [最终类型检查基线对比](/Users/liangdong/Documents/Mcp/local-validation-main-merge-evidence-20260928/typecheck-comparison.json)。

上述绝对路径仅对应这台 macOS 机器；Windows 验收需在自己的环境重新生成证据。

验收时查看本报告和上述证据；Windows 拉取同一分支后按
`docs/WINDOWS_LOCAL_VALIDATION_ACCEPTANCE.md` 编译和执行，不使用 macOS 二进制。
普通窗口测试用 `preview start` 或 `preview run`；一次性证据测试用
`preview validate --mode both`，二者不能同时占用同一项目。
