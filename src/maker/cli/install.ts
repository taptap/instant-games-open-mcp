/**
 * taptap-maker install command.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getStringFlag } from './common.js';

function getLocalCommand(): { command: string; args: string[] } {
  const localDist = path.resolve(process.cwd(), 'dist', 'maker.js');
  if (fs.existsSync(localDist)) {
    return {
      command: 'node',
      args: [localDist],
    };
  }

  return {
    command: 'npx',
    args: ['-y', '-p', '@taptap/instant-games-open-mcp', 'taptap-maker'],
  };
}

export async function runInstall(flags: Record<string, string | boolean>): Promise<void> {
  const ide = getStringFlag(flags, 'ide') || 'codex';
  if (!['codex', 'cursor', 'claude', 'all'].includes(ide)) {
    throw new Error('Usage: taptap-maker install --ide codex|cursor|claude|all');
  }

  if (ide === 'codex' || ide === 'all') {
    installCodex();
  }

  if (ide === 'cursor' || ide === 'all') {
    installCursor();
  }

  if (ide === 'claude' || ide === 'all') {
    process.stdout.write(
      'Claude Code install is not automated yet. Use `claude mcp add` with taptap-maker.\n'
    );
  }
}

function installCodex(): void {
  const { command, args } = getLocalCommand();
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  const block = [
    '',
    '[mcp_servers.taptap-maker]',
    `command = "${command}"`,
    `args = [${args.map((arg) => JSON.stringify(arg)).join(', ')}]`,
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  if (existing.includes('[mcp_servers.taptap-maker]')) {
    process.stdout.write(`✓ Codex config already contains taptap-maker: ${configPath}\n`);
    return;
  }

  fs.appendFileSync(configPath, block, 'utf8');
  process.stdout.write(`✓ Added taptap-maker to Codex config: ${configPath}\n`);
  process.stdout.write('Please restart Codex to load the MCP server.\n');
}

function installCursor(): void {
  const { command, args } = getLocalCommand();
  const configPath = path.join(process.cwd(), '.cursor', 'mcp.json');
  const config = {
    mcpServers: {
      'taptap-maker': {
        command,
        args,
        cwd: process.cwd(),
      },
    },
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  process.stdout.write(`✓ Wrote Cursor MCP config: ${configPath}\n`);
  process.stdout.write('Please restart Cursor to load the MCP server.\n');
}
