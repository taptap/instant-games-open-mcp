/**
 * Maker Lua LSP setup tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  checkMakerLuaLspEnvironment,
  formatMakerLuaLspEnvironmentStatus,
  setupMakerLuaLspEnvironment,
} from '../maker/system/luaLsp';
import type { MakerPythonEnvironment } from '../maker/system/python';

type SpawnCall = {
  command: string;
  args: string[];
  timeout?: number;
};

function spawnResult(status: number, stdout = '', stderr = ''): SpawnSyncReturns<string> {
  return {
    pid: 123,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
  };
}

function readyPython(python: string, platform: NodeJS.Platform = 'darwin'): MakerPythonEnvironment {
  return {
    platform,
    ready: true,
    status: 'ready',
    provider: 'uv-managed',
    python,
    version: '3.12.11',
    pipVersion: 'pip 25.1',
    missing: [],
    configPath: '/tmp/python.json',
    setupCommand: 'taptap-maker python setup',
    pathCommand: 'taptap-maker python path',
    nextAction: 'ready',
    uv: {
      path: '/tmp/uv',
      installed: true,
    },
  };
}

describe('Maker Lua LSP runtime', () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-lua-lsp-runtime-'));
    process.env.HOME = tempDir;
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalMakerHome === undefined) {
      delete process.env.TAPTAP_MAKER_HOME;
    } else {
      process.env.TAPTAP_MAKER_HOME = originalMakerHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('setup installs maker-lua-lsp with the selected Python and configures all IDEs', () => {
    const calls: SpawnCall[] = [];
    const python = path.join(tempDir, 'python', 'bin', 'python3');
    const scriptsDir = path.join(tempDir, 'python', 'bin');
    const lspCommand = path.join(scriptsDir, 'maker-lua-lsp');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(lspCommand, '');

    const spawn = (command: string, args: string[], options?: { timeout?: number }) => {
      calls.push({ command, args, timeout: options?.timeout });
      if (command === python && args.join(' ') === '-m pip install --upgrade maker-lua-lsp') {
        return spawnResult(0, 'installed maker-lua-lsp\n');
      }
      if (command === python && args.includes('-c')) {
        return spawnResult(0, `${scriptsDir}\n`);
      }
      if (command === lspCommand && args.join(' ') === 'install --ide codex,cursor,claude') {
        return spawnResult(0, 'configured\n');
      }
      if (command === lspCommand && args[0] === '--version') {
        return spawnResult(0, 'maker-lua-lsp 1.0.0\n');
      }
      return spawnResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = setupMakerLuaLspEnvironment({
      pythonEnvironment: readyPython(python),
      spawn,
    });

    expect(result.environment.status).toBe('ready');
    expect(result.environment.command).toBe(lspCommand);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: python,
          args: ['-m', 'pip', 'install', '--upgrade', 'maker-lua-lsp'],
        }),
        expect.objectContaining({
          command: lspCommand,
          args: ['install', '--ide', 'codex,cursor,claude'],
        }),
      ])
    );
    expect(calls.find((call) => call.command === python && call.args[0] === '-m')?.timeout).toBe(
      120_000
    );
    expect(
      calls.find((call) => call.command === lspCommand && call.args[0] === 'install')?.timeout
    ).toBe(120_000);
  });

  test('setup reports LSP install failure without throwing', () => {
    const python = path.join(tempDir, 'python', 'bin', 'python3');
    const spawn = (command: string, args: string[]) => {
      if (command === python && args.join(' ') === '-m pip install --upgrade maker-lua-lsp') {
        return spawnResult(1, '', 'network timeout');
      }
      return spawnResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = setupMakerLuaLspEnvironment({
      pythonEnvironment: readyPython(python),
      spawn,
    });

    expect(result.environment.ready).toBe(false);
    expect(result.environment.status).toBe('setup_failed');
    expect(result.environment.error).toContain('network timeout');
    expect(formatMakerLuaLspEnvironmentStatus(result.environment)).toContain(
      '- lsp_status: setup_failed'
    );
  });

  test('doctor reports missing LSP when Python is ready but command is unavailable', () => {
    const python = path.join(tempDir, 'python', 'bin', 'python3');
    const scriptsDir = path.join(tempDir, 'python', 'bin');
    const spawn = (command: string, args: string[]) => {
      if (command === python && args.includes('-c')) {
        return spawnResult(0, `${scriptsDir}\n`);
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerLuaLspEnvironment({
      pythonEnvironment: readyPython(python),
      spawn,
    });

    expect(environment.status).toBe('missing');
    expect(environment.ready).toBe(false);
    expect(environment.nextAction).toContain('taptap-maker lua-lsp setup');
  });
});
