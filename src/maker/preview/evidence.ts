import fs from 'node:fs';
import path from 'node:path';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';

const MAX_LOG_BYTES = 1024 * 1024;

export function trimPreviewEvidence(
  directory: string,
  currentSession: string,
  currentReload: number
): void {
  if (!fs.existsSync(directory)) return;
  const sessions = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name))
    .sort(
      (left, right) =>
        fs.statSync(path.join(directory, right.name)).mtimeMs -
        fs.statSync(path.join(directory, left.name)).mtimeMs
    );
  const retained = new Set([
    currentSession,
    ...sessions
      .filter((entry) => entry.name !== currentSession)
      .slice(0, 2)
      .map((entry) => entry.name),
  ]);
  for (const session of sessions) {
    const sessionDir = path.join(directory, session.name);
    const rounds = fs
      .readdirSync(sessionDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .sort((left, right) => Number(right.name) - Number(left.name));
    for (const [index, round] of rounds.entries()) {
      if (
        retained.has(session.name) &&
        (index < 5 || (session.name === currentSession && Number(round.name) === currentReload))
      )
        continue;
      const roundDir = path.join(sessionDir, round.name);
      fs.rmSync(path.join(roundDir, 'source'), { recursive: true, force: true });
      for (const file of fs.readdirSync(roundDir, { withFileTypes: true })) {
        if (
          file.isFile() &&
          (/^[0-9a-f-]{36}\.png$/.test(file.name) ||
            [
              'runtime.log',
              'runtime.log.1',
              'prepare.log',
              'validate.json',
              'result.json',
              'invocation.json',
            ].includes(file.name))
        ) {
          fs.unlinkSync(path.join(roundDir, file.name));
        }
      }
      if (!fs.readdirSync(roundDir).length) fs.rmdirSync(roundDir);
    }
    if (!fs.readdirSync(sessionDir).length) fs.rmdirSync(sessionDir);
  }
}

export function readStoredPreviewLogs(
  directory: string,
  cursor = 0,
  limit = 100
): Record<string, unknown> {
  if (
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500
  ) {
    throw new Error('Logs require a nonnegative cursor and a limit between 1 and 500.');
  }
  const rows: { cursor: number; text: string }[] = [];
  for (const name of ['runtime.log.1', 'runtime.log']) {
    const filename = path.join(directory, name);
    if (!fs.existsSync(filename)) continue;
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LOG_BYTES + 65536)
      throw new Error('Invalid preview log file.');
    for (const line of fs.readFileSync(filename, 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line) as { cursor: number; text: string };
      if (!Number.isSafeInteger(row.cursor) || typeof row.text !== 'string')
        throw new Error('Invalid preview log row.');
      rows.push({ cursor: row.cursor, text: String(sanitizeDiagnosticValue(row.text)) });
    }
  }
  const selected: typeof rows = [];
  let bytes = 0;
  for (const row of rows) {
    if (row.cursor <= cursor) continue;
    const size = Buffer.byteLength(JSON.stringify(row));
    if (selected.length >= limit || bytes + size > 65536) break;
    selected.push(row);
    bytes += size;
  }
  const next = selected[selected.length - 1]?.cursor ?? cursor;
  return {
    available: fs.existsSync(directory),
    logs: selected,
    next_cursor: next,
    truncated:
      !fs.existsSync(directory) ||
      cursor < (rows[0]?.cursor ?? 1) - 1 ||
      next < (rows[rows.length - 1]?.cursor ?? 0),
  };
}

export class PreviewLogs {
  private sequence = 0;
  private rows: { cursor: number; text: string; bytes: number }[] = [];
  private bytes = 0;

  constructor(private readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  append(text: string): void {
    const sanitized = String(sanitizeDiagnosticValue(text.slice(0, 16384)));
    const cursor = ++this.sequence;
    const encoded = JSON.stringify({ cursor, text: sanitized }) + '\n';
    const row = { cursor, text: sanitized, bytes: Buffer.byteLength(encoded) };
    this.rows.push(row);
    this.bytes += row.bytes;
    while ((this.bytes > MAX_LOG_BYTES || this.rows.length > 5000) && this.rows.length > 1)
      this.bytes -= this.rows.shift()!.bytes;
    const filename = path.join(this.directory, 'runtime.log');
    if (fs.existsSync(filename) && fs.statSync(filename).size + row.bytes > MAX_LOG_BYTES) {
      fs.renameSync(filename, filename + '.1');
    }
    fs.appendFileSync(filename, encoded, { mode: 0o600 });
  }

  read(
    cursor = 0,
    limit = 100
  ): { logs: { cursor: number; text: string }[]; next_cursor: number; truncated: boolean } {
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Logs require a nonnegative cursor and a limit between 1 and 500.');
    }
    const selected: { cursor: number; text: string }[] = [];
    let bytes = 0;
    for (const row of this.rows) {
      if (row.cursor <= cursor) continue;
      if (selected.length >= limit || bytes + row.bytes > 65536) break;
      selected.push({ cursor: row.cursor, text: row.text });
      bytes += row.bytes;
    }
    const next = selected[selected.length - 1]?.cursor ?? cursor;
    return {
      logs: selected,
      next_cursor: next,
      truncated: cursor < (this.rows[0]?.cursor ?? 1) - 1 || next < this.sequence,
    };
  }
}
