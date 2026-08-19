import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, 'scripts', 'resolve-dsh-maker-version.js');
const base = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages', 'dsh-maker', 'package.json'), 'utf8')
).version;

function run(args: string[]): Record<string, unknown> {
  const result = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return JSON.parse(result.stdout);
}

describe('resolve-dsh-maker-version', () => {
  it('stable returns the base version and stable tag', () => {
    const result = run(['--channel', 'stable', '--json']);
    expect(result.version).toBe(base);
    expect(result.tag).toBe(`dsh-maker-v${base}`);
    expect(result.prerelease).toBe(false);
  });

  it('dev without an existing tag keeps the base version', () => {
    const result = run(['--channel', 'dev', '--run-number', '5', '--latest-tag', 'none', '--json']);
    expect(result.version).toBe(`${base}-dev.5`);
    expect(result.tag).toBe(`dsh-maker-v${base}-dev.5`);
    expect(result.prerelease).toBe(true);
  });

  it('dev with an existing base tag increments the patch', () => {
    const [major, minor, patch] = base.split('.').map(Number);
    const result = run([
      '--channel',
      'dev',
      '--run-number',
      '6',
      '--latest-tag',
      `dsh-maker-v${base}`,
      '--json',
    ]);
    expect(result.version).toBe(`${major}.${minor}.${patch + 1}-dev.6`);
    expect(result.tag).toBe(`dsh-maker-v${major}.${minor}.${patch + 1}-dev.6`);
    expect(result.prerelease).toBe(true);
  });
});
