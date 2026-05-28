/**
 * Maker CLI command behavior tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { requestTapAuthWithPat } from '../maker/auth/patTap';
import { cloneMakerProject, listMakerProjects } from '../maker/cli/projects';
import { inspectAiDevKit, installAiDevKit, installAiDevKitSkills } from '../maker/cli/devKit';
import { runMakerCli } from '../maker/cli/commands';

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

jest.mock('../maker/cli/projects', () => ({
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
  const originalStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let homedirSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  const spawnSyncMock = jest.mocked(spawnSync);

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-cli-commands-'));
    process.env.HOME = tempDir;
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tempDir);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
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
    if (originalStdinIsTty) {
      Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTty);
    } else {
      delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
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
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
    expect(text).toContain('[mcp_servers."other".env]');
    expect(text).toContain('KEEP = "yes"');
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

  test('init prints the PAT creation URL before prompting interactively', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const close = jest.fn();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: jest.fn(async () => 'secret-maker-token'),
      close,
    } as unknown as readline.Interface);

    try {
      await runMakerCli([
        'init',
        '--app-id',
        'app-1',
        '--target-dir',
        tempDir,
        '--skip-mcp-install',
      ]);
    } finally {
      createInterfaceSpy.mockRestore();
    }

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Maker PAT is required');
    expect(output).toContain('Create one at: https://maker.taptap.cn/pat-tokens');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('secret-maker-token');
  });

  test('init PAT validation failures include the PAT URL', async () => {
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
    ).rejects.toThrow('https://maker.taptap.cn/pat-tokens');
  });

  test('init Chinese PAT validation failures include the PAT URL', async () => {
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
    ).rejects.toThrow('https://maker.taptap.cn/pat-tokens');
  });

  test('init clone auth failures include the PAT URL', async () => {
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
    ).rejects.toThrow('https://maker.taptap.cn/pat-tokens');
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

  test('init runs and prints AI skill installer result when dev kit is already present', async () => {
    jest.mocked(inspectAiDevKit).mockReturnValueOnce({
      targetDir: tempDir,
      requiredEntries: ['CLAUDE.md', 'examples', 'templates', 'urhox-libs'],
      presentEntries: ['CLAUDE.md', 'examples', 'templates', 'urhox-libs'],
      missingEntries: [],
      ready: true,
    });
    jest.mocked(installAiDevKitSkills).mockImplementationOnce((_targetDir, options) => {
      options?.onStart?.({
        platform: process.platform,
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        cwd: path.join(tempDir, 'tools'),
        command: ['bash', path.join(tempDir, 'tools', 'install-skills.sh'), 'all'],
      });
      return {
        ok: true,
        status: 'installed',
        script: path.join(tempDir, 'tools', 'install-skills.sh'),
        summary: 'claude=13, codex=13, cursor=13, gemini=13',
        stdout: '[install-skills] claude: installed=13 target=.claude/skills',
        stderr: '',
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
    expect(output).toContain('AI dev kit already present');
    expect(output).toContain('AI skills install started');
    expect(output).toContain('AI skills install result: claude=13, codex=13, cursor=13, gemini=13');
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
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('secret-maker-token');
  });

  test('apps warns when PAT is passed with --pat', async () => {
    await runMakerCli(['apps', '--pat', 'secret-maker-token', '--json']);

    expect(stderrSpy.mock.calls.join('')).toContain('exposes it via ps/shell history');
    expect(listMakerProjects).toHaveBeenCalledWith({ pat: 'secret-maker-token' });
  });

  test('apps PAT validation failures include the PAT URL', async () => {
    jest
      .mocked(listMakerProjects)
      .mockRejectedValueOnce(
        new Error('Maker project list failed: HTTP 401 {"code":"PAT_INVALID"}')
      );

    await expect(runMakerCli(['apps', '--pat', 'invalid-maker-token'])).rejects.toThrow(
      'https://maker.taptap.cn/pat-tokens'
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
      await runMakerCli(['pat', 'set', '--pat-stdin']);
    } finally {
      readFileSyncSpy.mockRestore();
    }

    expect(stderrSpy.mock.calls.join('')).not.toContain('exposes it via ps/shell history');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('stdin-maker-token');
  });

  test('pat set prints the PAT creation URL before prompting interactively', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const close = jest.fn();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: jest.fn(async () => 'secret-maker-token'),
      close,
    } as unknown as readline.Interface);

    try {
      await runMakerCli(['pat', 'set']);
    } finally {
      createInterfaceSpy.mockRestore();
    }

    const output = stdoutSpy.mock.calls.join('');
    expect(output).toContain('Create one at: https://maker.taptap.cn/pat-tokens');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('secret-maker-token');
    expect(close).toHaveBeenCalled();
  });

  test('pat set validation failures include the PAT URL', async () => {
    jest
      .mocked(requestTapAuthWithPat)
      .mockRejectedValueOnce(
        new Error('TapTap token request failed: HTTP 401 {"code":"PAT_INVALID"}')
      );

    await expect(runMakerCli(['pat', 'set', '--pat', 'invalid-maker-token'])).rejects.toThrow(
      'https://maker.taptap.cn/pat-tokens'
    );
  });

  test('mcp verify checks the configured npx package command by default', async () => {
    await runMakerCli(['mcp', 'verify', '--json']);

    expect(spawnSyncMock).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['-y', '-p', '@taptap/instant-games-open-mcp', 'taptap-maker', 'help'],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual(
      expect.objectContaining({
        mode: 'npx',
        command: expect.stringContaining('@taptap/instant-games-open-mcp taptap-maker help'),
        ok: true,
      })
    );
  });

  test('help documents the local runtime log watcher command', async () => {
    await runMakerCli(['help']);

    expect(stdoutSpy.mock.calls.join('')).toContain('taptap-maker logs watch');
    expect(stdoutSpy.mock.calls.join('')).toContain('--interval 5s');
    expect(stdoutSpy.mock.calls.join('')).toContain('--reset');
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
