/**
 * Resolve and verify the package launcher used by Maker MCP client configs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export type MakerMcpLauncherKind = 'node_npm_cli' | 'path_npx' | 'self_runtime';

export type MakerMcpLauncher = {
  kind: MakerMcpLauncherKind;
  command: string;
  args: string[];
  commandAndArgs: string[];
};

export type MakerMcpLauncherVerification = {
  ok: boolean;
  stage: 'initialize' | 'tools_list';
  launcherKind: MakerMcpLauncherKind;
  command: string;
  toolNames: string[];
  stderr?: string;
  error?: string;
  failureType?:
    | 'spawn_error'
    | 'timeout'
    | 'npm_environment_error'
    | 'protocol_error'
    | 'missing_required_tool';
};

type ResolveMakerMcpLauncherOptions = {
  packageName: string;
  platform?: NodeJS.Platform;
  execPath?: string;
  npmExecPath?: string;
  existsSync?: (candidate: string) => boolean;
};

type VerifyMakerMcpLauncherOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

const DEFAULT_VERIFY_TIMEOUT_MS = 90_000;
const VERIFY_CLIENT_VERSION = '1.0.0';
const REQUIRED_TOOL_NAME = 'maker_status_lite';
const PUBLISHED_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SELF_RUNTIME_DIRECTORIES = [
  'skills/taptap-maker-local',
  'skills/taptap-maker-dev-kit-guide',
  'skills/update-taptap-mcp',
];
const SELF_RUNTIME_FILES = ['dist/maker.js', 'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'];
const SELF_RUNTIME_COPY_FALLBACK_CODES = new Set(['EIO', 'EACCES', 'EPERM']);

export function resolveMakerPackageSpec(packageName: string, currentVersion: string): string {
  return PUBLISHED_VERSION_PATTERN.test(currentVersion)
    ? `${packageName}@${currentVersion}`
    : packageName;
}

export function materializeMakerSelfLauncher(options: {
  version: string;
  bundleUrl: string;
  makerHome: string;
  execPath?: string;
}): MakerMcpLauncher {
  if (!PUBLISHED_VERSION_PATTERN.test(options.version) && options.version !== 'dev') {
    throw new Error(`Invalid Maker runtime version: ${options.version}`);
  }

  const execPath = options.execPath ?? process.execPath;
  if (!path.isAbsolute(execPath) || !fs.existsSync(execPath)) {
    throw new Error('Maker self launcher requires an existing absolute Node executable.');
  }

  const sourceBundle = fileURLToPath(options.bundleUrl);
  const sourceRoot = path.dirname(path.dirname(sourceBundle));
  const runtimeRoot = path.join(path.resolve(options.makerHome), 'mcp-runtime', options.version);
  for (const relativePath of [...SELF_RUNTIME_FILES, ...SELF_RUNTIME_DIRECTORIES]) {
    const sourcePath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Maker self runtime source is incomplete: ${sourcePath}`);
    }
  }

  if (path.resolve(sourceRoot) !== path.resolve(runtimeRoot)) {
    for (const relativePath of SELF_RUNTIME_FILES) {
      const sourcePath = path.join(sourceRoot, relativePath);
      const targetPath = path.join(runtimeRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
    for (const relativePath of SELF_RUNTIME_DIRECTORIES) {
      copySelfRuntimeDirectory(
        path.join(sourceRoot, relativePath),
        path.join(runtimeRoot, relativePath)
      );
    }
  }

  const stableBundle = path.join(runtimeRoot, 'dist', 'maker.js');
  return {
    kind: 'self_runtime',
    command: execPath,
    args: [stableBundle],
    commandAndArgs: [execPath, stableBundle],
  };
}

function copySelfRuntimeDirectory(sourcePath: string, targetPath: string): void {
  try {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
    if (!code || !SELF_RUNTIME_COPY_FALLBACK_CODES.has(code)) {
      throw error;
    }
    copyDirectoryEntries(sourcePath, targetPath);
  }
}

function copyDirectoryEntries(sourcePath: string, targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntry = path.join(sourcePath, entry.name);
    const targetEntry = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryEntries(sourceEntry, targetEntry);
    } else {
      fs.copyFileSync(sourceEntry, targetEntry);
    }
  }
}

/**
 * Resolve a package launcher that can be persisted in AI client MCP configs.
 */
