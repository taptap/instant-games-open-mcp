/**
 * Maker CLI command behavior tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { requestTapAuthWithPat } from '../maker/auth/patTap';
import { cloneMakerProject, listMakerProjects } from '../maker/cli/projects';
import { createMaskedPromptOutput, runMakerCli } from '../maker/cli/commands';

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
    expect(text.match(/\[mcp_servers\."taptap-maker"\.env\]/g)).toHaveLength(1);
    expect(text).toContain('TAPTAP_MCP_ENV = "rnd"');
    expect(text).toContain('[mcp_servers."other".env]');
    expect(text).toContain('KEEP = "yes"');
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

  test('pat set warns when PAT is passed as a positional argument', async () => {
    await runMakerCli(['pat', 'set', 'secret-maker-token']);

    expect(stderrSpy.mock.calls.join('')).toContain('exposes it via ps/shell history');
    expect(requestTapAuthWithPat).toHaveBeenCalledWith('secret-maker-token');
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

  test('masked prompt output does not echo input text', (done) => {
    const chunks: string[] = [];
    const maskedOutput = createMaskedPromptOutput();
    const source = ReadableText('interactive-maker-token');

    source.pipe(maskedOutput as Writable);
    maskedOutput.on('finish', () => {
      expect(chunks).toEqual([]);
      done();
    });
    maskedOutput.on('data', (chunk) => chunks.push(String(chunk)));
  });
});

function ReadableText(text: string): NodeJS.ReadableStream {
  return Readable.from([text]);
}
