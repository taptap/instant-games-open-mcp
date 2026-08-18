/**
 * WorkBuddy plugin migration tests for standalone Maker MCP registrations.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inspectWorkBuddyLegacyMakerMcp,
  migrateWorkBuddyLegacyMakerMcp,
  restoreWorkBuddyLegacyMakerMcp,
} from '../maker/cli/pluginMigration';

describe('Maker WorkBuddy plugin migration', () => {
  let tempDir: string;
  let makerHome: string;
  let primaryPath: string;
  let legacyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-workbuddy-plugin-migration-'));
    makerHome = path.join(tempDir, 'maker-home');
    primaryPath = path.join(tempDir, '.workbuddy', 'mcp.json');
    legacyPath = path.join(tempDir, '.workbuddy', '.mcp.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(configPath: string, config: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  function inspect() {
    return inspectWorkBuddyLegacyMakerMcp({ configPaths: [primaryPath, legacyPath] });
  }

  test('reports no registration while preferring the official config path', () => {
    expect(inspect()).toEqual({
      client: 'workbuddy',
      status: 'not_found',
      config_path: primaryPath,
      config_paths: [],
      registration_count: 0,
    });
  });

  test('finds an active registration in the legacy config', () => {
    writeConfig(legacyPath, {
      mcpServers: {
        'connector-proxy': { type: 'http', url: 'http://127.0.0.1:1/mcp' },
        'taptap-maker': { command: 'npx', args: ['-y', '@taptap/maker'] },
      },
    });

    expect(inspect()).toEqual({
      client: 'workbuddy',
      status: 'active',
      config_path: legacyPath,
      config_paths: [legacyPath],
      registration_count: 1,
      enabled: true,
    });
  });

  test('treats disabled false as active and disabled true as disabled', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node', disabled: false } },
    });
    expect(inspect()).toMatchObject({ status: 'active', enabled: true });

    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node', disabled: true } },
    });
    expect(inspect()).toMatchObject({ status: 'disabled', enabled: false });
  });

  test('refuses to choose when both WorkBuddy config files register Maker', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node', disabled: false } },
    });
    writeConfig(legacyPath, {
      mcpServers: { 'taptap-maker': { command: 'npx', disabled: true } },
    });

    expect(inspect()).toEqual({
      client: 'workbuddy',
      status: 'ambiguous',
      config_path: primaryPath,
      config_paths: [primaryPath, legacyPath],
      registration_count: 2,
    });
  });

  test('requires confirmation before disabling an active registration', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node', disabled: false } },
    });

    expect(() =>
      migrateWorkBuddyLegacyMakerMcp({
        configPaths: [primaryPath, legacyPath],
        makerHome,
        confirm: false,
      })
    ).toThrow('requires explicit confirmation');
    expect(inspect()).toMatchObject({ status: 'active' });
  });

  test('disables only Maker, writes a backup, and records restoration ownership', () => {
    const original = {
      mcpServers: {
        'connector-proxy': { type: 'http', url: 'http://127.0.0.1:1/mcp' },
        'taptap-maker': {
          command: 'npx',
          args: ['-y', '-p', '@taptap/maker', 'taptap-maker'],
          disabled: false,
        },
      },
      customSetting: true,
    };
    writeConfig(primaryPath, original);

    const result = migrateWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });

    expect(result).toMatchObject({
      client: 'workbuddy',
      status: 'disabled',
      action: 'disabled',
      changed: true,
      config_path: primaryPath,
      registration_count: 1,
      enabled: false,
    });
    const migrated = JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
    expect(migrated.mcpServers['taptap-maker']).toEqual({
      ...original.mcpServers['taptap-maker'],
      disabled: true,
    });
    expect(migrated.mcpServers['connector-proxy']).toEqual(original.mcpServers['connector-proxy']);
    expect(migrated.customSetting).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${primaryPath}.taptap-maker.bak.latest`, 'utf8'))).toEqual(
      original
    );
    expect(JSON.parse(fs.readFileSync(result.state_path!, 'utf8'))).toMatchObject({
      schema_version: 1,
      client: 'workbuddy',
      config_path: primaryPath,
      previous_disabled: false,
      original_registration_sha256: expect.any(String),
      migrated_registration_sha256: expect.any(String),
    });
  });

  test('repeated migration is a no-op and preserves the original backup', () => {
    writeConfig(legacyPath, {
      mcpServers: { 'taptap-maker': { command: 'npx' } },
    });
    const options = {
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    };

    const first = migrateWorkBuddyLegacyMakerMcp(options);
    const backup = fs.readFileSync(`${legacyPath}.taptap-maker.bak.latest`, 'utf8');
    const second = migrateWorkBuddyLegacyMakerMcp(options);

    expect(first.changed).toBe(true);
    expect(second).toMatchObject({ action: 'already_migrated', changed: false });
    expect(fs.readFileSync(`${legacyPath}.taptap-maker.bak.latest`, 'utf8')).toBe(backup);
  });

  test('does not claim a registration already disabled outside the plugin', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node', disabled: true } },
    });

    const result = migrateWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'already_disabled', changed: false });
    expect(result.state_path).toBeUndefined();
    expect(fs.existsSync(`${primaryPath}.taptap-maker.bak.latest`)).toBe(false);
  });

  test('restores the previous disabled value and preserves later unrelated edits', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node' } },
      before: true,
    });
    const migrated = migrateWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });
    const config = JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
    config.after = true;
    writeConfig(primaryPath, config);

    const result = restoreWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'restored', changed: true, status: 'active' });
    const restored = JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
    expect(restored.mcpServers['taptap-maker']).toEqual({ command: 'node' });
    expect(restored).toMatchObject({ before: true, after: true });
    expect(fs.existsSync(migrated.state_path!)).toBe(false);
  });

  test('refuses to restore a registration changed after plugin migration', () => {
    writeConfig(primaryPath, {
      mcpServers: { 'taptap-maker': { command: 'node' } },
    });
    migrateWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });
    writeConfig(primaryPath, {
      mcpServers: {
        'taptap-maker': { command: 'custom-node', args: ['custom.js'], disabled: true },
      },
    });

    const result = restoreWorkBuddyLegacyMakerMcp({
      configPaths: [primaryPath, legacyPath],
      makerHome,
      confirm: true,
    });

    expect(result).toMatchObject({ action: 'not_owned', changed: false });
    expect(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).mcpServers['taptap-maker']).toEqual({
      command: 'custom-node',
      args: ['custom.js'],
      disabled: true,
    });
  });
});
