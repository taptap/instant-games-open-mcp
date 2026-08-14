/**
 * Maker MCP launcher resolution and protocol verification tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  classifyVerificationFailure,
  materializeMakerSelfLauncher,
  resolveMakerPackageSpec,
  resolveMakerMcpLauncher,
  verifyMakerMcpLauncher,
  type MakerMcpLauncher,
} from '../maker/cli/mcpLauncher';

describe('Maker MCP launcher', () => {
  test('pins published Maker versions instead of resolving the npm latest tag', () => {
    expect(resolveMakerPackageSpec('@taptap/maker', '0.0.30-beta.2')).toBe(
      '@taptap/maker@0.0.30-beta.2'
    );
    expect(resolveMakerPackageSpec('@taptap/maker', '0.0.31')).toBe('@taptap/maker@0.0.31');
    expect(resolveMakerPackageSpec('@taptap/maker', 'dev')).toBe('@taptap/maker');
  });

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

  test('classifies npm cache permission stderr as an environment failure', () => {
    expect(
      classifyVerificationFailure(
        'MCP error -32000: Connection closed',
        'npm ERR! code EPERM\nnpm ERR! Your cache folder contains root-owned files'
      )
    ).toBe('npm_environment_error');
    expect(
      classifyVerificationFailure(
        'MCP error -32000: Connection closed',
        'npm error code EACCES\nnpm error path /home/user/.npm/_cacache'
      )
    ).toBe('npm_environment_error');
  });

  test('materializes a stable self runtime outside the temporary npx package cache', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-self-launcher-'));
    try {
      const packageRoot = path.join(tempDir, '_npx', 'node_modules', '@taptap', 'maker');
      const makerHome = path.join(tempDir, 'maker-home');
      const bundlePath = path.join(packageRoot, 'dist', 'maker.js');
      fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
      fs.writeFileSync(bundlePath, '// maker bundle');
      for (const skill of [
        'taptap-maker-local',
        'taptap-maker-dev-kit-guide',
        'update-taptap-mcp',
      ]) {
        const skillDir = path.join(packageRoot, 'skills', skill);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skill}`);
      }
      const docsDir = path.join(packageRoot, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'),
        '# Troubleshooting'
      );

      const launcher = materializeMakerSelfLauncher({
        version: '0.0.30-beta.2',
        bundleUrl: pathToFileURL(bundlePath).href,
        makerHome,
        execPath: process.execPath,
      });

      const stableBundle = path.join(makerHome, 'mcp-runtime', '0.0.30-beta.2', 'dist', 'maker.js');
      expect(launcher).toEqual({
        kind: 'self_runtime',
        command: process.execPath,
        args: [stableBundle],
        commandAndArgs: [process.execPath, stableBundle],
      });
      expect(fs.readFileSync(stableBundle, 'utf8')).toBe('// maker bundle');
      expect(
        fs.readFileSync(
          path.join(
            makerHome,
            'mcp-runtime',
            '0.0.30-beta.2',
            'skills',
            'taptap-maker-local',
            'SKILL.md'
          ),
          'utf8'
        )
      ).toBe('# taptap-maker-local');
      expect(launcher.commandAndArgs.join(' ')).not.toContain('_npx');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('always materializes a self runtime to an absolute persistent path', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-self-relative-'));
    const originalCwd = process.cwd();
    try {
      const packageRoot = path.join(tempDir, 'package');
      const bundlePath = path.join(packageRoot, 'dist', 'maker.js');
      fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
      fs.writeFileSync(bundlePath, '// maker bundle');
      for (const skill of [
        'taptap-maker-local',
        'taptap-maker-dev-kit-guide',
        'update-taptap-mcp',
      ]) {
        const skillDir = path.join(packageRoot, 'skills', skill);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skill}`);
      }
      const docsDir = path.join(packageRoot, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'),
        '# Troubleshooting'
      );
      process.chdir(tempDir);

      const launcher = materializeMakerSelfLauncher({
        version: '0.0.30-beta.2',
        bundleUrl: pathToFileURL(bundlePath).href,
        makerHome: 'relative-maker-home',
        execPath: process.execPath,
      });

      expect(path.isAbsolute(launcher.args[0])).toBe(true);
      expect(launcher.args[0]).toBe(
        path.join(
          process.cwd(),
          'relative-maker-home',
          'mcp-runtime',
          '0.0.30-beta.2',
          'dist',
          'maker.js'
        )
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