export function resolveMakerMcpLauncher(options: ResolveMakerMcpLauncherOptions): MakerMcpLauncher {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    const args = ['-y', '-p', options.packageName, 'taptap-maker'];
    return {
      kind: 'path_npx',
      command: 'npx',
      args,
      commandAndArgs: ['npx', ...args],
    };
  }

  const existsSync = options.existsSync ?? fs.existsSync;
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  const windowsPath = path.win32;
  const npmCliCandidates = uniqueStrings([
    npmExecPath,
    windowsPath.join(windowsPath.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]).filter(
    (candidate) =>
      windowsPath.isAbsolute(candidate) &&
      windowsPath.basename(candidate).toLowerCase() === 'npm-cli.js' &&
      existsSync(candidate)
  );

  if (windowsPath.isAbsolute(execPath) && existsSync(execPath) && npmCliCandidates[0]) {
    const args = [
      npmCliCandidates[0],
      'exec',
      '--yes',
      '--package',
      options.packageName,
      '--',
      'taptap-maker',
    ];
    return {
      kind: 'node_npm_cli',
      command: execPath,
      args,
      commandAndArgs: [execPath, ...args],
    };
  }

  throw new Error(
    'No runnable absolute Node/npm launcher was found. Install Node.js with npm, then rerun taptap-maker mcp install.'
  );
}

/**
 * Start the resolved command as an MCP client would and require a tools/list response.
 */
export async function verifyMakerMcpLauncher(
  launcher: MakerMcpLauncher,
  options: VerifyMakerMcpLauncherOptions = {}
): Promise<MakerMcpLauncherVerification> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  const transport = new StdioClientTransport({
    command: launcher.command,
    args: launcher.args,
    cwd: options.cwd,
    env: options.env,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'taptap-maker-launcher-verifier', version: VERIFY_CLIENT_VERSION },
    { capabilities: {} }
  );
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  let stage: MakerMcpLauncherVerification['stage'] = 'initialize';

  try {
    await withTimeout(client.connect(transport), timeoutMs, stage);
    stage = 'tools_list';
    const result = await withTimeout(client.listTools(), timeoutMs, stage);
    const toolNames = result.tools.map((tool) => tool.name);
    if (!toolNames.includes(REQUIRED_TOOL_NAME)) {
      return failureResult(
        launcher,
        stage,
        stderr,
        'missing_required_tool',
        `MCP tools/list did not include ${REQUIRED_TOOL_NAME}.`,
        toolNames
      );
    }
    return {
      ok: true,
      stage,
      launcherKind: launcher.kind,
      command: formatCommand(launcher),
      toolNames,
      ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failureResult(
      launcher,
      stage,
      stderr,
      classifyVerificationFailure(message, stderr),
      message
    );
  } finally {
    await closeClient(client);
    transport.stderr?.destroy();
  }
}

function failureResult(
  launcher: MakerMcpLauncher,
  stage: MakerMcpLauncherVerification['stage'],
  stderr: string,
  failureType: NonNullable<MakerMcpLauncherVerification['failureType']>,
  error: string,
  toolNames: string[] = []
): MakerMcpLauncherVerification {
  return {
    ok: false,
    stage,
    launcherKind: launcher.kind,
    command: formatCommand(launcher),
    toolNames,
    ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
    error,
    failureType,
  };
}

export function classifyVerificationFailure(
  message: string,
  stderr: string
): NonNullable<MakerMcpLauncherVerification['failureType']> {
  const diagnosticText = `${message}\n${stderr}`;
  if (
    /npm\s+(?:(?:ERR!|error)\s+)?(?:code\s+)?E(?:PERM|ACCES)|cache folder contains root-owned files|cache[^\n]*(?:permission|not writable|write failed)/i.test(
      diagnosticText
    )
  ) {
    return 'npm_environment_error';
  }
  if (/timed out/i.test(message)) {
    return 'timeout';
  }
  if (/ENOENT|not recognized|spawn/i.test(message)) {
    return 'spawn_error';
  }
  return 'protocol_error';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Maker MCP launcher verification timed out during ${stage}.`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function closeClient(client: Client): Promise<void> {
  try {
    await withTimeout(client.close(), 5_000, 'close');
  } catch {
    // Verification has already captured the actionable startup failure.
  }
}

function formatCommand(launcher: MakerMcpLauncher): string {
  return launcher.commandAndArgs.map(quoteCommandArgument).join(' ');
}

function quoteCommandArgument(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
