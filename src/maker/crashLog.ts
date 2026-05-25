/**
 * Bounded last-resort crash logging for the Maker MCP entry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getMakerHome } from './storage.js';

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 16 * 1024;

export type MakerCrashLogOptions = {
  maxBytes?: number;
  maxEntryBytes?: number;
};

/**
 * Append one Maker crash entry without allowing the crash log to grow without bound.
 */
export function appendMakerCrashLog(
  source: string,
  error: unknown,
  options: MakerCrashLogOptions = {}
): void {
  const makerHome = getMakerHome();
  fs.mkdirSync(makerHome, { recursive: true });

  const logPath = path.join(makerHome, 'mcp-crash.log');
  const maxBytes =
    positiveInteger(options.maxBytes) ||
    resolveEnvBytes('TAPTAP_MAKER_CRASH_LOG_MAX_BYTES', DEFAULT_MAX_BYTES);
  const maxEntryBytes =
    positiveInteger(options.maxEntryBytes) ||
    resolveEnvBytes('TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES', DEFAULT_MAX_ENTRY_BYTES);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const entry = truncateUtf8(
    [`[${new Date().toISOString()}] ${source}`, message, ''].join('\n'),
    Math.min(maxEntryBytes, maxBytes)
  );
  const entryBytes = Buffer.byteLength(entry, 'utf8');

  rotateIfNeeded(logPath, maxBytes, entryBytes);
  fs.appendFileSync(logPath, entry, 'utf8');
}

function rotateIfNeeded(logPath: string, maxBytes: number, incomingBytes: number): void {
  if (!fs.existsSync(logPath)) {
    return;
  }

  const currentBytes = fs.statSync(logPath).size;
  if (currentBytes + incomingBytes <= maxBytes) {
    return;
  }

  const rotatedPath = `${logPath}.1`;
  writeFileTail(logPath, rotatedPath, maxBytes);
  fs.writeFileSync(logPath, '', 'utf8');
}

function writeFileTail(sourcePath: string, targetPath: string, maxBytes: number): void {
  const size = fs.statSync(sourcePath).size;
  const bytesToRead = Math.min(size, maxBytes);
  const start = Math.max(0, size - bytesToRead);
  const fd = fs.openSync(sourcePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, start);
    fs.writeFileSync(targetPath, buffer);
  } finally {
    fs.closeSync(fd);
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }

  const suffix = `\n[truncated to ${maxBytes} bytes]\n`;
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  const prefixBytes = Math.max(0, maxBytes - suffixBytes);
  return `${Buffer.from(value, 'utf8').subarray(0, prefixBytes).toString('utf8')}${suffix}`;
}

function resolveEnvBytes(key: string, fallback: number): number {
  return positiveInteger(Number(process.env[key])) || fallback;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}
