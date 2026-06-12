import type { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import {
  installParentDeathWatchdog,
  installStdinExitHandler,
  installStdioErrorHandlers,
  type LifecycleLog,
} from '../core/utils/processLifecycle.js';

type ProxyWithCleanup = {
  cleanup: () => void;
};

export function installStandaloneProxyLifecycleHandlers(options: {
  proxy: ProxyWithCleanup;
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
  exit?: (code: number) => void;
  log?: LifecycleLog;
  installSignals?: boolean;
  installParentWatchdog?: boolean;
}): NodeJS.Timeout | undefined {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log;
  let exiting = false;

  const exitOnce = (source: string, message: string): void => {
    if (exiting) {
      return;
    }
    exiting = true;
    log?.(source, message);
    options.proxy.cleanup();
    exit(0);
  };

  installStdinExitHandler({
    stdin,
    cleanup: () => undefined,
    exit: () => undefined,
    source: 'standalone-proxy-stdin-closed',
    message: 'Standalone proxy stdin closed; exiting.',
    onClosed: exitOnce,
  });

  installStdioErrorHandlers({
    streams: [stdin, stdout, stderr].filter(Boolean) as EventEmitter[],
    cleanup: () => undefined,
    exit: () => undefined,
    log,
    disconnectedSource: 'standalone-proxy-stdio-disconnected',
    disconnectedMessage: 'Standalone proxy stdio disconnected; exiting.',
    onDisconnected: exitOnce,
    ignoredSource: 'standalone-proxy-stdio-error',
    ignoredMessage: (error) => `Standalone proxy stdio error ignored: ${formatError(error)}`,
  });

  if (options.installSignals !== false) {
    const signalCleanup = (): void => {
      exitOnce('standalone-proxy-signal', 'Standalone proxy received shutdown signal; exiting.');
    };
    process.on('SIGINT', signalCleanup);
    process.on('SIGTERM', signalCleanup);
  }

  if (options.installParentWatchdog === false) {
    return undefined;
  }

  return installParentDeathWatchdog({
    cleanup: () =>
      exitOnce('standalone-proxy-parent-dead', 'Standalone proxy parent process is gone; exiting.'),
    exit: () => undefined,
    source: 'standalone-proxy-parent-dead',
    message: 'Standalone proxy parent process is gone; exiting.',
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
