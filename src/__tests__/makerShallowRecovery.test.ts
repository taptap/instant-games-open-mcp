/**
 * Recovery for `fatal: expected 'acknowledgments'` caused by redundant shallow markers.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerGitError, createGitFailure } from '../maker/git/failure';
import { withShallowAcknowledgmentsRecovery } from '../maker/git/run';
import {
  isShallowAcknowledgmentsFailure,
  pruneRedundantShallowMarkers,
} from '../maker/git/shallow';

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

const ACK_STDERR = "fatal: expected 'acknowledgments'";

describe('shallow acknowledgments recovery', () => {
  let root: string;
  let server: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-shallow-'));
    server = path.join(root, 'server');
    fs.mkdirSync(server);
    git(server, ['init', '-q', '-b', 'main']);
    for (const name of ['a', 'b', 'c']) {
      fs.writeFileSync(path.join(server, name), name);
      git(server, ['add', '-A']);
      git(server, ['commit', '-q', '-m', name]);
    }
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function shallowClone(name: string, depth: number): string {
    const dir = path.join(root, name);
    git(root, ['clone', '-q', `--depth=${depth}`, `file://${server}`, dir]);
    return dir;
  }

  test('recognizes the acknowledgments failure', () => {
    expect(isShallowAcknowledgmentsFailure(ACK_STDERR)).toBe(true);
    expect(isShallowAcknowledgmentsFailure('fatal: Authentication failed')).toBe(false);
    expect(createGitFailure({ stage: 'fetch', stderr: ACK_STDERR }).retryable).toBe(false);
  });

  test('keeps a real shallow boundary', () => {
    const local = shallowClone('real', 1);
    const before = fs.readFileSync(path.join(local, '.git', 'shallow'), 'utf8');

    expect(pruneRedundantShallowMarkers(local)).toBe(0);
    expect(fs.readFileSync(path.join(local, '.git', 'shallow'), 'utf8')).toBe(before);
  });

  test('removes a root-commit marker and a marker whose parent is present', () => {
    const local = shallowClone('full', 10);
    const rootCommit = git(local, ['rev-list', '--max-parents=0', 'HEAD']).trim();
    const head = git(local, ['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(path.join(local, '.git', 'shallow'), `${rootCommit}\n${head}\n`);

    expect(pruneRedundantShallowMarkers(local)).toBe(2);
    expect(fs.existsSync(path.join(local, '.git', 'shallow'))).toBe(false);
    expect(git(local, ['rev-parse', '--is-shallow-repository']).trim()).toBe('false');
  });

  test('removes only the redundant line when a real boundary is also present', () => {
    const local = shallowClone('mixed', 1);
    const boundary = fs.readFileSync(path.join(local, '.git', 'shallow'), 'utf8').trim();
    fs.writeFileSync(path.join(local, '.git', 'shallow'), `${boundary}\n${'0'.repeat(40)}\n`);

    expect(pruneRedundantShallowMarkers(local)).toBe(1);
    expect(fs.readFileSync(path.join(local, '.git', 'shallow'), 'utf8')).toBe(`${boundary}\n`);
  });

  test('does not replace shallow while another process holds the lock', () => {
    const local = shallowClone('locked', 1);
    const shallow = path.join(local, '.git', 'shallow');
    const before = fs.readFileSync(shallow, 'utf8');
    const lock = fs.openSync(shallow + '.lock', 'wx');
    try {
      expect(pruneRedundantShallowMarkers(local)).toBe(0);
      expect(fs.readFileSync(shallow, 'utf8')).toBe(before);
      expect(fs.existsSync(shallow + '.lock')).toBe(true);
    } finally {
      fs.closeSync(lock);
      fs.rmSync(shallow + '.lock', { force: true });
    }
  });

  test('releases the shallow lock after removing redundant markers', () => {
    const local = shallowClone('unlocked', 10);
    const rootCommit = git(local, ['rev-list', '--max-parents=0', 'HEAD']).trim();
    fs.writeFileSync(path.join(local, '.git', 'shallow'), rootCommit + '\n');

    expect(pruneRedundantShallowMarkers(local)).toBe(1);
    expect(fs.existsSync(path.join(local, '.git', 'shallow'))).toBe(false);
    expect(fs.existsSync(path.join(local, '.git', 'shallow.lock'))).toBe(false);
    expect(fs.readdirSync(path.join(local, '.git')).some((name) => name.endsWith('.tmp'))).toBe(
      false
    );
  });

  test('retries the fetch once after removing redundant markers', async () => {
    const local = shallowClone('retry', 10);
    const rootCommit = git(local, ['rev-list', '--max-parents=0', 'HEAD']).trim();
    fs.writeFileSync(path.join(local, '.git', 'shallow'), `${rootCommit}\n`);
    let calls = 0;
    const fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new MakerGitError(createGitFailure({ stage: 'fetch', stderr: ACK_STDERR }));
      }
      return 'fetched';
    });

    await expect(withShallowAcknowledgmentsRecovery(local, fetch)).resolves.toBe('fetched');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(local, '.git', 'shallow'))).toBe(false);
  });

  test('keeps the original error when nothing can be removed or the error is different', async () => {
    const local = shallowClone('noop', 1);
    const ack = new MakerGitError(createGitFailure({ stage: 'fetch', stderr: ACK_STDERR }));
    const ackFetch = jest.fn(async () => {
      throw ack;
    });
    await expect(withShallowAcknowledgmentsRecovery(local, ackFetch)).rejects.toBe(ack);
    expect(ackFetch).toHaveBeenCalledTimes(1);

    const other = new Error('fatal: Authentication failed');
    const otherFetch = jest.fn(async () => {
      throw other;
    });
    await expect(withShallowAcknowledgmentsRecovery(local, otherFetch)).rejects.toBe(other);
    expect(otherFetch).toHaveBeenCalledTimes(1);
  });
});
