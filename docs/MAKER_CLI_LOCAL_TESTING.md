# Maker CLI Local Testing Guide

这份文档用于新开对话后测试 Maker CLI，尤其是第一步 `taptap-maker init` 之前的本地 CLI 可用性、PAT/app 列表、dev-kit、clone 和 MCP 配置写入行为。

如果目标是“本地开发完自测”，需要真实 PAT、固定 Maker 项目、已绑定项目修改提交和远端构建，请优先使用：

- [Maker Local Self-Test Playbook](MAKER_LOCAL_SELF_TEST.md)

本文档偏向分层手工检查；`MAKER_LOCAL_SELF_TEST.md` 是给新 AI 对话直接执行完整本地自测的流程规范。

优先原则：

- 先跑不写真实用户配置的安全测试。
- 真实 PAT 和真实 MCP 配置分开测。
- Windows 是主要验证目标；macOS 可以先做快速验证。
- 测试失败时保留输出，不要直接清理现场。

## 0. 测试对象

本分支本地构建后的 CLI 入口：

```bash
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js
```

线上/发布包入口：

```bash
npx -y -p @taptap/instant-games-open-mcp@beta taptap-maker
```

本地分支验证时优先用 `node dist/maker.js`，避免测到线上旧包。

## 已安装线上 MCP 时怎么测

如果本机已经安装或配置过线上版本，不要一开始就删除配置。推荐分三层测：

1. **CLI 功能测试**：使用本地 `node dist/maker.js`，并隔离 `HOME` / `TAPTAP_MAKER_HOME`。这不会影响线上 MCP 配置。
2. **配置生成测试**：仍然使用隔离 `HOME` 跑 `mcp install`，检查生成的配置是否正确。
3. **真实客户端接入测试**：确认前两层没问题后，再决定是否覆盖真实用户级 MCP 配置。

只有第 3 层会影响本机真实 Codex / Cursor / Claude 配置。

### 为什么不建议先删配置

- 已有线上配置可能还要用于回退。
- CLI 测试不依赖客户端已经加载的 MCP tools。
- 删除配置无法解决“当前 Agent 会话不能热加载新 MCP”的问题；多数客户端仍需要刷新/重启。
- 本轮重构重点是 CLI-first，第一阶段验证不需要客户端已经能看到新 tools。

### 如何确认当前命中的版本

测试 CLI 时，用绝对路径可以确保命中本地分支：

```bash
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js help
```

如果用 `npx`，可能命中线上包或缓存包：

```bash
npx -y -p @taptap/instant-games-open-mcp@beta taptap-maker help
```

所以本地分支测试不要用 `npx` 作为第一选择。

### 真实配置覆盖前先备份

`taptap-maker mcp install` 会在写配置前自动生成 `.bak.<timestamp>` 备份，但真实覆盖前仍建议先查看当前配置。

常见路径：

macOS/Linux：

```bash
ls -la ~/.codex/config.toml ~/.cursor/mcp.json ~/.claude.json 2>/dev/null
```

Windows PowerShell：

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\config.toml","$env:USERPROFILE\.cursor\mcp.json","$env:USERPROFILE\.claude.json" -ErrorAction SilentlyContinue
```

如果只是测试本地分支，不要改这些真实文件；继续用隔离 `HOME`。

### 如果必须测真实客户端

确认要让真实客户端加载本地分支时，可以手动把 MCP command 指向本地 `node dist/maker.js`，这样不用等 npm 发布：

Codex 配置思路：

```toml
[mcp_servers."taptap-maker-local"]
command = "node"
args = ["/Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js"]

