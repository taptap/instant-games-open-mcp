import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { previewDirectory, writePrivateJson } from './protocol.js';
import { getMakerHome } from '../storage.js';
import { processPresence } from '../system/processPresence.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { withPreviewLock } from './installation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RETENTION_MS = 7 * 86400000;
const CLEANUP_INTERVAL_MS = 86400000;
const BUDGET_BYTES = 5 * 1024 ** 3;
const LIMITS: Record<string, number> = {
  'run.json': 16384,
  'result.json': 8 * 1024 ** 2,
  'invocation.json': 65536,
  'validate.json': 4 * 1024 ** 2,
  'runtime.log': 1024 ** 2 + 65536,
  'runtime.log.1': 1024 ** 2 + 65536,
  'prepare.log': 16 * 1024 ** 2,
  'screenshot.png': 128 * 1024 ** 2,
};

export type ValidationRun = {
  run_id: string;
  project_realpath: string;
  started_at: string;
  phase: string;
  owner_pid: number;
  runtime_pid?: number;
  runtime_launch_pending?: boolean;
  finished_at?: string;
  result?: string;
  game_result?: string;
};
export type ValidationHandle = ValidationRun & { directory: string };

// Anchor at the user's Maker home, then reject links in every managed component.
async function historyRoot(project: string, create = false): Promise<string> {
  if (create) await fs.promises.mkdir(getMakerHome(), { recursive: true, mode: 0o700 });
  const home = await fs.promises.realpath(getMakerHome());
  let current = home;
  for (const part of ['preview', path.basename(previewDirectory(project)), 'validation']) {
    current = path.join(current, part);
    if (create) {
      try {
        await fs.promises.mkdir(current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = await fs.promises.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Invalid validation evidence directory.');
  }
  return current;
}

async function runDirectory(project: string, id: string): Promise<string> {
  if (!UUID.test(id)) throw new Error('Invalid validation run ID.');
  const directory = path.join(await historyRoot(project), id);
  const stat = await fs.promises.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Invalid validation run directory.');
  return directory;
}

async function artifact(
  directory: string,
  name: string,
  max = LIMITS[name]
): Promise<Buffer | undefined> {
  if (!max) throw new Error('Unknown validation artifact.');
  const filename = path.join(directory, name);
  let file: fs.promises.FileHandle | undefined;
  try {
    const before = await fs.promises.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size > max)
      throw new Error('Invalid or oversized validation artifact.');
    file = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = await file.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > max)
      throw new Error('Validation artifact identity changed.');
    // Bound the read even when a producer is still appending.
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return bytes.subarray(0, offset);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  } finally {
    await file?.close();
  }
}

async function jsonArtifact(
  directory: string,
  name: string
): Promise<Record<string, unknown> | undefined> {
  const bytes = await artifact(directory, name);
  if (!bytes) return undefined;
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid validation JSON.');
  return value;
}

async function record(project: string, id: string): Promise<ValidationRun> {
  const data = await jsonArtifact(await runDirectory(project, id), 'run.json');
  if (
    !data ||
    data.run_id !== id ||
    data.project_realpath !== project ||
    typeof data.started_at !== 'string' ||
    !Number.isFinite(Date.parse(data.started_at)) ||
    typeof data.phase !== 'string' ||
    !Number.isSafeInteger(data.owner_pid) ||
    Number(data.owner_pid) <= 0 ||
    (data.runtime_pid !== undefined &&
      (!Number.isSafeInteger(data.runtime_pid) || Number(data.runtime_pid) <= 0)) ||
    (data.runtime_launch_pending !== undefined &&
      typeof data.runtime_launch_pending !== 'boolean') ||
    (data.finished_at !== undefined &&
      (typeof data.finished_at !== 'string' || !Number.isFinite(Date.parse(data.finished_at))))
  )
    throw new Error('Invalid validation run record.');
  return data as ValidationRun;
}

function summary(run: ValidationRun) {
  return {
    ...run,
    status: run.finished_at
      ? 'finished'
      : processPresence(run.owner_pid) === 'alive' &&
          Date.now() - Date.parse(run.started_at) < 3600000
        ? 'running'
        : 'incomplete',
  };
}

export async function createValidationRun(project: string): Promise<ValidationHandle> {
  const root = await historyRoot(project, true);
  const run_id = randomUUID();
  const directory = path.join(root, run_id);
  await fs.promises.mkdir(directory, { mode: 0o700 });
  await fs.promises.writeFile(path.join(directory, 'runtime.log'), '', { flag: 'wx', mode: 0o600 });
  const run: ValidationHandle = {
    run_id,
    directory,
    project_realpath: project,
    started_at: new Date().toISOString(),
    phase: 'preparing',
    owner_pid: process.pid,
  };
  updateValidationRun(run, {});
  return run;
}

export function updateValidationRun(run: ValidationHandle, update: Partial<ValidationRun>): void {
  Object.assign(run, update);
  const { directory, ...data } = run;
  writePrivateJson(path.join(directory, 'run.json'), data);
}

export function finishValidationRun(run: ValidationHandle, result: Record<string, unknown>): void {
  writePrivateJson(path.join(run.directory, 'result.json'), result);
  updateValidationRun(run, {
    phase: 'finished',
    finished_at: new Date().toISOString(),
    result: String(result.result),
    game_result: (result.report as Record<string, unknown> | undefined)?.result as
      | string
      | undefined,
    runtime_pid: undefined,
    runtime_launch_pending: false,
  });
}

async function records(
  project: string,
  limit = 5000
): Promise<{ runs: ValidationRun[]; warnings: string[] }> {
  const warnings: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(await historyRoot(project), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { runs: [], warnings };
    throw error;
  }
  const ids = entries.filter((item) => UUID.test(item.name) && item.isDirectory());
  entries
    .filter((item) => UUID.test(item.name) && !item.isDirectory())
    .forEach((item) => warnings.push(`Invalid validation run directory: ${item.name}`));
  if (ids.length > limit) warnings.push('History scan limited to 5000 runs; archive old evidence.');
  const runs: ValidationRun[] = [];
  for (const item of ids.slice(0, limit)) {
    try {
      runs.push(await record(project, item.name));
    } catch {
      warnings.push(`Unreadable validation record: ${item.name}`);
    }
  }
  runs.sort((a, b) => b.started_at.localeCompare(a.started_at) || b.run_id.localeCompare(a.run_id));
  return { runs, warnings };
}

// Call under the project operation lock before launching any new Runtime.
export async function requireNoActiveValidationRuntime(
  project: string,
  currentRun?: string
): Promise<void> {
  const { runs, warnings } = await records(project, Infinity);
  if (warnings.length)
    throw new Error(
      'Validation Runtime ownership is unverified. Inspect ' +
        path.join(previewDirectory(project), 'validation') +
        ': ' +
        warnings.join('; ')
    );
  for (const run of runs) {
    if (run.run_id === currentRun || run.finished_at) continue;
    const unknownLaunch =
      run.runtime_launch_pending === true || (!run.runtime_pid && run.phase !== 'preparing');
    if (unknownLaunch || (run.runtime_pid && processPresence(run.runtime_pid) !== 'missing'))
      throw new Error(
        'A previous validation Runtime is active or unverified (run ' +
          run.run_id +
          '). Inspect ' +
          path.join(previewDirectory(project), 'validation', run.run_id, 'run.json') +
          ' and confirm that Runtime has exited before retrying. No process was stopped.'
      );
  }
}

export async function listValidationRuns(project: string, before?: string) {
  const { runs, warnings } = await records(project);
  const index = before ? runs.findIndex((run) => run.run_id === before) : -1;
  if (before && index < 0) throw new Error('History cursor expired. Refresh validation history.');
  const page = runs.slice(index + 1, index + 21);
  return {
    runs: page.map(summary),
    next_cursor: index + 21 < runs.length ? page.at(-1)?.run_id : undefined,
    warnings,
  };
}

export function isCompleteValidationPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 45 &&
    bytes.toString('hex', 0, 8) === '89504e470d0a1a0a' &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0 &&
    bytes.subarray(-12).toString('hex') === '0000000049454e44ae426082'
  );
}

