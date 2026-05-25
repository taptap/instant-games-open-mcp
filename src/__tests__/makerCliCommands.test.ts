/**
 * Maker CLI command behavior tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requestTapAuthWithPat } from '../maker/auth/patTap';
import { runMakerCli } from '../maker/cli/commands';

jest.mock('../maker/auth/patTap', () => ({
  requestTapAuthWithPat: jest.fn(async () => ({
    kid: 'kid-1234567890',
    token: 'tap-token',
    mac_key: 'mac-key',
  })),
}));

describe('Maker CLI commands', () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
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
});
