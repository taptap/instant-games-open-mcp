/**
 * Maker git command helpers with progress reporting and transient retry,
 * built on the shared executor.
 */

import { GitCommandError, runGit, runGitSync } from './exec.js';
import {
  MakerGitError,
  appendRetryExhausted,
  createGitFailure,
  getMakerGitRetryDecisionFromError,
  type MakerGitRetryDecision,
} from './failure.js';
import { getGitCommand } from '../system/git.js';
import { isShallowAcknowledgmentsFailure, pruneRedundantShallowMarkers } from './shallow.js';

export interface MakerProjectProgress {
  progress?: number;
  total?: number;
  message: string;
  phase?: string;
}

export type MakerProjectProgressHandler = (progress: MakerProjectProgress) => void;

/** Reads stdout. Rejects with GitCommandError. */
export async function readGit(args: string[], cwd: string): Promise<string> {
  return (await runGit(args, { cwd })).stdout;
}

/** Reads stdout synchronously. Throws GitCommandError. */
export function readGitSync(args: string[]): string {
  return runGitSync(args);
}

/** Runs a git command and rejects with a classified MakerGitError. */
export async function gitStep(
  args: string[],
  options: {
    cwd: string;
    stage?: string;
    quiet?: boolean;
    onProgress?: MakerProjectProgressHandler;
    secret?: string;
  }
): Promise<void> {
  try {
    await runGit(args, {
      cwd: options.cwd,
      onStderr: (chunk) => emitGitProgress(chunk, options.onProgress, options.secret),
    });
  } catch (error) {
    const failure = error as GitCommandError;
    throw new MakerGitError(
      createGitFailure({
        stage: options.stage || args[0] || 'git',
        command: sanitize(`${getGitCommand()} ${args.join(' ')}`, options.secret),
        exitCode: failure.exitCode ?? null,
        stdout: options.quiet ? '' : sanitize(failure.stdout || '', options.secret),
        stderr:
          options.quiet && failure.exitCode !== null
            ? ''
            : sanitize(failure.stderr || failure.message, options.secret),
      })
    );
  }
}

/**
 * Runs a git command and rejects with a plain Error whose message contains the
 * sanitized command and output (used by clone init/checkout).
 */
export async function gitCapture(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
    onProgress?: MakerProjectProgressHandler;
  } = {}
): Promise<void> {
  try {
    await runGit(args, {
      cwd: options.cwd,
      onStderr: (chunk) => emitGitProgress(chunk, options.onProgress, options.sanitize),
    });
  } catch (error) {
    const failure = error as GitCommandError;
    if (failure.exitCode === null || failure.exitCode === undefined) throw error;
    const pretty = `${getGitCommand()} ${args.map((arg) => sanitize(arg, options.sanitize)).join(' ')}`;
    const detail = sanitize(
      [failure.stdout.trim(), failure.stderr.trim()].filter(Boolean).join('\n'),
      options.sanitize
    );
    throw new Error(
      [`${pretty} failed with exit code ${failure.exitCode}`, detail].filter(Boolean).join('\n')
    );
  }
}

export function gitCaptureWithTransientRetry(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
    onProgress?: MakerProjectProgressHandler;
  } = {}
): Promise<number> {
  return runWithTransientRetry(() => gitCapture(args, options), {
    stage: args[0] || 'git',
    onProgress: options.onProgress,
  });
}

export function gitStepWithTransientRetry(
  args: string[],
  options: {
    cwd: string;
    stage?: string;
    secret?: string;
    onProgress?: MakerProjectProgressHandler;
  }
): Promise<number> {
  const stage = options.stage || args[0] || 'git';
  const attempt = () =>
    runMakerGitNetworkOperationWithTransientRetry(
      args,
      (effectiveArgs) => gitStep(effectiveArgs, { ...options, stage }),
      { stage, onProgress: options.onProgress }
    );
  return args[0] === 'fetch'
    ? withShallowAcknowledgmentsRecovery(options.cwd, attempt, options.onProgress)
    : attempt();
}

/**
 * When a fetch fails with `expected 'acknowledgments'`, remove redundant
 * .git/shallow markers once and retry the fetch once. Other failures, and
 * repositories without redundant markers, keep the original error.
 */
