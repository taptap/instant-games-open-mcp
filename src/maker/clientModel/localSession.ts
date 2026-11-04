import { execFile } from 'node:child_process';
import { open, opendir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { MakerClientModel, MakerClientModelContext } from './types.js';
import { bestEffort } from '../system/bestEffort.js';
import { LOCAL_PROBE_TIMEOUT_MS as MODEL_LOOKUP_TIMEOUT_MS } from './limits.js';
import {
  cindyDataDirectory,
  readCindySessionModel,
  readWindowsCodexModel,
} from './desktopSession.js';

const execFileAsync = promisify(execFile);
const MAX_SESSION_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_SCAN_ENTRIES = 512;
const MAX_PENDING_PROBES = 4;
let pendingProbes = 0;

async function localProbe<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  fallback: T
): Promise<T> {
  if (pendingProbes >= MAX_PENDING_PROBES) return fallback;
  return bestEffort(
    async (signal) => {
      pendingProbes++;
      try {
        return await operation(signal);
      } finally {
        // A timed-out OS read may still be pending; keep its slot until it really ends.
        pendingProbes--;
      }
    },
    MODEL_LOOKUP_TIMEOUT_MS,
    fallback
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function modelString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 256 ? trimmed : undefined;
}

async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    signal,
    timeout: MODEL_LOOKUP_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  return stdout;
}

async function readSessionText(
  filename: string,
  tail: boolean,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted();
  const handle = await open(filename, 'r');
  try {
    signal.throwIfAborted();
    const stat = await handle.stat();
    signal.throwIfAborted();
    if (!stat.isFile() || (!tail && stat.size > MAX_SESSION_BYTES)) {
      throw new Error('Unsupported session file');
    }
    const size = Math.min(stat.size, tail ? MAX_TRANSCRIPT_BYTES : MAX_SESSION_BYTES);
    const offset = tail ? stat.size - size : 0;
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, offset);
    signal.throwIfAborted();
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    // A tail read may start inside a JSON record; discard that partial first line.
    return offset > 0 ? (text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : '') : text;
  } finally {
    await handle.close();
  }
}

async function readWorkBuddyModel(
  pid: number,
  signal: AbortSignal,
  projectDir?: string
): Promise<MakerClientModel | undefined> {
  const home = path.join(os.homedir(), '.workbuddy');
  let sessionText: string;
  try {
    sessionText = await readSessionText(
      path.join(home, 'sessions', String(pid) + '.json'),
      false,
      signal
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const session = asRecord(JSON.parse(sessionText));
  const sessionId = session?.sessionId;
  const cwd = session?.cwd;
  if (
    typeof sessionId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) ||
    typeof cwd !== 'string' ||
    !cwd
  ) {
    return {};
  }
  if (projectDir && !(await sameProject(cwd, await realpath(projectDir)))) return {};
  const slug = cwd
    .replace(/^([a-z]):(?=[/\\])/i, (_, drive: string) => drive.toLowerCase())
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]/g, '-');
  if (!slug || slug === '.' || slug === '..') return {};
  const transcript = await readSessionText(
    path.join(home, 'projects', slug, sessionId + '.jsonl'),
    true,
    signal
  );
  const lines = transcript.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    let record: Record<string, unknown> | undefined;
    try {
      record = asRecord(JSON.parse(lines[index]));
    } catch {
      continue;
    }
    if (!record || !Object.prototype.hasOwnProperty.call(record, 'providerData')) continue;
    const provider = asRecord(record.providerData);
    // Use one latest record, never fill missing fields from older model selections.
    return {
      client_ide_name: 'WorkBuddy',
      client_model_id: modelString(provider?.requestModelId),
      client_model_name: modelString(provider?.requestModelName),
      resolved_model: modelString(provider?.model),
    };
  }
  return {};
}

