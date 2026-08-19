import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nodeRequire = createRequire(__filename);
const releaseScope = nodeRequire('../../scripts/release-scope.cjs');

describe('release-scope classifier', () => {
  it('classifies Maker-owned files without classifying shared release files', () => {
    expect(releaseScope.isMakerOwnedPath('src/maker/server/mcp.ts')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('packages/maker/package.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('src/__tests__/makerRuntimeLogs.test.ts')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('config/maker-version-policy.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/update-maker-version-policy.cjs')).toBe(true);
    expect(
      releaseScope.isMakerOwnedPath('.github/workflows/prepare-maker-plugin-release.yml')
    ).toBe(true);
    expect(releaseScope.isMakerOwnedPath('.github/workflows/publish-maker-plugin.yml')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('config/maker-plugin-version.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('.agents/plugins/marketplace.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('.codebuddy-plugin/marketplace.json')).toBe(true);
    expect(
      releaseScope.isMakerOwnedPath('plugin-sources/taptap-maker/workbuddy/bin/run-node')
    ).toBe(true);
    expect(releaseScope.isMakerOwnedPath('plugins/taptap-maker/.mcp.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('plugins/workbuddy/taptap-maker/.mcp.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/package-maker-client-plugins.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/prepare-maker-codex-plugin.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/prepare-maker-workbuddy-plugin.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/resolve-maker-plugin-version.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/update-maker-plugin-version.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('packages/dsh-maker/package.json')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('packages/dsh-maker/lib/index.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('packages/dsh-maker/INSTALL.md')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('scripts/package-maker-dsh-plugin.js')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('.github/workflows/publish-dsh-maker-plugin.yml')).toBe(
      true
    );
    expect(releaseScope.isMakerOwnedPath('docs/DSH_PLUGIN.md')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('docs/DSH_PLUGIN_RESEARCH.md')).toBe(true);
    expect(releaseScope.isMakerOwnedPath('.github/workflows/release.yml')).toBe(false);
    expect(releaseScope.isMakerOwnedPath('package.json')).toBe(false);
  });

  it('skips legacy release for Maker-only paths even if squash message lost the marker', () => {
    const result = releaseScope.shouldSkipLegacyRelease({
      files: ['src/maker/index.ts', 'skills/taptap-maker-local/SKILL.md'],
      markerText: 'fix: repair local build',
    });

    expect(result.onlyMakerChanged).toBe(true);
    expect(result.hasMakerMarker).toBe(false);
    expect(result.skipLegacyRelease).toBe(true);
  });

  it('does not skip legacy release for mixed path changes even with marker', () => {
    const result = releaseScope.shouldSkipLegacyRelease({
      files: ['src/maker/index.ts', 'src/server.ts'],
      markerText: 'fix(maker): update root entry',
    });

    expect(result.onlyMakerChanged).toBe(false);
    expect(result.nonMakerFiles).toEqual(['src/server.ts']);
    expect(result.skipLegacyRelease).toBe(false);
  });

  it('recognizes release infrastructure paths that intentionally span release ownership', () => {
    const classification = releaseScope.classifyFiles([
      '.github/workflows/claude-review.yml',
      '.github/workflows/codeql.yml',
      '.github/workflows/release.yml',
      '.github/workflows/publish-maker.yml',
      '.github/workflows/prepare-maker-plugin-release.yml',
      '.github/workflows/publish-maker-plugin.yml',
      '.github/workflows/publish-dsh-maker-plugin.yml',
      'scripts/release-scope.cjs',
      'scripts/update-maker-version-policy.cjs',
      'scripts/resolve-main-release-version.js',
      'scripts/resolve-maker-version.js',
      'config/maker-version-policy.json',
      'src/__tests__/releaseScope.test.ts',
      'src/__tests__/makerVersionPolicy.test.ts',
      'CONTRIBUTING.md',
      'README.md',
      'docs/CI_CD.md',
      'docs/MAKER.md',
      'package.json',
      'package-lock.json',
      'src/__tests__/mainPackageManifest.test.ts',
      'src/__tests__/mainReleaseVersionPolicy.test.ts',
    ]);

    expect(classification.hasMakerChanges).toBe(true);
    expect(classification.hasNonMakerChanges).toBe(true);
    expect(classification.onlyReleaseInfrastructureChanged).toBe(true);
  });

  it('keeps Maker plugin release workflows out of the main package release', () => {
    const result = releaseScope.shouldSkipLegacyRelease({
      files: [
        '.github/workflows/prepare-maker-plugin-release.yml',
        '.github/workflows/publish-maker-plugin.yml',
      ],
      markerText: 'ci(maker-plugin): update plugin publishing',
    });

    expect(result.onlyMakerChanged).toBe(true);
    expect(result.onlyReleaseInfrastructureChanged).toBe(true);
    expect(result.skipLegacyRelease).toBe(true);
  });

  it('uses three-dot diff to avoid base-only changes in PR scope detection', () => {
    const repo = mkdtempSync(join(tmpdir(), 'release-scope-diff-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    const write = (file: string, content: string) =>
      writeFileSync(join(repo, file), content, 'utf8');

    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test User']);
    write('README.md', 'base\n');
    git(['add', 'README.md']);
    git(['commit', '-qm', 'chore: initial']);
    const rootCommit = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '-qb', 'maker']);
    mkdirSync(join(repo, 'src/maker'), { recursive: true });
    write('src/maker/index.ts', 'export {};\n');
    git(['add', 'src/maker/index.ts']);
    git(['commit', '-qm', 'fix(maker): maker change']);
    git(['checkout', '-q', 'main']);
    write('README.md', 'base\nmain only\n');
    git(['commit', '-am', 'docs: main only']);
    const base = git(['rev-parse', 'HEAD']).trim();
    const head = git(['rev-parse', 'maker']).trim();
    const originalCwd = process.cwd();

    try {
      process.chdir(repo);
      expect(releaseScope.readCommitFiles(rootCommit)).toEqual(['README.md']);
      expect(releaseScope.readChangedFiles(base, head, 'two-dot')).toEqual([
        'README.md',
        'src/maker/index.ts',
      ]);
      expect(releaseScope.readChangedFiles(base, head, 'three-dot')).toEqual([
        'src/maker/index.ts',
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
