/**
 * taptap-maker entry.
 *
 * Starts Maker MCP server mode.
 */

import { startMakerMcpServer } from './server/mcp.js';
import { formatCliError, runMakerCli } from './cli/commands.js';
import { appendMakerCrashLog } from './crashLog.js';

installCrashLogging();

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command) {
    await startMakerMcpServer();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  await runMakerCli(process.argv.slice(2));
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [--env rnd|production] [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--skip-confirm] [--skip-mcp-install] [--register-mcp codex,cursor,claude]',
      '                     [--package @taptap/instant-games-open-mcp] [--json]',
      '  taptap-maker doctor [--target-dir DIR] [--env rnd|production] [--json]',
      '  taptap-maker apps [--pat PAT] [--json]',
      '  taptap-maker pat set [PAT] [--json]',
      '  taptap-maker mcp install [--ide codex,cursor,claude] [--env rnd|production]',
      '                             [--package @taptap/instant-games-open-mcp] [--json]',
      '  taptap-maker mcp verify              Verify CLI spawn path',
      '  taptap-maker dev-kit update [--target-dir DIR] [--json]',
      '  taptap-maker help                    Show this help',
      '',
      'Windows note:',
      '  Generated MCP configs use npx.cmd automatically on Windows.',
      '',
      'MCP server mode is still used by AI clients after configuration reload.',
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
