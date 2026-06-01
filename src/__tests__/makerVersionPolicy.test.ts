import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'resolve-maker-version.js');

function createFakeNpm(currentVersion: string, existingVersions: string[] = [currentVersion]) {
  const dir = mkdtempSync(join(tmpdir(), 'maker-version-policy-'));
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
if (query === '@taptap/maker' && field === 'versions') {
  console.log(JSON.stringify(Array.from(existing)));
  process.exit(0);
}
if (query === '@taptap/maker' && field.startsWith('dist-tags.')) {
  console.log(current);
  process.exit(0);
}
const versionMatch = /^@taptap\\/maker@(.+)$/.exec(query);
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

describe('Maker publish version policy', () => {
  it('rejects auto-last-number outside fix branches', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'feature/maker-release',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('auto-last-number mode is only allowed from fix/');
  });

  it('allows auto-last-number from fix branches', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'fix/maker-release',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6');
  });

  it('rejects auto-last-number when the current dist-tag is a prerelease', () => {
    const fakeBin = createFakeNpm('0.0.5-beta.1');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'fix/maker-release',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('auto-last-number requires a stable three-segment version');
  });

  it('allows manual major or minor changes after target confirmation', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'manual',
      MAKER_MANUAL_VERSION: '0.1.0',
      MAKER_CONFIRM_VERSION: '0.1.0',
      MAKER_NPM_TAG: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Current online @taptap/maker@beta version: 0.0.5');
    expect(result.stdout.match(/Current online @taptap\/maker@beta version/g)).toHaveLength(1);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.1.0');
    expect(result.stdout).toContain('Major/minor changed: true');
  });

  it('does not require previous online confirmation for manual patch changes', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'manual',
      MAKER_MANUAL_VERSION: '0.0.6',
      MAKER_CONFIRM_VERSION: '0.0.6',
      MAKER_NPM_TAG: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6');
    expect(result.stdout).toContain('Major/minor changed: false');
  });
});
