import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const nodeRequire = createRequire(__filename);
const SCRIPT_PATH = join(process.cwd(), 'scripts', 'check-no-ci-skip.cjs');

function runPolicy(message: string) {
  return spawnSync('node', [SCRIPT_PATH, '--message', message], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('CI skip directive policy', () => {
  it.each(['[skip ci]', '[ci skip]', '[skip actions]', '[actions skip]', '[no ci]'])(
    'rejects %s in PR commit messages',
    (directive) => {
      const result = runPolicy(`feat: add guarded workflow ${directive}

This should still run PR checks.`);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CI skip directives are not allowed');
      expect(result.stderr).toContain(directive);
    }
  );

  it('allows normal PR commit messages', () => {
    const result = runPolicy(`feat: add guarded workflow

This commit runs checks normally.`);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('runs the policy before commitlint in PR checks', () => {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'pr.yml'), 'utf8');

    expect(workflow).toContain('node scripts/check-no-ci-skip.cjs --from');
    expect(workflow.indexOf('Reject CI skip directives')).toBeLessThan(
      workflow.indexOf('Validate PR commits with commitlint')
    );
  });

  it('does not ignore skip-ci commits in commitlint config', () => {
    const config = nodeRequire('../../.commitlintrc.cjs');
    const message = 'feat: add guarded workflow [skip ci]';

    expect(config.ignores.some((ignore: (commit: string) => boolean) => ignore(message))).toBe(
      false
    );
  });
});
