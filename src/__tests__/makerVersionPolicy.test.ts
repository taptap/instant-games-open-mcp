import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'resolve-maker-version.js');

function createFakeNpm(
  currentVersion: string,
  existingVersions: string[] = [currentVersion],
  versionsJson = JSON.stringify(existingVersions),
  maxDistTagQueries?: number
) {
  const dir = mkdtempSync(join(tmpdir(), 'maker-version-policy-'));
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const npmPath = join(binDir, 'npm');
  const distTagQueryCountPath = join(dir, 'dist-tag-query-count');
  writeFileSync(
    npmPath,
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const current = ${JSON.stringify(currentVersion)};
const existing = new Set(${JSON.stringify(existingVersions)});
const maxDistTagQueries = ${maxDistTagQueries ?? 'null'};
const distTagQueryCountPath = ${JSON.stringify(distTagQueryCountPath)};
if (args[0] !== 'view') {
  console.error('Unsupported npm command: ' + args.join(' '));
  process.exit(1);
}
const query = args[1] || '';
const field = args[2] || '';
if (query === '@taptap/maker' && field === 'versions') {
  console.log(${JSON.stringify(versionsJson)});
  process.exit(0);
}
if (query === '@taptap/maker' && field.startsWith('dist-tags.')) {
  if (maxDistTagQueries !== null) {
    let queryCount = 0;
    try {
      queryCount = Number(fs.readFileSync(distTagQueryCountPath, 'utf8')) || 0;
    } catch {}
    queryCount += 1;
    fs.writeFileSync(distTagQueryCountPath, String(queryCount));
    if (queryCount > maxDistTagQueries) {
      console.error('dist-tag queried too many times: ' + queryCount);
      process.exit(1);
    }
  }
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
  it('rejects auto-last-number from short-lived fix branches', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'fix/maker-release',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('auto-last-number mode is only allowed from main or beta');
  });

  it('rejects manual publish from short-lived fix branches', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'manual',
      MAKER_MANUAL_VERSION: '0.0.6',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'fix/maker-release',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@taptap/maker can only be published from main or beta');
  });

  it('resolves beta auto-last-number to the next prerelease after the highest stable version', () => {
    const fakeBin = createFakeNpm('0.0.16', ['0.0.13', '0.0.14', '0.0.15', '0.0.16']);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.17-beta.1');
  });

  it('increments beta prerelease numbers within the next stable version line', () => {
    const fakeBin = createFakeNpm('0.0.17-beta.1', ['0.0.13', '0.0.16', '0.0.17-beta.1']);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.17-beta.2');
  });

  it('allows auto-last-number from the main release branch', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'latest',
      GITHUB_REF_NAME: 'main',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6');
  });

  it('publishes the stable version after beta prereleases without skipping the patch', () => {
    const fakeBin = createFakeNpm('0.0.16', ['0.0.16', '0.0.17-beta.1', '0.0.17-beta.2']);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'latest',
      GITHUB_REF_NAME: 'main',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.17');
  });

  it('uses the next prerelease base when a beta dist-tag lags behind stable versions', () => {
    const fakeBin = createFakeNpm('0.0.3', [
      '0.0.1-beta.1',
      '0.0.1-beta.2',
      '0.0.1',
      '0.0.2',
      '0.0.3',
      '0.0.4',
      '0.0.5',
    ]);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6-beta.1');
  });

  it('accepts npm versions output as a single JSON string', () => {
    const fakeBin = createFakeNpm('0.0.5', ['0.0.5'], JSON.stringify('0.0.5'));
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6-beta.1');
  });

  it('continues beta prerelease numbering when the current dist-tag is a prerelease', () => {
    const fakeBin = createFakeNpm('0.0.5-beta.1');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.5-beta.2');
  });

  it('rolls beta prerelease to the next stable line when a higher stable version exists', () => {
    const fakeBin = createFakeNpm('0.0.5-beta.1', ['0.0.5-beta.1', '0.0.6']);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.7-beta.1');
  });

  it('uses the highest stable version across major and minor lines for beta prereleases', () => {
    const fakeBin = createFakeNpm('0.0.17-beta.2', [
      '0.0.16',
      '0.0.17-beta.1',
      '0.0.17-beta.2',
      '0.1.0',
    ]);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.1.1-beta.1');
  });

  it('uses prerelease semantics for alpha and next tags', () => {
    const alphaBin = createFakeNpm('0.0.16', ['0.0.16']);
    const alphaResult = runResolver({
      PATH: alphaBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'alpha',
      GITHUB_REF_NAME: 'beta',
    });
    const nextBin = createFakeNpm('0.0.16', ['0.0.16']);
    const nextResult = runResolver({
      PATH: nextBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'next',
      GITHUB_REF_NAME: 'beta',
    });

    expect(alphaResult.status).toBe(0);
    expect(alphaResult.stdout).toContain('Resolved @taptap/maker version: 0.0.17-alpha.1');
    expect(nextResult.status).toBe(0);
    expect(nextResult.stdout).toContain('Resolved @taptap/maker version: 0.0.17-next.1');
  });

  it('queries the current dist-tag only once in auto mode', () => {
    const fakeBin = createFakeNpm('0.0.16', ['0.0.16'], JSON.stringify(['0.0.16']), 1);
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'auto-last-number',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'beta',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.17-beta.1');
  });

  it('allows manual major or minor changes and flags approval requirement', () => {
    const fakeBin = createFakeNpm('0.0.5');
    const result = runResolver({
      PATH: fakeBin,
      MAKER_VERSION_MODE: 'manual',
      MAKER_MANUAL_VERSION: '0.1.0',
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'main',
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
      MAKER_NPM_TAG: 'beta',
      GITHUB_REF_NAME: 'main',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved @taptap/maker version: 0.0.6');
    expect(result.stdout).toContain('Major/minor changed: false');
  });
});
