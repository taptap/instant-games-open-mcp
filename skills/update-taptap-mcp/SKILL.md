---
name: update-taptap-mcp
description: 更新本地 npx 缓存的 @taptap/instant-games-open-mcp 到最新版本。当用户说"更新 taptap mcp"、"tap mcp 有新版本"、"刷新 mcp 缓存"时触发。先判断平台，再只读对应章节：Windows 用户读上半部分，macOS/Linux 用户读下半部分。
---

## 安装位置提醒（所有平台、所有客户端通用）

检查或更新 TapTap MCP 时，顺带提醒用户：

- 推荐把 Maker MCP 安装到 user scope / 全局 scope。
- 不建议安装到当前目录、项目目录或仓库级 scope，避免配置随项目变化或被误提交。
- 如果用户当前使用项目级配置，不要强制迁移，也不要阻塞更新；只说明推荐做法，并给出迁移方向。
- 具体迁移操作交给用户当前 AI 客户端处理，例如让客户端把 MCP 从 project/local scope 移到 user/global scope。

提醒示例：

```text
顺带提醒：Maker MCP 建议安装到 user scope 或全局 scope，不建议放在当前项目目录。
如果你现在是项目级配置，也可以继续更新；后续可让 Claude Code / Codex / Cursor
帮你迁移到 user/global scope。
```

---

# Windows (PowerShell)

## Step 0：友好提醒安装位置

```powershell
# 1. 项目级 .mcp.json（Claude Code / Codex 都会读）
if (Test-Path .mcp.json) {
  if (Select-String -Path .mcp.json -Pattern 'taptap' -Quiet) {
    Write-Host "ℹ️  当前目录 .mcp.json 包含 taptap MCP。更新可以继续；建议后续迁移到 user/global scope。"
  }
}

# 2. Claude Code 项目级残留（~/.claude.json 的 projects[<path>].mcpServers）
$cj = "$env:USERPROFILE\.claude.json"
if (Test-Path $cj) {
  $json = Get-Content $cj -Raw | ConvertFrom-Json
  $json.projects.PSObject.Properties | ForEach-Object {
    $projectPath = $_.Name
    $servers = $_.Value.mcpServers
    if ($servers) {
      $servers.PSObject.Properties | Where-Object { $_.Name -match 'taptap' } | ForEach-Object {
        Write-Host "ℹ️  Claude Code 项目级 taptap MCP：$($_.Name) under project $projectPath。更新可以继续；建议后续迁移到 user/global scope。"
      }
    }
  }
  # user scope 正确位置
  if ($json.mcpServers) {
    $json.mcpServers.PSObject.Properties | Where-Object { $_.Name -match 'taptap' } | ForEach-Object {
      Write-Host "✅ user scope 已安装：$($_.Name)"
    }
  }
}

# 3. 常见项目级 MCP / AI 客户端配置。只查已知路径，避免扫到游戏资源或源码导致噪音。
$projectConfigPaths = @(
  '.codex\config.toml',
  '.codex\mcp.json',
  '.cursor\mcp.json',
  '.vscode\mcp.json',
  'codex.toml'
)
foreach ($f in $projectConfigPaths) {
  if ((Test-Path $f) -and (Select-String -Path $f -Pattern 'taptap' -Quiet)) {
    Write-Host "ℹ️  $f 包含 taptap MCP。更新可以继续；建议后续迁移到 user/global scope。"
  }
}
```

如果发现项目级配置，只做友好提醒，不要中断更新流程。可以告诉用户：更新缓存可以继续；后续可让当前 AI 客户端把 MCP 从 project/local scope 迁移到 user/global scope。

## Step 1：对比远端和本地版本

```powershell
npm view '@taptap/instant-games-open-mcp' version
$NpxDir = Join-Path (npm config get cache) '_npx'
Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Join-Path $_.FullName 'node_modules\@taptap\instant-games-open-mcp\package.json'
  if (Test-Path $p) { "$($_.Name) -> $((Get-Content $p -Raw | ConvertFrom-Json).version)" }
}
```

若版本相同，可以结束更新缓存流程。

## Step 2：清理缓存

```powershell
$NpxDir = Join-Path (npm config get cache) '_npx'
Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  if (Test-Path (Join-Path $_.FullName 'node_modules\@taptap\instant-games-open-mcp')) {
    Remove-Item -Recurse -Force $_.FullName
  }
}
```

## Step 3：预热下载

