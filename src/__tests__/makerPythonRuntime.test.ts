/**
 * Maker Python runtime detection and setup tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  checkMakerPythonEnvironment,
  formatMakerPythonEnvironmentStatus,
  getMakerPythonConfigPath,
  setupMakerPythonEnvironment,
} from '../maker/system/python';

type SpawnCall = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

function spawnResult(
  status: number,
  stdout = '',
  stderr = '',
  error?: Error
): SpawnSyncReturns<string> {
  return {
    pid: 123,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error,
  };
}

function pythonInfo(executable: string, version = '3.13.3'): string {
  return `${JSON.stringify({ executable, version })}\n`;
}

describe('Maker Python runtime', () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-python-runtime-'));
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

  test('rejects Windows Store app execution alias as a usable Python', () => {
    const calls: SpawnCall[] = [];
    const spawn = (command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, env: options?.env });
      if (command === 'py') {
        return spawnResult(1, '', 'Python was not found');
      }
      if (command === 'where.exe') {
        return spawnResult(
          0,
          'C:\\Users\\alice\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\r\n'
        );
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'win32',
      spawn,
    });

    expect(environment.status).toBe('store_alias_only');
    expect(environment.ready).toBe(false);
    expect(environment.missing).toContain('python');
    expect(environment.nextAction).toContain('taptap-maker python setup');
    expect(calls.map((call) => call.command)).toContain('where.exe');
  });

  test('uses existing Windows py launcher Python when pip is available', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'py' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('C:\\Python313\\python.exe'));
      }
      if (command === 'C:\\Python313\\python.exe' && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 25.1 from C:\\Python313\\Lib\\site-packages\\pip\n');
      }
      return spawnResult(1, '', 'unexpected command');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'win32',
      spawn,
    });

    expect(environment.status).toBe('ready');
    expect(environment.provider).toBe('system');
    expect(environment.python).toBe('C:\\Python313\\python.exe');
    expect(environment.version).toBe('3.13.3');
    expect(environment.pipVersion).toContain('pip 25.1');
  });

  test('detects pip missing separately from Python missing', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'python3' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('/opt/python/bin/python3'));
      }
      if (command === '/opt/python/bin/python3' && args.join(' ') === '-m pip --version') {
        return spawnResult(1, '', 'No module named pip');
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('pip_missing');
    expect(environment.python).toBe('/opt/python/bin/python3');
    expect(environment.missing).toContain('pip');
    expect(formatMakerPythonEnvironmentStatus(environment)).toContain(
      '- python_status: pip_missing'
    );
  });

  test('continues scanning candidates after an unusable Python is found', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'python3' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('/opt/python37/bin/python3', '3.7.17'));
      }
      if (command === '/opt/python37/bin/python3' && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 23.0 from /opt/python37/lib/site-packages/pip\n');
      }
      if (command === 'python' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('/opt/python312/bin/python', '3.12.11'));
      }
      if (command === '/opt/python312/bin/python' && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 25.1 from /opt/python312/lib/site-packages/pip\n');
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('ready');
    expect(environment.ready).toBe(true);
    expect(environment.python).toBe('/opt/python312/bin/python');
    expect(environment.version).toBe('3.12.11');
  });

  test('rejects Python versions below the minimum supported 3.8', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'python3' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('/opt/python37/bin/python3', '3.7.17'));
      }
      if (command === '/opt/python37/bin/python3' && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 23.0 from /opt/python37/lib/site-packages/pip\n');
      }
      if (command === 'python') {
        return spawnResult(1, '', 'not found');
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('version_unsupported');
    expect(environment.ready).toBe(false);
    expect(environment.python).toBe('/opt/python37/bin/python3');
    expect(environment.missing).toContain('python>=3.8');
    expect(environment.nextAction).toContain('taptap-maker python setup');
    expect(formatMakerPythonEnvironmentStatus(environment)).toContain(
      '- python_version_requirement: >=3.8'
    );
  });

  test('accepts Python 3.8 with a recommendation to use 3.12 or newer', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'python3' && args.includes('-c')) {
        return spawnResult(0, pythonInfo('/opt/python38/bin/python3', '3.8.18'));
      }
      if (command === '/opt/python38/bin/python3' && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 24.0 from /opt/python38/lib/site-packages/pip\n');
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('ready');
    expect(environment.ready).toBe(true);
    expect(environment.python).toBe('/opt/python38/bin/python3');
    expect(environment.warning).toContain('Python 3.12 or newer is recommended');
    expect(formatMakerPythonEnvironmentStatus(environment)).toContain(
      '- recommended_python_version: >=3.12'
    );
  });

  test('does not reuse Apple or Xcode Python as a Maker toolchain runtime', () => {
    const spawn = (command: string, args: string[]) => {
      if (command === 'python3' && args.includes('-c')) {
        return spawnResult(
          0,
          pythonInfo('/Applications/Xcode.app/Contents/Developer/usr/bin/python3', '3.9.6')
        );
      }
      if (
        command === '/Applications/Xcode.app/Contents/Developer/usr/bin/python3' &&
        args.join(' ') === '-m pip --version'
      ) {
        return spawnResult(0, 'pip 21.2.4 from Xcode\n');
      }
      if (command === 'python') {
        return spawnResult(1, '', 'not found');
      }
      return spawnResult(1, '', 'not found');
    };

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('missing');
    expect(environment.ready).toBe(false);
    expect(environment.error).toContain('Apple/Xcode Python');
    expect(environment.nextAction).toContain('taptap-maker python setup');
  });

  test('setup installs uv into Maker home and stores managed Python path', () => {
    const calls: SpawnCall[] = [];
    const managedPython = path.join(tempDir, 'maker-home', 'python', 'uv', 'cpython', 'python');
    const uvPath = path.join(tempDir, 'maker-home', 'bin', 'uv');
    const spawn = (command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, env: options?.env });
      if (command === 'python3') {
        return spawnResult(1, '', 'not found');
      }
      if (command === 'python') {
        return spawnResult(1, '', 'not found');
      }
      if (command === 'sh') {
        fs.mkdirSync(path.dirname(uvPath), { recursive: true });
        fs.writeFileSync(uvPath, '');
        return spawnResult(0, 'installed uv\n');
      }
      if (command === uvPath && args.join(' ') === 'python install 3.12 --managed-python') {
        return spawnResult(0, 'Installed Python 3.12.11\n');
      }
      if (command === uvPath && args.join(' ') === 'python find 3.12') {
        return spawnResult(0, `${managedPython}\n`);
      }
      if (command === managedPython && args.includes('-c')) {
        return spawnResult(0, pythonInfo(managedPython));
      }
      if (command === managedPython && args.join(' ') === '-m pip --version') {
        return spawnResult(0, 'pip 25.1 from managed\n');
      }
      return spawnResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
    };

    const result = setupMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(result.changed).toBe(true);
    expect(result.environment.status).toBe('ready');
    expect(result.environment.provider).toBe('uv-managed');
    expect(result.environment.python).toBe(managedPython);
    expect(fs.existsSync(getMakerPythonConfigPath())).toBe(true);
    expect(calls.find((call) => call.command === 'sh')?.env).toEqual(
      expect.objectContaining({
        INSTALLER_NO_MODIFY_PATH: '1',
        UV_INSTALL_DIR: path.join(tempDir, 'maker-home', 'bin'),
      })
    );
    expect(calls.find((call) => call.command === uvPath && call.args[0] === 'python')?.env).toEqual(
      expect.objectContaining({
        UV_PYTHON_INSTALL_DIR: path.join(tempDir, 'maker-home', 'python', 'uv'),
      })
    );
  });

  test('records setup failures and reports them on subsequent checks', () => {
    const uvPath = path.join(tempDir, 'maker-home', 'bin', 'uv');
    const spawn = (command: string) => {
      if (command === 'python3' || command === 'python') {
        return spawnResult(1, '', 'not found');
      }
      if (command === 'sh') {
        fs.mkdirSync(path.dirname(uvPath), { recursive: true });
        fs.writeFileSync(uvPath, '');
        return spawnResult(0, 'installed uv\n');
      }
      if (command === uvPath) {
        return spawnResult(1, '', 'temporary download failure');
      }
      return spawnResult(1, '', 'not found');
    };

    expect(() =>
      setupMakerPythonEnvironment({
        platform: 'darwin',
        spawn,
      })
    ).toThrow('uv python install failed');

    const environment = checkMakerPythonEnvironment({
      platform: 'darwin',
      spawn,
    });

    expect(environment.status).toBe('setup_failed');
    expect(environment.ready).toBe(false);
    expect(environment.error).toContain('temporary download failure');
    expect(environment.nextAction).toContain('taptap-maker python setup');
    expect(environment.nextAction).toContain('Python 3.12');
    expect(environment.nextAction).not.toContain('私有 Python');
  });
});
