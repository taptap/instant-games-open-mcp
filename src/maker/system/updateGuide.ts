/**
 * Platform-specific TapTap MCP update guidance.
 */

export type MakerMcpUpdateBin = 'taptap-maker' | 'instant-games-open-mcp' | 'taptap-mcp-proxy';

export interface MakerMcpUpdateGuideOptions {
  platform?: NodeJS.Platform;
  packageSpec?: string;
  bin?: MakerMcpUpdateBin;
  client?: 'codex' | 'claude' | 'cursor' | 'unknown';
}

const DEFAULT_PACKAGE_SPEC = '@taptap/instant-games-open-mcp@beta';
const DEFAULT_BIN: MakerMcpUpdateBin = 'taptap-maker';
const UPDATE_BINS: MakerMcpUpdateBin[] = [
  'taptap-maker',
  'instant-games-open-mcp',
  'taptap-mcp-proxy',
];

export function createMakerMcpUpdateGuide(options: MakerMcpUpdateGuideOptions = {}): string {
  const platform = options.platform || process.platform;
  const packageSpec = options.packageSpec || DEFAULT_PACKAGE_SPEC;
  const bin = isMakerMcpUpdateBin(options.bin) ? options.bin : DEFAULT_BIN;
  const client = options.client || 'unknown';
  const isWindows = platform === 'win32';

  return [
    'TapTap Maker MCP update guide',
    '',
    `- platform: ${isWindows ? 'Windows PowerShell' : 'macOS / Linux'}`,
    `- client: ${client}`,
    `- package: ${packageSpec}`,
    `- bin: ${bin}`,
    '',
    'Important',
    '',
    '- 本工具不会直接执行更新命令，只返回适合当前平台的更新引导。',
    '- 请由当前本地 AI 客户端在用户机器的 shell 中执行下列命令。',
    '- 推荐把 Maker MCP 安装到 user/global scope，不建议放在当前项目目录或仓库级配置。',
    '- 如果现在是 project/local scope，也可以继续更新；后续可让 Claude Code / Codex / Cursor 迁移到 user/global scope。',
    '- 更新 npx 缓存后，当前 MCP 会话通常不会热加载；请重启 MCP 客户端，或新开 Claude Code / Codex / Cursor 窗口。',
    '- 重启后调用 maker_status，确认新 MCP 已生效。',
    '',
    isWindows ? createWindowsGuide(packageSpec, bin) : createPosixGuide(packageSpec, bin),
  ].join('\n');
}