[mcp_servers."taptap-maker-local".env]
TAPTAP_MCP_ENV = "rnd"
```

Windows 配置思路：

```json
{
  "mcpServers": {
    "taptap-maker-local": {
      "command": "node",
      "args": ["C:\\path\\to\\taptap_minigame_open_mcp\\dist\\maker.js"],
      "env": {
        "TAPTAP_MCP_ENV": "rnd"
      }
    }
  }
}
```

建议用新名字 `taptap-maker-local`，不要覆盖已有线上 `taptap-maker`，这样线上版本还能保留回退。客户端刷新或重启后，应能同时看到两个 server；测试完再删除 local 这条即可。

## 1. 开始前构建

在仓库目录执行：

```bash
cd /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp
npm run build
```

预期：

- `dist/maker.js` 生成成功。
- 不需要先发布 npm 包。

## 2. 零风险 CLI Smoke

这组命令不需要 PAT，不应该写真实用户配置。

```bash
cd /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp
node dist/maker.js help
node dist/maker.js doctor --json --target-dir .
node dist/maker.js mcp verify --json
```

预期：

- `help` 显示 `init / doctor / apps / pat set / mcp install / mcp verify / dev-kit update`。
- `doctor --json` 返回 Git、auth、project、dev_kit 状态。
- `mcp verify --json` 返回 `ok: true`。

注意：

- `doctor` 只检查状态，不应该下载 dev-kit。
- 如果 `doctor` 报 Git 缺失，先修 Git。不要继续测 init。

## 3. 隔离 HOME 的安全测试

`pat set` 会写：

```text
~/.taptap-maker/pat.json
~/.maker-pat
```

所以测试 PAT 写入或 MCP 配置写入时，推荐临时隔离 `HOME` 和 `TAPTAP_MAKER_HOME`。

macOS/Linux：

```bash
export MAKER_TEST_ROOT=/tmp/taptap-maker-cli-test
rm -rf "$MAKER_TEST_ROOT"
mkdir -p "$MAKER_TEST_ROOT/home" "$MAKER_TEST_ROOT/maker-home" "$MAKER_TEST_ROOT/project"
export HOME="$MAKER_TEST_ROOT/home"
export TAPTAP_MAKER_HOME="$MAKER_TEST_ROOT/maker-home"
cd "$MAKER_TEST_ROOT/project"
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js doctor --json --target-dir .
```

Windows PowerShell：

```powershell
$env:MAKER_TEST_ROOT="$env:TEMP\taptap-maker-cli-test"
Remove-Item -Recurse -Force $env:MAKER_TEST_ROOT -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$env:MAKER_TEST_ROOT\home" | Out-Null
New-Item -ItemType Directory -Force "$env:MAKER_TEST_ROOT\maker-home" | Out-Null
New-Item -ItemType Directory -Force "$env:MAKER_TEST_ROOT\project" | Out-Null
$env:HOME="$env:MAKER_TEST_ROOT\home"
$env:USERPROFILE="$env:MAKER_TEST_ROOT\home"
$env:TAPTAP_MAKER_HOME="$env:MAKER_TEST_ROOT\maker-home"
Set-Location "$env:MAKER_TEST_ROOT\project"
node C:\path\to\taptap_minigame_open_mcp\dist\maker.js doctor --json --target-dir .
```

预期：

- 输出里的 PAT 路径应指向隔离目录。
- 不应该改动真实 `~/.codex`、`~/.cursor`、`~/.claude.json`。

## 4. PAT 和 App 列表测试

这一步需要真实 Maker PAT，但不 clone、不写 MCP 配置。

macOS/Linux：

```bash
export MAKER_TEST_ROOT=/tmp/taptap-maker-cli-test
mkdir -p "$MAKER_TEST_ROOT/home" "$MAKER_TEST_ROOT/maker-home" "$MAKER_TEST_ROOT/project"
export HOME="$MAKER_TEST_ROOT/home"
export TAPTAP_MAKER_HOME="$MAKER_TEST_ROOT/maker-home"
cd "$MAKER_TEST_ROOT/project"

node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js pat set "<PASTE_PAT_HERE>" --json
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js apps --json
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js doctor --json --target-dir .
```

Windows PowerShell：

```powershell
$env:HOME="$env:MAKER_TEST_ROOT\home"
$env:USERPROFILE="$env:MAKER_TEST_ROOT\home"
$env:TAPTAP_MAKER_HOME="$env:MAKER_TEST_ROOT\maker-home"
Set-Location "$env:MAKER_TEST_ROOT\project"

