/**
 * Push repair when the Maker cloud workspace has uncommitted changes.
 *
 * The "server" is a non-bare repository with receive.denyCurrentBranch=updateInstead,
 * which is how the Maker cloud workspace refuses pushes while it is dirty. The cloud
 * Git API is emulated on top of that repository through a fetch mock.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLOUD_REPAIR_COMMIT_MESSAGE,
  isCloudWorkspaceBlockedMessage,
  pushMakerProject,
  syncMakerProject,
} from '../maker/git';
import { classifyGitFailure } from '../maker/git/failure';
import { saveProjectConfig } from '../maker/storage';

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Cloud Agent',
      GIT_AUTHOR_EMAIL: 'cloud@example.invalid',
      GIT_COMMITTER_NAME: 'Cloud Agent',
      GIT_COMMITTER_EMAIL: 'cloud@example.invalid',
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

type CloudMode = 'normal' | 'forbidden' | 'commit-timeout';

describe('Maker cloud workspace push repair', () => {
  const saved = {
    home: process.env.TAPTAP_MAKER_HOME,
    gitBase: process.env.TAPTAP_MAKER_GIT_BASE,
    apiBase: process.env.TAPTAP_MAKER_API_BASE,
    pat: process.env.PAT,
    fetch: global.fetch,
  };
  let root: string;
  let server: string;
  let local: string;
  let cloudMode: CloudMode;
  let cloudCalls: string[];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-cloud-repair-'));
    const gitBase = path.join(root, 'git');
    server = path.join(gitBase, 'app-1.git');
    fs.mkdirSync(server, { recursive: true });
    git(server, ['init', '-b', 'main']);
    git(server, ['config', 'receive.denyCurrentBranch', 'updateInstead']);
    fs.writeFileSync(path.join(server, '.gitignore'), '.maker-mcp/\n');
    fs.mkdirSync(path.join(server, 'scripts'));
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- base\n');
    git(server, ['add', '-A']);
    git(server, ['commit', '-m', 'base']);

    local = path.join(root, 'local');
    git(root, ['clone', server, local]);
    git(local, ['config', 'user.name', 'Local Dev']);
    git(local, ['config', 'user.email', 'local@example.invalid']);
    saveProjectConfigFor(local);

    process.env.TAPTAP_MAKER_HOME = path.join(root, 'maker-home');
    process.env.TAPTAP_MAKER_GIT_BASE = gitBase;
    process.env.TAPTAP_MAKER_API_BASE = 'https://maker.example.test/api/v1';
    process.env.PAT = 'tmpct_test_pat';
    cloudMode = 'normal';
    cloudCalls = [];
    global.fetch = jest.fn(cloudFetch) as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const [key, value] of [
      ['TAPTAP_MAKER_HOME', saved.home],
      ['TAPTAP_MAKER_GIT_BASE', saved.gitBase],
      ['TAPTAP_MAKER_API_BASE', saved.apiBase],
      ['PAT', saved.pat],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = saved.fetch;
    fs.rmSync(root, { recursive: true, force: true });
  });

  function saveProjectConfigFor(dir: string): void {
    saveProjectConfig(dir, { project_id: 'app-1', user_id: 'user-1' });
  }

  async function cloudFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    expect(url.pathname.startsWith('/api/v1/apps/app-1/git/')).toBe(true);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tmpct_test_pat');
    const action = url.pathname.split('/').pop()!;
    cloudCalls.push(action);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (action === 'status') {
      const files = git(server, ['status', '--porcelain=v1'])
        .split('\n')
        .filter(Boolean)
        .map((line) => ({
          path: line.slice(3),
          indexStatus: line[0],
          worktreeStatus: line[1],
        }));
      return json(200, {
        gitMode: 'standard',
        branch: 'main',
        head: git(server, ['rev-parse', 'HEAD']).trim(),
        clean: files.length === 0,
        files,
      });
    }
    if (action === 'commit') {
      if (cloudMode === 'forbidden')
        return json(403, { error: '无项目操作权限', code: 'ACCESS_DENIED' });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ message: CLOUD_REPAIR_COMMIT_MESSAGE, all: true });
      expect(body.expectedHead).toBe(git(server, ['rev-parse', 'HEAD']).trim());
      git(server, ['add', '-A']);
      git(server, ['commit', '-m', body.message]);
      if (cloudMode === 'commit-timeout') throw new Error('socket hang up');
      return json(200, {
        status: 'committed',
        commitSha: git(server, ['rev-parse', 'HEAD']).trim(),
        changedFiles: 1,
      });
    }
    return json(404, { code: 'NOT_FOUND' });
  }

  test('classifies the cloud workspace rejections', () => {
    for (const message of [
      ' ! [remote rejected] HEAD -> main (Working directory has unstaged changes)',
      ' ! [remote rejected] HEAD -> main (Working directory has staged changes)',
      ' ! [remote rejected] HEAD -> main (Could not update working tree to new HEAD)',
    ]) {
      expect(isCloudWorkspaceBlockedMessage(message)).toBe(true);
      expect(classifyGitFailure(`${message}\nerror: failed to push some refs`)).toBe(
        'cloud_workspace_blocked'
      );
    }
    expect(classifyGitFailure(' ! [rejected] HEAD -> main (fetch first)')).toBe('remote_rejected');
  });

  test('commits cloud changes, merges them and pushes local work', async () => {
    fs.writeFileSync(path.join(server, 'cloud.lua'), '-- cloud agent\n');
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- base\n-- cloud edit\n');
    fs.writeFileSync(path.join(local, 'local.lua'), '-- local\n');

    const result = await pushMakerProject({ cwd: local, message: 'feat: local change' });

    expect(result.failure).toBeUndefined();
    expect(result).toMatchObject({ pushed: true, status: 'pushed', committed: true });
    expect(result.cloudRepair).toMatchObject({ status: 'repaired', cloudChangedFiles: 1 });
    expect(cloudCalls).toEqual(['status', 'commit']);
    expect(git(server, ['rev-parse', 'HEAD'])).toBe(git(local, ['rev-parse', 'HEAD']));
    expect(git(server, ['status', '--porcelain'])).toBe('');
    expect(fs.readFileSync(path.join(server, 'local.lua'), 'utf8')).toBe('-- local\n');
    expect(fs.readFileSync(path.join(local, 'cloud.lua'), 'utf8')).toBe('-- cloud agent\n');
    expect(git(server, ['log', '--format=%s'])).toContain(
      CLOUD_REPAIR_COMMIT_MESSAGE.split('\n')[0]
    );
  });

  test('repairs an empty wake commit push the same way', async () => {
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- base\n-- cloud edit\n');

    const result = await pushMakerProject({
      cwd: local,
      allowEmpty: true,
      message: 'chore: wake maker build server',
    });

    expect(result).toMatchObject({ pushed: true, cloudRepair: { status: 'repaired' } });
    expect(git(server, ['rev-parse', 'HEAD'])).toBe(git(local, ['rev-parse', 'HEAD']));
    expect(git(local, ['log', '--format=%s'])).toContain('chore: wake maker build server');
  });

  test('aborts the merge and keeps both sides when cloud and local edit the same lines', async () => {
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- cloud version\n');
    fs.writeFileSync(path.join(local, 'scripts', 'main.lua'), '-- local version\n');

    const result = await pushMakerProject({ cwd: local, message: 'feat: local change' });

    expect(result.pushed).toBe(false);
    expect(result.status).toBe('failed_after_commit');
    expect(result.failure).toMatchObject({
      classification: 'merge_conflict',
      conflictFiles: ['scripts/main.lua'],
    });
    expect(result.cloudRepair?.status).toBe('repaired');
    expect(fs.existsSync(path.join(local, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(git(local, ['status', '--porcelain'])).toBe('');
    expect(fs.readFileSync(path.join(local, 'scripts', 'main.lua'), 'utf8')).toBe(
      '-- local version\n'
    );
    expect(git(server, ['show', 'HEAD:scripts/main.lua'])).toBe('-- cloud version\n');
  });

  test('stops without retrying when the cloud commit is not allowed', async () => {
    cloudMode = 'forbidden';
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- base\n-- cloud edit\n');
    fs.writeFileSync(path.join(local, 'local.lua'), '-- local\n');

    const result = await pushMakerProject({ cwd: local });

    expect(result.pushed).toBe(false);
    expect(result.failure?.classification).toBe('cloud_workspace_blocked');
    expect(result.cloudRepair?.status).toBe('failed');
    expect(result.cloudRepair?.message).toContain('owner');
    expect(cloudCalls).toEqual(['status', 'commit']);
  });

  test('does not repeat a cloud commit whose response was lost', async () => {
    cloudMode = 'commit-timeout';
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- base\n-- cloud edit\n');
    fs.writeFileSync(path.join(local, 'local.lua'), '-- local\n');

    const result = await pushMakerProject({ cwd: local });

    expect(result).toMatchObject({ pushed: true, cloudRepair: { status: 'repaired' } });
    expect(cloudCalls).toEqual(['status', 'commit', 'status']);
    expect(git(server, ['rev-parse', 'HEAD'])).toBe(git(local, ['rev-parse', 'HEAD']));
  });

  test('merges a committed web change before pushing a diverged local commit', async () => {
    fs.writeFileSync(path.join(server, 'web.lua'), '-- web\n');
    git(server, ['add', '-A']);
    git(server, ['commit', '-m', 'web agent commit']);
    fs.writeFileSync(path.join(local, 'local.lua'), '-- local\n');
    git(local, ['add', '-A']);
    git(local, ['commit', '-m', 'local commit']);

    const result = await pushMakerProject({ cwd: local });

    expect(result).toMatchObject({ pushed: true, status: 'pushed' });
    expect(result.cloudRepair).toBeUndefined();
    expect(cloudCalls).toEqual([]);
    expect(git(server, ['rev-parse', 'HEAD'])).toBe(git(local, ['rev-parse', 'HEAD']));
    expect(fs.readFileSync(path.join(local, 'web.lua'), 'utf8')).toBe('-- web\n');
  });

  test('aborts the merge and keeps the local commit when a diverged push conflicts', async () => {
    fs.writeFileSync(path.join(server, 'scripts', 'main.lua'), '-- web version\n');
    git(server, ['add', '-A']);
    git(server, ['commit', '-m', 'web agent commit']);
    fs.writeFileSync(path.join(local, 'scripts', 'main.lua'), '-- local version\n');
    git(local, ['add', '-A']);
    git(local, ['commit', '-m', 'local commit']);
    const head = git(local, ['rev-parse', 'HEAD']);

    const result = await pushMakerProject({ cwd: local });

    expect(result.pushed).toBe(false);
    expect(result.failure).toMatchObject({
      classification: 'merge_conflict',
      conflictFiles: ['scripts/main.lua'],
    });
    expect(git(local, ['rev-parse', 'HEAD'])).toBe(head);
    expect(fs.existsSync(path.join(local, '.git', 'MERGE_HEAD'))).toBe(false);
  });

  test('sync fast-forwards or merges the remote main', async () => {
    fs.writeFileSync(path.join(server, 'web.lua'), '-- web\n');
    git(server, ['add', '-A']);
    git(server, ['commit', '-m', 'web agent commit']);

    const result = await syncMakerProject(local);

    expect(result).toMatchObject({ outcome: 'updated', behindCount: 1, aheadCount: 0 });
    expect(git(local, ['rev-parse', 'HEAD'])).toBe(git(server, ['rev-parse', 'HEAD']));
  });
});