export async function readValidationRun(project: string, id: string) {
  const run = await record(project, id);
  const directory = await runDirectory(project, id);
  const result = await jsonArtifact(directory, 'result.json');
  const invocation = await jsonArtifact(directory, 'invocation.json');
  const warnings: string[] = [];
  let report: Record<string, unknown> | undefined;
  try {
    report = await jsonArtifact(directory, 'validate.json');
  } catch {
    warnings.push(
      'Runtime report is incomplete or unreadable; inspect logs and retained evidence.'
    );
  }
  // Publishing a screenshot requires the executor's completed collection, not a file's existence.
  const screenshots =
    Array.isArray(result?.artifacts) &&
    result.artifacts.some((item) => item && item.kind === 'screenshot');
  return sanitizeDiagnosticValue({
    run: summary(run),
    result,
    invocation,
    report,
    artifacts: screenshots ? [{ id: 'screenshot.png', kind: 'screenshot' }] : [],
    warnings,
  }) as {
    run: ReturnType<typeof summary>;
    result?: Record<string, unknown>;
    invocation?: Record<string, unknown>;
    report?: Record<string, unknown>;
    artifacts: { id: string; kind: string }[];
    warnings: string[];
  };
}

export async function readValidationArtifact(
  project: string,
  id: string,
  name: string
): Promise<Buffer> {
  if (name !== 'screenshot.png') throw new Error('Unknown validation artifact.');
  const detail = await readValidationRun(project, id);
  if (!detail.artifacts.length) throw new Error('Screenshot has not been collected.');
  const bytes = await artifact(await runDirectory(project, id), name);
  if (!bytes || !isCompleteValidationPng(bytes)) throw new Error('Screenshot is incomplete.');
  return bytes;
}

