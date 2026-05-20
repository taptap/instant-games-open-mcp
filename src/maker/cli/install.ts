/**
 * taptap-maker install command.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getStringFlag } from './common.js';

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface ClaudeInstallInvocation {
  command: string;
  args: string[];
}

function getLocalCommand(): CommandSpec {
  const localDist = path.resolve(process.cwd(), 'dist', 'maker.js');
  if (fs.existsSync(localDist)) {
    return {
      command: 'node',
      args: [localDist],
    };
  }

  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
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
    installClaude(flags);
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

function installClaude(flags: Record<string, string | boolean>): void {
  const invocation = createClaudeMcpAddInvocation({
    projectRoot: process.cwd(),
    server: getLocalCommand(),
    scope: getStringFlag(flags, 'scope') || 'local',
  });

  if (flags['dry-run'] === true) {
    process.stdout.write(`${formatShellCommand(invocation.command, invocation.args)}\n`);
    return;
  }

  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(
      [
        'Claude Code CLI not found or failed to start.',
        'Install Claude Code CLI first, or run the printed command manually after installing it.',
        `command: ${formatShellCommand(invocation.command, invocation.args)}`,
        `error: ${result.error.message}`,
      ].join('\n')
    );
  }

  if (result.status !== 0) {
    throw new Error(
      [
        'Claude Code MCP install failed.',
        `command: ${formatShellCommand(invocation.command, invocation.args)}`,
        result.stdout ? `stdout:\n${result.stdout.trim()}` : '',
        result.stderr ? `stderr:\n${result.stderr.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.stdout.write('✓ Added taptap-maker to Claude Code MCP config.\n');
  process.stdout.write('Please restart or reload Claude Code to load the MCP server.\n');
}

export function createClaudeMcpAddInvocation(options: {
  projectRoot: string;
  server: CommandSpec;
  scope?: string;
}): ClaudeInstallInvocation {
  const scope = options.scope || 'local';
  if (!['local', 'user', 'project'].includes(scope)) {
    throw new Error('Claude Code scope must be one of: local, user, project');
  }

  const wrapped = createCwdWrappedCommand(options.projectRoot, options.server);
  return {
    command: process.platform === 'win32' ? 'claude.cmd' : 'claude',
    args: ['mcp', 'add', '--scope', scope, 'taptap-maker', '--', wrapped.command, ...wrapped.args],
  };
}

export function createCwdWrappedCommand(projectRoot: string, server: CommandSpec): CommandSpec {
  const cwd = path.resolve(projectRoot);
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `cd /d "${escapeCmd(cwd)}" && ${formatCmdCommand(server)}`],
    };
  }

  return {
    command: '/bin/sh',
    args: [
      '-lc',
      'cd "$1" && shift && exec "$@"',
      'taptap-maker-cwd',
      cwd,
      server.command,
      ...server.args,
    ],
  };
}

function formatShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(' ');
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function formatCmdCommand(server: CommandSpec): string {
  return [server.command, ...server.args].map(quoteCmdArg).join(' ');
}

function quoteCmdArg(value: string): string {
  return `"${escapeCmd(value)}"`;
}

function escapeCmd(value: string): string {
  return value.replace(/"/g, '\\"');
}
