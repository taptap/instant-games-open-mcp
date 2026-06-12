import type { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';

export type LifecycleLog = (source: string, message: string) => void;

const DISCONNECTED_STDIO_CODES = new Set([
  'EPIPE',
  'ERR_STREAM_DESTROYED',
  'ECONNRESET',
  'EIO',
  'ENXIO',
]);

export function isDisconnectedStdioError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && DISCONNECTED_STDIO_CODES.has(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('epipe') || message.includes('stream destroyed');
}

/**
 * Decides whether a child process should exit because its parent process died.
 *
 * Platform caveat: on Windows `process.ppid` never becomes 1, so detection relies on
 * probing the original parent PID. Windows reuses PIDs aggressively, so a dead parent
 * whose PID was recycled makes the probe succeed and the watchdog never fires. That
 * failure direction is safe (it keeps a process alive, never kills a healthy one); on
 * Windows the reliable exit signals are stdin end/close plus the EPIPE stdio guards.
 */
export function shouldExitForParentDeath(options: {
  initialPpid: number;
  currentPpid: number;
  platform: NodeJS.Platform;
  probeParent: () => boolean;
}): boolean {
  if (
    (options.platform === 'darwin' || options.platform === 'linux') &&
    options.initialPpid > 1 &&
    options.currentPpid === 1
  ) {
    return true;
  }

  try {
    options.probeParent();
    return false;
  } catch (error) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'ESRCH' &&
        options.initialPpid > 1
    );
  }
}

export function installStdinExitHandler(options: {
  stdin?: Readable;
  cleanup: () => void;
  exit?: (code: number) => void;
  log?: LifecycleLog;
  source: string;
  message: string;
}): void {
  const stdin = options.stdin ?? process.stdin;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let exiting = false;

  const exitOnStdinClosed = (): void => {
    if (exiting) {
      return;
    }
    exiting = true;
    options.log?.(options.source, options.message);
    options.cleanup();
    exit(0);
  };

  stdin.once('end', exitOnStdinClosed);
  stdin.once('close', exitOnStdinClosed);
}

export function installParentDeathWatchdog(options: {
  cleanup: () => void;
  exit?: (code: number) => void;
  log?: LifecycleLog;
  source: string;
  message: string;
  intervalMs?: number;
  initialPpid?: number;
  getCurrentPpid?: () => number;
  platform?: NodeJS.Platform;
  probeParent?: () => boolean;
}): NodeJS.Timeout {
  const initialPpid = options.initialPpid ?? process.ppid;
  const getCurrentPpid = options.getCurrentPpid ?? (() => process.ppid);
  const platform = options.platform ?? process.platform;
  const probeParent = options.probeParent ?? (() => process.kill(initialPpid, 0));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let exiting = false;

  const timer = setInterval(() => {
    if (exiting) {
      return;
    }
    const shouldExit = shouldExitForParentDeath({
      initialPpid,
      currentPpid: getCurrentPpid(),
      platform,
      probeParent,
    });
    if (!shouldExit) {
      return;
    }
    exiting = true;
    options.log?.(options.source, options.message);
    options.cleanup();
    exit(0);
  }, options.intervalMs ?? 15_000);
  timer.unref?.();
  return timer;
}

export function installStdioErrorHandlers(options: {
  streams: EventEmitter[];
  cleanup: () => void;
  exit?: (code: number) => void;
  log?: LifecycleLog;
  disconnectedSource: string;
  disconnectedMessage: string;
  ignoredSource?: string;
}): void {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let exiting = false;

  for (const stream of options.streams) {
    stream.on('error', (error) => {
      if (!isDisconnectedStdioError(error)) {
        options.log?.(
          options.ignoredSource ?? 'stdio-error',
          `Standalone proxy stdio error ignored: ${formatError(error)}`
        );
        return;
      }
      if (exiting) {
        return;
      }
      exiting = true;
      options.log?.(options.disconnectedSource, options.disconnectedMessage);
      options.cleanup();
      exit(0);
    });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
