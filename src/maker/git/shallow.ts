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

/**
 * Replaces a file while the caller holds its git lock.
 * The new contents are fully written and flushed to a temporary file first, so an
 * interrupted write cannot truncate boundaries that must be kept. Windows cannot
 * rename over an existing file; the original is moved aside and restored if the
 * swap fails.
 */
function replaceFile(target: string, contents: string): void {
  const temporary = `${target}.${process.pid}.tmp`;
  writeCompleteFile(temporary, contents);
  try {
    if (process.platform === 'win32') replaceWithBackup(target, temporary);
    else fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function writeCompleteFile(file: string, contents: string): void {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
    throw error;
  }
  fs.closeSync(fd);
}

function replaceWithBackup(target: string, source: string): void {
  const backup = `${target}.${process.pid}.bak`;
  fs.rmSync(backup, { force: true });
  fs.renameSync(target, backup);
  try {
    fs.renameSync(source, target);
  } catch (error) {
    if (!fs.existsSync(target)) fs.renameSync(backup, target);
    throw error;
  }
  try {
    fs.rmSync(backup, { force: true });
  } catch {
    // Replacement already landed. A leftover backup must not fail the recovery.
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
