/**
 * Recovery for `fatal: expected 'acknowledgments'` on fetch.
 *
 * A shallow clone records boundary commits in .git/shallow and git sends them
 * as "shallow <oid>" lines on every fetch. Some lines are redundant: a root
 * commit, or a commit whose parents are already present locally. The Maker
 * gateway can drop fetches that carry such lines. Removing only the redundant
 * lines is safe; real boundaries (a parent object is missing) are kept.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runGitSync } from './exec.js';

const ACKNOWLEDGMENTS_PATTERN = /expected 'acknowledgments'/i;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export function isShallowAcknowledgmentsFailure(message: string): boolean {
  return ACKNOWLEDGMENTS_PATTERN.test(message);
}

/** Removes redundant .git/shallow lines. Returns how many lines were removed. */
export function pruneRedundantShallowMarkers(cwd: string): number {
  let lockFd: number | undefined;
  let lockPath: string | undefined;
  let acquired = false;
  try {
    const shallowPath = path.resolve(
      cwd,
      runGitSync(['rev-parse', '--git-path', 'shallow'], { cwd }).trim()
    );
    lockPath = `${shallowPath}.lock`;
    try {
      // Same exclusive lock git uses. Do not read or replace shallow before
      // this succeeds, and never steal a lock another fetch already holds.
      lockFd = fs.openSync(lockPath, 'wx');
      acquired = true;
    } catch {
      return 0;
    }
    if (!fs.existsSync(shallowPath)) return 0;
    const lines = fs
      .readFileSync(shallowPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const kept = lines.filter((oid) => OBJECT_ID.test(oid) && isRealBoundary(cwd, oid));
    if (kept.length === lines.length) return 0;
    if (kept.length === 0) {
      fs.rmSync(shallowPath, { force: true });
    } else {
      replaceFile(shallowPath, `${kept.join('\n')}\n`);
    }
    return lines.length - kept.length;
  } catch {
    return 0;
  } finally {
    if (acquired) releaseShallowLock(lockFd, lockPath);
  }
}

function releaseShallowLock(lockFd: number | undefined, lockPath: string | undefined): void {
  if (lockFd !== undefined) {
    try {
      fs.closeSync(lockFd);
    } catch {
      // Still remove the lock file below.
    }
  }
  if (lockPath) fs.rmSync(lockPath, { force: true });
}

/** Replaces a file while the caller holds its git lock. POSIX rename is atomic. */
function replaceFile(target: string, contents: string): void {
  if (process.platform === 'win32') {
    fs.writeFileSync(target, contents, 'utf8');
    return;
  }
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, 'utf8');
  try {
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** A boundary is real when the commit exists and at least one parent object is missing. */
function isRealBoundary(cwd: string, oid: string): boolean {
  let body: string;
  try {
    body = runGitSync(['cat-file', '-p', oid], { cwd });
  } catch {
    return false;
  }
  const parents = body
    .split('\n')
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice('parent '.length).trim());
  return parents.some((parent) => {
    try {
      runGitSync(['cat-file', '-e', parent], { cwd });
      return false;
    } catch {
      return true;
    }
  });
}
