/**
 * taptap-maker entry.
 *
 * Starts Maker MCP server mode.
 */

import { startMakerMcpServer } from './server/mcp.js';
import { formatCliError, runMakerCli } from './cli/commands.js';
import { appendMakerCrashLog } from './crashLog.js';
import { loadConfig } from '../mcp-proxy/config.js';
import { TapTapMCPProxy } from '../mcp-proxy/proxy.js';
import {
  installParentDeathWatchdog,
  installProxyStdinExitHandler,
  isDisconnectedStdioError,
  logLifecycleEvent,
} from './lifecycle.js';

installCrashLogging();

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command) {
    await startMakerMcpServer();
    return;
  }

  if (command === '__maker-proxy') {
    process.argv.splice(2, 1);
    await startEmbeddedProxy();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  await runMakerCli(process.argv.slice(2));
}

async function startEmbeddedProxy(): Promise<void> {
  const config = await loadConfig();
  const proxy = new TapTapMCPProxy(config);
  await proxy.start();

  const cleanup = (source = 'proxy-signal'): void => {
    logLifecycleEvent(source, 'Embedded Maker proxy received shutdown signal; exiting.');
    proxy.cleanup();
    process.exit(0);
  };

  installProxyStdinExitHandler(proxy);
  installParentDeathWatchdog(proxy);
  process.on('SIGINT', () => cleanup('proxy-sigint'));
  process.on('SIGTERM', () => cleanup('proxy-sigterm'));
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [--env rnd|production] [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--create --name NAME]',
      '                     [--skip-confirm] [--skip-mcp-install] [--register-mcp codex,cursor,claude]',
      '                     [--json]',
      '  taptap-maker doctor [--target-dir DIR] [--env rnd|production] [--json]',
      '  taptap-maker python doctor [--json]',
      '  taptap-maker python setup [--json]',
      '  taptap-maker python path [--json]',
      '  taptap-maker lua-lsp doctor [--json]',
      '  taptap-maker lua-lsp setup [--json]',
      '  taptap-maker apps [--pat PAT] [--all] [--json]',
      '                     # --pat warns: PAT appears in ps/history',
      '  taptap-maker login [--env rnd|production] [--json]',
      '  taptap-maker pat set [--pat-stdin] [--json]',
      '  taptap-maker pat set [PAT|--pat PAT] [--json]  # fallback; warns: PAT appears in ps/history',
      '  taptap-maker install [--ide codex,cursor,claude] [--env rnd|production]',
      '                        [--json]  # alias for mcp install',
      '  taptap-maker mcp install [--ide codex,cursor,claude] [--env rnd|production]',
      '                             [--json]',
      '  taptap-maker mcp verify [--mode npx|self] [--json]',
      '  taptap-maker dev-kit update [--target-dir DIR] [--json]',
      '  taptap-maker logs watch [--target-dir DIR] [--interval 5s] [--reset] [--json]',
      '',
      'MCP verify defaults to the npx command written into AI client config.',
      'Maker MCP configs and npx verification use @taptap/maker.',
      '',
      'Windows note:',
      '  Generated MCP configs wrap npx.cmd with cmd.exe on Windows for spawn compatibility.',
      '',
    ].join('\n')
  );
}

main().catch((error) => {
  logCrash('main.catch', error);
  safeWriteStderr(`❌ ${formatCliError(error)}\n`);
  process.exit(1);
});

function installCrashLogging(): void {
  installStdioErrorHandler(process.stdout, 'stdout-error');
  installStdioErrorHandler(process.stderr, 'stderr-error');
  installStdinErrorHandler();

  let handlingFatalError = false;
  process.on('uncaughtException', (error) => {
    logCrash('uncaughtException', error);
    if (isDisconnectedStdioError(error)) {
      logLifecycleEvent('uncaughtException-stdio-closed', 'Maker stdio disconnected; exiting.');
      process.exit(0);
    }
    if (handlingFatalError) {
      logCrash('uncaughtException-recursive', error);
      process.exit(1);
    }
    handlingFatalError = true;
    safeWriteStderr(`❌ Uncaught Maker MCP error: ${error.message}\n`);
    handlingFatalError = false;
  });

  process.on('unhandledRejection', (reason) => {
    logCrash('unhandledRejection', reason);
    if (isDisconnectedStdioError(reason)) {
      logLifecycleEvent('unhandledRejection-stdio-closed', 'Maker stdio disconnected; exiting.');
      process.exit(0);
    }
    if (handlingFatalError) {
      logCrash('unhandledRejection-recursive', reason);
      process.exit(1);
    }
    handlingFatalError = true;
    safeWriteStderr(
      `❌ Unhandled Maker MCP rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`
    );
    handlingFatalError = false;
  });
}

function installStdioErrorHandler(
  stream: NodeJS.WriteStream,
  source: 'stdout-error' | 'stderr-error'
): void {
  stream.on('error', (error) => {
    logCrash(source, error);
    if (isDisconnectedStdioError(error)) {
      process.exit(0);
    }
  });
}

function installStdinErrorHandler(): void {
  // Reads on a detached TTY fail with EIO/ENXIO; without a listener the stream error
  // escalates to uncaughtException and an orphaned interactive CLI can spin forever.
  process.stdin.on('error', (error) => {
    logCrash('stdin-error', error);
    if (isDisconnectedStdioError(error)) {
      logLifecycleEvent('stdin-error-disconnected', 'Maker stdin became unreadable; exiting.');
      process.exit(0);
    }
  });
}

function safeWriteStderr(message: string): void {
  try {
    process.stderr.write(message);
  } catch (error) {
    logCrash('stderr-write-failed', error);
    if (isDisconnectedStdioError(error)) {
      process.exit(0);
    }
  }
}

function logCrash(source: string, error: unknown): void {
  try {
    appendMakerCrashLog(source, error);
  } catch {
    // Last-resort crash logging must never create another crash.
  }
}
