/**
 * taptap-maker entry.
 *
 * Starts Maker MCP server mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { startMakerMcpServer } from './server/mcp.js';
import { getMakerHome } from './storage.js';

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

  throw new Error(
    `taptap-maker does not expose user CLI subcommands. Start it without arguments as an MCP server.`
  );
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker help                    Show this help',
      '',
      'Normal Maker local development should use MCP tools:',
      '  maker_exchange_pat, maker_list_apps, maker_clone_to_current_directory,',
      '  maker_submit_current_directory, maker_build_current_directory.',
      '',
      'Advanced CLI subcommands still exist for maintainers and diagnostics,',
      'but are not the default user onboarding path.',
      '',
    ].join('\n')
  );
}

main().catch((error) => {
  logCrash('main.catch', error);
  process.stderr.write(`❌ ${error instanceof Error ? error.message : String(error)}\n`);
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
    const makerHome = getMakerHome();
    fs.mkdirSync(makerHome, { recursive: true });
    const logPath = path.join(makerHome, 'mcp-crash.log');
    const message = error instanceof Error ? error.stack || error.message : String(error);
    fs.appendFileSync(
      logPath,
      [`[${new Date().toISOString()}] ${source}`, message, ''].join('\n'),
      'utf8'
    );
  } catch {
    // Last-resort crash logging must never create another crash.
  }
}
