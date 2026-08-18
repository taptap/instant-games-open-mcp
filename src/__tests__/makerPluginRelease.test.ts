/**
 * Release contract for independently versioned Maker client plugins.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '../..');

describe('TapTap Maker plugin release version', () => {
  test('keeps a stable plugin version independently from the embedded Maker MCP', () => {
    const pluginPolicy = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'config', 'maker-plugin-version.json'), 'utf8')
    );

    expect(pluginPolicy).toEqual({
      schema_version: 1,
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
  });

  test.each([
    ['none', '0.0.1'],
    ['maker-plugin-v0.0.1', '0.0.2'],
    ['maker-plugin-v0.0.29', '0.0.30'],
  ])('resolves the next patch after %s as %s', (latestTag, expectedVersion) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/resolve-maker-plugin-version.js', '--latest-tag', latestTag, '--json'],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      latest_tag: latestTag === 'none' ? null : latestTag,
      version: expectedVersion,
      tag: `maker-plugin-v${expectedVersion}`,
    });
  });

  test('rejects a tag outside the Maker plugin release namespace', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/resolve-maker-plugin-version.js', '--latest-tag', 'v1.24.11', '--json'],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid Maker plugin release tag');
  });

  test('updates only the plugin version source', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-plugin-version-'));
    const policyPath = path.join(tempDir, 'maker-plugin-version.json');
    fs.writeFileSync(policyPath, '{"schema_version":1,"version":"0.0.1"}\n', 'utf8');

    const result = spawnSync(
      process.execPath,
      ['scripts/update-maker-plugin-version.js', '--version', '0.0.2', '--policy-path', policyPath],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(policyPath, 'utf8'))).toEqual({
      schema_version: 1,
      version: '0.0.2',
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('packages both clients with checksums and machine-readable release metadata', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-plugin-release-'));
    const result = spawnSync(
      process.execPath,
      ['scripts/package-maker-client-plugins.js', '--output-dir', tempDir],
      { cwd: projectRoot, encoding: 'utf8', timeout: 30_000 }
    );

    expect(result.status).toBe(0);
    const pluginPolicy = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'config', 'maker-plugin-version.json'), 'utf8')
    );
    const makerPolicy = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
    );
    const codexAsset = `taptap-maker-codex-plugin-${pluginPolicy.version}.zip`;
    const workBuddyAsset = `taptap-maker-workbuddy-plugin-${pluginPolicy.version}.zip`;
    const release = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'maker-plugin-release.json'), 'utf8')
    );
    const installGuide = fs.readFileSync(path.join(tempDir, 'INSTALL.md'), 'utf8');
    const checksums = fs.readFileSync(path.join(tempDir, 'SHA256SUMS'), 'utf8');

    expect(fs.statSync(path.join(tempDir, codexAsset)).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(tempDir, workBuddyAsset)).size).toBeGreaterThan(0);
    const codexArchive = fs.readFileSync(path.join(tempDir, codexAsset));
    const workBuddyArchive = fs.readFileSync(path.join(tempDir, workBuddyAsset));
    expect(codexArchive.includes(Buffer.from('.agents/plugins/marketplace.json'))).toBe(true);
    expect(
      codexArchive.includes(Buffer.from('plugins/taptap-maker/.codex-plugin/plugin.json'))
    ).toBe(true);
    expect(workBuddyArchive.includes(Buffer.from('.codebuddy-plugin/marketplace.json'))).toBe(true);
    expect(
      workBuddyArchive.includes(
        Buffer.from('plugins/workbuddy/taptap-maker/.codebuddy-plugin/plugin.json')
      )
    ).toBe(true);
    expect(checksums).toMatch(new RegExp(`^[a-f0-9]{64}  ${codexAsset}$`, 'm'));
    expect(checksums).toMatch(new RegExp(`^[a-f0-9]{64}  ${workBuddyAsset}$`, 'm'));
    expect(release).toEqual(
      expect.objectContaining({
        schema_version: 1,
        plugin_version: pluginPolicy.version,
        maker_mcp_version: makerPolicy.latest,
        tag: `maker-plugin-v${pluginPolicy.version}`,
        assets: {
          codex: codexAsset,
          workbuddy: workBuddyAsset,
          checksums: 'SHA256SUMS',
          install_guide: 'INSTALL.md',
        },
      })
    );
    expect(installGuide).toContain(`插件版本：\`${pluginPolicy.version}\``);
    expect(installGuide).toContain('发布渠道：`main 稳定版`');
    expect(installGuide).toContain('当前宿主客户端是 Codex');
    expect(installGuide).toContain('当前宿主客户端是 WorkBuddy');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('keeps plugin release automation separate from npm publishing', () => {
    const prepareWorkflow = fs.readFileSync(
      path.join(projectRoot, '.github', 'workflows', 'prepare-maker-plugin-release.yml'),
      'utf8'
    );
    const publishWorkflow = fs.readFileSync(
      path.join(projectRoot, '.github', 'workflows', 'publish-maker-plugin.yml'),
      'utf8'
    );

    expect(prepareWorkflow).toContain('workflow_dispatch:');
    expect(prepareWorkflow).toContain('scripts/resolve-maker-plugin-version.js');
    expect(prepareWorkflow).toContain('scripts/update-maker-plugin-version.js');
    expect(prepareWorkflow).toContain('peter-evans/create-pull-request');
    expect(publishWorkflow).toContain('maker-plugin-v');
    expect(publishWorkflow).toContain('npm run maker:plugins:package --');
    expect(publishWorkflow).toContain('gh release create');
    expect(publishWorkflow).toContain('gh release view "$RELEASE_TAG"');
    expect(publishWorkflow).toContain('notes="artifacts/maker-plugins/INSTALL.md"');
    expect(publishWorkflow).toContain('::error::Missing artifacts/maker-plugins/INSTALL.md');
    expect(publishWorkflow).toContain(
      'gh release upload "$RELEASE_TAG" artifacts/maker-plugins/* --clobber'
    );
    expect(publishWorkflow).toContain('tagged_sha');
    for (const workflow of [prepareWorkflow, publishWorkflow]) {
      expect(workflow).not.toContain('npm publish');
      expect(workflow).not.toContain('publish-maker.yml');
      expect(workflow).not.toContain('release.yml');
    }
  });
});
