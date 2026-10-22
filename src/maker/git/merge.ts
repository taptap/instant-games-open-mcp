/**
 * Merge the Maker remote main into the local branch.
 *
 * Fast-forwards when possible, otherwise creates a local merge commit. When
 * the merge stops on conflicts it is aborted right away, so the working tree
 * and HEAD are back to where they were before the merge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GitCommandError, runGit } from './exec.js';

/** Runs git in the project and returns stdout. Rejects with GitCommandError. */
export type GitRunner = (args: string[], timeoutMs: number) => Promise<string>;

export interface MergeRemoteResult {
  outcome: 'merged' | 'conflict' | 'blocked';
  /** Paths with merge conflicts (merge already aborted). */
  conflictFiles: string[];
  /** Local files git refused to overwrite (merge never started). */
  overwrittenFiles: string[];
  error?: GitCommandError;
}

const INSPECT_TIMEOUT_MS = 15000;

/** Identity used for local merge commits, the same as Maker submit commits. */
export const MAKER_COMMIT_IDENTITY_ARGS = [
  '-c',
  'user.email=maker-mcp@local',
  '-c',
  'user.name=taptap-maker',
];

export function createGitRunner(cwd: string): GitRunner {
  return async (args, timeoutMs) => (await runGit(args, { cwd, timeoutMs })).stdout;
}

/** True while a merge, rebase, cherry-pick or bisect is unfinished, or the index is locked. */
export async function gitOperationInProgress(cwd: string, run: GitRunner): Promise<boolean> {
  for (const name of [
    'MERGE_HEAD',
    'REBASE_HEAD',
    'CHERRY_PICK_HEAD',
    'BISECT_LOG',
    'rebase-merge',
    'rebase-apply',
    'index.lock',
  ]) {
    if (await gitPathExists(cwd, run, name)) return true;
  }
  return false;
}

export async function gitPathExists(cwd: string, run: GitRunner, name: string): Promise<boolean> {
  const relative = (await run(['rev-parse', '--git-path', name], INSPECT_TIMEOUT_MS)).trim();
  return fs.existsSync(path.resolve(cwd, relative));
}

/**
 * Callers must check `gitOperationInProgress` first: on conflicts this aborts the
 * merge it started, and must never abort a merge the user already had in progress.
 */
export async function mergeRemote(
  cwd: string,
  ref: string,
  run: GitRunner = createGitRunner(cwd)
): Promise<MergeRemoteResult> {
  try {
    // No kill timeout: killing git mid-merge leaves index.lock behind.
    await run(
      [...MAKER_COMMIT_IDENTITY_ARGS, 'merge', '--no-edit', '--ff', '--no-autostash', ref],
      0
    );
    return { outcome: 'merged', conflictFiles: [], overwrittenFiles: [] };
  } catch (error) {
    const gitError = error instanceof GitCommandError ? error : undefined;
    if (!gitError) throw error;
    if (await gitPathExists(cwd, run, 'MERGE_HEAD')) {
      const conflictFiles = await readConflictFiles(run);
      await run(['merge', '--abort'], INSPECT_TIMEOUT_MS).catch(() => undefined);
      if (await gitPathExists(cwd, run, 'MERGE_HEAD')) {
        return { outcome: 'blocked', conflictFiles, overwrittenFiles: [], error: gitError };
      }
      return { outcome: 'conflict', conflictFiles, overwrittenFiles: [], error: gitError };
    }
    return {
      outcome: 'blocked',
      conflictFiles: [],
      overwrittenFiles: parseOverwrittenFiles(gitError.stderr),
      error: gitError,
    };
  }
}

async function readConflictFiles(run: GitRunner): Promise<string[]> {
  try {
    const raw = await run(['diff', '--name-only', '--diff-filter=U', '-z'], INSPECT_TIMEOUT_MS);
    return raw.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

/** Files listed by git's "would be overwritten by merge" refusal. */
export function parseOverwrittenFiles(stderr: string): string[] {
  const match = stderr.match(
    /would be overwritten by merge:\r?\n([\s\S]*?)\r?\n(?:Please|Aborting)/
  );
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
