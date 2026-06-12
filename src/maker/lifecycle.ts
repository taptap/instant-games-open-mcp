import type { Readable } from 'node:stream';
import { appendMakerCrashLog } from './crashLog.js';
import type { TapTapMCPProxy } from '../mcp-proxy/proxy.js';
export {
  isDisconnectedStdioError,
  shouldExitForParentDeath,
} from '../core/utils/processLifecycle.js';
import {
  installParentDeathWatchdog as installSharedParentDeathWatchdog,
  installStdinExitHandler,
} from '../core/utils/processLifecycle.js';

export function installProxyStdinExitHandler(
  proxy: Pick<TapTapMCPProxy, 'cleanup'>,
  stdin: Readable = process.stdin,
  exit: (code: number) => void = (code) => process.exit(code)
): void {
  installStdinExitHandler({
    stdin,
    cleanup: () => proxy.cleanup(),
    exit,
    log: logLifecycleEvent,
    source: 'proxy-stdin-closed',
    message: 'Embedded Maker proxy stdin closed; exiting.',
  });
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
  return installSharedParentDeathWatchdog({
    cleanup: () => proxy.cleanup(),
    exit: options.exit,
    log: logLifecycleEvent,
    source: 'proxy-parent-dead',
    message: 'Embedded Maker proxy parent process is gone; exiting.',
    intervalMs: options.intervalMs,
    initialPpid: options.initialPpid,
    getCurrentPpid: options.getCurrentPpid,
  });
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
