/**
 * Maker Codex plugin legacy MCP migration tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inspectCodexLegacyMakerMcp,
  migrateCodexLegacyMakerMcp,
  restoreCodexLegacyMakerMcp,
} from '../maker/cli/pluginMigration';

describe('Maker Codex plugin migration', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-plugin-migration-'));
    configPath = path.join(tempDir, '.codex', 'config.toml');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(content: string): void {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, content, 'utf8');
  }

  test('reports a missing legacy Codex Maker MCP registration', () => {
    expect(inspectCodexLegacyMakerMcp({ configPath })).toEqual({
      client: 'codex',
      status: 'not_found',
      config_path: configPath,
      registration_count: 0,
    });
  });

  test('reports an active bare Maker MCP registration and preserves nested tables', () => {
    writeConfig(
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.taptap-maker]',
        'command = "/opt/homebrew/bin/node"',
        'args = ["/tmp/maker.js"]',
        '',
        '[mcp_servers.taptap-maker.env]',
        'TAPTAP_MCP_CLIENT_IDE = "codex"',
        '',
        '[mcp_servers.other]',
        'command = "other-mcp"',
        '',
      ].join('\n')
    );

    expect(inspectCodexLegacyMakerMcp({ configPath })).toEqual({
      client: 'codex',
      status: 'active',
      config_path: configPath,
      registration_count: 1,
      enabled: true,
    });
  });

  test('reports an explicitly disabled quoted Maker MCP registration', () => {
    writeConfig(
      [
        '[mcp_servers."taptap-maker"]',
        'command = "node"',
        'args = ["/tmp/maker.js"]',
        'enabled = false',
        '',
      ].join('\n')
    );

    expect(inspectCodexLegacyMakerMcp({ configPath })).toEqual({
      client: 'codex',
      status: 'disabled',
      config_path: configPath,
      registration_count: 1,
      enabled: false,
    });
  });

  test('reports equivalent duplicate Maker MCP registration tables as ambiguous', () => {
    writeConfig(
      [
        '[mcp_servers.taptap-maker]',
        'command = "node"',
        '',
        '[mcp_servers."taptap-maker"]',
        'command = "node"',
        '',
      ].join('\n')
    );

    expect(inspectCodexLegacyMakerMcp({ configPath })).toEqual({
      client: 'codex',
      status: 'ambiguous',
      config_path: configPath,
      registration_count: 2,
    });
  });

  test('ignores Maker table-like text inside TOML multiline strings', () => {
    writeConfig(
      [
        'instructions = """',
        '[mcp_servers.taptap-maker]',
        'command = "not-a-real-server"',
        '"""',
        '',
        '[mcp_servers.taptap-maker]',
        'command = "node"',
        'args = ["/tmp/maker.js"]',
        '',
      ].join('\n')
    );

    expect(inspectCodexLegacyMakerMcp({ configPath })).toEqual({
      client: 'codex',
      status: 'active',
      config_path: configPath,
      registration_count: 1,
      enabled: true,
    });

    migrateCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: true });
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
      'instructions = """\n[mcp_servers.taptap-maker]\ncommand = "not-a-real-server"\n"""'
    );
  });

  test('requires explicit confirmation before disabling an active legacy registration', () => {
    writeConfig(
      ['[mcp_servers.taptap-maker]', 'command = "node"', 'args = ["/tmp/maker.js"]', ''].join('\n')
    );

    expect(() =>
      migrateCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: false })
    ).toThrow('requires explicit confirmation');
    expect(fs.readFileSync(configPath, 'utf8')).not.toContain('enabled = false');
  });

  test('disables one active registration while preserving nested and unrelated config', () => {
    const original = [
      'model = "gpt-5"',
      '',
      '[mcp_servers.taptap-maker]',
      'command = "/opt/homebrew/bin/node"',
      'args = ["/tmp/maker.js"]',
      '',
      '[mcp_servers.taptap-maker.env]',
      'TAPTAP_MCP_CLIENT_IDE = "codex"',
      '',
      '[mcp_servers.other]',
      'command = "other-mcp"',
      '',
    ].join('\n');
    writeConfig(original);

    const result = migrateCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({
      client: 'codex',
      status: 'disabled',
      action: 'disabled',
      changed: true,
      config_path: configPath,
      registration_count: 1,
      enabled: false,
    });
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
      '[mcp_servers.taptap-maker]\nenabled = false\ncommand = "/opt/homebrew/bin/node"'
    );
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
      '[mcp_servers.taptap-maker.env]\nTAPTAP_MCP_CLIENT_IDE = "codex"'
    );
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
      '[mcp_servers.other]\ncommand = "other-mcp"'
    );
    expect(fs.readFileSync(`${configPath}.taptap-maker.bak.latest`, 'utf8')).toBe(original);
    expect(JSON.parse(fs.readFileSync(result.state_path!, 'utf8'))).toMatchObject({
      schema_version: 2,
      client: 'codex',
      config_path: configPath,
      previous_enabled: 'implicit',
      original_registration_sha256: expect.any(String),
      migrated_registration_sha256: expect.any(String),
    });
  });

  test('is a no-op on repeated migration and does not replace the first backup', () => {
    const original = [
      '[mcp_servers."taptap-maker"]',
      'command = "node"',
      'enabled = true',
      '',
    ].join('\n');
    writeConfig(original);

    const first = migrateCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });
    const migrated = fs.readFileSync(configPath, 'utf8');
    const second = migrateCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(first.changed).toBe(true);
    expect(second).toMatchObject({ action: 'already_migrated', changed: false });
    expect(fs.readFileSync(configPath, 'utf8')).toBe(migrated);
    expect(fs.readFileSync(`${configPath}.taptap-maker.bak.latest`, 'utf8')).toBe(original);
  });

  test('does not claim a legacy registration that was already disabled by the user', () => {
    writeConfig(
      ['[mcp_servers.taptap-maker]', 'command = "node"', 'enabled = false', ''].join('\n')
    );

    const result = migrateCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'already_disabled', changed: false });
    expect(result.state_path).toBeUndefined();
    expect(fs.existsSync(`${configPath}.taptap-maker.bak.latest`)).toBe(false);
  });

  test('requires explicit confirmation before restoring an owned migration', () => {
    writeConfig(
      ['[mcp_servers.taptap-maker]', 'command = "node"', 'args = ["/tmp/maker.js"]', ''].join('\n')
    );
    migrateCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: true });

    expect(() =>
      restoreCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: false })
    ).toThrow('requires explicit confirmation');
    expect(inspectCodexLegacyMakerMcp({ configPath }).status).toBe('disabled');
  });

  test('restores an implicit enabled state and preserves later unrelated config edits', () => {
    const original = [
      '[mcp_servers.taptap-maker]',
      'command = "node"',
      'args = ["/tmp/maker.js"]',
      '',
    ].join('\n');
    writeConfig(original);
    const migrated = migrateCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });
    fs.appendFileSync(configPath, '\n[notice]\nhide_rate_limit_model_nudge = true\n', 'utf8');

    const result = restoreCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({
      client: 'codex',
      status: 'active',
      action: 'restored',
      changed: true,
      enabled: true,
    });
    const restored = fs.readFileSync(configPath, 'utf8');
    expect(restored).not.toContain('enabled = false');
    expect(restored).toContain('[notice]\nhide_rate_limit_model_nudge = true');
    expect(fs.existsSync(migrated.state_path!)).toBe(false);
  });

  test('restores an explicit enabled true value', () => {
    writeConfig(
      ['[mcp_servers."taptap-maker"]', 'command = "node"', 'enabled = true', ''].join('\n')
    );
    migrateCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: true });

    const result = restoreCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'restored', changed: true, enabled: true });
    expect(fs.readFileSync(configPath, 'utf8')).toContain('enabled = true');
  });

  test('does not enable a user-disabled registration without migration ownership', () => {
    writeConfig(
      ['[mcp_servers.taptap-maker]', 'command = "node"', 'enabled = false', ''].join('\n')
    );

    const result = restoreCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'not_owned', changed: false, status: 'disabled' });
    expect(fs.readFileSync(configPath, 'utf8')).toContain('enabled = false');
  });

  test('does not restore a different registration that replaced the migrated table', () => {
    writeConfig(
      ['[mcp_servers.taptap-maker]', 'command = "node"', 'args = ["/original/maker.js"]', ''].join(
        '\n'
      )
    );
    migrateCodexLegacyMakerMcp({ configPath, makerHome: tempDir, confirm: true });
    writeConfig(
      [
        '[mcp_servers.taptap-maker]',
        'command = "other-runtime"',
        'args = ["/replacement/server.js"]',
        'enabled = false',
        '',
      ].join('\n')
    );

    const result = restoreCodexLegacyMakerMcp({
      configPath,
      makerHome: tempDir,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'not_owned', changed: false, status: 'disabled' });
    expect(fs.readFileSync(configPath, 'utf8')).toContain('command = "other-runtime"');
    expect(fs.readFileSync(configPath, 'utf8')).toContain('enabled = false');
  });
});
