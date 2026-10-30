---
name: maker-mcp-isolated-dev
description: Automatically isolate Maker MCP source-repository development when starting, rebuilding, restarting, or testing its console or canvas (开发画布、重启控制台、验证最新页面). Check existing console instances, briefly notify the user, and proceed without asking for isolation confirmation while other AI sessions keep using the installed version. Not for ordinary game development or installed-package upgrades.
---

# Maker MCP 开发环境隔离

其他 AI 继续使用当前安装版；当前源码另起开发控制台及其画布服务。
复用现有 `TAPTAP_MAKER_HOME`、构建脚本和 CLI，不新增服务管理器或修改其他 AI 的配置。

## 自动触发与提示

- 用户在 Maker MCP 源码仓库要求启动、重建、重启或实际验证开发版控制台/画布时，
  自动采用本 Skill，不要求用户记住名称或手动调用。普通代码、文档编辑不额外启动服务。
- 执行前按下文只读检查已有实例。发现原控制台正在运行时，简短提示：
  “检测到已有 Maker 控制台正在运行，本次自动使用独立开发实例，保留原控制台和画布。”
  随即继续隔离流程，不询问“是否隔离”，不等待确认。
- 控制台存活、项目登记或 AI 会话登记不等于画布正在编辑。只有确实查到打开的画布页面
  才描述为“已有画布打开”；不为判断占用遍历所有项目或操作其他 AI 的标签页。
- 未发现原实例或无法确认其状态时，开发侧仍使用独立入口与 home，避免后来启动的
  其他 AI 连接开发环境。同一任务复用已核实的开发实例，不反复提示或重复创建。
- 这是 Agent 在任务执行前按需检查，不是后台监控或进程自动切换。免确认仅适用于
  本地隔离流程；未明确的测试项目、付费生成和远端写操作仍遵循各自的目标及授权要求。

## 隔离边界

- 程序入口分开：开发构建输出到专用目录，不覆盖已安装版或正在被其他会话使用的 bundle。
- 进程登记分开：开发命令始终携带独立的 `TAPTAP_MAKER_HOME`，隔离 session、启动锁、
  项目登记和任务记录。端口由服务自动分配，不手工抢占原控制台端口。
- 画布文件分开：画布及素材仍保存在游戏项目目录中。独立进程不能隔离同一个目录的写入；
  实际编辑使用已明确指定的测试项目或独立本地副本，不改其他 AI 正在使用的画布。
- 隔离目录只影响本地状态；同一账号的远端项目、积分和付费任务仍然共享。

## 启动前

1. 确认当前源码仓库及已有修改，只读检查原环境的 `console/session.json`、项目登记与
   `/api/health`。记录原控制台的入口、PID、origin、instanceId 和启动时间；
   原环境不一定使用默认的 `~/.taptap-maker`，按实际启动配置确认，不输出凭证。
2. 核对开发入口和数据目录与原环境不同，包括 realpath，避免符号链接指回同一位置。
   原服务不可访问时如实记录，不能为完成隔离测试而重启或清理原服务。
3. 仅验证控制台启动时不必绑定游戏。需要操作画布时，沿用用户已指定的测试项目；
   没有明确目标时再让用户选择，不从原控制台登记列表自动挑一个项目。

## 构建与启动

先按仓库当前构建约定确认入口；相关契约见
[环境变量](../../../docs/MAKER_ENVIRONMENT_VARIABLES.md)和
[控制台生命周期](../../../docs/MAKER_CONSOLE.md)。

以下为 macOS/Linux 的独立启动示例，在源码仓库根目录执行。首次创建测试目录，
后续状态、画布操作和重启复用同一个目录；跨 Shell 调用时明确传入记录下来的绝对路径。

```bash
maker_dev_root="$(mktemp -d "${TMPDIR:-/tmp}/maker-isolated-dev.XXXXXX")"
maker_dev_home="$maker_dev_root/home"
maker_dev_entry="$maker_dev_root/dist/maker.mjs"

MAKER_BUNDLE_OUTFILE="$maker_dev_entry" node scripts/bundle-maker.js
```

构建成功后再启动。若已有经核实独立的开发产物，可直接复用，不必每次重建。

```bash
TAPTAP_MAKER_HOME="$maker_dev_home" node "$maker_dev_entry" console open --no-open --json
TAPTAP_MAKER_HOME="$maker_dev_home" node "$maker_dev_entry" console status --json
```

需要画布时，在 `console open` 后附加 `--target-dir "<已确认测试项目的绝对路径>"`。
使用返回的 URL 在 Cindy 内置浏览器打开，核对页面已连接和所选测试项目。
Windows 按相同原则在子进程环境中设置变量并使用绝对路径，不照抄 Bash 语法。

- 所有开发侧 `console`、`canvas`、`preview` 命令都使用上述明确入口和 home，
  不临时换成 PATH 中的裸 `taptap-maker` 或 `npx`。不要将开发 home 写进全局 Shell 配置。
- 会话里已安装的 Maker MCP 连接不会随 Shell 变量切换。开发控制台验收使用隔离 CLI；
  若任务确实需要开发版 MCP 连接，再单独配置其入口和环境，不覆盖原连接。
- 新 home 可能缺少登录、PAT、模型设置或 Runtime。只在验收实际需要时按对应流程准备，
  不整目录复制原 home，也不通过共用 home 解决鉴权问题。

## 修改后重启

1. 先保存开发画布并检查开发实例的任务和预览。存在活动任务或未知结果时按现有流程处理，
   不强杀，也不为了重启自动重试生成。
2. 核对 `console status` 的 PID、入口、origin 与开发 home 中的登记一致，再执行：

   ```bash
   TAPTAP_MAKER_HOME="$maker_dev_home" node "$maker_dev_entry" console stop --json
   ```

3. `draining: true` 只表示收到关闭请求。确认开发进程退出及登记释放后，
   重新构建并用同一隔离入口执行 `console open`，以新返回的 URL 打开页面。
4. 不停止原控制台，不按进程名批量清理，不删除原环境锁文件。
   身份不匹配时先查入口和 home，不能照错误提示去关闭另一套环境。

## 验证与交付

首次建立隔离环境或明确要求验证隔离时，检查开发实例的启动、页面交互、停止和重启：

- 两套实例的 PID、origin、instanceId 不同；开发侧登记和任务来自独立 home。
- 开发实例启停前后，原实例身份未变、健康接口正常，已安装 bundle 未被覆盖。
  原环境可能被其他 AI 正常操作，不要求其任务或画布内容在测试期间完全不变。
- 验证画布功能时，在测试项目中通过页面或现有 canvas CLI 完成对应实际操作；
  不直接改 `.maker` 下的保存文件，不把 HTTP 成功当作画布功能通过。

后续普通小修按改动范围验证，不机械重跑整套隔离测试。
只测控制台就明确说明未覆盖画布编辑或生成；不用单元测试替代用户操作验收。
临时验证结束后只关闭自己创建的实例和标签页；用户要求继续使用时保留并交付入口、home
和 URL。临时构建和记录留在仓库外，不作为产品文件提交。
