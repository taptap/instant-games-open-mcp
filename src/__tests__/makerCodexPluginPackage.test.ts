/**
 * Codex plugin packaging contract for the standalone Maker distribution.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '../..');
const versionPolicy = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
) as { latest: string };
const makerVersion = versionPolicy.latest;
const makerSourceUrl = 'https://github.com/taptap/instant-games-open-mcp/tree/main/src/maker';

describe('TapTap Maker Codex plugin package', () => {
  let tempDir: string;
  let pluginRoot: string;
  let repositoryBundleMtimeNs: bigint | undefined;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-codex-plugin-package-'));
    pluginRoot = path.join(tempDir, 'taptap-maker');
    const repositoryBundle = path.join(projectRoot, 'dist', 'maker.js');
    repositoryBundleMtimeNs = fs.existsSync(repositoryBundle)
      ? fs.statSync(repositoryBundle, { bigint: true }).mtimeNs
      : undefined;
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-maker-codex-plugin.js', '--output-dir', pluginRoot],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );
    if (result.status !== 0) {
      throw new Error(`Plugin preparation failed:\n${result.stdout}\n${result.stderr}`);
    }
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses the exact Maker release identity and plugin metadata', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')
    );

    expect(manifest).toEqual(
      expect.objectContaining({
        name: 'taptap-maker',
        version: makerVersion,
        homepage: makerSourceUrl,
        repository: makerSourceUrl,
        skills: './skills/',
        mcpServers: './.mcp.json',
        author: { name: 'TapTap Team' },
      })
    );
    expect(manifest.interface).toEqual(
      expect.objectContaining({
        displayName: 'TapTap Maker',
        developerName: 'TapTap Team',
        category: 'Developer Tools',
        brandColor: '#16B8C4',
        websiteURL: makerSourceUrl,
        composerIcon: './assets/taptap-maker.png',
        logo: './assets/taptap-maker.png',
        logoDark: './assets/taptap-maker.png',
      })
    );
  });

  test('offers only create and sync starter prompts with an empty-directory requirement', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')
    );

    expect(manifest.interface.defaultPrompt).toEqual([
      '快速创建一个新的 TapTap Maker 项目。必须先在 Codex 中选择并打开一个空目录。',
      '同步 TapTap Maker 游戏到本地继续开发。必须先在 Codex 中选择并打开一个空目录。',
    ]);
  });

  test('bundles the shared transparent Maker icon asset', () => {
    const iconPath = path.join(pluginRoot, 'assets', 'taptap-maker.png');

    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.readFileSync(iconPath).subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  test('keeps a dedicated README at the public Maker source URL', () => {
    const readmePath = path.join(projectRoot, 'src', 'maker', 'README.md');

    expect(fs.existsSync(readmePath)).toBe(true);
    expect(fs.readFileSync(readmePath, 'utf8')).toContain('# TapTap Maker MCP');
  });

  test('launches the bundled runtime from the plugin root without npm or npx', () => {
    const mcpText = fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8');
    const mcp = JSON.parse(mcpText);
    const pluginServer = mcp.mcpServers['taptap-maker-plugin'];

    expect(pluginServer).toEqual({
      command: 'node',
      args: ['./dist/maker.js'],
      cwd: '.',
      env: {
        TAPTAP_MAKER_DISTRIBUTION: 'codex_plugin',
        TAPTAP_MCP_CLIENT_IDE: 'codex',
      },
    });
    expect(fs.existsSync(path.resolve(pluginRoot, pluginServer.cwd))).toBe(true);
    expect(mcp.mcpServers['taptap-maker']).toBeUndefined();
    expect(mcpText).not.toMatch(/\b(?:npm|npx)\b/i);
  });

  test('publishes the plugin under the Developer Tools marketplace category', () => {
    const marketplace = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8')
    );
    const entry = marketplace.plugins.find(
      (plugin: { name?: string }) => plugin.name === 'taptap-maker'
    );

    expect(entry?.category).toBe('Developer Tools');
  });

  test('contains the runtime, CLI, skills, and troubleshooting documentation', () => {
    const requiredPaths = [
      'dist/maker.js',
      'bin/taptap-maker',
      'skills/taptap-maker-local/SKILL.md',
      'skills/taptap-maker-dev-kit-guide/SKILL.md',
      'skills/update-taptap-mcp/SKILL.md',
      'skills/taptap-maker-plugin-lifecycle/SKILL.md',
      'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md',
      'README.md',
    ];

    for (const relativePath of requiredPaths) {
      expect(fs.existsSync(path.join(pluginRoot, relativePath))).toBe(true);
    }
    const bundledRuntime = fs.readFileSync(path.join(pluginRoot, 'dist', 'maker.js'), 'utf8');
    expect(bundledRuntime).toContain(`// TapTap Maker MCP version: ${makerVersion}`);
  });

  test('builds entirely in the requested output directory', () => {
    const repositoryBundle = path.join(projectRoot, 'dist', 'maker.js');
    expect(fs.existsSync(path.join(pluginRoot, 'dist', 'maker.js'))).toBe(true);
    expect(
      fs.existsSync(repositoryBundle)
        ? fs.statSync(repositoryBundle, { bigint: true }).mtimeNs
        : undefined
    ).toBe(repositoryBundleMtimeNs);
  });

  test('updates through the Codex marketplace without invoking the standalone npm upgrader', () => {
    const updateSkill = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'update-taptap-mcp', 'SKILL.md'),
      'utf8'
    );

    expect(updateSkill).toContain('Codex marketplace');
    expect(updateSkill).not.toMatch(/(?:^|\s)npx\s+-/mu);
    expect(updateSkill).not.toContain('taptap-maker upgrade');
  });
});