export async function readValidationLogs(project: string, id: string, cursor = 0) {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid log cursor.');
  await record(project, id);
  const directory = await runDirectory(project, id);
  const rows: { cursor: number; text: string }[] = [];
  for (const name of ['runtime.log.1', 'runtime.log']) {
    const bytes = await artifact(directory, name);
    if (!bytes) continue;
    const text = bytes.toString('utf8');
    for (const line of text
      .slice(0, text.lastIndexOf('\n') + 1)
      .split('\n')
      .filter(Boolean)) {
      const row = JSON.parse(line);
      if (!Number.isSafeInteger(row.cursor) || typeof row.text !== 'string')
        throw new Error('Invalid validation log row.');
      rows.push({ cursor: row.cursor, text: String(sanitizeDiagnosticValue(row.text)) });
    }
  }
  const logs: typeof rows = [];
  let size = 0;
  let previous = cursor;
  let gap = false;
  for (const row of rows) {
    if (row.cursor <= cursor) continue;
    size += Buffer.byteLength(JSON.stringify(row));
    if (logs.length >= 100 || size > 65536) break;
    if (row.cursor !== previous + 1) gap = true;
    previous = row.cursor;
    logs.push(row);
  }
  const next_cursor = logs.at(-1)?.cursor ?? cursor;
  return {
    logs,
    next_cursor,
    truncated:
      gap || cursor < (rows[0]?.cursor ?? 1) - 1 || next_cursor < (rows.at(-1)?.cursor ?? 0),
  };
}

export async function readValidationPreparation(project: string, id: string) {
  await record(project, id);
  const text =
    (await artifact(await runDirectory(project, id), 'prepare.log'))?.toString('utf8') ?? '';
  return {
    text: String(sanitizeDiagnosticValue(text.slice(-65536))),
    truncated: text.length > 65536,
  };
}

