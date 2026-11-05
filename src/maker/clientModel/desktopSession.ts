import { opendir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MakerClientModel } from './types.js';
import { CODEX_THREAD_ID_PATTERN, findWindowsCodexThread } from './windowsCodexThread.js';

type Run = (command: string, args: string[], signal: AbortSignal) => Promise<string>;
const MAX_ROWS = 512;
const THREAD_ID = CODEX_THREAD_ID_PATTERN;

function value(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const text = input.trim();
  return text && text.length <= 256 && !/^(unknown|unavailable|n\/a|null|undefined)$/i.test(text)
    ? text
    : undefined;
}

function normalized(filename: string): string {
  const result = filename.replace(/^\\\\\?\\/, '').replace(/\\/g, '/');
  return process.platform === 'win32' ? result.toLowerCase() : result;
}

function literal(text: string): string {
  return "'" + text.replace(/'/g, "''") + "'";
}

async function rows(database: string, query: string, signal: AbortSignal, run: Run) {
  const output = await run(
    'sqlite3',
    [
      '-readonly',
      '-json',
      '-init',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-cmd',
      '.timeout 100',
      database,
      query,
    ],
    signal
  );
  signal.throwIfAborted();
  const result: unknown = JSON.parse(output || '[]');
  if (!Array.isArray(result) || result.length > MAX_ROWS) return [];
  return result.filter(
    (row): row is Record<string, unknown> =>
      row !== null && typeof row === 'object' && !Array.isArray(row)
  );
}

function projectCondition(column: string, project: string): string {
  const expression = `replace(${column}, char(92), '/')`;
  const comparable = process.platform === 'win32' ? `lower(${expression})` : expression;
  const projectPath = normalized(project);
  return `(${comparable} = ${literal(projectPath)} OR ${comparable} = ${literal('//?/' + projectPath)})`;
}

async function matchesProject(candidate: unknown, project: string): Promise<boolean> {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  try {
    return normalized(await realpath(candidate)) === normalized(project);
  } catch {
    return false;
  }
}

export function cindyDataDirectory(): string | undefined {
  if (process.platform === 'win32') {
    return process.env.APPDATA && path.isAbsolute(process.env.APPDATA)
      ? path.join(process.env.APPDATA, 'Cindy')
      : undefined;
  }
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cindy');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Cindy');
}

async function lockedThread(pid: number, home: string, signal: AbortSignal, run: Run) {
  if (process.platform === 'win32') return findWindowsCodexThread(pid, home, signal, run);
  const output = await run('lsof', ['-n', '-P', '-a', '-p', String(pid), '-Fn'], signal);
  const locks = [
    ...new Set(
      output
        .split('\n')
        .filter((line) => line.startsWith('n'))
        .map((line) => line.slice(1))
        .filter(
          (file) =>
            path.isAbsolute(file) &&
            path.dirname(file) === path.join(home, 'thread-writer-locks') &&
            file.endsWith('.lock')
        )
    ),
  ];
  const id = locks.length === 1 ? path.basename(locks[0], '.lock') : '';
  return THREAD_ID.test(id) ? id : undefined;
}

/** Only one account database is accepted; never pick the newest account or read chat bodies. */
export async function readCindySessionModel(
  projectDir: string,
  ancestors: number[],
  signal: AbortSignal,
  run: Run,
  codexPid?: number
): Promise<MakerClientModel> {
  const root = cindyDataDirectory();
  if (!root) return {};
  const databases: string[] = [];
  const directory = await opendir(root);
  let count = 0;
  for await (const entry of directory) {
    signal.throwIfAborted();
    if (++count > MAX_ROWS) return {};
    if (entry.isFile() && /^cindy-[a-zA-Z0-9_-]+\.db$/.test(entry.name)) databases.push(entry.name);
  }
  if (databases.length !== 1) return {};
  const project = await realpath(projectDir);
  const inheritedThread = process.env.CODEX_THREAD_ID;
  if (inheritedThread && !THREAD_ID.test(inheritedThread)) return {};
  const thread =
    inheritedThread ||
    (codexPid
      ? await lockedThread(
          codexPid,
          process.env.CODEX_HOME || path.join(root, 'codex-home'),
          signal,
          run
        )
      : undefined);
  const records = await rows(
    path.join(root, databases[0]),
    'SELECT model, sdk_session_id, active_turn_pid, working_dir, worktree_path, ' +
      'id FROM sessions ' +
      "WHERE status <> 'archived' AND hidden_at IS NULL AND remote_host_id IS NULL AND (" +
      projectCondition('COALESCE(worktree_path, working_dir)', project) +
      ') ' +
      (thread ? 'AND sdk_session_id = ' + literal(thread) + ' ' : '') +
      'LIMIT 513;',
    signal,
    run
  );
  const matching = [];
  for (const record of records) {
    signal.throwIfAborted();
    if (await matchesProject(record.worktree_path ?? record.working_dir, project))
      matching.push(record);
  }
  const exact = matching.filter(
    (row) =>
      (thread && THREAD_ID.test(thread) && row.sdk_session_id === thread) ||
      (typeof row.active_turn_pid === 'number' && ancestors.includes(row.active_turn_pid))
  );
  // No latest-session guess: unrelated activity must not change this caller's model.
  if (exact.length !== 1 || (thread && exact[0].sdk_session_id !== thread)) return {};
  const selected = exact[0];
  const model = value(selected.model);
  if (!model) return {};
  return {
    client_model_id: model,
    client_ide_name: 'Cindy',
    model_lookup_scope: 'current_session',
  };
}

/** Resolve the current thread from its environment or the caller's unique writer lock. */
export async function readWindowsCodexModel(
  projectDir: string,
  signal: AbortSignal,
  run: Run,
  codexPid: number
): Promise<MakerClientModel> {
  const project = await realpath(projectDir);
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  if (!path.isAbsolute(home)) return {};
  const thread = process.env.CODEX_THREAD_ID || (await lockedThread(codexPid, home, signal, run));
  if (!thread || !THREAD_ID.test(thread)) return {};
  const records = await rows(
    path.join(home, 'state_5.sqlite'),
    'SELECT model, model_provider, cwd, updated_at FROM threads WHERE archived = 0 AND ' +
      'id = ' +
      literal(thread) +
      ' LIMIT 2;',
    signal,
    run
  );
  const selected = records[0];
  if (!selected || records.length !== 1 || !(await matchesProject(selected.cwd, project)))
    return {};
  const model = value(selected.model);
  if (!model) return {};
  return {
    client_model_id: model,
    model_provider: value(selected.model_provider),
    client_ide_name: 'Codex',
    model_lookup_scope: 'current_session',
  };
}