node C:\path\to\taptap_minigame_open_mcp\dist\maker.js pat set "<PASTE_PAT_HERE>" --json
node C:\path\to\taptap_minigame_open_mcp\dist\maker.js apps --json
node C:\path\to\taptap_minigame_open_mcp\dist\maker.js doctor --json --target-dir .
```

预期：

- `pat set` 输出 `Maker PAT and TapTap token saved`。
- `apps --json` 返回 app 数组。
- `doctor` 返回 `auth.pat: true` 和 `auth.tap_auth: true`。

如果失败：

- 401/403：PAT 失效或环境不匹配。
- 空 app 列表：确认账号是否有 Maker app。
- 网络错误：保留完整错误输出，先不要改代码。

## 5. Init 非交互测试（不写真实 MCP 配置）

这一步会下载 dev-kit 并 clone Maker 项目。请选择空目录。

macOS/Linux：

```bash
export MAKER_TEST_ROOT=/tmp/taptap-maker-cli-test
export HOME="$MAKER_TEST_ROOT/home"
export TAPTAP_MAKER_HOME="$MAKER_TEST_ROOT/maker-home"
export MAKER_GAME_DIR="$MAKER_TEST_ROOT/game"
rm -rf "$MAKER_GAME_DIR"
mkdir -p "$MAKER_GAME_DIR"

node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js init \
  --target-dir "$MAKER_GAME_DIR" \
  --env rnd \
  --pat "<PASTE_PAT_HERE>" \
  --app-id "<APP_ID_FROM_APPS>" \
  --skip-confirm \
  --skip-mcp-install \
  --json
```

Windows PowerShell：

```powershell
$env:MAKER_GAME_DIR="$env:MAKER_TEST_ROOT\game"
Remove-Item -Recurse -Force $env:MAKER_GAME_DIR -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $env:MAKER_GAME_DIR | Out-Null

node C:\path\to\taptap_minigame_open_mcp\dist\maker.js init `
  --target-dir "$env:MAKER_GAME_DIR" `
  --env rnd `
  --pat "<PASTE_PAT_HERE>" `
  --app-id "<APP_ID_FROM_APPS>" `
  --skip-confirm `
  --skip-mcp-install `
  --json
```

预期：

- 输出是多行 JSON 事件，不是一个 JSON 数组。
- 能看到 `init_start`、`doctor`、`pat`、`tap_auth`、`app`、`dev_kit`、`clone`、`done` 等步骤。
- 目标目录出现 `.maker-mcp/config.json`。
- 目标目录是独立 Maker Git 仓库。
- dev-kit 文件存在，例如 `CLAUDE.md`、`examples/`、`templates/`、`urhox-libs/`。

验证：

```bash
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js doctor --json --target-dir "$MAKER_GAME_DIR"
ls -la "$MAKER_GAME_DIR/.maker-mcp"
git -C "$MAKER_GAME_DIR" status --short --branch
```

Windows PowerShell：

```powershell
node C:\path\to\taptap_minigame_open_mcp\dist\maker.js doctor --json --target-dir "$env:MAKER_GAME_DIR"
Get-ChildItem "$env:MAKER_GAME_DIR\.maker-mcp"
git -C "$env:MAKER_GAME_DIR" status --short --branch
```

## 6. Init 交互测试

这一步更接近真实用户体验。

```bash
mkdir -p /tmp/maker-interactive-game
cd /tmp/maker-interactive-game
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js init --env rnd --skip-mcp-install
```

交互预期：

- 没有 PAT 时提示 PAT 页面。
- 粘贴 PAT 后自动换 TapTap token。
- 展示完整 app 列表。
- 用户可以输入序号或 app id。
- clone 完成后提示需要刷新/重启 AI 客户端才能看到 MCP tools。

这里加 `--skip-mcp-install` 是为了先验证 CLI 初始化，不改真实客户端配置。

## 7. MCP 配置写入测试（隔离 HOME）

先在隔离 HOME 下测试生成配置格式。

