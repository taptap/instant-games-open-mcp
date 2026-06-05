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

  const cleanup = (): void => {
    proxy.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [--env rnd|production] [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--skip-confirm] [--skip-mcp-install] [--register-mcp codex,cursor,claude]',
      '                     [--json]',
      '  taptap-maker doctor [--target-dir DIR] [--env rnd|production] [--json]',
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
      '  Generated MCP configs use npx.cmd automatically on Windows.',
      '',
    ].join('\n')
  );
}

main().catch((error) => {
  logCrash('main.catch', error);
  process.stderr.write(`❌ ${formatCliError(error)}\n`);
  process.exit(1);
});

function installCrashLogging(): void {
  process.on('uncaughtException', (error) => {
    logCrash('uncaughtException', error);
    process.stderr.write(`❌ Uncaught Maker MCP error: ${error.message}\n`);
  });

  process.on('unhandledRejection', (reason) => {
    logCrash('unhandledRejection', reason);
    process.stderr.write(
      `❌ Unhandled Maker MCP rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`
    );
  });
}

function logCrash(source: string, error: unknown): void {
  try {
    appendMakerCrashLog(source, error);
  } catch {
    // Last-resort crash logging must never create another crash.
  }
}
