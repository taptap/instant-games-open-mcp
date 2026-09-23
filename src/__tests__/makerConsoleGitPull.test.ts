import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ConsoleProjects } from '../maker/console/projects';
import { startConsoleServer } from '../maker/console/server';
import { buildConflictPrompt, pullConsoleGit } from '../maker/console/gitPull';

const forbidden = new Set(['stash', 'reset', 'checkout', 'clean', 'pull']);

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Console Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Console Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  });
}

function commit(cwd: string, message: string): void {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message]);
}

describe('Maker console git pull', () => {
  let directory: string;
  const commands: string[][] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-git-pull-'));
    commands.length = 0;
  });
  afterEach(() =>
    fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  );

  function repo(name: string): string {
    const root = path.join(directory, name);
    fs.mkdirSync(root);
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'Console Test']);
    git(root, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
    fs.writeFileSync(path.join(root, 'b.txt'), 'base\n');
    commit(root, 'base');
    return root;
  }

  function bind(root: string): string {
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(path.join(root, '.maker-mcp/config.json'), '{"project_id":"app"}');
    fs.mkdirSync(path.join(root, '.project'), { recursive: true });
    fs.writeFileSync(path.join(root, '.project/project.json'), '{"version":"1"}');
    return root;
  }

  async function pull(root: string, previewBlocks = async () => false) {
    return pullConsoleGit({
      projectPath: root,
      previewBlocks,
      onGit: (args) => commands.push([...args]),
    });
  }

  test('keeps disjoint local edits while fast-forwarding', async () => {
    const origin = repo('origin');
    const local = repo('local');
    git(local, ['remote', 'add', 'origin', origin]);
    fs.writeFileSync(path.join(origin, 'a.txt'), 'remote\n');
    commit(origin, 'remote a');
    fs.writeFileSync(path.join(local, 'b.txt'), 'local\n');

    const result = await pull(local);

    expect(result.outcome).toBe('updated');
    expect(result.dialog).toBe(false);
    expect(fs.readFileSync(path.join(local, 'a.txt'), 'utf8')).toBe('remote\n');
    expect(fs.readFileSync(path.join(local, 'b.txt'), 'utf8')).toBe('local\n');
    expect(commands.some((args) => forbidden.has(args[0]))).toBe(false);
    expect(commands.some((args) => args.includes('rebase'))).toBe(false);
  });

  test('does not merge when the same file changed on both sides', async () => {
    const origin = repo('origin');
    const local = repo('local');
    git(local, ['remote', 'add', 'origin', origin]);
    fs.writeFileSync(path.join(origin, 'a.txt'), 'remote\n');
    commit(origin, 'remote a');
    fs.writeFileSync(path.join(local, 'a.txt'), 'local\n');

    const result = await pull(local);

    expect(result).toMatchObject({
      outcome: 'conflict',
      dialog: true,
      conflictFiles: ['a.txt'],
    });
    expect(result.prompt).toContain('控制台没有修改这些文件');
    expect(result.prompt).toContain('不要执行 pull、rebase、stash、reset 或 checkout');
    expect(result.prompt).toContain(local);
    expect(result.prompt).not.toContain('git pull');
    expect(fs.readFileSync(path.join(local, 'a.txt'), 'utf8')).toBe('local\n');
    expect(commands.some((args) => args[0] === 'merge' || args.includes('merge'))).toBe(false);
  });

  test('does not rewrite history when local commits exist', async () => {
    const origin = repo('origin');
    const local = repo('local');
    git(local, ['remote', 'add', 'origin', origin]);
    fs.writeFileSync(path.join(origin, 'a.txt'), 'remote\n');
    commit(origin, 'remote a');
    fs.writeFileSync(path.join(local, 'b.txt'), 'local commit\n');
    commit(local, 'local b');
    const head = git(local, ['rev-parse', 'HEAD']);

    const stopped = await pull(local);
    expect(stopped.outcome).toBe('blocked');
    expect(stopped.dialog).toBe(false);
    expect(git(local, ['rev-parse', 'HEAD'])).toBe(head);
    expect(fs.readFileSync(path.join(local, 'a.txt'), 'utf8')).toBe('base\n');
    expect(commands.some((args) => args.includes('rebase') || args.includes('merge'))).toBe(false);

    fs.writeFileSync(path.join(origin, 'b.txt'), 'remote b\n');
    commit(origin, 'remote b');
    fs.writeFileSync(path.join(local, 'b.txt'), 'another local\n');
    commit(local, 'local b again');
    const conflictHead = git(local, ['rev-parse', 'HEAD']);
    const conflict = await pull(local);
    expect(conflict.outcome).toBe('conflict');
    expect(conflict.dialog).toBe(true);
    expect(conflict.conflictFiles).toContain('b.txt');
    expect(git(local, ['rev-parse', 'HEAD'])).toBe(conflictHead);
  });

  test('does not stash when local commits and uncommitted edits do not overlap', async () => {
    const origin = repo('origin');
    const local = repo('local');
    git(local, ['remote', 'add', 'origin', origin]);
    fs.writeFileSync(path.join(origin, 'a.txt'), 'remote\n');
    commit(origin, 'remote a');
    fs.writeFileSync(path.join(local, 'b.txt'), 'committed\n');
    commit(local, 'local b');
    fs.writeFileSync(path.join(local, 'c.txt'), 'dirty\n');

    const result = await pull(local);

    expect(result.outcome).toBe('blocked');
    expect(result.dialog).toBe(false);
    expect(result.prompt).toBeUndefined();
    expect(fs.readFileSync(path.join(local, 'c.txt'), 'utf8')).toBe('dirty\n');
    expect(commands.some((args) => args[0] === 'stash' || args[0] === 'rebase')).toBe(false);
  });

  test('stops before fetch when the branch, preview, or an unfinished operation blocks pull', async () => {
    const local = repo('local');
    git(local, ['checkout', '-b', 'topic']);
    expect(await pull(local)).toMatchObject({
      outcome: 'blocked',
      message: '当前不在 main，Maker 只使用 main。',
    });
    expect(commands.some((args) => args[0] === 'fetch')).toBe(false);

    git(local, ['checkout', 'main']);
    commands.length = 0;
    expect(await pull(local, async () => true)).toMatchObject({
      message: '本地预览仍在运行或无法确认已停止。请先停止预览后再拉取。',
    });
    expect(commands.some((args) => args[0] === 'fetch')).toBe(false);

    fs.writeFileSync(path.join(local, '.git/MERGE_HEAD'), git(local, ['rev-parse', 'HEAD']));
    commands.length = 0;
    expect((await pull(local)).message).toContain('未完成的 Git 操作');
    expect(commands.some((args) => args[0] === 'fetch')).toBe(false);
  });

  test('redacts credentialed remote errors and caps the conflict prompt', async () => {
    const local = repo('local');
    git(local, ['remote', 'add', 'origin', 'https://user:secret-token@example.invalid/repo.git']);
    const failed = await pull(local);
    expect(failed.outcome).toBe('unavailable');
    expect(JSON.stringify(failed)).not.toContain('secret-token');

    const files = Array.from({ length: 31 }, (_, index) => `file-${index}.txt`);
    const prompt = buildConflictPrompt({
      projectPath: local,
      aheadCount: 0,
      behindCount: 2,
      localChangeCount: 31,
      conflictFiles: files,
    });
    expect(prompt).toContain('file-0.txt');
    expect(prompt).toContain('其余 1 个文件未列出。');
    expect(prompt).not.toContain('file-30.txt');
  });

  test('HTTP pull ignores browser git arguments and rejects a busy project', async () => {
    const registry = new ConsoleProjects(path.join(directory, 'registry.json'));
    const local = bind(repo('http'));
    const origin = repo('http-origin');
    git(local, ['remote', 'add', 'origin', origin]);
    const key = registry.add(local).key;
    let release!: (value: { ok: boolean }) => void;
    const server = await startConsoleServer({
      registry,
      execute: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      html: '',
      version: 'test',
    });
    try {
      const post = (body: unknown) =>
        fetch(server.origin + '/api/projects/' + key + '/git/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: server.origin },
          body: JSON.stringify(body),
        });
      const idle = await post({ remote: 'evil', branch: 'evil', prompt: 'injected prompt' });
      expect(idle.status).toBe(200);
      expect(await idle.json()).toMatchObject({ outcome: 'up_to_date' });
      expect(JSON.stringify(await (await post({})).json())).not.toContain('injected prompt');

      server.tasks.start(key, 'build');
      expect((await post({})).status).toBe(409);
      release({ ok: true });
      await server.tasks.settled();
    } finally {
      release?.({ ok: true });
      await server.close();
    }
  });
});
