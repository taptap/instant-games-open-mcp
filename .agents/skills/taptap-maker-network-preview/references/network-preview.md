# 联网游戏本地预览与 Validate

这份流程用于 TapTap Maker 的多人、持久世界或带服务端入口的项目。Maker 本地预览/Validate
沿用 `run-lua-validate` 的测试语义，但联网项目的启动由 Maker 网络适配接管。原 Skill 中
“只支持单机”的提示是旧启动器限制，不是联网能力结论；不能因为看到这句提示就停止。

## 一、先确认当前分发支持联网入口

先运行（不要先执行旧 Skill 的单机启动命令）：

```sh
taptap-maker preview validate --help
```

帮助中必须出现 `--network`。没有这个参数时，当前 CLI 仍是旧版本，返回
`STALE_MAKER_DISTRIBUTION`，不能通过修改项目配置、删除 `run-lua-validate` 文件或换一份
`npx` 版本来补能力；应先更新 Maker 插件/MCP 分发包。

确认项目路径是绝对路径并经过 realpath 校验：

```sh
PROJECT="/absolute/network-game"
taptap-maker preview status --target-dir "$PROJECT" --json
```

不要从“10 个项目”目录名猜项目，也不要把一个项目的 Runtime 会话、构建缓存或测试服连接信息复用到另一个项目。

## 二、检查联网配置和构建版本

按下面的顺序只读检查：

1. `.project/settings.json`：确认 `@runtime.multiplayer.enabled=true`，或存在正数 `max_players`、启用的 `persistent_world`。
2. `.project/project.json`：确认真实 `project_id`、`entry@client` 和 `entry@server`。`project_id` 不能是 `local-preview`，作者不能是仅用于本地临时项目的 `local-preview`。
3. `scripts/`：确认客户端入口和服务端入口实际存在；常见服务端入口是 `server.lua` 或 `server_main.lua`。
4. `dist/latest.json`：确认存在有效版本，并且对应版本目录里有客户端 manifest。
5. 服务端版本：确认该版本已经提交/构建到 Maker 测试服。联网本地预览只替换客户端连接地址，测试服执行的是远端已构建的服务端版本。

缺少 `latest.json`、manifest、`project_id` 或远端构建版本时，不要先启动 Runtime；先报告缺失项。不要把本地 server 文件当作已经部署到测试服。

## 三、处理旧的 run-lua-validate Skill

`run-lua-validate` 仍然用于定义测试入口、断言、报告字段和截图判读，但它的旧启动说明可能只覆盖单机。处理方式如下：

- 不删除、重写或伪造上游 Skill。
- 不运行 Skill 自带的单机 Runtime 启动命令来测试联网项目。
- 直接使用 Maker `preview start` 或 `preview validate --network`。
- Skill 文件缺失时记录为“测试指导缺失”，不要把它误报为网络连接失败；需要完整断言规则时，再按当前 Maker 分发的 dev-kit 流程恢复。
- 如果本机过滤文件把 `run-lua-validate` 排除，只允许修复当前平台的这一项，并保留其他排除项；这不会替代网络参数，也不代表测试服已连通。

## 四、启动联网本地预览窗口

### 4.1 停止冲突会话

```sh
taptap-maker preview status --target-dir "$PROJECT" --json
```

只有确认 `process_alive=false` 且状态为 `stopped` 或已确认的 `failed`，才能继续。若有活动预览，先向用户说明停止会丢失窗口内存状态，再执行：

```sh
taptap-maker preview stop --target-dir "$PROJECT" --json
taptap-maker preview status --target-dir "$PROJECT" --json
```

状态未知、会话归属不明或验证记录未完成时停止，不要强杀未知进程，也不要启动第二个 Runtime。

### 4.2 安装并启动

Runtime 缺失时：

```sh
taptap-maker preview install --target-dir "$PROJECT" --json
```

启动联网窗口：

```sh
taptap-maker preview start --target-dir "$PROJECT" --json
```

Maker 会读取联网配置、准备必要的本地副本、用生产 Maker 鉴权申请测试服，并把 `directConnectParams` 传给客户端 Runtime。启动返回或进程存活不能单独证明连网成功。

### 4.3 检查窗口是否真的连通

```sh
taptap-maker preview logs --target-dir "$PROJECT" --tail --json
taptap-maker preview status --target-dir "$PROJECT" --json
```

至少要分别看到以下证据：

- 测试服分配成功，并返回了连接信息。
- Runtime 启动参数包含联网 server、tag 和 direct-connect 参数。
- 客户端完成网络连接或 Ready 生命周期。
- 没有认证失败、连接超时、WebSocket 关闭、远端版本缺失或服务端 Lua 错误。

只看到 `process_alive=true`、窗口出现或本地 Runtime 启动日志，均只能报告为“已启动，连接未知”。