async function readCodexModel(
  pid: number,
  signal: AbortSignal,
  context: MakerClientModelContext
): Promise<MakerClientModel> {
  if (process.platform === 'win32') {
    return context.projectDir ? readWindowsCodexModel(context.projectDir, signal, run, pid) : {};
  }
  const output = await run('lsof', ['-n', '-P', '-a', '-p', String(pid), '-Fn'], signal);
  const locks = new Set(
    output
      .split('\n')
      .filter((line) => line.startsWith('n'))
      .map((line) => line.slice(1))
      .filter(
        (filename) =>
          path.isAbsolute(filename) &&
          path.basename(path.dirname(filename)) === 'thread-writer-locks' &&
          filename.endsWith('.lock')
      )
  );
  if (locks.size !== 1) return {};
  const lock = [...locks][0];
  const threadId = path.basename(lock, '.lock');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId)) return {};
  const database = path.join(path.dirname(path.dirname(lock)), 'state_5.sqlite');
  const result = await run(
    'sqlite3',
    [
      '-readonly',
      '-json',
      '-init',
      '/dev/null',
      '-cmd',
      '.timeout 100',
      database,
      "SELECT model, model_provider FROM threads WHERE id = '" + threadId + "' LIMIT 1;",
    ],
    signal
  );
  const rows: unknown = JSON.parse(result);
  const row = Array.isArray(rows) && rows.length === 1 ? asRecord(rows[0]) : undefined;
  return {
    client_model_id: modelString(row?.model),
    model_provider: modelString(row?.model_provider),
  };
}

async function directoryNames(directory: string, signal: AbortSignal): Promise<string[]> {
  const names: string[] = [];
  let count = 0;
  const handle = await opendir(directory);
  for await (const entry of handle) {
    signal.throwIfAborted();
    if (++count > MAX_SCAN_ENTRIES) throw new Error('Session scan limit exceeded');
    if (entry.isDirectory()) names.push(entry.name);
  }
  return names;
}

async function sameProject(candidate: unknown, projectDir: string): Promise<boolean> {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  try {
    const resolved = await realpath(candidate);
    return process.platform === 'win32'
      ? resolved.toLowerCase() === projectDir.toLowerCase()
      : resolved === projectDir;
  } catch {
    return false;
  }
}

async function readKiroModel(projectDir: string, signal: AbortSignal): Promise<MakerClientModel> {
  const root = path.join(os.homedir(), '.kiro', 'sessions');
  let latest: Record<string, unknown> | undefined;
  let latestTime = -Infinity;
  let tied = false;
  let count = 0;
  for (const workspace of await directoryNames(root, signal)) {
    for (const session of await directoryNames(path.join(root, workspace), signal)) {
      signal.throwIfAborted();
      if (++count > MAX_SCAN_ENTRIES) return {};
      if (!session.startsWith('sess_')) continue;
      let record: Record<string, unknown> | undefined;
      try {
        record = asRecord(
          JSON.parse(
            await readSessionText(
              path.join(root, workspace, session, 'session.json'),
              false,
              signal
            )
          )
        );
      } catch {
        signal.throwIfAborted();
        continue;
      }
      if (!Array.isArray(record?.workspacePaths)) continue;
      let matchesProject = false;
      for (const candidate of record.workspacePaths) {
        signal.throwIfAborted();
        if (await sameProject(candidate, projectDir)) {
          matchesProject = true;
          break;
        }
      }
      const modified =
        typeof record.lastModifiedAt === 'string' ? Date.parse(record.lastModifiedAt) : NaN;
      if (!matchesProject || !Number.isFinite(modified)) continue;
      if (modified > latestTime) {
        latest = record;
        latestTime = modified;
        tied = false;
      } else if (modified === latestTime) {
        tied = true;
      }
    }
  }
  const id = modelString(latest?.modelId);
  if (tied || !id) return {};
  return {
    client_model_id: id,
    client_model_name: modelString(asRecord(latest?.contextSnapshotModelDisplay)?.display),
    model_lookup_scope: 'latest_session',
  };
}

