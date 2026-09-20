import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withQrcodeFastForward } from '../maker/cli/qrcodeSync.js';

describe('restricted QR config fast-forward', () => {
  let cwd: string;
  const file = '.project/project.json';
  const config = { taptap_publish: { title: 'Game', developer_id: null } };
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (value: unknown) =>
    fs.writeFileSync(path.join(cwd, file), JSON.stringify(value, null, 2) + '\n');
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-sync-'));
    git('init', '-b', 'main');
    git('config', 'user.name', 'QR test');
    git('config', 'user.email', 'qr@example.test');
    fs.mkdirSync(path.join(cwd, '.project'));
    write(config);
    fs.writeFileSync(path.join(cwd, 'other.txt'), 'base\n');
    git('add', '.');
    git('commit', '-m', 'test: baseline');
    git('checkout', '-b', 'remote-qr');
    fs.writeFileSync(path.join(cwd, file), JSON.stringify(config, null, 2));
    git('commit', '-am', 'test: remote formatting');
    git('checkout', 'main');
    write({ ...config, taptap_publish: { ...config.taptap_publish, developer_id: 290607 } });
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test('successful fast-forward preserves staging performed after QR index preparation', async () => {
    const working = fs.readFileSync(path.join(cwd, file));
    let staged = '';
    await withQrcodeFastForward(cwd, 'remote-qr', async (revision) => {
      fs.writeFileSync(path.join(cwd, 'other.txt'), 'concurrent user change\n');
      git('add', 'other.txt');
      staged = git('rev-parse', ':other.txt');
      git('merge', '--ff-only', revision);
    });
    expect(git('rev-parse', 'HEAD')).toBe(git('rev-parse', 'remote-qr'));
    expect(git('rev-parse', ':other.txt')).toBe(staged);
    expect(fs.readFileSync(path.join(cwd, file))).toEqual(working);
  });

  test.each(['same-file-stage', 'commit'])(
    'preserves concurrent %s when Git rejects fast-forward',
    async (mode) => {
      let head = '',
        index = '';
      await expect(
        withQrcodeFastForward(cwd, 'remote-qr', async (revision) => {
          if (mode === 'same-file-stage') git('add', file);
          else {
            fs.writeFileSync(path.join(cwd, 'other.txt'), 'concurrent commit\n');
            git('add', 'other.txt');
            git('commit', '-m', 'test: concurrent user commit');
          }
          head = git('rev-parse', 'HEAD');
          index = git('ls-files', '--stage');
          git('merge', '--ff-only', revision);
        })
      ).rejects.toThrow();
      expect(git('rev-parse', 'HEAD')).toBe(head);
      expect(git('ls-files', '--stage')).toBe(index);
      expect(
        JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')).taptap_publish.developer_id
      ).toBe(290607);
      expect(git('stash', 'list')).toBe('');
    }
  );

  test.each(['remote-semantic', 'local-other', 'staged'])(
    'does not relax Git protection for %s',
    async (mode) => {
      if (mode === 'remote-semantic') {
        const saved = fs.readFileSync(path.join(cwd, file));
        fs.writeFileSync(path.join(cwd, file), git('show', 'HEAD:' + file) + '\n');
        git('checkout', 'remote-qr');
        write({ ...config, version: 'remote-change' });
        git('commit', '-am', 'test: remote semantics');
        git('checkout', 'main');
        fs.writeFileSync(path.join(cwd, file), saved);
      }
      if (mode === 'local-other') write({ ...config, version: 'local-change' });
      if (mode === 'staged') git('add', file);
      const before = fs.readFileSync(path.join(cwd, file));
      const index = git('ls-files', '--stage');
      const head = git('rev-parse', 'HEAD');
      await expect(
        withQrcodeFastForward(cwd, 'remote-qr', async (revision) => {
          git('merge', '--ff-only', revision);
        })
      ).rejects.toThrow();
      expect(fs.readFileSync(path.join(cwd, file))).toEqual(before);
      expect(git('ls-files', '--stage')).toBe(index);
      expect(git('rev-parse', 'HEAD')).toBe(head);
    }
  );

  test.each(['none', 'working-file', 'same-index', 'other-index'])(
    'failed merge restores only its own index entry, preserving concurrent changes: %s',
    async (concurrent) => {
      const before = fs.readFileSync(path.join(cwd, file));
      const index = git('ls-files', '--stage', '--', file);
      let concurrentIndex: string | undefined;
      await expect(
        withQrcodeFastForward(cwd, 'remote-qr', async () => {
          expect(git('rev-parse', ':' + file)).toBe(git('rev-parse', 'remote-qr:' + file));
          expect(fs.readFileSync(path.join(cwd, file))).toEqual(before);
          if (concurrent === 'working-file' || concurrent === 'same-index') {
            write({ ...config, version: 'concurrent-editor' });
            if (concurrent === 'same-index') {
              git('add', file);
              concurrentIndex = git('ls-files', '--stage', '--', file);
            }
          }
          if (concurrent === 'other-index') {
            fs.writeFileSync(path.join(cwd, 'other.txt'), 'concurrent-stage\n');
            git('add', 'other.txt');
            concurrentIndex = git('ls-files', '--stage', '--', 'other.txt');
          }
          throw new Error('forced merge failure');
        })
      ).rejects.toThrow('forced merge failure');
      expect(git('ls-files', '--stage', '--', file)).toBe(
        concurrent === 'same-index' ? concurrentIndex : index
      );
      if (concurrent === 'other-index')
        expect(git('ls-files', '--stage', '--', 'other.txt')).toBe(concurrentIndex);
      if (concurrent === 'working-file' || concurrent === 'same-index')
        expect(JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')).version).toBe(
          'concurrent-editor'
        );
      else expect(fs.readFileSync(path.join(cwd, file))).toEqual(before);
      expect(git('stash', 'list')).toBe('');
      expect(fs.existsSync(path.join(cwd, '.git/index.lock'))).toBe(false);
    }
  );
});