预热正式 npm 包，并验证 `taptap-maker` binary 可以启动。

```powershell
$log = Join-Path $env:TEMP 'taptap-mcp-warmup.log'
npx -y -p '@taptap/instant-games-open-mcp' taptap-maker help > $log 2> "$log.err"
```

## Step 4：验证

```powershell
$NpxDir = Join-Path (npm config get cache) '_npx'
Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Join-Path $_.FullName 'node_modules\@taptap\instant-games-open-mcp\package.json'
  if (Test-Path $p) { "$($_.Name) -> $((Get-Content $p -Raw | ConvertFrom-Json).version)" }
}
claude mcp list 2>&1 | Select-String -Pattern 'taptap|Warning'
```

## Step 5：提示用户重启客户端

更新完成后提醒用户重启 MCP 客户端，或新开 Claude Code / Codex / Cursor 窗口。当前会话通常不会热加载新 MCP；重启后以能读取 `maker://status` 作为首选生效标准；如果客户端不支持 MCP Resources，则以 `maker_status_lite` 是否可调用作为兜底标准。

---

# macOS / Linux (bash / zsh)

## Step 0：友好提醒安装位置

```bash
# 1. 项目级 .mcp.json
[ -f .mcp.json ] && grep -q -i taptap .mcp.json && \
  echo "ℹ️  当前目录 .mcp.json 包含 taptap MCP。更新可以继续；建议后续迁移到 user/global scope。"

# 2. Claude Code 项目级残留
CJ="$HOME/.claude.json"
if [ -f "$CJ" ]; then
  jq -r '
    .projects // {} | to_entries[]
    | . as $p | $p.value.mcpServers // {} | to_entries[]
    | select(.key | test("taptap"; "i"))
    | "ℹ️  Claude Code 项目级 taptap MCP: \($p.key) -> \(.key)。更新可以继续；建议后续迁移到 user/global scope。"
  ' "$CJ"
  jq -r '
    .mcpServers // {} | to_entries[]
    | select(.key | test("taptap"; "i"))
    | "✅ user scope 已安装: \(.key)"
  ' "$CJ"
fi

# 3. 常见项目级 MCP / AI 客户端配置。只查已知路径，避免扫到游戏资源或源码导致噪音。
for f in .codex/config.toml .codex/mcp.json .cursor/mcp.json .vscode/mcp.json codex.toml; do
  [ -f "$f" ] && grep -q -i taptap "$f" && \
    echo "ℹ️  $f 包含 taptap MCP。更新可以继续；建议后续迁移到 user/global scope。"
done
```

如果发现项目级配置，只做友好提醒，不要中断更新流程。可以告诉用户：更新缓存可以继续；后续可让当前 AI 客户端把 MCP 从 project/local scope 迁移到 user/global scope。

## Step 1：对比远端和本地版本

```bash
npm view @taptap/instant-games-open-mcp version
NPX_DIR="$(npm config get cache)/_npx"
for d in "$NPX_DIR"/*/; do
  p="$d/node_modules/@taptap/instant-games-open-mcp/package.json"
  [ -f "$p" ] && echo "$(basename $d) -> $(jq -r .version $p)"
done
```

若版本相同，可以结束更新缓存流程。

## Step 2：清理缓存

```bash
NPX_DIR="$(npm config get cache)/_npx"
for d in "$NPX_DIR"/*/; do
  [ -d "$d/node_modules/@taptap/instant-games-open-mcp" ] && rm -rf "$d"
done
```

## Step 3：预热下载

预热正式 npm 包，并验证 `taptap-maker` binary 可以启动。

```bash
npx -y -p @taptap/instant-games-open-mcp taptap-maker help \
  > /tmp/taptap-mcp-warmup.log 2>&1
```

## Step 4：验证

```bash
NPX_DIR="$(npm config get cache)/_npx"
for d in "$NPX_DIR"/*/; do
  p="$d/node_modules/@taptap/instant-games-open-mcp/package.json"
  [ -f "$p" ] && echo "$(basename $d) -> $(jq -r .version $p)"
done
claude mcp list 2>&1 | grep -E "taptap|Warning"
```

## Step 5：提示用户重启客户端

更新完成后提醒用户重启 MCP 客户端，或新开 Claude Code / Codex / Cursor 窗口。当前会话通常不会热加载新 MCP；重启后以能读取 `maker://status` 作为首选生效标准；如果客户端不支持 MCP Resources，则以 `maker_status_lite` 是否可调用作为兜底标准。
