import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nodeRequire = createRequire(__filename);
const { evaluatePushScope, isZeroSha, readFilesForMode, validatePrScope } = nodeRequire(
  '../../scripts/check-release-scope.cjs'
);

describe('release scope PR guard', () => {
  it('accepts Maker-only PRs with the maker marker', () => {
    const result = validatePrScope({
      files: ['src/maker/index.ts'],
      title: 'fix(maker): harden local init',
    });

    expect(result.ok).toBe(true);
  });

  it('rejects Maker-only PRs without the maker marker', () => {
    const result = validatePrScope({
      files: ['src/maker/index.ts'],
      title: 'fix: harden local init',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('must include `(maker)`');
  });

  it('rejects maker-marked PRs with shared files', () => {
    const result = validatePrScope({
      files: ['src/maker/index.ts', 'package.json'],
      title: 'fix(maker): update package metadata',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('separate PRs');
  });

  it('rejects mixed Maker and main package paths even without maker marker', () => {
    const result = validatePrScope({
      files: ['src/maker/index.ts', 'src/server.ts'],
      title: 'fix(server): change shared startup',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('separate PRs');
  });

  it('allows release infrastructure PRs to update both release ownership surfaces', () => {
    const result = validatePrScope({
      files: [
        '.github/workflows/release.yml',
        '.github/workflows/publish-maker.yml',
        'scripts/release-scope.cjs',
        'scripts/resolve-main-release-version.js',
        'scripts/resolve-maker-version.js',
        'CONTRIBUTING.md',
        'README.md',
        'docs/CI_CD.md',
        'docs/MAKER.md',
        'src/__tests__/mainReleaseVersionPolicy.test.ts',
      ],
      title: 'ci(release): isolate maker package publishing',
    });

    expect(result.ok).toBe(true);
  });

  it('allows release infrastructure PRs that only touch Maker release workflow files', () => {
    const result = validatePrScope({
      files: ['.github/workflows/publish-maker.yml'],
      title: 'ci(release): tune maker publish workflow',
    });

    expect(result.ok).toBe(true);
  });

  it('skips legacy release for Maker-only push changes without relying on marker text', () => {
    const result = evaluatePushScope({
      files: ['src/maker/index.ts', 'skills/taptap-maker-local/SKILL.md'],
      markerText: 'fix: harden local init',
    });

    expect(result.skipLegacyRelease).toBe(true);
  });

  it('detects all-zero push before sha values', () => {
    expect(isZeroSha('0000000000000000000000000000000000000000')).toBe(true);
    expect(isZeroSha('1000000000000000000000000000000000000000')).toBe(false);
  });

  it('reads the full head tree for all-zero push before sha values', () => {
    const repo = mkdtempSync(join(tmpdir(), 'release-scope-zero-push-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    const write = (file: string, content: string) =>
      writeFileSync(join(repo, file), content, 'utf8');

    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test User']);
    mkdirSync(join(repo, 'src/maker'), { recursive: true });
    write('src/maker/index.ts', 'export {};\n');
    git(['add', 'src/maker/index.ts']);
    git(['commit', '-qm', 'fix(maker): add maker file']);
    write('src/server.ts', 'export {};\n');
    git(['add', 'src/server.ts']);
    git(['commit', '-qm', 'fix(server): add server file']);
    const head = git(['rev-parse', 'HEAD']).trim();
    const originalCwd = process.cwd();

    try {
      process.chdir(repo);
      expect(
        readFilesForMode({
          mode: 'push',
          base: '0000000000000000000000000000000000000000',
          head,
        }).sort()
      ).toEqual(['src/maker/index.ts', 'src/server.ts']);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
