/**
 * Git stdout is decoded as a UTF-8 stream, not one Buffer at a time.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGit } from '../maker/git/exec';

test('runGit keeps a multibyte path intact', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-git-encoding-'));
  try {
    const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8' });
    expect(init.status).toBe(0);
    const name = path.join('脚本', '主程序.lua');
    fs.mkdirSync(path.join(root, '脚本'));
    fs.writeFileSync(path.join(root, name), '-- 中文\n');
    const result = await runGit(
      ['-c', 'core.quotePath=false', 'status', '--porcelain', '--untracked-files=all'],
      { cwd: root }
    );
    expect(result.stdout).toContain('脚本/主程序.lua');
    expect(result.stdout).not.toContain('\uFFFD');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