async function readTraeValueRows(
  database: string,
  condition: string,
  signal: AbortSignal
): Promise<unknown[]> {
  const result = await run(
    'sqlite3',
    [
      '-readonly',
      '-json',
      '-init',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-cmd',
      '.timeout 100',
      database,
      'SELECT value FROM ItemTable WHERE ' + condition + ';',
    ],
    signal
  );
  const rows: unknown = JSON.parse(result || '[]');
  return Array.isArray(rows) ? rows : [];
}

async function readTraeModel(projectDir: string, signal: AbortSignal): Promise<MakerClientModel> {
  const appData =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA
        : undefined;
  if (!appData || !path.isAbsolute(appData)) return {};
  const root = path.join(appData, 'Trae CN', 'User');
  const workspaces = path.join(root, 'workspaceStorage');
  const matches: string[] = [];
  for (const workspace of await directoryNames(workspaces, signal)) {
    signal.throwIfAborted();
    try {
      const record = asRecord(
        JSON.parse(
          await readSessionText(path.join(workspaces, workspace, 'workspace.json'), false, signal)
        )
      );
      if (typeof record?.folder !== 'string' || !record.folder.startsWith('file:')) continue;
      if (await sameProject(fileURLToPath(record.folder), projectDir)) matches.push(workspace);
    } catch {
      signal.throwIfAborted();
    }
  }
  if (matches.length !== 1) return {};
  const sessions = await readTraeValueRows(
    path.join(workspaces, matches[0], 'state.vscdb'),
    "key = 'ai-chat-v2.lastActiveSessionId'",
    signal
  );
  const sessionId = sessions.length === 1 ? modelString(asRecord(sessions[0])?.value) : undefined;
  if (!sessionId) return {};
  const rows = await readTraeValueRows(
    path.join(root, 'globalStorage', 'state.vscdb'),
    "substr(key, -length(':AI.agent.model.session_selected_model')) = " +
      "':AI.agent.model.session_selected_model'",
    signal
  );
  const models = new Set<string>();
  for (const row of rows) {
    signal.throwIfAborted();
    const value = asRecord(row)?.value;
    if (typeof value !== 'string') return {};
    const selections = asRecord(asRecord(JSON.parse(value))?.[sessionId]);
    if (!selections) continue;
    for (const selection of Object.values(selections)) {
      const id = modelString(asRecord(selection)?.modelId);
      if (!id) return {};
      models.add(id);
    }
  }
  // The active Agent label is unknown; never prefer one of several different models.
  return models.size === 1
    ? { client_model_id: [...models][0], model_lookup_scope: 'latest_session' }
    : {};
}

function fallbackClient(name: string): 'kiro' | 'trae-cn' | undefined {
  if (/^(?:kiro)(?:[ ._-].*)?$/i.test(name)) return 'kiro';
  if (/^trae[ _-]cn(?:[ ._-].*)?$/i.test(name)) return 'trae-cn';
  return undefined;
}

async function readLatestSessionModel(
  client: 'kiro' | 'trae-cn',
  context: MakerClientModelContext,
  signal: AbortSignal
): Promise<MakerClientModel> {
  if (!context.projectDir) return {};
  const projectDir = await realpath(context.projectDir);
  signal.throwIfAborted();
  return client === 'kiro' ? readKiroModel(projectDir, signal) : readTraeModel(projectDir, signal);
}

