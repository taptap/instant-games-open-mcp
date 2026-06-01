/**
 * Maker runtime log pull helpers.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_RUNTIME_LOG_SINCE_SECONDS = 600;
export const MAX_RUNTIME_LOG_WINDOW_SECONDS = 3600;
export const DEFAULT_RUNTIME_LOG_TOPICS = ['user_script', 'server_user_script'];
const MERGED_RUNTIME_LOG_FILE = 'runtime.log';
const RUNTIME_LOG_FILES_TO_RESET = [
  MERGED_RUNTIME_LOG_FILE,
  'state.json',
  'last-query-runtime-logs-result.json',
  'runtime.raw.log',
  'engine.log',
  'user_script.log',
  'server_user_script.log',
];

export interface RuntimeLogEntry {
  id?: string;
  time?: number;
  t?: number;
  topic?: string;
  level?: string;
  message?: string;
  msg?: string;
  userId?: string | null;
  source?: string;
  [key: string]: unknown;
}

export interface RuntimeLogState {
  appId?: string;
  projectId?: string;
  nextStartTime?: number;
  updatedAt?: string;
  lastPollAt?: string;
  lastSuccessAt?: string;
  lastWrittenLogs?: number;
  consecutiveFailures?: number;
  lastError?: string | null;
}

export interface RuntimeLogQueryArgs {
  startTime?: number;
  sinceSeconds?: number;
  topics?: string[];
  limit?: number;
}

export interface RuntimeLogQueryResult {
  logs: RuntimeLogEntry[];
  nextStartTime: number;
  serverTime: number;
  hasMore: boolean;
}

export interface RuntimeLogPullResult {
  projectRoot: string;
  queryArgs: RuntimeLogQueryArgs;
  writtenLogs: number;
  files: string[];
  statePath: string;
  nextStartTime: number;
  serverTime: number;
  hasMore: boolean;
  cursorExpired: boolean;
}

export interface RuntimeLogWatchResult {
  projectRoot: string;
  polls: number;
  writtenLogs: number;
  lastResult?: RuntimeLogPullResult;
}

type RuntimeLogPayloadCandidate = Partial<RuntimeLogQueryResult> & {
  next_start_time?: number;
  server_time?: number;
  has_more?: boolean;
  type?: string;
  success?: boolean;
  truncated?: boolean;
};

export async function watchRuntimeLogs(options: {
  projectRoot: string;
  projectId?: string;
  reset?: boolean;
  intervalMs?: number;
  sinceSeconds?: number;
  limit?: number;
  nowMs?: () => number;
  maxPolls?: number;
  maxConsecutiveFailures?: number;
  sleep?: (ms: number) => Promise<void>;
  callRemoteRuntimeLogs: (args: RuntimeLogQueryArgs) => Promise<RuntimeLogQueryResult>;
  onPoll?: (result: RuntimeLogPullResult) => void | Promise<void>;
  onError?: (error: unknown, consecutiveFailures: number) => void | Promise<void>;
}): Promise<RuntimeLogWatchResult> {
  if (options.reset) {
    resetRuntimeLogs(options.projectRoot);
  }

  const intervalMs = options.intervalMs ?? 5000;
  const maxConsecutiveFailures = options.maxConsecutiveFailures;
  const sleep = options.sleep || defaultSleep;
  const nowMs = options.nowMs || Date.now;
  let polls = 0;
  let writtenLogs = 0;
  let lastResult: RuntimeLogPullResult | undefined;
  let consecutiveFailures = 0;

  for (;;) {
    try {
      const previousCursor = lastResult?.nextStartTime;
      const result = await pullRuntimeLogs({
        projectRoot: options.projectRoot,
        projectId: options.projectId,
        sinceSeconds: options.sinceSeconds,
        limit: options.limit,
        nowMs: options.nowMs,
        callRemoteRuntimeLogs: options.callRemoteRuntimeLogs,
      });
      polls += 1;
      writtenLogs += result.writtenLogs;
      lastResult = result;
      consecutiveFailures = 0;
      await options.onPoll?.(result);

      if (options.maxPolls !== undefined && polls >= options.maxPolls) {
        return { projectRoot: options.projectRoot, polls, writtenLogs, lastResult };
      }

      const cursorProgressed =
        previousCursor === undefined
          ? result.writtenLogs > 0
          : result.nextStartTime !== previousCursor;
      if (!result.hasMore || !cursorProgressed) {
        await sleep(intervalMs);
      }
    } catch (error) {
      consecutiveFailures += 1;
      writeRuntimeLogFailureState(options.projectRoot, {
        nowMs,
        consecutiveFailures,
        error,
      });
      await options.onError?.(error, consecutiveFailures);
      if (isNonRetryableRuntimeLogError(error)) {
        throw new Error(
          `runtime log watch stopped after non-retryable failure: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      if (maxConsecutiveFailures !== undefined && consecutiveFailures >= maxConsecutiveFailures) {
        throw new Error(
          `runtime log watch stopped after ${consecutiveFailures} consecutive failures: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      await sleep(intervalMs);
    }
  }
}

export async function pullRuntimeLogs(options: {
  projectRoot: string;
  projectId?: string;
  startTime?: number;
  sinceSeconds?: number;
  topics?: string[];
  limit?: number;
  nowMs?: () => number;
  callRemoteRuntimeLogs: (args: RuntimeLogQueryArgs) => Promise<RuntimeLogQueryResult>;
}): Promise<RuntimeLogPullResult> {
  const nowMs = options.nowMs || Date.now;
  const state = readRuntimeLogState(options.projectRoot);
  const nowSeconds = nowMs() / 1000;
  const stateFresh =
    state?.nextStartTime !== undefined && isFreshRuntimeLogCursor(state.nextStartTime, nowSeconds);
  const queryArgs: RuntimeLogQueryArgs = {};
  let cursorExpired = false;

  if (options.startTime !== undefined) {
    queryArgs.startTime = options.startTime;
  } else if (stateFresh && state) {
    queryArgs.startTime = state.nextStartTime;
  } else {
    cursorExpired = Boolean(state?.nextStartTime);
    queryArgs.sinceSeconds = options.sinceSeconds ?? DEFAULT_RUNTIME_LOG_SINCE_SECONDS;
  }

  queryArgs.topics =
    options.topics && options.topics.length > 0 ? options.topics : DEFAULT_RUNTIME_LOG_TOPICS;
  if (options.limit !== undefined) {
    queryArgs.limit = options.limit;
  }

  const result = await options.callRemoteRuntimeLogs(queryArgs);
  const appendResult = appendRuntimeLogs(options.projectRoot, result.logs);
  const nextStartTime = resolveNextRuntimeLogCursor(result);
  const nowIso = new Date(nowMs()).toISOString();
  const nextState: RuntimeLogState = {
    ...(state || {}),
    ...(options.projectId ? { appId: options.projectId, projectId: options.projectId } : {}),
    nextStartTime,
    updatedAt: nowIso,
    lastPollAt: nowIso,
    lastSuccessAt: nowIso,
    lastWrittenLogs: appendResult.written,
    consecutiveFailures: 0,
    lastError: null,
  };
  writeRuntimeLogState(options.projectRoot, nextState);

  return {
    projectRoot: options.projectRoot,
    queryArgs,
    writtenLogs: appendResult.written,
    files: appendResult.files,
    statePath: getRuntimeLogStatePath(options.projectRoot),
    nextStartTime,
    serverTime: result.serverTime,
    hasMore: result.hasMore,
    cursorExpired,
  };
}

export function resetRuntimeLogs(projectRoot: string): string {
  const runtimeDir = getRuntimeLogDir(projectRoot);
  fs.mkdirSync(runtimeDir, { recursive: true });
  for (const file of RUNTIME_LOG_FILES_TO_RESET) {
    fs.rmSync(path.join(runtimeDir, file), { force: true });
  }
  return runtimeDir;
}

export function readRuntimeLogState(projectRoot: string): RuntimeLogState | null {
  const statePath = getRuntimeLogStatePath(projectRoot);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<RuntimeLogState>;
    return isRuntimeLogState(state) ? (state as RuntimeLogState) : null;
  } catch {
    return null;
  }
}

export function formatRuntimeLogPullResult(result: RuntimeLogPullResult): string {
  return [
    '✓ Maker runtime logs pulled once',
    '',
    `- project_root: ${result.projectRoot}`,
    `- query_args: ${JSON.stringify(result.queryArgs)}`,
    `- written_logs: ${result.writtenLogs}`,
    `- files: ${result.files.length > 0 ? result.files.join(', ') : '(none)'}`,
    `- state: ${result.statePath}`,
    `- next_start_time: ${result.nextStartTime}`,
    `- server_time: ${result.serverTime}`,
    `- has_more: ${result.hasMore ? 'yes' : 'no'}`,
    result.cursorExpired
      ? '- cursor_expired: yes; old cursor exceeded 1 hour, used default since window'
      : '- cursor_expired: no',
    '',
    result.hasMore
      ? 'next_action: 还有更多远端日志；继续运行 taptap-maker logs watch 可拉取后续页面。'
      : 'next_action: 日志已写入 .maker/logs/runtime/runtime.log，AI/skill 可直接读取这一份合并日志。',
  ].join('\n');
}

export function normalizeRuntimeLogQueryResult(result: unknown): RuntimeLogQueryResult {
  const payload = findRuntimeLogPayload(extractRemoteToolPayload(result));
  if (!payload) {
    throw new Error('query_runtime_logs result does not contain logs array.');
  }

  const nextStartTime = payload.nextStartTime ?? payload.next_start_time;
  const serverTime = payload.serverTime ?? payload.server_time ?? nextStartTime;
  const hasMore = payload.hasMore ?? payload.has_more ?? false;
  if (typeof nextStartTime !== 'number') {
    throw new Error('query_runtime_logs result does not contain nextStartTime.');
  }
  if (typeof serverTime !== 'number') {
    throw new Error('query_runtime_logs result does not contain serverTime.');
  }

  return {
    logs: payload.logs.map(normalizeRuntimeLogEntry),
    nextStartTime,
    serverTime,
    hasMore: Boolean(hasMore),
  };
}

export function writeRuntimeLogRawResponse(projectRoot: string, raw: unknown): string {
  const rawPath = path.join(getRuntimeLogDir(projectRoot), 'last-query-runtime-logs-result.json');
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(
    rawPath,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), raw }, null, 2)}\n`,
    'utf8'
  );
  return rawPath;
}

function appendRuntimeLogs(
  projectRoot: string,
  logs: RuntimeLogEntry[]
): {
  files: string[];
  written: number;
} {
  fs.mkdirSync(getRuntimeLogDir(projectRoot), { recursive: true });
  if (logs.length === 0) {
    return { files: [], written: 0 };
  }

  const filePath = getRuntimeLogPath(projectRoot);
  let written = 0;
  for (const log of logs) {
    const line = JSON.stringify(compactRuntimeLogEntry(log));
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
    written += 1;
  }

  return { files: written > 0 ? [filePath] : [], written };
}

function writeRuntimeLogState(projectRoot: string, state: RuntimeLogState): void {
  const statePath = getRuntimeLogStatePath(projectRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, statePath);
}

function writeRuntimeLogFailureState(
  projectRoot: string,
  options: {
    nowMs: () => number;
    consecutiveFailures: number;
    error: unknown;
  }
): void {
  const nowIso = new Date(options.nowMs()).toISOString();
  writeRuntimeLogState(projectRoot, {
    ...(readRuntimeLogState(projectRoot) || {}),
    updatedAt: nowIso,
    lastPollAt: nowIso,
    consecutiveFailures: options.consecutiveFailures,
    lastError: options.error instanceof Error ? options.error.message : String(options.error),
  });
}

function isRuntimeLogState(state: Partial<RuntimeLogState>): boolean {
  return (
    typeof state.nextStartTime === 'number' ||
    typeof state.updatedAt === 'string' ||
    typeof state.lastPollAt === 'string' ||
    typeof state.lastSuccessAt === 'string'
  );
}

function isFreshRuntimeLogCursor(nextStartTime: number, nowSeconds: number): boolean {
  if (!Number.isFinite(nextStartTime) || nextStartTime <= 0) {
    return false;
  }
  if (nextStartTime > 10_000_000_000) {
    return false;
  }
  const ageSeconds = nowSeconds - nextStartTime;
  return ageSeconds >= -300 && ageSeconds <= MAX_RUNTIME_LOG_WINDOW_SECONDS;
}

function isNonRetryableRuntimeLogError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(?:401|403|unauthori[sz]ed|forbidden|pat expired|auth(?:entication|orization)?)\b/i.test(
    message
  );
}

function getRuntimeLogDir(projectRoot: string): string {
  return path.join(projectRoot, '.maker', 'logs', 'runtime');
}

function getRuntimeLogStatePath(projectRoot: string): string {
  return path.join(getRuntimeLogDir(projectRoot), 'state.json');
}

function getRuntimeLogPath(projectRoot: string): string {
  return path.join(getRuntimeLogDir(projectRoot), MERGED_RUNTIME_LOG_FILE);
}

function resolveNextRuntimeLogCursor(result: RuntimeLogQueryResult): number {
  const maxLogTime = result.logs.reduce((max, log) => {
    const value = typeof log.t === 'number' ? log.t : typeof log.time === 'number' ? log.time : max;
    return Math.max(max, value);
  }, Number.NEGATIVE_INFINITY);
  if (maxLogTime === Number.NEGATIVE_INFINITY) {
    return result.nextStartTime;
  }
  return Math.max(result.nextStartTime, maxLogTime + 1);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractRemoteToolPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent;
  if (structuredContent) {
    return structuredContent;
  }

  const textItems = extractRemoteToolTextItems(result);
  if (textItems.length === 0) {
    return result;
  }

  for (const textItem of textItems) {
    const payload = parseRuntimeLogTextPayload(textItem);
    if (payload) {
      return payload;
    }
  }
  const text = textItems.join('\n');
  return parseRuntimeLogTextPayload(text) || text;
}

function parseRuntimeLogTextPayload(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return parseRuntimeLogNdjson(text);
  }
}

function extractRemoteToolTextItems(result: unknown): string[] {
  if (!result || typeof result !== 'object') {
    return [];
  }

  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  return (
    content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string) || []
  );
}

function parseRuntimeLogNdjson(text: string): RuntimeLogPayloadCandidate | null {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) {
    return null;
  }

  const parsedRows: unknown[] = [];
  for (const row of rows) {
    try {
      parsedRows.push(JSON.parse(row));
    } catch {
      return null;
    }
  }

  const meta = parsedRows.find(isRuntimeLogMeta) as RuntimeLogPayloadCandidate | undefined;
  const logs = parsedRows.filter((row) => !isRuntimeLogMeta(row));
  if (!meta && logs.length === 0) {
    return null;
  }

  return {
    logs: logs as RuntimeLogEntry[],
    nextStartTime: meta?.nextStartTime,
    next_start_time: meta?.next_start_time,
    serverTime: meta?.serverTime,
    server_time: meta?.server_time,
    hasMore: meta?.hasMore ?? meta?.has_more ?? meta?.truncated,
  };
}

function findRuntimeLogPayload(value: unknown, depth = 0): RuntimeLogPayloadCandidate | null {
  if (!value || typeof value !== 'object' || depth > 4) {
    return null;
  }

  const candidate = value as RuntimeLogPayloadCandidate;
  if (Array.isArray(candidate.logs)) {
    return candidate;
  }
  if (
    candidate.type === 'meta' &&
    candidate.success === true &&
    typeof candidate.nextStartTime === 'number'
  ) {
    return {
      logs: [],
      nextStartTime: candidate.nextStartTime,
      serverTime: candidate.serverTime ?? candidate.nextStartTime,
      hasMore: Boolean(candidate.truncated),
    };
  }

  const wrappers = value as Record<string, unknown>;
  for (const key of ['data', 'result', 'payload', 'runtimeLogs', 'runtime_logs']) {
    const nested = findRuntimeLogPayload(wrappers[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function isRuntimeLogMeta(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as RuntimeLogPayloadCandidate).type === 'meta' &&
    (value as RuntimeLogPayloadCandidate).success === true &&
    (typeof (value as RuntimeLogPayloadCandidate).nextStartTime === 'number' ||
      typeof (value as RuntimeLogPayloadCandidate).next_start_time === 'number')
  );
}

function normalizeRuntimeLogEntry(entry: RuntimeLogEntry): RuntimeLogEntry {
  return compactRuntimeLogEntry(entry);
}

function compactRuntimeLogEntry(entry: RuntimeLogEntry): RuntimeLogEntry {
  const { id: _id, time, message, ...rest } = entry;
  const compact: RuntimeLogEntry = {
    ...rest,
  };
  if (compact.t === undefined && time !== undefined) {
    compact.t = time;
  }
  if (compact.msg === undefined && message !== undefined) {
    compact.msg = message;
  }
  return compact;
}
