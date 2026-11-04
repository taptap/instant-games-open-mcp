/**
 * Maker forces command-local HTTP/1.1 without changing Git config.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGit, runGitSync } from '../maker/git/exec';

const originalBin = process.env.TAPTAP_MAKER_GIT_BIN;
const tempDirs: string[] = [];

function installFakeGit(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-git-http-'));
  tempDirs.push(dir);
  const bin = path.join(dir, 'git');
  fs.writeFileSync(bin, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  return bin;
}

afterEach(() => {
  if (originalBin === undefined) delete process.env.TAPTAP_MAKER_GIT_BIN;
  else process.env.TAPTAP_MAKER_GIT_BIN = originalBin;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

test('runGit forces command-local HTTP/1.1', async () => {
  process.env.TAPTAP_MAKER_GIT_BIN = installFakeGit();
  const result = await runGit(['fetch', 'origin']);
  expect(result.stdout).toBe('-c\nhttp.version=HTTP/1.1\nfetch\norigin\n');
});

test('runGitSync forces command-local HTTP/1.1', () => {
  process.env.TAPTAP_MAKER_GIT_BIN = installFakeGit();
  expect(runGitSync(['status'])).toBe('-c\nhttp.version=HTTP/1.1\nstatus\n');
});
