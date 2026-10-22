/**
 * The single place where Maker spawns git.
 *
 * Every caller keeps its own arguments (prefix `-c` flags, `-C` paths) and
 * its own limits; this module only standardizes how the process is run:
 * - results settle on `close`, after stdout/stderr are fully drained;
 * - git never waits on a terminal prompt (`GIT_TERMINAL_PROMPT=0`);
 * - git messages are English (`LC_ALL=C`) so error classification is stable;
 * - errors carry command, exit code, stdout and stderr.
 */

import { spawn, spawnSync } from 'node:child_process';
import { getGitCommand } from '../system/git.js';

export interface GitExecOptions {
  cwd?: string;
  /** Kill the process after this many ms. 0 or undefined means no timeout. */
  timeoutMs?: number;
  killSignal?: NodeJS.Signals;
  signal?: AbortSignal;
  /** Extra environment variables layered over the standard git environment. */
  env?: Record<string, string>;
  /** Fail when stdout or stderr exceeds this many bytes. Undefined means unlimited. */
  maxBuffer?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode: number | null,
    readonly stdout: string,
    readonly stderr: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

/** Standard environment for every git process started by Maker. */
export function gitEnvironment(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
    LANGUAGE: 'C',
    ...extra,
  };
}

function describeCommand(command: string, args: readonly string[]): string {
  return `${command} ${args.join(' ')}`;
}

export function runGit(
  args: readonly string[],
  options: GitExecOptions = {}
): Promise<GitExecResult> {
  const command = getGitCommand();
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason ?? new Error('git command aborted'));
      return;
    }
    let settled = false;
    let stdout = '';
    let stderr = '';
    let failure: { message: string; code?: string } | undefined;
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: gitEnvironment(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const kill = (message: string, code: string) => {
      if (!failure) failure = { message, code };
      child.kill(options.killSignal || 'SIGTERM');
    };
    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(
            () =>
              kill(
                `${describeCommand(command, args)} timed out after ${options.timeoutMs}ms`,
                'ETIMEDOUT'
              ),
            options.timeoutMs
          )
        : undefined;
    const onAbort = () => kill(`${describeCommand(command, args)} aborted`, 'ABORT_ERR');
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (error?: Error, code?: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
        return;
      }
      if (failure) {
        if (failure.code === 'ABORT_ERR' && options.signal?.reason) {
          reject(options.signal.reason);
          return;
        }
        reject(
          new GitCommandError(
            failure.message,
            describeCommand(command, args),
            code ?? null,
            stdout,
            stderr,
            failure.code
          )
        );
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new GitCommandError(
          `${describeCommand(command, args)} failed with exit code ${code}: ${stderr}`,
          describeCommand(command, args),
          code ?? null,
          stdout,
          stderr
        )
      );
    };
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    if (!stdoutStream || !stderrStream) {
      child.kill();
      reject(
        new GitCommandError(
          'git stdio pipes were not created',
          describeCommand(command, args),
          null,
          '',
          'git stdio pipes were not created'
        )
      );
      return;
    }
    // Stream decoder, not per-chunk String(buffer): a UTF-8 character split
    // across two data events must not become a replacement character.
    stdoutStream.setEncoding('utf8');
    stderrStream.setEncoding('utf8');
    stdoutStream.on('data', (chunk: string) => {
      stdout += chunk;
      options.onStdout?.(chunk);
      if (options.maxBuffer && stdout.length > options.maxBuffer)
        kill('stdout maxBuffer length exceeded', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
    });
    stderrStream.on('data', (chunk: string) => {
      stderr += chunk;
      options.onStderr?.(chunk);
      if (options.maxBuffer && stderr.length > options.maxBuffer)
        kill('stderr maxBuffer length exceeded', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
    });
    child.on('error', (error) => {
      const spawnError = error as NodeJS.ErrnoException;
      finish(
        new GitCommandError(
          spawnError.message,
          describeCommand(command, args),
          null,
          stdout,
          stderr || spawnError.message,
          spawnError.code
        )
      );
    });
    child.on('close', (code) => finish(undefined, code));
  });
}

export function runGitSync(
  args: readonly string[],
  options: Omit<GitExecOptions, 'signal' | 'onStdout' | 'onStderr'> = {}
): string {
  const command = getGitCommand();
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: gitEnvironment(options.env),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    ...(options.killSignal ? { killSignal: options.killSignal } : {}),
    ...(options.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr || '';
    const spawnError = result.error as NodeJS.ErrnoException | undefined;
    throw new GitCommandError(
      spawnError?.message || stderr || `${describeCommand(command, args)} failed`,
      describeCommand(command, args),
      result.status,
      result.stdout || '',
      stderr,
      spawnError?.code
    );
  }
  return result.stdout;
}