function createWindowsGuide(packageSpec: string, bin: MakerMcpUpdateBin): string {
  return [
    'Windows PowerShell',
    '',
    'Step 0: 安装检查和配置位置提醒',
    '',
    '```powershell',
    'node --version',
    'npm --version',
    'npx --version',
    '',
    '# 1. 项目级 .mcp.json（Claude Code / Codex 都可能读取）',
    'if (Test-Path .mcp.json) {',
    "  if (Select-String -Path .mcp.json -Pattern 'taptap|instant-games-open-mcp|taptap-maker' -Quiet) {",
    '    Write-Host "ℹ️  当前目录 .mcp.json 包含 TapTap MCP。更新可以继续；建议后续迁移到 user/global scope。"',
    '  }',
    '}',
    '',
    '# 2. Claude Code user/project scope',
    '$cj = "$env:USERPROFILE\\.claude.json"',
    'if (Test-Path $cj) {',
    '  $json = Get-Content $cj -Raw | ConvertFrom-Json',
    '  if ($json.mcpServers) {',
    "    $json.mcpServers.PSObject.Properties | Where-Object { $_.Name -match 'taptap' } | ForEach-Object {",
    '      Write-Host "✅ Claude Code user scope 已安装：$($_.Name)"',
    '    }',
    '  }',
    '  if ($json.projects) {',
    '    $json.projects.PSObject.Properties | ForEach-Object {',
    '      $projectPath = $_.Name',
    '      $servers = $_.Value.mcpServers',
    '      if ($servers) {',
    "        $servers.PSObject.Properties | Where-Object { $_.Name -match 'taptap' } | ForEach-Object {",
    '          Write-Host "ℹ️  Claude Code project scope TapTap MCP：$($_.Name) under $projectPath。建议后续迁移到 user/global scope。"',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
    '',
    '# 3. 常见项目级 MCP / AI 客户端配置。只查已知路径，避免扫到源码或游戏资源。',
    "$projectConfigPaths = @('.codex\\config.toml', '.codex\\mcp.json', '.cursor\\mcp.json', '.vscode\\mcp.json', 'codex.toml')",
    'foreach ($f in $projectConfigPaths) {',
    "  if ((Test-Path $f) -and (Select-String -Path $f -Pattern 'taptap|instant-games-open-mcp|taptap-maker' -Quiet)) {",
    '    Write-Host "ℹ️  $f 包含 TapTap MCP。更新可以继续；建议后续迁移到 user/global scope。"',
    '  }',
    '}',
    '```',
    '',
    'Step 1: 对比远端和本地 npx 缓存版本',
    '',
    '```powershell',
    `npm view ${quotePowerShell(packageSpec)} version`,
    "$NpxDir = Join-Path (npm config get cache) '_npx'",
    '$LocalVersions = @()',
    'Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {',
    "  $p = Join-Path $_.FullName 'node_modules\\@taptap\\instant-games-open-mcp\\package.json'",
    '  if (Test-Path $p) {',
    '    $version = (Get-Content $p -Raw | ConvertFrom-Json).version',
    '    $LocalVersions += "$($_.Name) -> $version"',
    '  }',
    '}',
    '$LocalVersions',
    '```',
    '',
    '如果远端和本地版本已经一致，可以结束更新缓存流程，但仍建议重启或新开窗口确认。',
    '',
    'Step 2: 清理 TapTap MCP 的 npx 缓存',
    '',
    '```powershell',
    "$NpxDir = Join-Path (npm config get cache) '_npx'",
    'Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {',
    "  if (Test-Path (Join-Path $_.FullName 'node_modules\\@taptap\\instant-games-open-mcp')) {",
    '    Remove-Item -Recurse -Force $_.FullName',
    '  }',
    '}',
    '```',
    '',
    'Step 3: 预热下载新版本',
    '',
    '```powershell',
    "$env:TAPTAP_MCP_ENV = 'rnd'",
    "$log = Join-Path $env:TEMP 'taptap-mcp-warmup.log'",
    '$proc = Start-Process -FilePath npx `',
    `  -ArgumentList ${formatPowerShellArgumentList(createNpxWarmupArgs(packageSpec, bin))} \``,
    '  -RedirectStandardOutput $log -RedirectStandardError "$log.err" `',
    '  -WindowStyle Hidden -PassThru',
    'Start-Sleep -Seconds 25',
    'Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue',
    '```',
    '',
    'Step 4: 验证缓存版本',
    '',
    '```powershell',
    "$NpxDir = Join-Path (npm config get cache) '_npx'",
    'Get-ChildItem $NpxDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {',
    "  $p = Join-Path $_.FullName 'node_modules\\@taptap\\instant-games-open-mcp\\package.json'",
    '  if (Test-Path $p) { "$($_.Name) -> $((Get-Content $p -Raw | ConvertFrom-Json).version)" }',
    '}',
    '```',
    '',
    'Step 5: 生效方式',
    '',
    '请重启 MCP 客户端，或新开 Claude Code / Codex / Cursor 窗口。当前会话通常不会热加载新 MCP；重启后调用 maker_status 验证。',
  ].join('\n');
}

