import type { Readable } from 'node:stream';
import { appendMakerCrashLog } from './crashLog.js';
import type { TapTapMCPProxy } from '../mcp-proxy/proxy.js';

// EIO/ENXIO: reads on a TTY whose controlling terminal went away (closed window,
// dropped SSH session) fail with these codes; treat them as "client gone" too,
// otherwise an orphaned interactive CLI can spin on stdin errors at full CPU.
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
 * Decides whether the embedded proxy should exit because its parent process died.
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

export function installProxyStdinExitHandler(
  proxy: Pick<TapTapMCPProxy, 'cleanup'>,
  stdin: Readable = process.stdin,
  exit: (code: number) => void = (code) => process.exit(code)
): void {
  let exiting = false;
  const exitOnStdinClosed = (): void => {
    if (exiting) {
      return;
    }
    exiting = true;
    logLifecycleEvent('proxy-stdin-closed', 'Embedded Maker proxy stdin closed; exiting.');
    proxy.cleanup();
    exit(0);
  };

  stdin.once('end', exitOnStdinClosed);
  stdin.once('close', exitOnStdinClosed);
}

export function installParentDeathWatchdog(
  proxy: Pick<TapTapMCPProxy, 'cleanup'>,
  options: {
    intervalMs?: number;
    initialPpid?: number;
    getCurrentPpid?: () => number;
    exit?: (code: number) => void;
  } = {}
): NodeJS.Timeout {
  const initialPpid = options.initialPpid ?? process.ppid;
  const getCurrentPpid = options.getCurrentPpid ?? (() => process.ppid);
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let exiting = false;

  const timer = setInterval(() => {
    if (exiting) {
      return;
    }
    const shouldExit = shouldExitForParentDeath({
      initialPpid,
      currentPpid: getCurrentPpid(),
      platform: process.platform,
      probeParent: () => process.kill(initialPpid, 0),
    });
    if (!shouldExit) {
      return;
    }
    exiting = true;
    logLifecycleEvent('proxy-parent-dead', 'Embedded Maker proxy parent process is gone; exiting.');
    proxy.cleanup();
    exit(0);
  }, options.intervalMs ?? 15_000);
  timer.unref?.();
  return timer;
}

export function logLifecycleEvent(source: string, message: string): void {
  try {
    // Pass a plain string: lifecycle exits are expected events, not crashes, so they
    // must stay single-line and stack-free to keep real crashes readable in the log.
    appendMakerCrashLog(`lifecycle:${source}`, message);
  } catch {
    // Lifecycle logging must not keep a broken stdio process alive.
  }
}
