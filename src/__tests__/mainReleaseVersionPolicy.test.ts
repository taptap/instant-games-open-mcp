import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'resolve-main-release-version.js');
const PACKAGE_NAME = '@taptap/instant-games-open-mcp';

function createFakeNpm(
  currentVersion: string,
  existingVersions: string[] = [currentVersion],
  versionsJson = JSON.stringify(existingVersions)
) {
  const dir = mkdtempSync(join(tmpdir(), 'main-release-version-policy-'));
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const npmPath = join(binDir, 'npm');
  writeFileSync(
    npmPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const current = ${JSON.stringify(currentVersion)};
const existing = new Set(${JSON.stringify(existingVersions)});
if (args[0] !== 'view') {
  console.error('Unsupported npm command: ' + args.join(' '));
  process.exit(1);
}
const query = args[1] || '';
const field = args[2] || '';
if (query === ${JSON.stringify(PACKAGE_NAME)} && field === 'versions') {
  console.log(${JSON.stringify(versionsJson)});
  process.exit(0);
}
if (query === ${JSON.stringify(PACKAGE_NAME)} && field === 'dist-tags.latest') {
  console.log(current);
  process.exit(0);
}
const versionMatch = /^@taptap\\/instant-games-open-mcp@(.+)$/.exec(query);
if (versionMatch && field === 'version') {
  if (existing.has(versionMatch[1])) {
    console.log(versionMatch[1]);
    process.exit(0);
  }
  process.exit(1);
}
console.error('Unsupported npm view: ' + args.join(' '));
process.exit(1);
`,
    'utf8'
  );
  chmodSync(npmPath, 0o755);
  return binDir;
}

function runResolver(env: Record<string, string | undefined>) {
  return spawnSync('node', [SCRIPT_PATH], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      PATH: `${env.PATH}:${process.env.PATH || ''}`,
    },
    encoding: 'utf8',
  });
}

describe('main package release version policy', () => {
  it('auto increments only the patch from npm latest', () => {
    const fakeBin = createFakeNpm('1.24.5');
    const result = runResolver({
      PATH: fakeBin,
      GITHUB_REF_NAME: 'main',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Current online @taptap/instant-games-open-mcp@latest version: 1.24.5'
    );
    expect(result.stdout).toContain('Resolved @taptap/instant-games-open-mcp version: 1.24.6');
    expect(result.stdout).toContain('Version mode: auto-last-number');
    expect(result.stdout).toContain('Major/minor changed: false');
  });

  it('skips already published patch versions in the same major/minor line', () => {
    const fakeBin = createFakeNpm('1.24.3', ['1.24.3', '1.24.4', '1.24.5']);
    const result = runResolver({
      PATH: fakeBin,
      GITHUB_REF_NAME: 'main',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/instant-games-open-mcp version: 1.24.6');
  });

  it('allows manual major or minor changes and flags approval requirement', () => {
    const fakeBin = createFakeNpm('1.24.5');
    const result = runResolver({
      PATH: fakeBin,
      GITHUB_REF_NAME: 'main',
      MAIN_MANUAL_VERSION: '1.25.0',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/instant-games-open-mcp version: 1.25.0');
    expect(result.stdout).toContain('Version mode: manual');
    expect(result.stdout).toContain('Major/minor changed: true');
  });

  it('rejects latest publishing outside main', () => {
    const fakeBin = createFakeNpm('1.24.5');
    const result = runResolver({
      PATH: fakeBin,
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('latest can only be published from main');
  });

  it('rejects prerelease manual versions for latest', () => {
    const fakeBin = createFakeNpm('1.24.5');
    const result = runResolver({
      PATH: fakeBin,
      GITHUB_REF_NAME: 'main',
      MAIN_MANUAL_VERSION: '1.25.0-beta.1',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid stable version');
  });
});
