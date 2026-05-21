/**
 * taptap-maker entry.
 *
 * With subcommands it behaves as a CLI. Without subcommands it starts MCP server mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './cli/common.js';
import { runInit } from './cli/init.js';
import { runInstall } from './cli/install.js';
import { runLogin, runLogout } from './cli/login.js';
import { runProjects } from './cli/projects.js';
import { runStatus } from './cli/status.js';
import { startMakerMcpServer } from './server/mcp.js';
import { getMakerHome } from './storage.js';

installCrashLogging();

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command) {
    await startMakerMcpServer();
    return;
  }

  switch (parsed.command) {
    case 'init':
      await runInit(parsed.flags);
      return;
    case 'login':
      await runLogin(parsed.flags);
      return;
    case 'logout':
      await runLogout();
      return;
    case 'status':
      await runStatus(parsed.flags);
      return;
    case 'projects':
      await runProjects(parsed.rest, parsed.flags);
      return;
    case 'install':
      await runInstall(parsed.flags);
      return;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      throw new Error(`Unknown taptap-maker command: ${parsed.command}`);
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [options]          Login/onboard/bind a Maker project',
      '  taptap-maker login --pat <pat>       Save Maker PAT for API and git operations',
      '  taptap-maker login --jwt <jwt>       Save legacy Maker JWT fallback',
      '  taptap-maker logout                  Clear local Maker PAT/JWT/Tap auth',
      '  taptap-maker status [--json]         Show local Maker state',
      '  taptap-maker projects list [--json]  List Maker projects',
      '  taptap-maker projects clone <id>     Clone Maker app/project and write .maker-mcp',
      '  taptap-maker projects push -m <msg>  Commit and push current Maker project',
      '  taptap-maker install --ide <ide>     Install MCP config for codex/cursor/claude/all',
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