export async function cleanValidationHistory(project: string): Promise<string[]> {
  let root: string;
  try {
    root = await historyRoot(project);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  // Reuse the project lock so concurrent commands cannot scan or delete the same history.
  return withPreviewLock(project, async () => {
    const previous = await artifact(root, 'cleanup.json', 1024);
    let completedAt = NaN;
    if (previous) {
      try {
        const state = JSON.parse(previous.toString('utf8'));
        if (typeof state?.completed_at === 'string') completedAt = Date.parse(state.completed_at);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    const elapsed = Date.now() - completedAt;
    if (elapsed >= 0 && elapsed < CLEANUP_INTERVAL_MS) return [];

    const { runs, warnings } = await records(project, Infinity);
    let bytes = 0;
    let count = 0;
    for (const run of runs) {
      const directory = await runDirectory(project, run.run_id);
      const expired = Date.now() - Date.parse(run.finished_at || run.started_at) > RETENTION_MS;
      const inactive =
        run.finished_at ||
        (processPresence(run.owner_pid) === 'missing' &&
          !run.runtime_launch_pending &&
          (!run.runtime_pid || processPresence(run.runtime_pid) === 'missing'));
      if (expired && inactive) {
        await fs.promises.rm(directory, { recursive: true, force: true });
        continue;
      }
      // Include prepared source in the warning budget, but never follow its links.
      const pending = [directory];
      while (pending.length && count < 50000) {
        const current = pending.pop()!;
        for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
          if (count >= 50000) break;
          count++;
          const filename = path.join(current, entry.name);
          const stat = await fs.promises.lstat(filename);
          if (stat.isSymbolicLink()) continue;
          if (stat.isDirectory()) pending.push(filename);
          else if (stat.isFile()) bytes += stat.size;
        }
      }
    }
    if (count >= 50000) warnings.push('Validation disk usage scan truncated at 50000 entries.');
    if (bytes > BUDGET_BYTES)
      warnings.push(
        'Validation cache exceeds 5 GiB. Archive needed evidence before manually removing completed runs; recent runs were not deleted.'
      );
    writePrivateJson(path.join(root, 'cleanup.json'), {
      completed_at: new Date(Date.now()).toISOString(),
    });
    return warnings;
  });
}

export async function archiveValidationRun(
  run: ValidationHandle,
  outputDir: string
): Promise<string> {
  if (!path.isAbsolute(outputDir)) throw new Error('--output-dir must be an absolute directory.');
  await fs.promises.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const root = await fs.promises.realpath(outputDir);
  const managed = await fs.promises.realpath(path.dirname(previewDirectory(run.project_realpath)));
  const relative = path.relative(managed, root);
  if (
    !relative ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  )
    throw new Error('--output-dir must be outside the managed preview cache.');
  const destination = path.join(root, run.run_id);
  await fs.promises.mkdir(destination, { mode: 0o700 });
  const files = [
    ...Object.keys(LIMITS).filter((name) => !['run.json', 'result.json'].includes(name)),
    'run.json',
    'result.json',
  ];
  for (const name of files) {
    let bytes = await artifact(run.directory, name);
    if (bytes && name === 'result.json') {
      const result = JSON.parse(bytes.toString('utf8'));
      const archived = {
        ...result,
        source_evidence_directory: run.directory,
        evidence_directory: destination,
        archive_directory: destination,
        log_path: path.join(destination, 'runtime.log'),
        invocation_path: path.join(destination, 'invocation.json'),
        artifacts: Array.isArray(result.artifacts)
          ? result.artifacts.map((item: Record<string, unknown>) => {
              const original = typeof item.path === 'string' ? item.path : '';
              return original &&
                path.dirname(original) === run.directory &&
                LIMITS[path.basename(original)]
                ? { ...item, path: path.join(destination, path.basename(original)) }
                : item;
            })
          : [],
      };
      bytes = Buffer.from(JSON.stringify(archived, null, 2));
    }
    if (bytes)
      await fs.promises.writeFile(path.join(destination, name), bytes, { flag: 'wx', mode: 0o600 });
  }
  return destination;
}
