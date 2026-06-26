/**
 * Maker CLI command behavior tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { requestTapAuthWithPat } from '../maker/auth/patTap';
import { loginWithCliAuthCode } from '../maker/auth/cliLogin';
import { setMakerEnvironmentOverride } from '../maker/config';
import { cloneMakerProject, listMakerProjects } from '../maker/cli/projects';
import {
  checkAiDevKitUpdate,
  inspectAiDevKit,
  installAiDevKit,
  installAiDevKitSkills,
} from '../maker/cli/devKit';
import { formatMakerPackageUpdateStatus, getMakerPackageUpdateStatus } from '../maker/versionCheck';
import { resolveNpxCliCommand, runMakerCli } from '../maker/cli/commands';
import { loadProjectConfig, saveProjectConfig } from '../maker/storage';

function mockReadyPython(spawnSyncMock: jest.MockedFunction<typeof spawnSync>): void {
  spawnSyncMock.mockImplementation((command, args) => {
    if (command === 'python3' && Array.isArray(args) && args.includes('-c')) {
      return {
        status: 0,
        stdout: JSON.stringify({
          executable: '/opt/maker-python/bin/python3',
          version: '3.12.11',
        }),
        stderr: '',
      } as ReturnType<typeof spawnSync>;
    }
    if (
      command === '/opt/maker-python/bin/python3' &&
      Array.isArray(args) &&
      args.join(' ') === '-m pip --version'
    ) {
      return {
        status: 0,
        stdout: 'pip 25.1 from /opt/maker-python/lib/python3.12/site-packages/pip\n',
        stderr: '',
      } as ReturnType<typeof spawnSync>;
    }
    return { status: 0, stdout: 'help output', stderr: '' } as ReturnType<typeof spawnSync>;
  });
}

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawnSync: jest.fn(() => ({ status: 0, stdout: 'help output', stderr: '' })),
}));

jest.mock('../maker/auth/patTap', () => ({
  requestTapAuthWithPat: jest.fn(async () => ({
    kid: 'kid-1234567890',
    token: 'tap-token',
    mac_key: 'mac-key',
  })),
}));

jest.mock('../maker/auth/cliLogin', () => ({
  loginWithCliAuthCode: jest.fn(async () => ({
    token: 'browser-maker-pat',
    expires_at: '2026-06-05T00:00:00.000Z',
    code: '7cqFPS6OyS7z8D8NXWAjhJvEBNtq9pZi',
    auth_url: 'https://maker.taptap.cn/pat-tokens?code=7cqFPS6OyS7z8D8NXWAjhJvEBNtq9pZi',
  })),
}));

jest.mock('../maker/cli/projects', () => ({
  createMakerProject: jest.fn(async () => ({
    id: 'created-app',
    name: 'Created App',
    user_id: 'created-user',
    gameType: 'sce',
    stage: 'plan',
  })),
  cloneMakerProject: jest.fn(async (options) => ({
    targetDir: options.targetDir,
    appId: options.appId,
  })),
  listMakerProjects: jest.fn(async () => [
    {
      id: 'app-1',
      name: 'App One',
      user_id: 'user-1',
    },
  ]),
}));

jest.mock('../maker/cli/devKit', () => ({
  DEV_KIT_GITIGNORE_STAGING_FILE: '.gitignore.dev-kit-before-clone',
  finalizeStagedDevKitGitignore: jest.fn(),
  checkAiDevKitUpdate: jest.fn(async () => ({
    targetDir: '',
    updateAvailable: false,
  })),
  inspectAiDevKit: jest.fn(() => ({
    targetDir: '',
    requiredEntries: [],
    presentEntries: [],
    missingEntries: [],
    ready: true,
  })),
  installAiDevKit: jest.fn(),
  installAiDevKitSkills: jest.fn(),
  listPresentDevKitManagedEntries: jest.fn(() => []),
  writeDevKitStagedGitignore: jest.fn(),
}));

jest.mock('../maker/versionCheck', () => ({
  formatMakerPackageUpdateStatus: jest.fn(() =>
    [
      'Maker MCP package update',
      '',
      '- status: current',
      '- current_version: 0.0.8',
      '- next_action: Continue normal work; no package upgrade is required.',
      '- restart_required: no',
    ].join('\n')
  ),
  getMakerPackageUpdateStatus: jest.fn(async () => ({
    status: 'current',
    current_version: '0.0.8',
    next_action: 'Continue normal work; no package upgrade is required.',
    restart_required: false,
  })),
}));

jest.mock('../maker/system/git', () => {
  const actual = jest.requireActual('../maker/system/git');
  return {
    ...actual,
    checkGitEnvironment: jest.fn(() => ({
      platform: process.platform,
      command: 'git',
      installed: true,
      version: 'git version test',
      verifyCommand: 'git --version',
      installGuide: [],
    })),
    ensureGitAvailable: jest.fn(() => ({
      platform: process.platform,
      command: 'git',
      installed: true,
      version: 'git version test',
      verifyCommand: 'git --version',
      installGuide: [],
    })),
  };
});

describe('Maker CLI commands', () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalEnv = process.env.TAPTAP_MCP_ENV;
  const originalPythonBin = process.env.TAPTAP_MAKER_PYTHON_BIN;
  const originalStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let homedirSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  const spawnSyncMock = jest.mocked(spawnSync);
  const cliLoginMock = jest.mocked(loginWithCliAuthCode);
  const expectedNpxLaunch = resolveNpxCliCommand('@taptap/maker');
  const expectedOpenCodeCommand =
    process.platform === 'win32'
      ? ['npx.cmd', '-y', '-p', '@taptap/maker', 'taptap-maker']
      : ['npx', '-y', '-p', '@taptap/maker', 'taptap-maker'];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-cli-commands-'));
    process.env.HOME = tempDir;
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    delete process.env.TAPTAP_MCP_ENV;
    delete process.env.TAPTAP_MAKER_PYTHON_BIN;
    setMakerEnvironmentOverride(undefined);
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tempDir);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
    mockReadyPython(spawnSyncMock);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
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
    if (originalEnv === undefined) {
      delete process.env.TAPTAP_MCP_ENV;
    } else {
      process.env.TAPTAP_MCP_ENV = originalEnv;
    }
    if (originalPythonBin === undefined) {
      delete process.env.TAPTAP_MAKER_PYTHON_BIN;
    } else {
      process.env.TAPTAP_MAKER_PYTHON_BIN = originalPythonBin;
    }
    setMakerEnvironmentOverride(undefined);
    if (originalStdinIsTty) {
      Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTty);
    } else {
      delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('resolves npx package commands for Windows and POSIX launchers', () => {
    expect(resolveNpxCliCommand('@taptap/maker', 'win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npx.cmd', '-y', '-p', '@taptap/maker', 'taptap-maker'],
      commandAndArgs: [
        'cmd.exe',
        '/d',
        '/s',
        '/c',
        'npx.cmd',
        '-y',
        '-p',
        '@taptap/maker',
        'taptap-maker',
      ],
    });
    expect(resolveNpxCliCommand('@taptap/maker', 'linux')).toEqual({
      command: 'npx',
      args: ['-y', '-p', '@taptap/maker', 'taptap-maker'],
      commandAndArgs: ['npx', '-y', '-p', '@taptap/maker', 'taptap-maker'],
    });
    expect(resolveNpxCliCommand('@taptap/maker', 'darwin')).toEqual({
      command: 'npx',
      args: ['-y', '-p', '@taptap/maker', 'taptap-maker'],
      commandAndArgs: ['npx', '-y', '-p', '@taptap/maker', 'taptap-maker'],
    });
  });

  test('codex mcp install replaces existing server table and env subtable', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers."taptap-maker"]',
        'command = "old-npx"',
        '',
        '[mcp_servers."taptap-maker".env]',
        'TAPTAP_MCP_ENV = "production"',
        '',
        '[mcp_servers."other"]',
        'command = "other"',
        '',
        '[mcp_servers."other".env]',
        'KEEP = "yes"',
        '',
      ].join('\n'),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'codex', '--env', 'rnd']);

    const text = fs.readFileSync(configPath, 'utf8');
    expect(text.match(/\[mcp_servers\."taptap-maker"\]/g)).toHaveLength(1);
    expect(text.match(/\[mcp_servers\."taptap-maker"\.env\]/g)).toHaveLength(1);
    expect(text).toContain(
      `args = [${expectedNpxLaunch.args.map((arg) => `"${arg}"`).join(', ')}]`
    );
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
    expect(text).toContain('[mcp_servers."other".env]');
    expect(text).toContain('KEEP = "yes"');
  });

  test('top-level install aliases mcp install', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');

    await runMakerCli(['install', '--ide', 'codex', '--env', 'rnd']);

    const text = fs.readFileSync(configPath, 'utf8');
    expect(text.match(/\[mcp_servers\."taptap-maker"\]/g)).toHaveLength(1);
    expect(text).toContain(`command = "${expectedNpxLaunch.command}"`);
    expect(text).toContain(
      `args = [${expectedNpxLaunch.args.map((arg) => `"${arg}"`).join(', ')}]`
    );
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
  });

  test('json mcp install writes a Windows spawn-compatible package command', async () => {
    const configPath = path.join(tempDir, '.cursor', 'mcp.json');

    await runMakerCli(['mcp', 'install', '--ide', 'cursor', '--env', 'rnd']);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: {
        TAPTAP_MCP_ENV: 'rnd',
      },
    });
    if (process.platform === 'win32') {
      expect(config.mcpServers['taptap-maker'].command).not.toBe('npx.cmd');
    }
  });

  test('json mcp install pins cwd when target directory is provided', async () => {
    const configPath = path.join(tempDir, '.cursor', 'mcp.json');
    const projectDir = path.join(tempDir, 'maker-project');
    fs.mkdirSync(projectDir, { recursive: true });

    await runMakerCli([
      'mcp',
      'install',
      '--ide',
      'cursor',
      '--env',
      'rnd',
      '--target-dir',
      projectDir,
    ]);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      cwd: projectDir,
      env: {
        TAPTAP_MCP_ENV: 'rnd',
      },
    });
  });

  test('mcp install does not create backups when config is unchanged', async () => {
    const configPath = path.join(tempDir, '.cursor', 'mcp.json');

    await runMakerCli(['mcp', 'install', '--ide', 'cursor', '--env', 'rnd']);
    await runMakerCli(['mcp', 'install', '--ide', 'cursor', '--env', 'rnd']);

    expect(fs.existsSync(`${configPath}.taptap-maker.bak.latest`)).toBe(false);
    expect(
      fs.readdirSync(path.dirname(configPath)).filter((entry) => entry.startsWith('mcp.json.bak.'))
    ).toEqual([]);
  });

  test('mcp install creates only the TapTap Maker latest backup when config changes', async () => {
    const configPath = path.join(tempDir, '.cursor', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const legacyBackupPath = `${configPath}.bak.20260101000000`;
    const previousConfig = `${JSON.stringify(
      {
        mcpServers: {
          'taptap-maker': {
            command: 'old',
            args: ['old'],
          },
        },
      },
      null,
      2
    )}\n`;
    fs.writeFileSync(configPath, previousConfig, 'utf8');
    fs.writeFileSync(legacyBackupPath, 'legacy backup owned by an unknown tool\n', 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'cursor', '--env', 'rnd']);

    const latestBackupPath = `${configPath}.taptap-maker.bak.latest`;
    expect(fs.readFileSync(latestBackupPath, 'utf8')).toBe(previousConfig);
    expect(fs.readFileSync(legacyBackupPath, 'utf8')).toBe(
      'legacy backup owned by an unknown tool\n'
    );
    expect(
      fs.readdirSync(path.dirname(configPath)).filter((entry) => /^mcp\.json\.bak\.\d+/.test(entry))
    ).toEqual(['mcp.json.bak.20260101000000']);
  });

  test('default mcp install updates detected editor configs only', async () => {
    const traePath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'TRAE SOLO', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json');
    const openCodePath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');
    const workBuddyPath = path.join(tempDir, '.workbuddy', 'mcp.json');
    fs.mkdirSync(path.dirname(traePath), { recursive: true });
    fs.mkdirSync(path.dirname(openCodePath), { recursive: true });
    fs.mkdirSync(path.dirname(workBuddyPath), { recursive: true });
    fs.writeFileSync(traePath, '{ "mcpServers": {} }\n', 'utf8');
    fs.writeFileSync(
      openCodePath,
      '{ "$schema": "https://opencode.ai/config.json", "mcp": {} }\n',
      'utf8'
    );
    fs.writeFileSync(workBuddyPath, '{ "mcpServers": {} }\n', 'utf8');

    await runMakerCli(['mcp', 'install', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.map((entry: { ide: string }) => entry.ide)).toEqual(
      expect.arrayContaining(['codex', 'cursor', 'claude', 'trae', 'opencode', 'workbuddy'])
    );
    expect(JSON.parse(fs.readFileSync(traePath, 'utf8')).mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
    expect(JSON.parse(fs.readFileSync(openCodePath, 'utf8')).mcp['taptap-maker']).toEqual({
      type: 'local',
      command: expectedOpenCodeCommand,
      enabled: true,
    });
    expect(JSON.parse(fs.readFileSync(workBuddyPath, 'utf8')).mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
    expect(fs.existsSync(path.join(tempDir, 'maker-home', 'mcp.json'))).toBe(false);
  });

  test('trae mcp install updates both solo and non-solo configs when both exist', async () => {
    const traePaths =
      process.platform === 'win32'
        ? [
            path.join(tempDir, 'AppData', 'Roaming', 'TRAE SOLO', 'User', 'mcp.json'),
            path.join(tempDir, 'AppData', 'Roaming', 'Trae', 'User', 'mcp.json'),
          ]
        : [
            path.join(
              tempDir,
              'Library',
              'Application Support',
              'TRAE SOLO CN',
              'User',
              'mcp.json'
            ),
            path.join(tempDir, 'Library', 'Application Support', 'Trae', 'User', 'mcp.json'),
          ];
    for (const configPath of traePaths) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, '{ "mcpServers": {} }\n', 'utf8');
    }

    await runMakerCli(['mcp', 'install', '--ide', 'trae', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.filter((entry: { ide: string }) => entry.ide === 'trae')).toHaveLength(2);
    for (const configPath of traePaths) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['taptap-maker'].env.TAPTAP_MCP_ENV).toBe('rnd');
    }
  });

  test('trae mcp install continues when one matched config is invalid', async () => {
    const soloConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'TRAE SOLO', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json');
    const invalidConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'Trae', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(soloConfigPath), { recursive: true });
    fs.mkdirSync(path.dirname(invalidConfigPath), { recursive: true });
    fs.writeFileSync(invalidConfigPath, '{ "mcpServers": { "broken": true, }\n', 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'trae', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ide: 'trae',
          ok: true,
          path: soloConfigPath,
        }),
        expect.objectContaining({
          ide: 'trae',
          ok: false,
          path: invalidConfigPath,
          message: expect.stringContaining('Invalid JSON'),
        }),
      ])
    );
    expect(JSON.parse(fs.readFileSync(soloConfigPath, 'utf8')).mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
    expect(fs.readFileSync(invalidConfigPath, 'utf8')).toBe(
      '{ "mcpServers": { "broken": true, }\n'
    );
  });

  test('default mcp install does not create unverified non-solo Trae config from user directory only', async () => {
    const traeCnConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'Trae CN', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(traeCnConfigPath), { recursive: true });

    await runMakerCli(['mcp', 'install', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.map((entry: { ide: string }) => entry.ide)).not.toContain('trae');
    expect(fs.existsSync(traeCnConfigPath)).toBe(false);
  });

  test('explicit trae mcp install creates solo config when the user directory exists', async () => {
    const traeCnConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'TRAE SOLO', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(traeCnConfigPath), { recursive: true });

    await runMakerCli(['mcp', 'install', '--ide', 'trae', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'trae',
        ok: true,
        path: traeCnConfigPath,
      }),
    ]);
    expect(
      JSON.parse(fs.readFileSync(traeCnConfigPath, 'utf8')).mcpServers['taptap-maker']
    ).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
  });

  test('explicit trae mcp install updates existing unverified non-solo config', async () => {
    const traeConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, 'AppData', 'Roaming', 'Trae', 'User', 'mcp.json')
        : path.join(tempDir, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(traeConfigPath), { recursive: true });
    fs.writeFileSync(traeConfigPath, '{ "mcpServers": {} }\n', 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'trae', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'trae',
        ok: true,
        path: traeConfigPath,
      }),
    ]);
    expect(JSON.parse(fs.readFileSync(traeConfigPath, 'utf8')).mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
  });

  test('opencode mcp install uses the official mcp schema without environment fields', async () => {
    const configPath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        '{',
        '  "$schema": "https://opencode.ai/config.json",',
        '  // Existing user setting must survive JSONC parsing.',
        '  "autoupdate": false,',
        '  "mcpServers": {',
        '    "taptap-maker": { "command": "old", "args": [] }',
        '  },',
        '  "mcp": {',
        '    "other": { "type": "local", "command": ["node", "other.js"] },',
        '  },',
        '}',
      ].join('\n'),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'opencode', '--env', 'rnd']);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.autoupdate).toBe(false);
    expect(config.mcp.other).toEqual({ type: 'local', command: ['node', 'other.js'] });
    expect(config.mcp['taptap-maker']).toEqual({
      type: 'local',
      command: expectedOpenCodeCommand,
      enabled: true,
    });
    expect(config.mcp['taptap-maker']).not.toHaveProperty('env');
    expect(config.mcp['taptap-maker']).not.toHaveProperty('environment');
    expect(config.mcpServers?.['taptap-maker']).toBeUndefined();
  });

  test('opencode mcp install reports that JSONC is rewritten as standard JSON', async () => {
    const configPath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      ['{', '  // user note', '  "mcp": {', '  },', '}'].join('\n'),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'opencode', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads[0].message).toContain('standard JSON');
  });

  test('opencode mcp install omits production environment by default', async () => {
    const configPath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{ "mcp": {} }\n', 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'opencode']);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.mcp['taptap-maker']).toEqual({
      type: 'local',
      command: expectedOpenCodeCommand,
      enabled: true,
    });
    expect(config.mcp['taptap-maker']).not.toHaveProperty('env');
    expect(config.mcp['taptap-maker']).not.toHaveProperty('environment');
  });

  test('explicit opencode mcp install does not create a missing config file', async () => {
    const configPath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');

    await runMakerCli(['mcp', 'install', '--ide', 'opencode', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'opencode',
        ok: false,
        message: expect.stringContaining('no supported config file found'),
      }),
    ]);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  test('explicit workbuddy mcp install writes platform config file', async () => {
    const configPath =
      process.platform === 'win32'
        ? path.join(tempDir, '.workbuddy', 'mcp.json')
        : path.join(tempDir, '.workbuddy', '.mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        { mcpServers: { 'connector-proxy': { type: 'http', url: 'http://127.0.0.1:1/mcp' } } },
        null,
        2
      ),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'workbuddy', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'workbuddy',
        ok: true,
        path: configPath,
      }),
    ]);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.mcpServers['connector-proxy']).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:1/mcp',
    });
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
  });

  test('workbuddy auto install writes existing platform config file', async () => {
    const workBuddyConfigPath =
      process.platform === 'win32'
        ? path.join(tempDir, '.workbuddy', 'mcp.json')
        : path.join(tempDir, '.workbuddy', '.mcp.json');
    fs.mkdirSync(path.dirname(workBuddyConfigPath), { recursive: true });
    const runtimeConfig = `${JSON.stringify(
      {
        mcpServers: {
          'connector-proxy': {
            type: 'http',
            url: 'http://127.0.0.1:60000/mcp',
          },
        },
      },
      null,
      2
    )}\n`;
    fs.writeFileSync(workBuddyConfigPath, runtimeConfig, 'utf8');

    await runMakerCli(['mcp', 'install', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.map((entry: { ide: string }) => entry.ide)).toContain('workbuddy');
    const config = JSON.parse(fs.readFileSync(workBuddyConfigPath, 'utf8'));
    expect(config.mcpServers['connector-proxy']).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:60000/mcp',
    });
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: { TAPTAP_MCP_ENV: 'rnd' },
    });
  });

  test('json mcp install rejects invalid existing JSON without overwriting it', async () => {
    const configPath = path.join(tempDir, '.cursor', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const invalidJson = '{ "mcpServers": { "other": true, }\n';
    fs.writeFileSync(configPath, invalidJson, 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'cursor', '--env', 'rnd', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'cursor',
        ok: false,
        message: expect.stringContaining('Invalid JSON'),
      }),
    ]);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(invalidJson);
    expect(fs.existsSync(`${configPath}.taptap-maker.bak.latest`)).toBe(false);
  });

  test('claude mcp install invokes Claude CLI through a Windows spawn-compatible command', async () => {
    await runMakerCli(['mcp', 'install', '--ide', 'claude', '--env', 'rnd', '--json']);

    const claudeArgs = [
      'mcp',
      'add',
      '--scope',
      'user',
      '--transport',
      'stdio',
      '--env',
      'TAPTAP_MCP_ENV=rnd',
      'taptap-maker',
      '--',
      expectedNpxLaunch.command,
      ...expectedNpxLaunch.args,
    ];
    expect(spawnSyncMock).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'cmd.exe' : 'claude',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'claude.cmd', ...claudeArgs] : claudeArgs,
      { encoding: 'utf8' }
    );
  });

  test('codex mcp install replaces existing bare server table and env subtable', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.taptap-maker]',
        'command = "node"',
        'args = ["/tmp/taptap-maker.js"]',
        '',
        '[mcp_servers.taptap-maker.env]',
        'TAPTAP_MCP_VERBOSE = "true"',
        '',
        '[mcp_servers."other"]',
        'command = "other"',
        '',
      ].join('\n'),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'codex', '--env', 'rnd']);

    const text = fs.readFileSync(configPath, 'utf8');
    expect(text).not.toContain('[mcp_servers.taptap-maker]');
    expect(text).not.toContain('[mcp_servers.taptap-maker.env]');
    expect(text.match(/\[mcp_servers\."taptap-maker"\]/g)).toHaveLength(1);
    expect(text.match(/\[mcp_servers\."taptap-maker"\.env\]/g)).toHaveLength(1);
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
    expect(text).toContain('[mcp_servers."other"]');
  });

  test('codex mcp install repairs mixed bare and quoted duplicate server tables', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.taptap-maker]',
        'command = "node"',
        '',
        '[mcp_servers.taptap-maker.env]',
        'TAPTAP_MCP_VERBOSE = "true"',
        '',
        '[mcp_servers."other"]',
        'command = "other"',
        '',
        '[mcp_servers."taptap-maker"]',
        'command = "old-npx"',
        '',
        '[mcp_servers."taptap-maker".env]',
        'TAPTAP_MCP_ENV = "production"',
        '',
      ].join('\n'),
      'utf8'
    );

    await runMakerCli(['mcp', 'install', '--ide', 'codex', '--env', 'rnd']);

    const text = fs.readFileSync(configPath, 'utf8');
    expect(text).not.toContain('[mcp_servers.taptap-maker]');
    expect(text).not.toContain('[mcp_servers.taptap-maker.env]');
    expect(text.match(/\[mcp_servers\."taptap-maker"\]/g)).toHaveLength(1);
    expect(text.match(/\[mcp_servers\."taptap-maker"\.env\]/g)).toHaveLength(1);
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
    expect(text).toContain('[mcp_servers."other"]');
  });

  test('codex mcp install is idempotent when repeated', async () => {
    const configPath = path.join(tempDir, '.codex', 'config.toml');

    await runMakerCli(['mcp', 'install', '--ide', 'codex', '--env', 'rnd']);
    const once = fs.readFileSync(configPath, 'utf8');

    await runMakerCli(['mcp', 'install', '--ide', 'codex', '--env', 'rnd']);
    const twice = fs.readFileSync(configPath, 'utf8');

    expect(twice).toBe(once);
    expect(twice.match(/\[mcp_servers\."taptap-maker"\]/g)).toHaveLength(1);
    expect(twice.match(/\[mcp_servers\."taptap-maker"\.env\]/g)).toHaveLength(1);
  });

  test('mcp install continues with later IDEs when one IDE config fails', async () => {
    fs.mkdirSync(path.join(tempDir, '.codex', 'config.toml'), { recursive: true });

    await runMakerCli(['mcp', 'install', '--ide', 'codex,cursor', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({
        ide: 'codex',
        ok: false,
      }),
      expect.objectContaining({
        ide: 'cursor',
        ok: true,
      }),
    ]);
    expect(fs.existsSync(path.join(tempDir, '.cursor', 'mcp.json'))).toBe(true);
  });

  test('mcp install resolves space-joined --ide from PowerShell 5.1 array expansion', async () => {
    // Windows PowerShell 5.1 turns `--ide codex,cursor,claude` into a single
    // space-joined argument "codex cursor claude"; it must still resolve to the
    // three IDEs instead of one unknown IDE.
    await runMakerCli(['mcp', 'install', '--ide', 'codex cursor claude', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.map((entry: { ide: string }) => entry.ide)).toEqual([
      'codex',
      'cursor',
      'claude',
    ]);
    expect(payloads.every((entry: { ok: boolean }) => entry.ok)).toBe(true);
    expect(payloads.some((entry: { message: string }) => /unknown ide/i.test(entry.message))).toBe(
      false
    );
  });

  test('mcp install still reports a genuinely unknown IDE token', async () => {
    // The whitespace split must not swallow real typos: known IDEs still install
    // while the unknown token is reported.
    await runMakerCli(['mcp', 'install', '--ide', 'cursor foobar', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads).toEqual([
      expect.objectContaining({ ide: 'cursor', ok: true }),
      expect.objectContaining({
        ide: 'foobar',
        ok: false,
        message: expect.stringContaining('Skipped unknown IDE: foobar'),
      }),
    ]);
  });

  test('mcp install accepts the --ides alias with whitespace separators', async () => {
    await runMakerCli(['mcp', 'install', '--ides', 'cursor claude', '--json']);

    const payloads = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payloads.map((entry: { ide: string }) => entry.ide)).toEqual(['cursor', 'claude']);
    expect(payloads.every((entry: { ok: boolean }) => entry.ok)).toBe(true);
  });

  test('agents update writes a versioned managed AGENTS block and is idempotent', async () => {
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Project Rules\n\nKeep this user rule.\n', 'utf8');

    await runMakerCli(['agents', 'update', '--target-dir', tempDir]);
    const once = fs.readFileSync(agentsPath, 'utf8');

    await runMakerCli(['agents', 'update', '--target-dir', tempDir]);
    const twice = fs.readFileSync(agentsPath, 'utf8');

    expect(twice).toBe(once);
    expect(twice).toContain('TapTap Maker managed AGENTS policy');
    expect(twice).toContain('version=');
    expect(twice).toContain('hash=sha256:');
    expect(twice).toContain('Keep this user rule.');
    expect((twice.match(/TapTap Maker managed AGENTS policy/g) || []).length).toBe(2);
  });

  test('doctor reports outdated AGENTS policy for a bound old project', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });
    fs.writeFileSync(
      path.join(tempDir, 'AGENTS.md'),
      [
        '<!-- >>> TapTap Maker asset tool policy >>> -->',
        'old managed policy',
        '<!-- <<< TapTap Maker asset tool policy <<< -->',
        '',
      ].join('\n'),
      'utf8'
    );

    await runMakerCli(['doctor', '--target-dir', tempDir]);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('AGENTS.md');
    expect(output).toContain('outdated');
    expect(output).toContain('taptap-maker agents update');
  });

  test('upgrade refreshes current project AGENTS policy and MCP config', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });
    const agentsPath = path.join(tempDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, 'Local project notes\n', 'utf8');

    await runMakerCli(['upgrade', '--target-dir', tempDir, '--ide', 'cursor', '--env', 'rnd']);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.cursor', 'mcp.json'), 'utf8'));
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      cwd: tempDir,
      env: {
        TAPTAP_MCP_ENV: 'rnd',
      },
    });
    const agents = fs.readFileSync(agentsPath, 'utf8');
    expect(agents).toContain('TapTap Maker managed AGENTS policy');
    expect(agents).toContain('Local project notes');
  });

  test('upgrade without explicit target dir does not pin cwd into user-level MCP config', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });
    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);

      await runMakerCli(['upgrade', '--ide', 'cursor', '--env', 'rnd']);
    } finally {
      process.chdir(originalCwd);
    }

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.cursor', 'mcp.json'), 'utf8'));
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
      env: {
        TAPTAP_MCP_ENV: 'rnd',
      },
    });
    expect(config.mcpServers['taptap-maker']).not.toHaveProperty('cwd');
  });

  test('init treats the token after command as positional app id', async () => {
    await runMakerCli([
      'init',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-confirm',
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    expect(listMakerProjects).toHaveBeenCalled();
    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
      })
    );
  });

  test('init can create a new Maker project before cloning', async () => {
    const createMakerProject = jest.requireMock('../maker/cli/projects')
      .createMakerProject as jest.Mock;

    await runMakerCli([
      'init',
      '--create',
      '--name',
      'My Local Game',
      '--target-dir',
      tempDir,
      '--skip-confirm',
      '--skip-mcp-install',
      '--pat',
      'valid-maker-token',
    ]);

    expect(createMakerProject).toHaveBeenCalledWith({
      name: 'My Local Game',
      gameType: 'sce',
      pat: 'valid-maker-token',
    });
    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'created-app',
        targetDir: tempDir,
        userId: 'created-user',
      })
    );
    expect(loadProjectConfig(tempDir)).toEqual(
      expect.objectContaining({
        project_id: 'created-app',
        user_id: 'created-user',
      })
    );
  });

  test('init refuses to create a new Maker project in an already-bound directory', async () => {
    const createMakerProject = jest.requireMock('../maker/cli/projects')
      .createMakerProject as jest.Mock;
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });

    await expect(
      runMakerCli([
        'init',
        '--create',
        '--name',
        'Another Game',
        '--target-dir',
        tempDir,
        '--skip-confirm',
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ])
    ).rejects.toThrow('already bound to Maker project app-1');

    expect(createMakerProject).not.toHaveBeenCalled();
    expect(cloneMakerProject).not.toHaveBeenCalled();
  });

  test('init warns when PAT is passed with --pat', async () => {
    await runMakerCli([
      'init',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-confirm',
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    expect(stderrSpy.mock.calls.join('')).toContain('exposes it via ps/shell history');
  });

  test('init starts CLI login when PAT is missing', async () => {
    await runMakerCli(['init', '--app-id', 'app-1', '--target-dir', tempDir, '--skip-mcp-install']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker login is required');
    expect(output).toContain('Starting Maker CLI login');
    expect(loginWithCliAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({
        env: 'production',
      })
    );
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('browser-maker-pat', 'production');
  });

  test('init does not pin project cwd into user-level MCP config by default', async () => {
    await runMakerCli([
      'init',
      '--app-id',
      'app-1',
      '--target-dir',
      tempDir,
      '--register-mcp',
      'cursor',
      '--pat',
      'secret-maker-token',
    ]);

    const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.cursor', 'mcp.json'), 'utf8'));
    expect(config.mcpServers['taptap-maker']).toEqual({
      command: expectedNpxLaunch.command,
      args: expectedNpxLaunch.args,
    });
    expect(config.mcpServers['taptap-maker']).not.toHaveProperty('env');
    expect(config.mcpServers['taptap-maker']).not.toHaveProperty('cwd');
  });

  test('init skips lua-lsp setup when LSP is already ready', async () => {
    process.env.TAPTAP_MAKER_PYTHON_BIN = '/opt/maker-python/bin/python3';
    const scriptsDir = path.join(tempDir, 'python-bin');
    const lspCommand = path.join(scriptsDir, 'maker-lua-lsp');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(lspCommand, '');
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === '/opt/maker-python/bin/python3' && args.includes('-c')) {
        if (String(args.at(-1)).includes('sysconfig.get_path')) {
          return { status: 0, stdout: `${scriptsDir}\n`, stderr: '' } as ReturnType<
            typeof spawnSync
          >;
        }
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: '/opt/maker-python/bin/python3',
            version: '3.12.11',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === '-m pip --version') {
        return { status: 0, stdout: 'pip 25.1\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === lspCommand && args[0] === '--version') {
        return { status: 0, stdout: 'maker-lua-lsp 1.0.0\n', stderr: '' } as ReturnType<
          typeof spawnSync
        >;
      }
      return { status: 0, stdout: 'help output', stderr: '' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'valid-maker-token',
    ]);

    expect(stdoutSpy.mock.calls.join('')).toContain('Maker Lua LSP is ready');
    expect(spawnSyncMock).not.toHaveBeenCalledWith(
      '/opt/maker-python/bin/python3',
      ['-m', 'pip', 'install', '--upgrade', 'maker-lua-lsp'],
      expect.any(Object)
    );
  });

  test('init retries Python setup twice and continues when the third attempt succeeds', async () => {
    let setupAttempts = 0;
    spawnSyncMock.mockImplementation((command, args, options) => {
      if (command === 'python3' || command === 'python') {
        return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
      }
      if (command === 'sh' && Array.isArray(args) && args.includes('-c')) {
        setupAttempts += 1;
        if (setupAttempts < 3) {
          return { status: 1, stdout: '', stderr: 'temporary download failure' } as ReturnType<
            typeof spawnSync
          >;
        }
        const uvInstallDir = (options?.env as NodeJS.ProcessEnv | undefined)?.UV_INSTALL_DIR;
        if (uvInstallDir) {
          fs.mkdirSync(uvInstallDir, { recursive: true });
          fs.writeFileSync(path.join(uvInstallDir, 'uv'), '');
        }
        return { status: 0, stdout: 'installed uv\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (typeof command === 'string' && command.endsWith('/uv')) {
        if (Array.isArray(args) && args.join(' ') === 'python install 3.12 --managed-python') {
          return { status: 0, stdout: 'installed python\n', stderr: '' } as ReturnType<
            typeof spawnSync
          >;
        }
        if (Array.isArray(args) && args.join(' ') === 'python find 3.12') {
          return {
            status: 0,
            stdout: `${path.join(tempDir, 'maker-home', 'python', 'python3')}\n`,
            stderr: '',
          } as ReturnType<typeof spawnSync>;
        }
      }
      if (
        command === path.join(tempDir, 'maker-home', 'python', 'python3') &&
        Array.isArray(args) &&
        args.includes('-c')
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: path.join(tempDir, 'maker-home', 'python', 'python3'),
            version: '3.12.11',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (
        command === path.join(tempDir, 'maker-home', 'python', 'python3') &&
        Array.isArray(args) &&
        args.join(' ') === '-m pip --version'
      ) {
        return { status: 0, stdout: 'pip 25.1 from managed\n', stderr: '' } as ReturnType<
          typeof spawnSync
        >;
      }
      return { status: 0, stdout: 'help output', stderr: '' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'valid-maker-token',
    ]);

    expect(setupAttempts).toBe(3);
    expect(stderrSpy.mock.calls.join('')).toContain('正在重试 1/2');
    expect(stderrSpy.mock.calls.join('')).toContain('正在重试 2/2');
    expect(listMakerProjects).toHaveBeenCalledWith({ pat: 'valid-maker-token' });
    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
      })
    );
  });

  test('init pauses before auth and clone when Python setup fails three times', async () => {
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === 'python3' || command === 'python') {
        return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
      }
      if (command === 'sh' && Array.isArray(args) && args.includes('-c')) {
        return { status: 1, stdout: '', stderr: 'temporary download failure' } as ReturnType<
          typeof spawnSync
        >;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    let error: unknown;
    try {
      await runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ]);
    } catch (caught) {
      error = caught;
    }

    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain('TapTap Maker 初始化已暂停');
    expect(message).toContain('已自动尝试 3 次');
    expect(message).toContain('taptap-maker python setup');
    expect(message).toContain('Python 3.12');
    expect(message).not.toContain('私有 Python');
    expect(requestTapAuthWithPat).not.toHaveBeenCalled();
    expect(listMakerProjects).not.toHaveBeenCalled();
    expect(cloneMakerProject).not.toHaveBeenCalled();
  });

  test('init PAT validation failures guide CLI login', async () => {
    jest
      .mocked(requestTapAuthWithPat)
      .mockRejectedValueOnce(
        new Error('TapTap token request failed: HTTP 401 {"code":"PAT_INVALID"}')
      );

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'invalid-maker-token',
      ])
    ).rejects.toThrow('taptap-maker login');
  });

  test('init Chinese PAT validation failures guide CLI login', async () => {
    jest.mocked(requestTapAuthWithPat).mockRejectedValueOnce(new Error('PAT 已过期'));

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'invalid-maker-token',
      ])
    ).rejects.toThrow('taptap-maker login');
  });

  test('init clone auth failures guide CLI login', async () => {
    jest
      .mocked(cloneMakerProject)
      .mockRejectedValueOnce(
        new Error('git clone failed with exit code 128: The requested URL returned error: 401')
      );

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'invalid-maker-token',
      ])
    ).rejects.toThrow('taptap-maker login');
  });

  test('init records selected Maker project before clone failures', async () => {
    jest
      .mocked(cloneMakerProject)
      .mockRejectedValueOnce(
        new Error('RPC failed; curl 56 Recv failure: Connection reset by peer')
      );

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ])
    ).rejects.toThrow('RPC failed');

    expect(loadProjectConfig(tempDir)).toEqual(
      expect.objectContaining({
        project_id: 'app-1',
        user_id: 'user-1',
      })
    );
  });

  test('init reuses a previously recorded Maker project selection', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'valid-maker-token',
    ]);

    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
        userId: 'user-1',
      })
    );
  });

  test('init does not overwrite an existing Maker project binding with another app', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-2',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ])
    ).rejects.toThrow('already bound to Maker project app-1');

    expect(loadProjectConfig(tempDir)).toEqual(
      expect.objectContaining({
        project_id: 'app-1',
      })
    );
    expect(cloneMakerProject).not.toHaveBeenCalled();
  });

  test('init records selected Maker project before clone failures', async () => {
    jest
      .mocked(cloneMakerProject)
      .mockRejectedValueOnce(
        new Error('RPC failed; curl 56 Recv failure: Connection reset by peer')
      );

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ])
    ).rejects.toThrow('RPC failed');

    expect(loadProjectConfig(tempDir)).toEqual(
      expect.objectContaining({
        project_id: 'app-1',
        user_id: 'user-1',
      })
    );
  });

  test('init reuses a previously recorded Maker project selection', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'valid-maker-token',
    ]);

    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
        userId: 'user-1',
      })
    );
  });

  test('init does not overwrite an existing Maker project binding with another app', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });

    await expect(
      runMakerCli([
        'init',
        '--skip-confirm',
        'app-2',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ])
    ).rejects.toThrow('already bound to Maker project app-1');

    expect(loadProjectConfig(tempDir)).toEqual(
      expect.objectContaining({
        project_id: 'app-1',
      })
    );
    expect(cloneMakerProject).not.toHaveBeenCalled();
  });

  test('init clone forbidden path failures do not include the PAT URL', async () => {
    jest
      .mocked(cloneMakerProject)
      .mockRejectedValueOnce(
        new Error('git push rejected: file matches forbidden pattern ".claude/skills/demo"')
      );

    let thrown: unknown;
    try {
      await runMakerCli([
        'init',
        '--skip-confirm',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'valid-maker-token',
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('matches forbidden pattern');
    expect((thrown as Error).message).not.toContain('pat-tokens');
  });

  test('boolean flags do not consume following positional app id', async () => {
    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
      })
    );
  });

  test('init prints AI dev kit preparation error details for human users', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md'],
      presentEntries: [],
      missingEntries: ['CLAUDE.md'],
      ready: false,
    });
    jest
      .mocked(installAiDevKit)
      .mockRejectedValueOnce(
        new Error('Failed to install AI dev kit skills\nstderr: installer failed')
      );

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('AI dev kit preparation failed; clone will continue');
    expect(output).toContain('Failed to install AI dev kit skills');
    expect(output).toContain('stderr: installer failed');
    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        targetDir: tempDir,
      })
    );
  });

  test('init prints AI dev kit skill installer success summary for human users', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md'],
      presentEntries: [],
      missingEntries: ['CLAUDE.md'],
      ready: false,
    });
    jest.mocked(installAiDevKit).mockImplementationOnce(async (options) => {
      options.onSkillInstallerStart?.({
        platform: process.platform,
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        cwd: path.join(tempDir, 'tools'),
        command: ['bash', path.join(tempDir, 'tools', 'install-skills.sh'), 'all'],
      });
      return {
        targetDir: tempDir,
        sourceDir: path.join(tempDir, 'source'),
        installedEntries: ['skills', 'tools'],
        skippedEntries: [],
        gitignorePath: path.join(tempDir, '.gitignore'),
        stagedGitignorePath: path.join(tempDir, '.gitignore.dev-kit-before-clone'),
        skillInstaller: {
          ok: true,
          status: 'installed',
          script: path.join(tempDir, 'tools', 'install-skills.sh'),
          summary: 'claude=13, codex=13, cursor=13, gemini=13',
          stdout: '[install-skills] claude: installed=13 target=.claude/skills',
          stderr: '',
        },
      };
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('AI skills install started');
    expect(output).toContain('AI dev kit prepared');
    expect(output).toContain('AI skills install result: claude=13, codex=13, cursor=13, gemini=13');
  });

  test('init clones before installing dev kit and allows dev kit to overwrite checkout files', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md'],
      presentEntries: [],
      missingEntries: ['CLAUDE.md'],
      ready: false,
    });
    jest.mocked(installAiDevKit).mockResolvedValueOnce({
      targetDir: tempDir,
      sourceDir: path.join(tempDir, 'source'),
      installedEntries: ['CLAUDE.md', 'tools'],
      skippedEntries: [],
      gitignorePath: path.join(tempDir, '.gitignore'),
      stagedGitignorePath: path.join(tempDir, '.gitignore.dev-kit-before-clone'),
      skillInstaller: {
        ok: true,
        status: 'installed',
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        summary: 'claude=13, codex=13, cursor=13, gemini=13',
        stdout: '',
        stderr: '',
      },
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    const cloneOrder = jest.mocked(cloneMakerProject).mock.invocationCallOrder[0];
    const installOrder = jest.mocked(installAiDevKit).mock.invocationCallOrder[0];
    const installOptions = jest.mocked(installAiDevKit).mock.calls[0]?.[0];
    expect(cloneOrder).toBeLessThan(installOrder);
    expect(installOptions).toEqual(expect.objectContaining({ targetDir: tempDir }));
    expect(installOptions).not.toHaveProperty('preserveExisting', true);
  });

  test('init prints prepared dev kit and skill failure details separately', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md'],
      presentEntries: [],
      missingEntries: ['CLAUDE.md'],
      ready: false,
    });
    jest.mocked(installAiDevKit).mockResolvedValueOnce({
      targetDir: tempDir,
      sourceDir: path.join(tempDir, 'source'),
      installedEntries: ['CLAUDE.md', 'skills', 'tools'],
      skippedEntries: [],
      gitignorePath: path.join(tempDir, '.gitignore'),
      stagedGitignorePath: path.join(tempDir, '.gitignore.dev-kit-before-clone'),
      skillInstaller: {
        ok: false,
        status: 'failed',
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        summary: 'failed: exit_status=42',
        stdout: 'installer stdout detail',
        stderr: 'installer stderr detail',
        error: 'Failed to install AI dev kit skills\nstderr:\ninstaller stderr detail',
      },
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('AI dev kit prepared');
    expect(output).toContain('AI skills install result: failed: exit_status=42');
    expect(output).toContain('AI skills install failed; clone will continue');
    expect(output).toContain('installer stderr detail');
  });

  test('init reinstalls dev kit even when checkout already has dev kit markers', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md', 'examples', 'templates', 'urhox-libs'],
      presentEntries: ['CLAUDE.md', 'examples', 'templates', 'urhox-libs'],
      missingEntries: [],
      ready: true,
    });
    jest.mocked(installAiDevKit).mockImplementationOnce(async (options) => {
      options.onSkillInstallerStart?.({
        platform: process.platform,
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        cwd: path.join(tempDir, 'tools'),
        command: ['bash', path.join(tempDir, 'tools', 'install-skills.sh'), 'all'],
      });
      return {
        targetDir: tempDir,
        sourceDir: path.join(tempDir, 'source'),
        installedEntries: ['CLAUDE.md', 'examples', 'templates', 'tools', 'urhox-libs'],
        skippedEntries: [],
        gitignorePath: path.join(tempDir, '.gitignore'),
        stagedGitignorePath: path.join(tempDir, '.gitignore.dev-kit-before-clone'),
        skillInstaller: {
          ok: true,
          status: 'installed',
          script: path.join(tempDir, 'tools', 'install-skills.sh'),
          summary: 'claude=13, codex=13, cursor=13, gemini=13',
          stdout: '[install-skills] claude: installed=13 target=.claude/skills',
          stderr: '',
        },
      };
    });

    await runMakerCli([
      'init',
      '--skip-confirm',
      'app-1',
      '--target-dir',
      tempDir,
      '--skip-mcp-install',
      '--pat',
      'secret-maker-token',
    ]);

    const output = stdoutSpy.mock.calls.join('');
    const installOptions = jest.mocked(installAiDevKit).mock.calls[0]?.[0];
    expect(output).toContain('AI skills install started');
    expect(output).toContain('AI dev kit prepared');
    expect(output).toContain('AI skills install result: claude=13, codex=13, cursor=13, gemini=13');
    expect(installOptions).toEqual(expect.objectContaining({ targetDir: tempDir }));
    expect(installOptions).not.toHaveProperty('preserveExisting', true);
    expect(installAiDevKitSkills).not.toHaveBeenCalled();
  });

  test('dev-kit update replaces managed local files', async () => {
    jest.mocked(installAiDevKit).mockResolvedValueOnce({
      targetDir: tempDir,
      sourceDir: path.join(tempDir, 'source'),
      installedEntries: ['CLAUDE.md', 'tools'],
      skippedEntries: [],
      gitignorePath: path.join(tempDir, '.gitignore'),
      stagedGitignorePath: path.join(tempDir, '.gitignore.dev-kit-before-clone'),
      skillInstaller: {
        ok: true,
        status: 'installed',
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        summary: 'claude=13, codex=13, cursor=13, gemini=13',
        stdout: '[install-skills] claude: installed=13 target=.claude/skills',
        stderr: '',
      },
    });

    await runMakerCli(['dev-kit', 'update', '--target-dir', tempDir, '--env', 'rnd']);

    expect(installAiDevKit).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDir: tempDir,
        preserveExisting: false,
        replaceManagedEntries: true,
        environment: 'rnd',
      })
    );
  });

  test('doctor includes AI dev kit update state in json output', async () => {
    jest.mocked(checkAiDevKitUpdate).mockResolvedValueOnce({
      targetDir: tempDir,
      updateAvailable: true,
      installed: {
        env: 'rnd',
        version: '20260604-150856',
        source_url:
          'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/20260604-150856/ai-dev-kit.zip',
        installed_at: '2026-06-04T16:00:00.000Z',
      },
      latest: {
        version: '20260605-053736',
        md5: '6ced394e09fed25c2b946889e0171b36',
        size: 27048639,
        uploaded_at: '2026-06-05T05:37:52.000Z',
      },
    });

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd', '--json']);

    const payload = JSON.parse(stdoutSpy.mock.calls.join(''));
    expect(checkAiDevKitUpdate).toHaveBeenCalledWith(tempDir, { environment: 'rnd' });
    expect(payload.env).toBe('rnd');
    expect(payload.lua_lsp).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        setupCommand: 'taptap-maker lua-lsp setup',
      })
    );
    expect(payload.dev_kit_update).toEqual(
      expect.objectContaining({
        updateAvailable: true,
        installed: expect.objectContaining({ version: '20260604-150856' }),
        latest: expect.objectContaining({ version: '20260605-053736' }),
      })
    );
    expect(payload.package_update).toEqual(
      expect.objectContaining({
        status: 'current',
        current_version: '0.0.8',
      })
    );
  });

  test('doctor includes Maker package update status in text output', async () => {
    jest.mocked(getMakerPackageUpdateStatus).mockResolvedValueOnce({
      status: 'required_upgrade',
      current_version: '0.0.5',
      target_version: '0.0.8',
      reason: 'below_minimum_supported',
      next_action:
        'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
      restart_required: true,
    });
    jest
      .mocked(formatMakerPackageUpdateStatus)
      .mockReturnValueOnce(
        [
          'Maker MCP package update',
          '',
          '- status: required_upgrade',
          '- current_version: 0.0.5',
          '- target_version: 0.0.8',
          '- reason: below_minimum_supported',
          '- next_action: Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
          '- restart_required: yes',
        ].join('\n')
      );

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(getMakerPackageUpdateStatus).toHaveBeenCalledWith({
      currentVersion: 'dev',
      allowRemoteFetch: false,
      backgroundRefresh: false,
    });
    expect(output).toContain('Maker MCP package update');
    expect(output).toContain('- status: required_upgrade');
    expect(output).toContain('- next_action: Ask the user for approval');
    expect(output).not.toContain('taptap-maker upgrade --target-dir <PROJECT_DIR>\n\n');
  });

  test('doctor guides unbound directories to init when PAT is missing', async () => {
    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('- next_step: taptap-maker init');
    expect(output).not.toContain('- next_auth_step: taptap-maker login');
  });

  test('doctor hints to refresh the AI client when Maker tools are missing', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      project_name: 'App One',
      user_id: 'user-1',
      env: 'rnd',
    });

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker MCP tools availability');
    expect(output).toContain('- tools_visibility: refresh_ai_client_if_missing');
    expect(output).toContain('Restart the AI client or open a new AI conversation');
  });

  test('doctor warns when the AI pwd differs from the Maker project directory', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      project_name: 'App One',
      user_id: 'user-1',
      env: 'rnd',
    });

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker MCP tools availability');
    expect(output).toContain('- pwd_alignment: cwd_mismatch');
    expect(output).toContain(`- maker_project_dir: ${tempDir}`);
    expect(output).toContain(`- ai_pwd: ${process.cwd()}`);
    expect(output).toContain('Run the AI client from the Maker project directory');
  });

  test('doctor reports orphan maker proxy processes', async () => {
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === 'ps' && Array.isArray(args) && args.includes('-axo')) {
        return {
          status: 0,
          stdout: [
            '  PID  PPID  %CPU     ELAPSED COMMAND',
            '12345     1  46.0  6-01:02:03 node dist/maker.js __maker-proxy',
            '22345     1   0.1     01:02:03 taptap-maker logs watch --target-dir /tmp/game',
          ].join('\n'),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      return { status: 0, stdout: 'help output', stderr: '' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker orphan process check');
    expect(output).toContain('- pid: 12345 ppid: 1 cpu: 46.0 elapsed: 6-01:02:03');
    expect(output).not.toContain('22345');
    expect(output).toContain('- action: safe_to_kill_orphan_maker_processes');
  });

  test('subcommand --help prints usage instead of running the command', async () => {
    await runMakerCli(['init', '--help']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Usage:');
    expect(listMakerProjects).not.toHaveBeenCalled();
  });

  test('subcommand -h prints usage instead of running the command', async () => {
    await runMakerCli(['doctor', '-h']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Usage:');
    expect(output).not.toContain('TapTap Maker doctor');
  });

  test('doctor reports check_failed when the process scan cannot run', async () => {
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === 'ps' && Array.isArray(args) && args.includes('-axo')) {
        return { status: 1, stdout: '', stderr: 'ps failed' } as ReturnType<typeof spawnSync>;
      }
      return { status: 0, stdout: 'help output', stderr: '' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['doctor', '--target-dir', tempDir, '--env', 'rnd']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker orphan process check');
    expect(output).toContain('- orphan_processes: check_failed');
  });

  test('init selection index follows the recently active display order', async () => {
    jest.mocked(listMakerProjects).mockResolvedValueOnce([
      {
        id: 'older-app',
        name: 'Older App',
        lastConversationAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'recent-app',
        name: 'Recent App',
        lastConversationAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const close = jest.fn();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: jest.fn(async () => '1'),
      close,
    } as unknown as readline.Interface);

    try {
      await runMakerCli([
        'init',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'secret-maker-token',
      ]);
    } finally {
      createInterfaceSpy.mockRestore();
    }

    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'recent-app',
        targetDir: tempDir,
      })
    );
    expect(close).toHaveBeenCalled();
  });

  test('init selection prompt strongly advertises the create project option', async () => {
    jest.mocked(listMakerProjects).mockResolvedValueOnce([
      {
        id: 'app-1',
        name: 'App One',
        lastConversationAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const prompts: string[] = [];
    const close = jest.fn();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: jest.fn(async (prompt: string) => {
        prompts.push(prompt);
        return '1';
      }),
      close,
    } as unknown as readline.Interface);

    try {
      await runMakerCli([
        'init',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'secret-maker-token',
      ]);
    } finally {
      createInterfaceSpy.mockRestore();
    }

    expect(prompts[0]).toContain('0');
    expect(prompts[0]).toContain('new');
    expect(prompts[0]).toContain('创建新项目');
    expect(prompts[0]).toContain('Create a new Maker project');
    expect(close).toHaveBeenCalled();
  });

  test('init expands hidden apps via "all" before selecting by index', async () => {
    jest.mocked(listMakerProjects).mockResolvedValueOnce(
      Array.from({ length: 42 }, (_, index) => ({
        id: `app-${index + 1}`,
        name: `App ${index + 1}`,
        lastConversationAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }))
    );
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const answers = ['all', '41'];
    const close = jest.fn();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockImplementation(
      () =>
        ({
          question: jest.fn(async () => answers.shift() || '1'),
          close,
        }) as unknown as readline.Interface
    );

    try {
      await runMakerCli([
        'init',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
        '--pat',
        'secret-maker-token',
      ]);
    } finally {
      createInterfaceSpy.mockRestore();
    }

    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-2',
        targetDir: tempDir,
      })
    );
    expect(close).toHaveBeenCalledTimes(2);
  });

  test('pat set warns when PAT is passed as a positional argument', async () => {
    await runMakerCli(['pat', 'set', 'secret-maker-token']);

    expect(stderrSpy.mock.calls.join('')).toContain('exposes it via ps/shell history');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('secret-maker-token', 'production');
  });

  test('login exchanges TapTap token in the selected environment', async () => {
    await runMakerCli(['login', '--env', 'rnd']);

    expect(loginWithCliAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({
        env: 'rnd',
      })
    );
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('browser-maker-pat', 'rnd');
  });

  test('apps warns when PAT is passed with --pat', async () => {
    await runMakerCli(['apps', '--pat', 'secret-maker-token', '--json']);

    expect(stderrSpy.mock.calls.join('')).toContain('exposes it via ps/shell history');
    expect(listMakerProjects).toHaveBeenCalledWith({ pat: 'secret-maker-token' });
  });

  test('apps PAT validation failures guide CLI login', async () => {
    jest
      .mocked(listMakerProjects)
      .mockRejectedValueOnce(
        new Error('Maker project list failed: HTTP 401 {"code":"PAT_INVALID"}')
      );

    await expect(runMakerCli(['apps', '--pat', 'invalid-maker-token'])).rejects.toThrow(
      'taptap-maker login'
    );
  });

  test('apps rejects removed --limit / --offset with a guidance error', async () => {
    await expect(runMakerCli(['apps', '--offset', '40', '--limit', '40'])).rejects.toThrow(
      /no longer supports --limit \/ --offset/
    );
    expect(listMakerProjects).not.toHaveBeenCalled();
  });

  test('pat set can read PAT from stdin without argv warning', async () => {
    const readFileSyncSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValueOnce('stdin-maker-token\n');

    try {
      await runMakerCli(['pat', 'set', '--pat-stdin', '--env', 'rnd']);
    } finally {
      readFileSyncSpy.mockRestore();
    }

    expect(stderrSpy.mock.calls.join('')).not.toContain('exposes it via ps/shell history');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('stdin-maker-token', 'rnd');
  });

  test('pat set uses CLI login when no PAT is provided', async () => {
    await runMakerCli(['pat', 'set']);

    expect(cliLoginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: 'production',
      })
    );
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('browser-maker-pat', 'production');
    expect(stdoutSpy.mock.calls.join('')).toContain('Maker PAT and TapTap token saved');
  });

  test('init uses CLI login when no cached PAT exists', async () => {
    await runMakerCli(['init', '--app-id', 'app-1', '--target-dir', tempDir, '--skip-mcp-install']);

    expect(cliLoginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: 'production',
      })
    );
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('browser-maker-pat', 'production');
    expect(listMakerProjects).toHaveBeenCalledWith({ pat: 'browser-maker-pat' });
    expect(cloneMakerProject).toHaveBeenCalledWith(
      expect.objectContaining({
        pat: 'browser-maker-pat',
      })
    );
  });

  test('pat set validation failures guide CLI login', async () => {
    jest
      .mocked(requestTapAuthWithPat)
      .mockRejectedValueOnce(
        new Error('TapTap token request failed: HTTP 401 {"code":"PAT_INVALID"}')
      );

    await expect(runMakerCli(['pat', 'set', '--pat', 'invalid-maker-token'])).rejects.toThrow(
      'taptap-maker login'
    );
  });

  test('mcp verify checks the configured npx package command by default', async () => {
    await runMakerCli(['mcp', 'verify', '--json']);

    expect(spawnSyncMock).toHaveBeenCalledWith(
      expectedNpxLaunch.command,
      [...expectedNpxLaunch.args, 'help'],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual(
      expect.objectContaining({
        mode: 'npx',
        command: expect.stringContaining('@taptap/maker taptap-maker help'),
        ok: true,
      })
    );
  });

  test('mcp package override is no longer supported', async () => {
    await expect(runMakerCli(['mcp', 'verify', '--package', 'custom-package'])).rejects.toThrow(
      '@taptap/maker'
    );
  });

  test('help documents the local runtime log watcher command', async () => {
    await runMakerCli(['help']);

    expect(stdoutSpy.mock.calls.join('')).toContain('taptap-maker logs watch');
    expect(stdoutSpy.mock.calls.join('')).toContain('--interval 5s');
    expect(stdoutSpy.mock.calls.join('')).toContain('--reset');
  });

  test('help documents Python runtime commands', async () => {
    await runMakerCli(['help']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('taptap-maker python doctor');
    expect(output).toContain('taptap-maker python setup');
    expect(output).toContain('taptap-maker python path');
    expect(output).toContain('taptap-maker lua-lsp doctor');
    expect(output).toContain('taptap-maker lua-lsp setup');
  });

  test('help documents the standard init flow before create-specific flags', async () => {
    await runMakerCli(['help']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Standard init/clone/download flow: run `taptap-maker init`');
    expect(output).toContain('Create-new-project flow: add `--create --name NAME`');
    expect(output).toContain('only when the user');
    expect(output).toContain('clearly asks to create a new Maker project');
    expect(output.indexOf('Standard init/clone/download flow')).toBeLessThan(
      output.indexOf('Create-new-project flow')
    );
  });

  test('python doctor json reports missing Python without failing the CLI', async () => {
    spawnSyncMock.mockImplementation((command) => {
      if (command === 'python3' || command === 'python') {
        return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['python', 'doctor', '--json']);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload).toEqual(
      expect.objectContaining({
        ready: false,
        status: 'missing',
        setupCommand: 'taptap-maker python setup',
      })
    );
  });

  test('python path json reports missing runtime as structured JSON', async () => {
    spawnSyncMock.mockImplementation((command) => {
      if (command === 'python3' || command === 'python') {
        return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['python', 'path', '--json']);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload).toEqual(
      expect.objectContaining({
        ready: false,
        status: 'missing',
        nextAction: expect.stringContaining('taptap-maker python setup'),
      })
    );
  });

  test('python setup warns before using the official uv installer', async () => {
    process.env.TAPTAP_MAKER_PYTHON_BIN = '/opt/maker-python/bin/python3';
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === '/opt/maker-python/bin/python3' && args.includes('-c')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: '/opt/maker-python/bin/python3',
            version: '3.12.11',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === '-m pip --version') {
        return {
          status: 0,
          stdout: 'pip 25.1 from /opt/maker-python/lib/python3.12/site-packages/pip\n',
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['python', 'setup']);

    expect(stderrSpy.mock.calls.join('')).toContain(
      'may download and run the official uv installer from https://astral.sh'
    );
  });

  test('lua-lsp setup installs maker-lua-lsp for Codex Cursor and Claude', async () => {
    process.env.TAPTAP_MAKER_PYTHON_BIN = '/opt/maker-python/bin/python3';
    const venvDir = path.join(tempDir, 'maker-home', 'lua-lsp-venv');
    const venvPython = path.join(venvDir, 'bin', 'python');
    const scriptsDir = path.join(venvDir, 'bin');
    const lspCommand = path.join(scriptsDir, 'maker-lua-lsp');
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === '/opt/maker-python/bin/python3' && args.includes('-c')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: '/opt/maker-python/bin/python3',
            version: '3.12.11',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === '-m pip --version') {
        return { status: 0, stdout: 'pip 25.1\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === `-m venv ${venvDir}`) {
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.writeFileSync(venvPython, '');
        fs.writeFileSync(lspCommand, '');
        return { status: 0, stdout: 'created venv\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === venvPython && args.join(' ') === '-m pip install --upgrade maker-lua-lsp') {
        return { status: 0, stdout: 'installed\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === venvPython && args.includes('-c')) {
        return { status: 0, stdout: `${scriptsDir}\n`, stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === lspCommand && args.join(' ') === 'install --ide codex,cursor,claude') {
        return { status: 0, stdout: 'configured\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === lspCommand && args[0] === '--version') {
        return { status: 0, stdout: 'maker-lua-lsp 1.0.0\n', stderr: '' } as ReturnType<
          typeof spawnSync
        >;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['lua-lsp', 'setup', '--json']);

    const payload = JSON.parse(stdoutSpy.mock.calls.at(-1)?.[0] as string);
    expect(payload.environment).toEqual(
      expect.objectContaining({
        ready: true,
        status: 'ready',
        command: lspCommand,
      })
    );
    expect(spawnSyncMock).toHaveBeenCalledWith(
      '/opt/maker-python/bin/python3',
      ['-m', 'venv', venvDir],
      expect.any(Object)
    );
    expect(spawnSyncMock).toHaveBeenCalledWith(
      venvPython,
      ['-m', 'pip', 'install', '--upgrade', 'maker-lua-lsp'],
      expect.any(Object)
    );
    expect(spawnSyncMock).toHaveBeenCalledWith(
      lspCommand,
      ['install', '--ide', 'codex,cursor,claude'],
      expect.any(Object)
    );
  });

  test('python setup includes non-blocking Lua LSP setup result', async () => {
    process.env.TAPTAP_MAKER_PYTHON_BIN = '/opt/maker-python/bin/python3';
    const venvDir = path.join(tempDir, 'maker-home', 'lua-lsp-venv');
    const venvPython = path.join(venvDir, 'bin', 'python');
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === '/opt/maker-python/bin/python3' && args.includes('-c')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: '/opt/maker-python/bin/python3',
            version: '3.12.11',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === '-m pip --version') {
        return { status: 0, stdout: 'pip 25.1\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === `-m venv ${venvDir}`) {
        fs.mkdirSync(path.dirname(venvPython), { recursive: true });
        fs.writeFileSync(venvPython, '');
        return { status: 0, stdout: 'created venv\n', stderr: '' } as ReturnType<typeof spawnSync>;
      }
      if (command === venvPython && args.join(' ') === '-m pip install --upgrade maker-lua-lsp') {
        return { status: 1, stdout: '', stderr: 'lsp package failed' } as ReturnType<
          typeof spawnSync
        >;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['python', 'setup', '--json']);

    const payload = JSON.parse(stdoutSpy.mock.calls.at(-1)?.[0] as string);
    expect(payload.environment).toEqual(expect.objectContaining({ ready: true }));
    expect(payload.luaLsp.environment).toEqual(
      expect.objectContaining({
        ready: false,
        status: 'setup_failed',
        error: expect.stringContaining('lsp package failed'),
      })
    );
  });

  test('python path prints only the trusted Python executable path', async () => {
    process.env.TAPTAP_MAKER_PYTHON_BIN = '/opt/maker-python/bin/python3';
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === '/opt/maker-python/bin/python3' && args.includes('-c')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            executable: '/opt/maker-python/bin/python3',
            version: '3.13.3',
          }),
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      if (command === '/opt/maker-python/bin/python3' && args.join(' ') === '-m pip --version') {
        return {
          status: 0,
          stdout: 'pip 25.1 from /opt/maker-python/lib/python3.13/site-packages/pip\n',
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
      return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
    });

    await runMakerCli(['python', 'path']);

    expect(stdoutSpy.mock.calls.join('')).toBe('/opt/maker-python/bin/python3\n');
  });

  test('mcp verify explains null status as local startup failure before Maker MCP starts', async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
      error: undefined,
    } as ReturnType<typeof spawnSync>);

    await runMakerCli(['mcp', 'verify']);

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('MCP config command check failed before Maker MCP started');
    expect(output).toContain('- failure_type: unknown_no_status');
    expect(output).toContain('local Node/npm/npx startup check');
    expect(output).toContain('Run the command above directly');
    expect(output).not.toContain('MCP config command spawn failed');
  });

  test('mcp verify json classifies non-zero npx exit without treating it as MCP startup', async () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      signal: null,
      stdout: '',
      stderr: 'npm error network timeout',
      error: undefined,
    } as ReturnType<typeof spawnSync>);

    await runMakerCli(['mcp', 'verify', '--json']);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual(
      expect.objectContaining({
        ok: false,
        status: 1,
        failure_type: 'non_zero_exit',
        is_maker_mcp_started: false,
        stderr: 'npm error network timeout',
      })
    );
  });

  test('unknown command errors do not include raw argv tokens', async () => {
    await expect(runMakerCli(['pat', 'secret-maker-token'])).rejects.toThrow(
      'Unknown taptap-maker command: pat <redacted>'
    );
    await expect(runMakerCli(['pat', 'secret-maker-token'])).rejects.not.toThrow(
      'secret-maker-token'
    );
  });

  test('interactive PAT prompt does not use masking implementation', () => {
    const commandSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'maker', 'cli', 'commands.ts'),
      'utf8'
    );

    expect(commandSource).not.toContain('mask: true');
    expect(commandSource).not.toContain('createMaskedPromptOutput');
  });
});
