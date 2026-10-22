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
  try {
    const shallowPath = path.resolve(
      cwd,
      runGitSync(['rev-parse', '--git-path', 'shallow'], { cwd }).trim()
    );
    if (!fs.existsSync(shallowPath) || fs.existsSync(shallowPath + '.lock')) return 0;
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
      const temporary = `${shallowPath}.maker-${process.pid}`;
      fs.writeFileSync(temporary, kept.join('\n') + '\n', 'utf8');
      fs.renameSync(temporary, shallowPath);
    }
    return lines.length - kept.length;
  } catch {
    return 0;
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