macOS/Linux：

```bash
export MAKER_TEST_ROOT=/tmp/taptap-maker-cli-test
export HOME="$MAKER_TEST_ROOT/home"
export TAPTAP_MAKER_HOME="$MAKER_TEST_ROOT/maker-home"

node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js mcp install \
  --ide codex,cursor,claude \
  --env rnd \
  --package @taptap/instant-games-open-mcp@beta \
  --json

cat "$HOME/.codex/config.toml"
cat "$HOME/.cursor/mcp.json"
cat "$HOME/.claude.json"
```

预期：

- Codex 配置出现 `[mcp_servers."taptap-maker"]`。
- JSON 配置里 command 是 `npx`。
- args 是 `["-y", "-p", "@taptap/instant-games-open-mcp@beta", "taptap-maker"]`。
- env 里有 `TAPTAP_MCP_ENV=rnd`。

Windows 预期：

- JSON 配置里的 command 应是 `npx.cmd`。
- Claude CLI 如果可用，会优先走 `claude.cmd mcp add`；不可用时 fallback 写 `.claude.json`。

确认隔离配置没问题后，再决定是否跑真实写入：

```bash
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js mcp install --ide codex,cursor,claude --env rnd
```

注意：真实写入会备份并修改用户级配置，跑之前先确认。

## 8. MCP Server Smoke

初始化后，验证 MCP 暴露的 surface 是否正确。

```bash
cd /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp
node -e "import('@modelcontextprotocol/sdk/client/index.js').then(async ({Client})=>{const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js'); const transport=new StdioClientTransport({command:'node',args:['dist/maker.js']}); const client=new Client({name:'smoke',version:'1.0.0'},{capabilities:{}}); await client.connect(transport); const tools=await client.listTools(); const resources=await client.listResources(); const status=await client.readResource({uri:'maker://status'}); console.log(JSON.stringify({tools:tools.tools.map(t=>t.name),resources:resources.resources.map(r=>r.uri),statusPrefix:status.contents?.[0]?.text?.slice(0,32)})); await client.close();})"
```

预期：

```json
{
  "tools": ["maker_status_lite", "maker_build_current_directory"],
  "resources": ["maker://status"],
  "statusPrefix": "TapTap Maker MCP status\n- versio"
}
```

## 9. 构建入口测试

在已 clone 的 Maker 项目目录里，先读状态：

```bash
cd "$MAKER_GAME_DIR"
node /Users/liangdong/Documents/Mcp/taptap_minigame_open_mcp/dist/maker.js doctor --json --target-dir .
```

然后在 AI 客户端里调用：

```text
maker_build_current_directory
```

预期：

- 本地无改动：直接远端 build。
- 本地有改动：先 commit/push，再 build。
- push 失败：返回 `submit_failed_before_build`，不启动 build。
- push 成功但 build 失败：返回 `build_failed_after_submit`。

如果只是想确认云端远端版本，不提交本地改动，必须显式传：

```json
{ "confirm_remote_build_without_submit": true }
```

## 10. 记录反馈模板

测试后请记录：

```text
系统：
Node 版本：
Git 版本：
测试命令：
是否隔离 HOME：
PAT 环境：production / rnd
app id：
失败步骤：
完整错误输出：
用户感知问题：
建议优化：
```

特别关注：

- 第一次看到 PAT 提示是否清楚。
- app 列表是否足够容易选择。
- clone 前目录风险提示是否能理解。
- Windows 下 `npx.cmd`、Git PATH、PowerShell 换行是否顺畅。
- CLI 写完 MCP 配置后，用户是否理解需要刷新/重启客户端。

## 11. 清理测试目录

只清理隔离测试目录，不要清理真实用户配置：

macOS/Linux：

```bash
rm -rf /tmp/taptap-maker-cli-test /tmp/maker-interactive-game
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force "$env:TEMP\taptap-maker-cli-test" -ErrorAction SilentlyContinue
```

如果跑过真实 `mcp install`，不要手动删除配置，先检查自动生成的 `.bak.<timestamp>` 备份。
