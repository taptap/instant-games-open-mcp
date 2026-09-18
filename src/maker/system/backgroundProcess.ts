import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_ENV_KEYS = new Set([
  'APPDATA',
  'COMSPEC',
  'FRAMECRATE_STUDIO_DIR',
  'HOME',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SCE_MCP_URL',
  'SYSTEMROOT',
  'TAPTAP_MCP_CLIENT_IDE',
  'TAPTAP_MCP_ENV',
  'TAPTAP_MAKER_API_BASE',
  'TAPTAP_MAKER_CLIENT_ID',
  'TAPTAP_MAKER_CRASH_LOG_MAX_BYTES',
  'TAPTAP_MAKER_CRASH_LOG_MAX_ENTRY_BYTES',
  'TAPTAP_MAKER_DISTRIBUTION',
  'TAPTAP_MAKER_GIT_BASE',
  'TAPTAP_MAKER_GIT_BIN',
  'TAPTAP_MAKER_GIT_RETRY_DELAY_MS',
  'TAPTAP_MAKER_HOME',
  'TAPTAP_MAKER_PAT_URL',
  'TAPTAP_MAKER_PYTHON_BIN',
  'TAPTAP_MAKER_REMOTE_MCP_SERVER_URL',
  'TAPTAP_MAKER_TAP_TOKEN_URL',
  'TAPTAP_MAKER_VERSION_POLICY_URL',
  'TAPTAP_MAKER_WEB_URL',
  'TAPTAP_REMOTE_MCP_SERVER_URL',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
]);

export type BackgroundProcessLaunch = {
  expectedPid?: number;
  failure: () => Error | undefined;
  exited: () => boolean;
  stopUnpublished: () => boolean;
};

export type BackgroundProcessLaunchOptions = {
  command: string;
  args: string[];
  cwd: string;
  logFile: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
};

export function openBackgroundProcessLog(filename: string): number {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const oversized = fs.existsSync(filename) && fs.statSync(filename).size > 1024 * 1024;
  return fs.openSync(filename, oversized ? 'w' : 'a', 0o600);
}

export function selectWindowsBackgroundEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => typeof value === 'string' && WINDOWS_ENV_KEYS.has(key.toUpperCase())
    )
  );
}

export function buildWindowsBackgroundLaunchScripts(options: BackgroundProcessLaunchOptions): {
  broker: string;
  process: string;
} {
  const environment = Object.entries(selectWindowsBackgroundEnvironment(options.env)).map(
    ([key, value]) => `$env:${key} = ${powershellLiteral(value as string)}`
  );
  const command = [options.command, ...options.args].map(powershellLiteral).join(' ');
  const processScript = [
    "$ErrorActionPreference = 'Stop'",
    ...environment,
    `Set-Location -LiteralPath ${powershellLiteral(options.cwd)}`,
    // PS5 treats redirected native stderr as errors; keep setup fail-fast above.
    '$LASTEXITCODE = 1',
    "$ErrorActionPreference = 'Continue'",
    `& ${command} 1> $null 2>> ${powershellLiteral(options.logFile)}`,
    "$ErrorActionPreference = 'Stop'",
    'exit $LASTEXITCODE',
  ].join('\r\n');
  const encodedProcess = Buffer.from(processScript, 'utf16le').toString('base64');
  const broker = [
    "$ErrorActionPreference = 'Stop'",
    `$commandLine = 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedProcess}'`,
    '$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{',
    '  CommandLine = $commandLine',
    `  CurrentDirectory = ${powershellLiteral(options.cwd)}`,
    '}',
    "if ([int]$result.ReturnValue -ne 0) { throw ('Win32_Process.Create failed: ' + $result.ReturnValue) }",
    '[Console]::Out.Write([string]$result.ProcessId)',
  ].join('\r\n');
  return { broker, process: processScript };
}

export async function launchBackgroundProcess(
  options: BackgroundProcessLaunchOptions
): Promise<BackgroundProcessLaunch> {
  if (options.signal?.aborted) throw new Error('CANCELLED: background launch.');
  if ((options.platform ?? process.platform) !== 'win32') return directLaunch(options);

  fs.closeSync(openBackgroundProcessLog(options.logFile));
  const scripts = buildWindowsBackgroundLaunchScripts(options);
  const broker = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', scripts.broker],
    {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: selectWindowsBackgroundEnvironment(options.env),
    }
  );
  let stdout = '';
  let stderr = '';
  broker.stdout?.on('data', (chunk) => {
    stdout = (stdout + String(chunk)).slice(-4096);
  });
  broker.stderr?.on('data', (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4096);
  });
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    };
    const fail = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cancel = (): void => {
      broker.kill();
      fail(new Error('CANCELLED: Windows broker launch outcome is unverified.'));
    };
    const timer = setTimeout(() => {
      broker.kill();
      fail(new Error('TIMEOUT: Windows broker launch outcome is unverified.'));
    }, 15000);
    options.signal?.addEventListener('abort', cancel, { once: true });
    broker.once('error', fail);
    broker.once('close', (code) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Windows process broker exited with code ${code}.`));
    });
    if (options.signal?.aborted) cancel();
  });
  const brokerPid = Number(stdout.trim());
  if (!Number.isInteger(brokerPid) || brokerPid <= 0) {
    throw new Error('Windows process broker did not return a valid process id.');
  }
  return {
    failure: () => undefined,
    exited: () => false,
    // CIM returns the wrapper PID, not an owned ChildProcess handle. Never kill
    // by this historical PID: it may already have exited and been reused.
    stopUnpublished: () => false,
  };
}

function directLaunch(options: BackgroundProcessLaunchOptions): BackgroundProcessLaunch {
  const stderr = openBackgroundProcessLog(options.logFile);
  let child: ChildProcess;
  try {
    child = spawn(options.command, options.args, {
      cwd: options.cwd,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', stderr],
      env: options.env,
    });
  } finally {
    fs.closeSync(stderr);
  }
  let launchFailure: Error | undefined;
  child.once('error', (error) => {
    launchFailure = error;
  });
  child.unref();
  return {
    expectedPid: child.pid,
    failure: () => launchFailure,
    exited: () => child.exitCode !== null,
    stopUnpublished: () => {
      if (child.exitCode !== null || child.signalCode !== null) return true;
      if (child.exitCode === null) child.kill('SIGTERM');
      return false;
    },
  };
}

function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