## 五、执行联网 Validate

联网 Validate 会申请测试服并可能产生测试会话、存档或业务状态。执行前先向用户明确说明副作用并取得当前操作授权。

普通引擎验证：

```sh
taptap-maker preview validate --target-dir "$PROJECT" --network --json
```

带截图和断言：

```sh
taptap-maker preview validate \
  --target-dir "$PROJECT" \
  --network \
  --mode both \
  --screenshot-frame 600 \
  --validate-test check.lua \
  --json
```

`--network` 必须显式传入。联网项目不传时，正确结果是 `UNSUPPORTED` 且不能启动 Runtime；这不是网络故障。单机项目传入时，正确结果是参数错误。

### 5.1 读取结果

验证开始时先记录 stderr 的 `validation.started`，其中包含 `run_id`、`evidence_directory`、`log_path` 和 `invocation_path`。结束后读取：

- `invocation.json`：确认是否出现 `-production`、测试服 server、`-tag=debug` 和 `-directConnectParams=...`。
- `runtime.log`：确认认证、WebSocket、Ready、服务端错误和 Runtime 退出原因。
- 原始 `validate.json`：区分 `report.result=PASS/FAIL/TIMEOUT`。
- 截图和 `screenshot_assessment`：截图只代表视觉证据，不代表联机成功。
- 最终结果：`COMPLETED` 只表示证据收集完成；不能把它直接写成游戏通过。

如果指定了 `--validate-test` 但报告没有执行断言，必须报告断言未运行；不能用普通日志里的 Lua assert 文本替代 `test_assertions`。

## 六、联网失败的定位顺序

按第一个失败阶段处理，不要盲目重复申请测试服：

| 现象                                            | 先查什么                                               | 正确处理                                                  |
| ----------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| 未出现 `validation.started` 或未生成 invocation | 项目路径、活动会话、Runtime 安装、`--network` 是否传入 | 先修复本地前置条件，不申请测试服                          |
| `UNSUPPORTED` 且提示 `--network`                | 联网项目漏传显式参数                                   | 重新执行 `preview validate --network`                     |
| `project_id`/版本/manifest 缺失                 | `.project/project.json`、`dist/latest.json`、远端构建  | 准备有效构建版本；不把本地 server 改动当远端已部署        |
| 测试服鉴权失败                                  | Maker 登录、生产环境、PAT 是否过期                     | 运行 `taptap-maker login` 后重试；不要把 PAT 放进命令参数 |
| 测试服创建超时或失败                            | 远端构建是否完成、项目 ID/版本是否匹配、网络是否可达   | 查询已有构建状态并修复前置条件；不要无依据重复创建        |
| Runtime 启动但没有 direct-connect 参数          | CLI/bundle 版本过旧或没有走网络入口                    | 检查 `--help` 和 `invocation.json`；更新 Maker 分发       |
| direct-connect 参数存在但 WebSocket 断开        | DNS、防火墙、代理、Runtime 网络能力、测试服入口        | 保留日志，先验证网络入口可达和 Runtime 版本；不降级单机   |
| 客户端连上但没有 Ready                          | client/server 入口、远端服务端版本、协议和启动生命周期 | 对比远端构建版本及 server 日志；不要只看窗口画面          |
| Ready 后游戏逻辑报错                            | 服务端 Lua、客户端 Lua、远程事件和数据                 | 按原始报告和日志修复代码，再按相同参数复测                |

### 6.1 最小诊断材料

遇到“能启动但连不上网”时，必须保留以下材料：

1. 项目 realpath 和项目分类结果。
2. 使用的 Maker CLI/bundle 版本和 `preview validate --help` 是否有 `--network`。
3. `invocation.json`（敏感连接参数只保留存在性和字段名，不复制 token）。
4. 测试服申请结果和错误码。
5. Runtime 日志中从启动到连接关闭的连续片段。
6. 原始 Validate 报告、退出码和截图路径。

不要把“窗口打开”“进程存活”“HTTP 请求成功”单独当作联网玩法成功。

## 七、完成后的报告模板

```text
项目：<realpath>
类型：network/server
Maker 网络入口：--network（是/否）
远端构建版本：<version>
测试服：未申请 / 已申请失败 / 已申请成功
客户端连接：未启动 / WebSocket 失败 / 已连接但未 Ready / Ready
Validate：未执行 / COMPLETED + report PASS/FAIL/TIMEOUT
证据：invocation_path=<path>; log_path=<path>; report=<path>; screenshots=<paths>
剩余问题：<第一个失败阶段和下一步>
```

本 Skill 不自动提交、构建、发布或重试可能已经成功的远端操作。若响应中断或状态未知，先查询原任务和已有证据，再决定是否继续。