async function readCurrentSessionModel(
  signal: AbortSignal,
  context: MakerClientModelContext
): Promise<MakerClientModel> {
  const client = fallbackClient(context.clientName?.trim() || '');
  if (client) return readLatestSessionModel(client, context, signal);
  if (
    /^cindy(?:[ ._-].*)?$/i.test(context.clientName || '') &&
    context.projectDir &&
    process.env.CODEX_THREAD_ID
  ) {
    return readCindySessionModel(context.projectDir, [], signal, run);
  }
  // Terminal children inherit the exact thread; avoid an expensive Windows process query.
  const cindyRoot = cindyDataDirectory();
  if (
    context.projectDir &&
    process.env.CODEX_THREAD_ID &&
    cindyRoot &&
    process.env.CODEX_HOME &&
    path.resolve(process.env.CODEX_HOME) === path.join(cindyRoot, 'codex-home')
  ) {
    return readCindySessionModel(context.projectDir, [], signal, run);
  }
  const clientProcesses = context.clientProcesses ?? (await readClientProcesses(signal));
  const ancestors = clientProcesses.map(({ pid }) => pid);
  if (
    context.projectDir &&
    (/^cindy(?:[ ._-].*)?$/i.test(context.clientName || '') ||
      clientProcesses.some(({ command }) =>
        /(?:^|[/\\])cindy(?:\.exe|\.app(?:[/\\].*)?)?$/i.test(command)
      ))
  ) {
    const codexPid = clientProcesses.find(({ command }) =>
      /(?:^|[/\\])codex(?:\.exe)?$/i.test(command)
    )?.pid;
    return readCindySessionModel(context.projectDir, ancestors, signal, run, codexPid);
  }
  for (const { pid, command } of clientProcesses) {
    signal.throwIfAborted();
    const workBuddy = await readWorkBuddyModel(pid, signal, context.projectDir);
    if (workBuddy !== undefined) return workBuddy;
    if (/(?:^|[/\\])codex(?:\.exe)?$/i.test(command)) {
      return readCodexModel(pid, signal, context);
    }
    const app = command.split(/[/\\]/).find((part) => /\.app$/i.test(part));
    const editor = fallbackClient(path.basename(command)) ?? fallbackClient(app ?? '');
    if (editor) return readLatestSessionModel(editor, context, signal);
  }
  return {};
}

async function readClientProcesses(signal: AbortSignal) {
  const output =
    process.platform === 'win32'
      ? await run(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process | " +
              "ForEach-Object { '{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, $_.Name }",
          ],
          signal
        )
      : await run('ps', ['-axo', 'pid=,ppid=,comm='], signal);
  const processes = new Map<number, { parent: number; command: string }>();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (match) {
      processes.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
    }
  }
  let pid = process.ppid;
  const ancestors: Array<{ pid: number; command: string }> = [];
  for (let depth = 0; depth < 6 && pid > 1; depth++) {
    signal.throwIfAborted();
    const ancestor = processes.get(pid);
    if (!ancestor) break;
    ancestors.push({ pid, command: ancestor.command });
    if (ancestor.parent === pid) break;
    pid = ancestor.parent;
  }
  return ancestors;
}

/** Resolve stable IDE identity once; callers retain this only for their own connection. */
export async function identifyLocalClient(clientName?: string) {
  const clientProcesses = await localProbe(readClientProcesses, []);
  const known = [
    ['Cindy', /(?:^|[/\\])cindy(?:\.exe|\.app(?:[/\\].*)?)?$/i],
    ['Cursor', /(?:^|[/\\])cursor(?:\.exe|\.app(?:[/\\].*)?)?$/i],
    ['WorkBuddy', /(?:^|[/\\])workbuddy(?:\.exe|\.app(?:[/\\].*)?)?$/i],
    ['Claude Code', /(?:^|[/\\])claude(?:\.exe)?$/i],
    ['Codex', /(?:^|[/\\])codex(?:\.exe)?$/i],
  ] as const;
  const ide = known.find(([, pattern]) =>
    clientProcesses.some(({ command }) => pattern.test(command))
  )?.[0];
  return { clientProcesses, clientIdeName: ide ?? modelString(clientName) };
}

/** Read at report time; explicitly mark latest-session fallbacks and isolate all failures. */
export async function resolveLocalSessionModel(
  context: MakerClientModelContext = {}
): Promise<MakerClientModel> {
  const model = await localProbe<MakerClientModel>(
    (signal) => readCurrentSessionModel(signal, context),
    {}
  );
  if (!Object.values(model).some(Boolean)) return {};
  return { ...model, model_lookup_scope: model.model_lookup_scope ?? 'current_session' };
}
