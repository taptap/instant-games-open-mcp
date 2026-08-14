import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  createDshMakerPluginConfig,
  getDshHome,
  getDshMcpInstallPaths,
  mergeDshMakerMcpConfig,
} from '../maker/cli/dshMcpConfig';

describe('DSH Maker MCP config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-dsh-config-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('round-trips Windows launcher paths and Unicode without a shell or cwd', () => {
    const configPath = path.join(tempDir, 'cordis.patch.yml');
    const desired = createDshMakerPluginConfig({
      mcpName: 'taptap-maker',
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\测试用户\\.taptap-maker\\mcp-runtime\\0.0.31\\dist\\maker.js'],
      env: { TAPTAP_MCP_CLIENT_IDE: 'dsh' },
    });

    mergeDshMakerMcpConfig(configPath, desired);

    const serialized = fs.readFileSync(configPath, 'utf8');
    expect(parseYaml(serialized)).toEqual([{ insert: [desired] }]);
    expect(serialized).toContain('- insert:');
    expect(serialized).toContain('    - id: mcp-taptap-maker');
    expect(serialized).not.toContain('cmd.exe');
    expect(serialized).not.toContain('powershell');
    expect(serialized).not.toContain('cwd:');

    const patches = parseYaml(serialized) as Array<{ insert?: unknown[] }>;
    const composedFromEmpty = patches.flatMap((patch) => patch.insert || []);
    expect(composedFromEmpty).toEqual([desired]);
  });

  test('expands every tilde form supported by DSH_HOME', () => {
    expect(getDshHome({ homeDir: tempDir, environment: { DSH_HOME: '~' } })).toBe(tempDir);
    expect(getDshHome({ homeDir: tempDir, environment: { DSH_HOME: '~/.custom-dsh' } })).toBe(
      path.join(tempDir, '.custom-dsh')
    );
    expect(getDshHome({ homeDir: tempDir, environment: { DSH_HOME: '~\\custom-dsh' } })).toBe(
      path.join(tempDir, 'custom-dsh')
    );
  });

  test('leaves malformed YAML untouched and does not create a backup', () => {
    const configPath = path.join(tempDir, 'cordis.patch.yml');
    const original = '- id: broken\n  config: [\n';
    fs.writeFileSync(configPath, original, 'utf8');

    expect(() =>
      mergeDshMakerMcpConfig(
        configPath,
        createDshMakerPluginConfig({
          mcpName: 'taptap-maker',
          command: process.execPath,
          args: ['maker.js'],
        })
      )
    ).toThrow('Invalid YAML');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(original);
    expect(fs.existsSync(`${configPath}.taptap-maker.bak.latest`)).toBe(false);
  });

  test('strictly scans every profile before choosing the home patch', () => {
    const dshHome = path.join(tempDir, '.dsh');
    const profilesDir = path.join(dshHome, 'profiles');
    const desired = createDshMakerPluginConfig({
      mcpName: 'taptap-maker',
      command: process.execPath,
      args: ['maker.js'],
    });
    for (let index = 0; index < 51; index += 1) {
      const profileDir = path.join(profilesDir, `profile-${String(index).padStart(2, '0')}`);
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n', 'utf8');
    }
    const existingProfilePatch = path.join(profilesDir, 'profile-50', 'cordis.patch.yml');
    mergeDshMakerMcpConfig(existingProfilePatch, desired);

    expect(
      getDshMcpInstallPaths({
        homeDir: tempDir,
        environment: { DSH_HOME: dshHome },
        mcpName: 'taptap-maker',
      })
    ).toEqual([existingProfilePatch]);
  });

  test('fails closed when profiles cannot be enumerated during installation', () => {
    const dshHome = path.join(tempDir, '.dsh');
    const profilesDir = path.join(dshHome, 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    const originalReaddirSync = fs.readdirSync;
    const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(((target, options) => {
      if (path.resolve(String(target)) === profilesDir) {
        throw new Error('permission denied');
      }
      return originalReaddirSync(target, options as never);
    }) as typeof fs.readdirSync);

    try {
      expect(() =>
        getDshMcpInstallPaths({
          homeDir: tempDir,
          environment: { DSH_HOME: dshHome },
          mcpName: 'taptap-maker',
        })
      ).toThrow('permission denied');
    } finally {
      readdirSpy.mockRestore();
    }
  });
});