function createPosixGuide(packageSpec: string, bin: MakerMcpUpdateBin): string {
  return [
    'macOS / Linux',
    '',
    'Step 0: 安装检查和配置位置提醒',
    '',
    '```bash',
    'node --version',
    'npm --version',
    'npx --version',
    '',
    '# 1. 项目级 .mcp.json',
    '[ -f .mcp.json ] && grep -qiE "taptap|instant-games-open-mcp|taptap-maker" .mcp.json && \\',
    '  echo "ℹ️  当前目录 .mcp.json 包含 TapTap MCP。更新可以继续；建议后续迁移到 user/global scope。"',
    '',
    '# 2. Claude Code user/project scope。没有 jq 时跳过，不阻塞更新。',
    'CJ="$HOME/.claude.json"',
    'if [ -f "$CJ" ] && command -v jq >/dev/null 2>&1; then',
    "  jq -r '",
    '    .mcpServers // {} | to_entries[]',
    '    | select(.key | test("taptap"; "i"))',
    '    | "✅ Claude Code user scope 已安装: \\(.key)"',
    '  \' "$CJ"',
    "  jq -r '",
    '    .projects // {} | to_entries[]',
    '    | . as $p | $p.value.mcpServers // {} | to_entries[]',
    '    | select(.key | test("taptap"; "i"))',
    '    | "ℹ️  Claude Code project scope TapTap MCP: \\($p.key) -> \\(.key)。建议后续迁移到 user/global scope。"',
    '  \' "$CJ"',
    'fi',
    '',
    '# 3. 常见项目级 MCP / AI 客户端配置。只查已知路径，避免扫到源码或游戏资源。',
    'for f in .codex/config.toml .codex/mcp.json .cursor/mcp.json .vscode/mcp.json codex.toml; do',
    '  [ -f "$f" ] && grep -qiE "taptap|instant-games-open-mcp|taptap-maker" "$f" && \\',
    '    echo "ℹ️  $f 包含 TapTap MCP。更新可以继续；建议后续迁移到 user/global scope。"',
    'done',
    '```',
    '',
    'Step 1: 对比远端和本地 npx 缓存版本',
    '',
    '```bash',
    `npm view ${quotePosix(packageSpec)} version`,
    'NPX_DIR="$(npm config get cache)/_npx"',
    'for d in "$NPX_DIR"/*/; do',
    '  p="$d/node_modules/@taptap/instant-games-open-mcp/package.json"',
    '  [ -f "$p" ] && echo "$(basename "$d") -> $(node -p "require(process.argv[1]).version" "$p")"',
    'done',
    '```',
    '',
    '如果远端和本地版本已经一致，可以结束更新缓存流程，但仍建议重启或新开窗口确认。',
    '',
    'Step 2: 清理 TapTap MCP 的 npx 缓存',
    '',
    '```bash',
    'NPX_DIR="$(npm config get cache)/_npx"',
    'for d in "$NPX_DIR"/*/; do',
    '  [ -d "$d/node_modules/@taptap/instant-games-open-mcp" ] && rm -rf "$d"',
    'done',
    '```',
    '',
    'Step 3: 预热下载新版本',
    '',
    '```bash',
    `TAPTAP_MCP_ENV=rnd ${formatPosixNpxWarmup(packageSpec, bin)} \\`,
    '  < /dev/null > /tmp/taptap-mcp-warmup.log 2>&1 &',
    'PID=$!; sleep 25; kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null',
    '```',
    '',
    'Step 4: 验证缓存版本',
    '',
    '```bash',
    'NPX_DIR="$(npm config get cache)/_npx"',
    'for d in "$NPX_DIR"/*/; do',
    '  p="$d/node_modules/@taptap/instant-games-open-mcp/package.json"',
    '  [ -f "$p" ] && echo "$(basename "$d") -> $(node -p "require(process.argv[1]).version" "$p")"',
    'done',
    '```',
    '',
    'Step 5: 生效方式',
    '',
    '请重启 MCP 客户端，或新开 Claude Code / Codex / Cursor 窗口。当前会话通常不会热加载新 MCP；重启后调用 maker_status 验证。',
  ].join('\n');
}

function createNpxWarmupArgs(packageSpec: string, bin: MakerMcpUpdateBin): string[] {
  if (bin === 'instant-games-open-mcp') {
    return ['-y', '--prefer-online', packageSpec];
  }
  return ['-y', '--prefer-online', '-p', packageSpec, bin];
}

function isMakerMcpUpdateBin(value: unknown): value is MakerMcpUpdateBin {
  return typeof value === 'string' && UPDATE_BINS.includes(value as MakerMcpUpdateBin);
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatPowerShellArgumentList(args: string[]): string {
  return args.map(quotePowerShell).join(',');
}

function formatPosixNpxWarmup(packageSpec: string, bin: MakerMcpUpdateBin): string {
  const args = createNpxWarmupArgs(packageSpec, bin);
  return ['npx', ...args].map(quotePosix).join(' ');
}

function quotePosix(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
