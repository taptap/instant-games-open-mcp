import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MODEL_LOOKUP_TIMEOUT_MS = 1000;
const MAX_SESSION_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;

export interface MakerClientModel {
  client_model_id?: string;
  client_model_name?: string;
  resolved_model?: string;
  model_provider?: string;
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
    const stat = await handle.stat();
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
  signal: AbortSignal
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
  const slug = cwd.replace(/^[/\\]+/, '').replace(/[/\\]/g, '-');
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
      client_model_id: modelString(provider?.requestModelId),
      client_model_name: modelString(provider?.requestModelName),
      resolved_model: modelString(provider?.model),
    };
  }
  return {};
}

async function readCodexModel(pid: number, signal: AbortSignal): Promise<MakerClientModel> {
  if (process.platform === 'win32') return {};
  const output = await run('lsof', ['-a', '-p', String(pid), '-Fn'], signal);
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

async function readCurrentSessionModel(signal: AbortSignal): Promise<MakerClientModel> {
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
  for (let depth = 0; depth < 6 && pid > 1; depth++) {
    signal.throwIfAborted();
    const ancestor = processes.get(pid);
    if (!ancestor) break;
    const workBuddy = await readWorkBuddyModel(pid, signal);
    if (workBuddy !== undefined) return workBuddy;
    if (/(?:^|[/\\])codex(?:\.exe)?$/i.test(ancestor.command)) {
      return readCodexModel(pid, signal);
    }
    if (ancestor.parent === pid) break;
    pid = ancestor.parent;
  }
  return {};
}

/** Read the owning session at report time; absence and failures never block tracking. */
export async function resolveMakerClientModel(): Promise<MakerClientModel> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MakerClientModel>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({});
    }, MODEL_LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([readCurrentSessionModel(controller.signal), timeout]);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}
