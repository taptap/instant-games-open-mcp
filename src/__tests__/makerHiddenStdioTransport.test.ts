import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { HiddenStdioClientTransport } from '../maker/server/hiddenStdioTransport';

function processAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('HiddenStdioClientTransport close', () => {
  it('waits for a child that exits after stdin closes', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: [
        '-e',
        'process.stdin.resume(); process.stdin.on("end", () => setTimeout(() => process.exit(0), 300))',
      ],
      stderr: 'pipe',
    });
    await transport.start();
    const pid = transport.pid;
    const started = Date.now();
    await transport.close();
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(processAlive(pid)).toBe(false);
  });

  it('stops a child that ignores stdin', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    await transport.start();
    const pid = transport.pid;
    expect(processAlive(pid)).toBe(true);
    await transport.close();
    expect(processAlive(pid)).toBe(false);
  });
});

function writeProbe(filename: string): string {
  const script = path.join(os.tmpdir(), filename);
  const source = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class MakerProbe {',
    '  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '}',
    '"@',
    '$hwnd = [MakerProbe]::GetConsoleWindow()',
    '$visible = $false',
    'if ($hwnd -ne [IntPtr]::Zero) { $visible = [MakerProbe]::IsWindowVisible($hwnd) }',
    'Set-Content -LiteralPath $env:MAKER_CONSOLE_PROBE -Value ("{0} {1}" -f ([int64]$hwnd), $visible) -Encoding ascii',
    'Start-Sleep -Seconds 30',
    '',
  ].join('\n');
  fs.writeFileSync(script, source, 'utf8');
  return script;
}

describe('HiddenStdioClientTransport Windows console', () => {
  const windows = process.platform === 'win32';

  test('does not allocate a visible console window', async () => {
    if (!windows) return;
    const probe = path.join(os.tmpdir(), `maker-hidden-console-${process.pid}.txt`);
    fs.rmSync(probe, { force: true });
    const script = writeProbe(`maker-hidden-console-${process.pid}.ps1`);
    const transport = new HiddenStdioClientTransport({
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      env: { ...process.env, MAKER_CONSOLE_PROBE: probe } as Record<string, string>,
      stderr: 'pipe',
    });
    await transport.start();
    try {
      const started = Date.now();
      let text = '';
      while (Date.now() - started < 8000) {
        if (fs.existsSync(probe)) {
          text = fs.readFileSync(probe, 'utf8').trim();
          if (text) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(text).toMatch(/^0 false$/i);
    } finally {
      await transport.close();
      fs.rmSync(probe, { force: true });
      fs.rmSync(script, { force: true });
    }
  }, 20000);

  test('rejects an in-flight call when the child process exits', async () => {
    const server = [
      "const readline = require('node:readline');",
      'const rl = readline.createInterface({ input: process.stdin });',
      "rl.on('line', (line) => {",
      '  if (!line.trim()) return;',
      '  const msg = JSON.parse(line);',
      "  if (msg.method === 'initialize') {",
      "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } } }) + '\\n');",
      '  }',
      '});',
      'setInterval(() => {}, 1000);',
    ].join('');
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', server],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'hidden-stdio-test', version: '0' }, { capabilities: {} });
    await client.connect(transport);
    const pending = client.callTool({ name: 'create_video_task', arguments: {} }, undefined, {
      timeout: 60000,
    });
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.kill(transport.pid as number);
    await expect(pending).rejects.toThrow(/Connection closed|Not connected/);
    expect(Date.now() - started).toBeLessThan(5000);
    await client.close().catch(() => undefined);
    const timeouts = (
      client as unknown as {
        _timeoutInfo?: Map<number, { timeoutId: ReturnType<typeof setTimeout> }>;
      }
    )._timeoutInfo;
    for (const info of timeouts?.values() ?? []) clearTimeout(info.timeoutId);
  }, 15000);
});
