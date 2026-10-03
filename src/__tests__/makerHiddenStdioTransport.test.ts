import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { MakerStdioClient as Client } from '../maker/server/stdioClient';
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
  it('clears the initialization deadline when the proxy exits before the handshake', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'process.stdin.resume(); setTimeout(() => process.exit(0), 100)'],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'handshake-exit-test', version: '0' }, { capabilities: {} });
    try {
      await expect(client.connect(transport)).rejects.toThrow('Connection closed');
      expect((client as unknown as { _timeoutInfo: Map<number, unknown> })._timeoutInfo.size).toBe(
        0
      );
    } finally {
      await transport.close();
    }
  });

  it('drains stderr even without a diagnostic subscriber', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: [
        '-e',
        'process.stderr.write(Buffer.alloc(4 * 1024 * 1024), () => process.stdout.write(JSON.stringify({jsonrpc:"2.0",method:"ready"}) + "\\n")); process.stdin.resume()',
      ],
      stderr: 'pipe',
    });
    const ready = new Promise<void>((resolve) => {
      transport.onmessage = () => resolve();
    });
    try {
      await transport.start();
      await ready;
    } finally {
      await transport.close();
    }
  });

  it.each(['exit', 'close'] as const)('settles a backpressured send on %s', async (action) => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    await transport.start();
    const child = (transport as unknown as { process: ChildProcess }).process;
    const baseline = child.stdin!.listenerCount('error');
    const pending = transport
      .send({ jsonrpc: '2.0', method: 'large', params: { data: 'x'.repeat(4 * 1024 * 1024) } })
      .catch((error: unknown) => error);
    try {
      expect(child.stdin!.writableNeedDrain).toBe(true);
      if (action === 'exit') child.kill();
      else void transport.close();
      await expect(pending).resolves.toMatchObject({ message: expect.any(String) });
      await transport.close();
      expect(child.stdin!.listenerCount('drain')).toBe(0);
      expect(child.stdin!.listenerCount('error')).toBe(baseline);
      expect(child.stdin!.destroyed).toBe(true);
      expect(child.stdout!.destroyed).toBe(true);
      expect(child.stderr!.destroyed).toBe(true);
    } finally {
      await transport.close();
    }
  });

  it('concurrent closes all wait for the owned child to exit', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: [
        '-e',
        'process.stdin.resume(); process.stdin.on("end", () => setTimeout(() => process.exit(0), 300))',
      ],
      stderr: 'pipe',
    });
    await transport.start();
    const child = (transport as unknown as { process: ChildProcess }).process;
    await Promise.all(
      [transport.close(), transport.close()].map(async (closing) => {
        await closing;
        expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      })
    );
    await expect(transport.start()).rejects.toThrow('already started');
  });

  it('reports unconfirmed termination and allows cleanup to be retried', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    await transport.start();
    const child = (transport as unknown as { process: ChildProcess }).process;
    const kill = jest.spyOn(child, 'kill').mockReturnValue(false);
    try {
      await expect(transport.close()).rejects.toThrow('exit could not be confirmed');
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
    } finally {
      kill.mockRestore();
      child.kill();
      await transport.close();
    }
  }, 15000);

  it('cleans up after a spawn failure and rejects reuse', async () => {
    const transport = new HiddenStdioClientTransport({
      command: path.join(os.tmpdir(), 'missing-maker-executable-' + process.pid),
      stderr: 'pipe',
    });
    await expect(transport.start()).rejects.toThrow();
    await transport.close();
    expect(transport.pid).toBeNull();
    await expect(transport.start()).rejects.toThrow('already started');
  });

  it('waits for a child that exits after stdin closes', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: [
        '-e',
        'process.stdin.resume(); process.stdin.on("end", () => setTimeout(() => process.exit(0), 300))',
      ],
      stderr: 'pipe',
    });
    const onclose = jest.fn();
    transport.onclose = onclose;
    await transport.start();
    const pid = transport.pid;
    const started = Date.now();
    await transport.close();
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(processAlive(pid)).toBe(false);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('stops a child that ignores stdin', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    const onclose = jest.fn();
    transport.onclose = onclose;
    await transport.start();
    const pid = transport.pid;
    expect(processAlive(pid)).toBe(true);
    await transport.close();
    expect(processAlive(pid)).toBe(false);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('kills only the owned child and leaves an unrelated process', async () => {
    if (process.platform !== 'win32') return;
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    await transport.start();
    const ownedPid = transport.pid;
    try {
      expect(processAlive(unrelated.pid ?? null)).toBe(true);
      expect(processAlive(ownedPid)).toBe(true);
      const started = Date.now();
      await transport.close();
      expect(Date.now() - started).toBeLessThan(5000);
      expect(processAlive(ownedPid)).toBe(false);
      expect(processAlive(unrelated.pid ?? null)).toBe(true);
    } finally {
      await transport.close();
      try {
        unrelated.kill();
      } catch {
        /* test cleanup */
      }
    }
  }, 15000);

  it.each([false, true])(
    'rejects calls on exit once while inherited pipes drain (close before exit: %s)',
    async (closeBeforeExit) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-inherited-stdio-'));
      const releasePath = path.join(directory, 'release');
      const descendant = [
        "const fs = require('node:fs');",
        'const releasePath = ' + JSON.stringify(releasePath) + ';',
        'setInterval(() => {',
        '  if (!fs.existsSync(releasePath)) return;',
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "late-notification" }) + "\\n");',
        '  process.stderr.write("pipes-drained\\n", () => process.exit(0));',
        '}, 20);',
        'setTimeout(() => process.exit(0), 8000);',
      ].join('\n');
      const server = [
        "const readline = require('node:readline');",
        "const { spawn } = require('node:child_process');",
        'const rl = readline.createInterface({ input: process.stdin });',
        "rl.on('line', (line) => {",
        '  if (!line.trim()) return;',
        '  const message = JSON.parse(line);',
        '  if (message.method === "initialize") {',
        '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "inherited-pipes", version: "0" } } }) + "\\n");',
        '  }',
        '  if (message.method === "tools/call") {',
        '    const descendant = spawn(process.execPath, ["-e", ' +
          JSON.stringify(descendant) +
          '], { stdio: ["ignore", process.stdout, process.stderr], windowsHide: true });',
        '    descendant.once("spawn", () => process.exit(0));',
        '  }',
        '});',
      ].join('\n');
      const transport = new HiddenStdioClientTransport({
        command: process.execPath,
        args: ['-e', server],
        stderr: 'pipe',
      });
      const client = new Client(
        { name: 'inherited-stdio-test', version: '0' },
        { capabilities: {} }
      );
      const onclose = jest.fn();
      const onerror = jest.fn();
      const onnotification = jest.fn();
      transport.onclose = onclose;
      client.onerror = onerror;
      client.fallbackNotificationHandler = onnotification;
      let stderr = '';
      transport.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await client.connect(transport);
        const child = (transport as unknown as { process: ChildProcess }).process;
        const exited = once(child, 'exit');
        let pipesClosed = false;
        child.once('close', () => {
          pipesClosed = true;
        });
        const pending = client
          .callTool({ name: 'create_video_task', arguments: {} }, undefined, {
            timeout: 60000,
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        let cleanupFinished = false;
        const closeTransport = () =>
          transport.close().then(() => {
            cleanupFinished = true;
          });
        let closing = closeBeforeExit ? closeTransport() : undefined;
        if (closeBeforeExit) {
          await expect(transport.send({ jsonrpc: '2.0', method: 'ping' })).rejects.toThrow(
            'Not connected'
          );
        }
        await exited;
        const result = await Promise.race([
          pending,
          new Promise((resolve) => {
            deadline = setTimeout(() => resolve('still-pending'), 1000);
          }),
        ]);
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/Connection closed/);
        expect(onclose).toHaveBeenCalledTimes(1);
        await expect(transport.send({ jsonrpc: '2.0', method: 'ping' })).rejects.toThrow(
          'Not connected'
        );
        if (process.platform === 'win32') {
          const started = Date.now();
          closing ??= closeTransport();
          await closing;
          expect(Date.now() - started).toBeLessThan(2000);
          expect(child.stdout?.destroyed).toBe(true);
          expect(child.stderr?.destroyed).toBe(true);
          expect(onerror).not.toHaveBeenCalled();
          expect(onnotification).not.toHaveBeenCalled();
          fs.writeFileSync(releasePath, 'release');
          return;
        }
        expect(pipesClosed).toBe(false);
        expect(onclose).toHaveBeenCalledTimes(1);
        await expect(transport.send({ jsonrpc: '2.0', method: 'ping' })).rejects.toThrow(
          'Not connected'
        );
        closing ??= closeTransport();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(cleanupFinished).toBe(false);
        fs.writeFileSync(releasePath, 'release');
        await closing;
        expect(pipesClosed).toBe(true);
        expect(stderr).toContain('pipes-drained');
        expect(onclose).toHaveBeenCalledTimes(1);
        expect(onerror).not.toHaveBeenCalled();
        expect(onnotification).not.toHaveBeenCalled();
      } finally {
        clearTimeout(deadline);
        fs.writeFileSync(releasePath, 'release');
        await transport.close();
        await client.close().catch(() => undefined);
        const timeouts = (
          client as unknown as {
            _timeoutInfo?: Map<number, { timeoutId: ReturnType<typeof setTimeout> }>;
          }
        )._timeoutInfo;
        expect(timeouts?.size).toBe(0);
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
    15000
  );
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
    (transport as unknown as { process: ChildProcess }).process.kill();
    await expect(pending).rejects.toThrow(/Connection closed|Not connected/);
    expect(Date.now() - started).toBeLessThan(5000);
    await client.close().catch(() => undefined);
    const timeouts = (
      client as unknown as {
        _timeoutInfo?: Map<number, { timeoutId: ReturnType<typeof setTimeout> }>;
      }
    )._timeoutInfo;
    expect(timeouts?.size).toBe(0);
  }, 15000);
});
