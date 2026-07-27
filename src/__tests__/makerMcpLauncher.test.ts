/**
 * Maker MCP launcher resolution and protocol verification tests.
 */

import {
  resolveMakerMcpLauncher,
  verifyMakerMcpLauncher,
  type MakerMcpLauncher,
} from '../maker/cli/mcpLauncher';

describe('Maker MCP launcher', () => {
  test('uses absolute node and npm-cli paths on Windows without relying on PATH npx', () => {
    const nodePath = 'D:\\Program Files\\nodejs\\node.exe';
    const npmCliPath = 'D:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
    const existing = new Set([nodePath, npmCliPath]);

    const launcher = resolveMakerMcpLauncher({
      packageName: '@taptap/maker',
      platform: 'win32',
      execPath: nodePath,
      npmExecPath: npmCliPath,
      existsSync: (candidate) => existing.has(candidate),
    });

    expect(launcher).toEqual({
      kind: 'node_npm_cli',
      command: nodePath,
      args: [npmCliPath, 'exec', '--yes', '--package', '@taptap/maker', '--', 'taptap-maker'],
      commandAndArgs: [
        nodePath,
        npmCliPath,
        'exec',
        '--yes',
        '--package',
        '@taptap/maker',
        '--',
        'taptap-maker',
      ],
    });
    expect(launcher.commandAndArgs.join(' ')).not.toContain('cd ');
    expect(launcher.commandAndArgs).not.toContain('npx.cmd');
  });

  test('rejects Windows installation when no absolute launcher exists', () => {
    expect(() =>
      resolveMakerMcpLauncher({
        packageName: '@taptap/maker',
        platform: 'win32',
        execPath: 'C:\\portable-node\\node.exe',
        existsSync: () => false,
      })
    ).toThrow('No runnable absolute Node/npm launcher');
  });

  test('rejects npx.cmd-only Windows environments instead of persisting shell quoting', () => {
    const nodePath = 'D:\\游戏工具\\Portable Node\\node.exe';
    const npxPath = 'D:\\游戏工具\\Portable Node\\npx.cmd';
    const existing = new Set([nodePath, npxPath]);

    expect(() =>
      resolveMakerMcpLauncher({
        packageName: '@taptap/maker',
        platform: 'win32',
        execPath: nodePath,
        npmExecPath: 'D:\\missing\\npm-cli.js',
        existsSync: (candidate) => existing.has(candidate),
      })
    ).toThrow('No runnable absolute Node/npm launcher');
  });

  test('completes a real MCP initialize and tools/list exchange', async () => {
    const script = [
      "import { Server } from '@modelcontextprotocol/sdk/server/index.js';",
      "import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';",
      "import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';",
      "const server = new Server({ name: 'launcher-test', version: '1.0.0' }, { capabilities: { tools: {} } });",
      "server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'maker_status_lite', description: 'status', inputSchema: { type: 'object' } }] }));",
      'await server.connect(new StdioServerTransport());',
    ].join('\n');
    const launcher: MakerMcpLauncher = {
      kind: 'node_npm_cli',
      command: process.execPath,
      args: ['--input-type=module', '--eval', script],
      commandAndArgs: [process.execPath, '--input-type=module', '--eval', script],
    };

    const result = await verifyMakerMcpLauncher(launcher, { timeoutMs: 10_000 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        stage: 'tools_list',
        launcherKind: 'node_npm_cli',
      })
    );
    expect(result.toolNames).toContain('maker_status_lite');
  });
});