export async function withShallowAcknowledgmentsRecovery<T>(
  cwd: string,
  fetch: () => Promise<T>,
  onProgress?: MakerProjectProgressHandler
): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (!isShallowAcknowledgmentsFailure(errorText(error))) throw error;
    const removed = pruneRedundantShallowMarkers(cwd);
    if (removed === 0) throw error;
    onProgress?.({
      phase: 'fetch',
      message: `Fetch failed with expected 'acknowledgments'; removed ${removed} redundant .git/shallow marker(s), retrying once`,
    });
    return fetch();
  }
}

function errorText(error: unknown): string {
  if (error instanceof MakerGitError) {
    return [error.failure.stderr, error.failure.stdout, error.failure.message]
      .filter(Boolean)
      .join('\n');
  }
  if (error instanceof GitCommandError) return `${error.stderr}\n${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export async function runWithTransientRetry(
  operation: () => Promise<void>,
  options: {
    stage: string;
    onProgress?: MakerProjectProgressHandler;
    onRetry?: (decision: MakerGitRetryDecision) => void;
  }
): Promise<number> {
  let retries = 0;
  const maxRetries = 5;

  for (;;) {
    try {
      await operation();
      return retries;
    } catch (error) {
      const decision = getMakerGitRetryDecisionFromError(error);
      if (!decision.retry) {
        throw error;
      }

      if (retries >= maxRetries) {
        throw appendRetryExhausted(error, retries, decision);
      }

      retries += 1;
      options.onRetry?.(decision);
      options.onProgress?.({
        phase: options.stage,
        message: formatGitRetryProgressMessage(options.stage, decision, retries, maxRetries),
      });
      await sleep(getMakerGitRetryDelayMs() * retries);
    }
  }
}

export async function runMakerGitNetworkOperationWithTransientRetry(
  args: string[],
  operation: (effectiveArgs: string[]) => Promise<void>,
  options: {
    stage: string;
    onProgress?: MakerProjectProgressHandler;
  }
): Promise<number> {
  let fallbackHttpVersion: 'HTTP/1.1' | undefined;
  return runWithTransientRetry(
    () =>
      operation(
        fallbackHttpVersion ? ['-c', `http.version=${fallbackHttpVersion}`, ...args] : [...args]
      ),
    {
      ...options,
      onRetry: (decision) => {
        fallbackHttpVersion = decision.fallbackHttpVersion || fallbackHttpVersion;
      },
    }
  );
}

function formatGitRetryProgressMessage(
  stage: string,
  decision: MakerGitRetryDecision,
  retries: number,
  maxRetries: number
): string {
  const reason = decision.reason || 'temporary_remote_failure';
  if (reason === 'http2_transport_error') {
    return `Maker git HTTP/2 transport failed; retrying with command-local HTTP/1.1 ${retries}/${maxRetries}. Please keep this running.`;
  }
  const prefix =
    (stage === 'clone' || stage === 'fetch') && reason === 'remote_http_5xx'
      ? 'Maker server may still be preparing the repository'
      : 'Maker git remote is temporarily unavailable';
  return `${prefix} (${reason}); retrying ${retries}/${maxRetries}. Please keep this running.`;
}

export function getMakerGitRetryDelayMs(): number {
  const value = Number.parseInt(process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 5_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitize(value: string, secret?: string): string {
  if (!secret) {
    return value;
  }
  return value.split(secret).join('***');
}

export function emitGitProgress(
  chunk: Buffer | string,
  onProgress?: MakerProjectProgressHandler,
  secret?: string
): void {
  if (!onProgress) {
    return;
  }

  for (const rawLine of String(chunk).split(/\r\n|\n|\r/)) {
    const line = sanitize(rawLine.trim(), secret);
    const progress = parseGitProgressLine(line);
    if (progress) {
      onProgress(progress);
    }
  }
}

export function parseGitProgressLine(line: string): MakerProjectProgress | undefined {
  const message = line.trim();
  if (!message) {
    return undefined;
  }

  const percentMatch = message.match(
    /(?:remote:\s*)?(Counting objects|Compressing objects|Receiving objects|Resolving deltas|Writing objects):\s+(\d+)%/i
  );
  if (percentMatch) {
    return {
      progress: Math.max(0, Math.min(100, Number(percentMatch[2]))),
      total: 100,
      phase: 'git',
      message,
    };
  }

  if (/^(remote:\s*)?(Cloning into|Enumerating objects|Total )/i.test(message)) {
    return {
      phase: 'git',
      message,
    };
  }

  return undefined;
}
