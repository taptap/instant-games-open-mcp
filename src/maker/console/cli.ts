import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { claimRecoveryMutex as claimSharedRecoveryMutex } from '../system/recoveryMutex.js';
import { getMakerHome } from '../storage.js';
import {
  getMakerProjectRegistryPath,
  getLegacyMakerProjectRegistryPath,
} from '../projectRegistry.js';
import { writePrivateJson } from '../system/privateJson.js';
import { processPresence } from '../system/processPresence.js';
import { ConsoleProjects } from './projects.js';
import { createConsoleExecutor } from './executor.js';
import { launchConsoleServerProcess } from './processLauncher.js';
export { openConsoleLog } from './processLauncher.js';
import { startConsoleServer } from './server.js';
import { ConsoleError } from './types.js';
import { PreviewOwner } from '../preview/owner.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';

declare const __MAKER_VERSION__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ === 'undefined' ? 'dev' : __MAKER_VERSION__;
const CONSOLE_PROTOCOL_VERSION = 3;
type Session = {
  schema: 1;
  origin: string;
  instanceId: string;
  launcher: string;
  pid: number;
  draining?: boolean;
  userHost?: boolean;
  version?: string;
  entry?: string;
  startedAt?: string;
};
function home(): string {
  return path.join(getMakerHome(), 'console');
}
function sessionPath(): string {
  return path.join(home(), 'session.json');
}
export function createConsoleLauncherIdentity(
  version: string,
  developmentSource?: { entry: string; mtimeMs: number }
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        protocol: CONSOLE_PROTOCOL_VERSION,
        version,
        ...(version === 'dev' ? { developmentSource } : {}),
      })
    )
    .digest('hex');
}
export function ensureCompatibleConsoleLauncher(
  actual: string,
  expected: string,
  details?: {
    actual: Partial<Pick<Session, 'version' | 'entry' | 'startedAt' | 'pid'>>;
    expected: { version: string; entry: string };
  }
): void {
  if (actual !== expected) {
    throw new ConsoleError(
      'Another Maker version is serving the console. 当前控制台与本次 CLI 的启动身份不一致。' +
        ' 当前控制台：' +
        JSON.stringify({
          launcher: actual,
          ...details?.actual,
          version: details?.actual.version || '未记录（旧控制台）',
        }) +
        '；本次 CLI：' +
        JSON.stringify({ launcher: expected, ...details?.expected }) +
        '。先在原控制台保存画布，确认可关闭后执行 console stop，再用本次入口执行 console open --target-dir <项目绝对路径>。不会自动重启或丢弃未保存修改。',
      409
    );
  }
}
function ensureSessionLauncher(session: Session): void {
  ensureCompatibleConsoleLauncher(session.launcher, launcherIdentity(), {
    actual: {
      version: session.version,
      entry: session.entry,
      startedAt: session.startedAt,
      pid: session.pid,
    },
    expected: { version: VERSION, entry: fs.realpathSync(process.argv[1]) },
  });
}
function launcherIdentity(): string {
  const entry = fs.realpathSync(process.argv[1]);
  return createConsoleLauncherIdentity(VERSION, {
    entry,
    mtimeMs: fs.statSync(entry).mtimeMs,
  });
}
function readSession(): Session | undefined {
  if (!fs.existsSync(sessionPath())) return undefined;
  const session = JSON.parse(fs.readFileSync(sessionPath(), 'utf8')) as Session;
  if (
    session.schema !== 1 ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(session.origin) ||
    Number(new URL(session.origin).port) > 65535 ||
    !/^[a-f0-9-]{36}$/.test(session.instanceId) ||
    !Number.isInteger(session.pid) ||
    session.pid <= 0 ||
    typeof session.launcher !== 'string' ||
    (session.draining !== undefined && typeof session.draining !== 'boolean') ||
    (session.userHost !== undefined && typeof session.userHost !== 'boolean')
  )
    throw new ConsoleError(
      'Invalid local console session. Refusing to contact an unknown service.'
    );
  return session;
}
async function request(session: Session, route: string, body?: unknown, timeoutMs = 10000) {
  const response = await fetch(session.origin + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: session.origin,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  const value = (await response.json()) as Record<string, any>;
  if (response.status === 401)
    throw new ConsoleError(
      'An older console requiring a token is still running. Close it from its console page or run console stop with the previous Maker version, then reopen this version.',
      409
    );
  if (!response.ok)
    throw new ConsoleError(value.error || `Console HTTP ${response.status}`, response.status);
  return value;
}
async function activeSession(
  timeoutMs = 10000
): Promise<(Session & { draining: boolean; shutdownError?: string }) | undefined> {
  const session = readSession();
  if (!session) return undefined;
  try {
    const state = await request(session, '/api/health', undefined, timeoutMs);
    if (state.instanceId !== session.instanceId) throw new Error('Console identity mismatch.');
    return {
      ...session,
      draining: state.draining === true,
      shutdownError: typeof state.shutdownError === 'string' ? state.shutdownError : undefined,
    };
  } catch (error) {
    // A live process with an unresponsive or different endpoint must not be replaced.
    try {
      process.kill(session.pid, 0);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return undefined;
    }
    const latest = readSession();
    if (
      latest?.draining &&
      latest.instanceId === session.instanceId &&
      latest.pid === session.pid &&
      latest.origin === session.origin &&
      latest.launcher === session.launcher
    )
      return { ...latest, draining: true };
    throw error;
  }
}

async function availableSession(): Promise<Session | undefined> {
  let sawDraining = false;
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    try {
      const session = await activeSession(
        Math.max(1, Math.min(10000, Math.floor(deadline - performance.now())))
      );
      if (session?.shutdownError)
        throw new ConsoleError(
          `Console cleanup failed: ${session.shutdownError}. Run console stop to retry.`,
          409
        );
      if (!session?.draining) return session;
      sawDraining = true;
    } catch (error) {
      // A verified draining instance may close its socket just before its PID exits.
      if (!sawDraining || error instanceof ConsoleError) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new ConsoleError('The console is still shutting down. Try opening it again shortly.', 409);
}

export async function runConsoleSupervisor(): Promise<void> {
  const release = await claimConsoleServerLock(home());
  try {
    if (await activeSession()) throw new ConsoleError('A console service is already running.');
    const { getConsoleHtml } = await import('./web.js');
    const registry = new ConsoleProjects(getMakerProjectRegistryPath(), {
      legacyFilename: getLegacyMakerProjectRegistryPath(),
    });
    const instanceId = randomUUID();
    const userHost = process.argv[2] === 'console' && process.argv[3] === 'serve';
    const previewOwner = new PreviewOwner();
    const server = await startConsoleServer({
      registry,
      hasActivePreview: () => previewOwner.active,
      closePreviews: () => previewOwner.close(),
      html: getConsoleHtml(),
      version: VERSION,
      packageRoot: path.dirname(path.dirname(path.resolve(process.argv[1]))),
      distribution: process.env.TAPTAP_MAKER_DISTRIBUTION,
      historyFile: path.join(home(), 'tasks.json'),
      preferencesFile: path.join(home(), 'preferences.json'),
      instanceId,
      execute: createConsoleExecutor({
        entry: process.argv[1],
        previewOwner,
      }),
      onDraining: () => {
        const current = readSession();
        if (current?.instanceId === instanceId)
          writePrivateJson(sessionPath(), { ...current, draining: true });
      },
    });
    const record: Session = {
      schema: 1,
      origin: server.origin,
      instanceId,
      pid: process.pid,
      launcher: launcherIdentity(),
      userHost,
      version: VERSION,
      entry: fs.realpathSync(process.argv[1]),
      startedAt: new Date().toISOString(),
    };
    try {
      writePrivateJson(sessionPath(), record);
    } catch (error) {
      await server.close();
      throw error;
    }
    const cleanup = (): void => {
      try {
        if (readSession()?.instanceId === instanceId) fs.unlinkSync(sessionPath());
      } catch {
        /* Never remove a session owned by another process. */
      }
      release();
    };
    const shutdown = (): void => {
      void server.close().catch(() => {});
    };
    process.once('exit', cleanup);
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    void server.closed.then(() => {
      cleanup();
      process.removeListener('exit', cleanup);
      process.removeListener('SIGTERM', shutdown);
      process.removeListener('SIGINT', shutdown);
    });
  } catch (error) {
    release();
    throw error;
  }
}

export async function claimConsoleServerLock(directory: string): Promise<() => void> {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return claimOwnedLock(path.join(directory, 'server.lock'));
}

async function claimOwnedLock(filename: string): Promise<() => void> {
  filename = path.join(fs.realpathSync(path.dirname(filename)), path.basename(filename));
  const identity = `${process.pid}:${randomUUID()}`;
  // New acquisition and stale-owner recovery share the same guard. Otherwise
  // recovery can unlink a replacement acquired after the old owner exits.
  const recoveryFilename = filename + '.recovery';
  const releaseMutex = await claimRecoveryMutex(filename);
  try {
    claimRecoveryGuard(recoveryFilename, identity);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.writeFileSync(filename, identity, { flag: 'wx', mode: 0o600 });
        return () => {
          try {
            if (fs.readFileSync(filename, 'utf8') === identity) fs.unlinkSync(filename);
          } catch {
            /* Preserve a replacement lock. */
          }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let previous: string;
        try {
          previous = fs.readFileSync(filename, 'utf8');
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw cause;
        }
        const pid = Number(previous.split(':')[0]);
        if (!Number.isInteger(pid) || pid <= 0)
          throw new ConsoleError(
            'Invalid console ownership lock; refusing to start another service.'
          );
        try {
          process.kill(pid, 0);
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === 'ESRCH') {
            try {
              if (fs.readFileSync(filename, 'utf8') === previous) fs.unlinkSync(filename);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            continue;
          }
        }
        throw new ConsoleError('A console supervisor is already running.', 409);
      }
    }
    throw new ConsoleError('Console ownership changed during startup. Try again.');
  } finally {
    try {
      removeOwnedFile(recoveryFilename, identity);
    } finally {
      await releaseMutex();
    }
  }
}

function claimRecoveryMutex(filename: string): Promise<() => Promise<void>> {
  return claimSharedRecoveryMutex(
    filename,
    (port) =>
      new ConsoleError(
        `Console ownership recovery is busy (preferred loopback port ${port} is in use). Try again.`,
        409
      )
  );
}

function claimRecoveryGuard(filename: string, identity: string): void {
  for (let attempt = 0; attempt < 3; attempt++) {
    let descriptor: number;
    try {
      descriptor = fs.openSync(filename, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (reclaimStaleRecoveryGuard(filename)) continue;
      throw new ConsoleError('Console ownership recovery is already in progress.', 409);
    }
    try {
      fs.writeFileSync(descriptor, identity, 'utf8');
    } catch (error) {
      fs.unlinkSync(filename);
      throw error;
    } finally {
      fs.closeSync(descriptor);
    }
    return;
  }
  throw new ConsoleError('Console ownership recovery changed during startup.', 409);
}

// Only called while holding the publication/reclamation socket mutex.
function reclaimStaleRecoveryGuard(filename: string): boolean {
  let content: string;
  let modified: number;
  try {
    content = fs.readFileSync(filename, 'utf8');
    modified = fs.statSync(filename).mtimeMs;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
  const pid = Number(content.split(':')[0]);
  const stale =
    Number.isInteger(pid) && pid > 0
      ? processPresence(pid) === 'missing'
      : content === '' && Date.now() - modified >= 2000;
  if (!stale) return false;
  try {
    if (
      fs.readFileSync(filename, 'utf8') === content &&
      fs.statSync(filename).mtimeMs === modified
    ) {
      fs.unlinkSync(filename);
      return true;
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
  return false;
}

function removeOwnedFile(filename: string, identity: string): void {
  try {
    if (fs.readFileSync(filename, 'utf8') === identity) fs.unlinkSync(filename);
  } catch {
    // Preserve a replacement guard.
  }
}

async function ensureSession(allowLegacy = false): Promise<Session> {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  const existing = await availableSession();
  if (existing) {
    ensureSessionLauncher(existing);
    return existing;
  }
  const lock = path.join(home(), 'launch.lock');
  let releaseLaunch: (() => void) | undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      releaseLaunch = await claimOwnedLock(lock);
      break;
    } catch (error) {
      if (!(error instanceof ConsoleError) || error.status !== 409) throw error;
      const launched = await availableSession();
      if (launched) {
        ensureSessionLauncher(launched);
        return launched;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!releaseLaunch)
    throw new ConsoleError('Another console launch is in progress. Try again shortly.');
  try {
    const launched = await availableSession();
    if (launched) {
      ensureSessionLauncher(launched);
      return launched;
    }
    const launch = await launchConsoleServerProcess({
      execPath: process.execPath,
      execArgv: process.execArgv,
      entry: process.argv[1],
      cwd: home(),
      logFile: path.join(home(), 'server.log'),
      env: process.env,
      legacy: allowLegacy,
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      const failure = launch.failure();
      if (failure) throw failure;
      const session = readSession();
      if (session && (!launch.expectedPid || session.pid === launch.expectedPid)) {
        const active = await availableSession();
        if (active) {
          ensureSessionLauncher(active);
          return active;
        }
      }
      if (launch.exited()) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    // 只回收本次未发布的启动子进程。已发布的 session 可能正在服务其他调用方，
    // 探测失败时不能终止它。Windows wrapper PID 不是 session.pid，已有 session.json 时不得回收。
    const published = readSession();
    if (!published || (launch.expectedPid && published.pid !== launch.expectedPid)) {
      launch.stopUnpublished();
    }
    throw new ConsoleError(
      'Console did not start. Inspect the Maker console server log and launcher exit. Normal launch uses Node directly; no WMI fallback was attempted.'
    );
  } finally {
    releaseLaunch();
  }
}

export async function canvasConsoleConnection(projectPath: string) {
  if (!path.isAbsolute(projectPath)) throw new ConsoleError('--target-dir 必须是项目绝对路径。');
  const { previewProject } = await import('../preview/protocol.js');
  previewProject(projectPath);
  const session = await ensureSession();
  const project = await request(session, '/api/projects', { path: projectPath });
  return {
    url: session.origin + '/canvas?project=' + encodeURIComponent(project.key),
    transfer: async (route: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Origin', session.origin);
      const response = await fetch(
        session.origin + '/api/projects/' + encodeURIComponent(project.key) + '/canvases' + route,
        {
          ...init,
          headers,
          signal: AbortSignal.timeout(60000),
          redirect: 'error',
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new ConsoleError(body.error || '素材传输失败：' + response.status, response.status);
      }
      return response;
    },
    request: (route: string, body?: unknown) =>
      request(
        session,
        '/api/projects/' + encodeURIComponent(project.key) + '/canvases' + route,
        body
      ),
  };
}

export async function startConsolePreview(
  projectPath: string,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const session = await ensureSession();
  if (signal.aborted) throw new Error('CANCELLED');
  const project = await request(session, '/api/projects', { path: projectPath });
  if (signal.aborted) throw new Error('CANCELLED');
  const task = await request(session, '/api/tasks', {
    projectKey: project.key,
    action: 'preview.start',
  });
  const deadline = Date.now() + 360000;
  while (!signal.aborted && Date.now() < deadline) {
    const state = await request(session, '/api/state');
    const current = state.tasks.find((item: { id: string }) => item.id === task.id);
    if (!current)
      throw new Error('Preview task outcome unknown; inspect the console before retrying.');
    if (current.status !== 'running')
      return {
        ...current.result,
        ok: current.status === 'succeeded',
        task_id: task.id,
        console_url: session.origin,
        ...(current.error ? { error: current.error } : {}),
      };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    ok: false,
    result: 'UNDETERMINED',
    task_id: task.id,
    console_url: session.origin,
    error: 'Preview request was submitted. Inspect the console; do not retry automatically.',
  };
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? (['rundll32.exe', ['url.dll,FileProtocolHandler', url]] as const)
      : process.platform === 'darwin'
        ? (['open', [url]] as const)
        : (['xdg-open', [url]] as const);
  const child = spawn(command, [...args], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    shell: false,
  });
  child.on('error', () => {
    process.stderr.write(
      'Browser could not be opened automatically. Use the returned console URL.\n'
    );
  });
  child.unref();
}

export async function runConsoleCli(
  action: string | undefined,
  options: Record<string, string | boolean>
): Promise<void> {
  if (action === 'serve') {
    await runConsoleSupervisor();
    return;
  }
  if (action === 'status' || action === 'stop') {
    const session = await activeSession();
    if (!session) {
      process.stdout.write(JSON.stringify({ ok: true, running: false }) + '\n');
      return;
    }
    if (action === 'stop') await request(session, '/api/shutdown', {});
    process.stdout.write(
      JSON.stringify({
        ok: action === 'stop' || !session.shutdownError,
        running: true,
        origin: session.origin,
        console: {
          version: session.version ?? null,
          entry: session.entry ?? null,
          startedAt: session.startedAt ?? null,
          pid: session.pid,
          launcher: session.launcher,
        },
        cli: {
          version: VERSION,
          entry: fs.realpathSync(process.argv[1]),
          launcher: launcherIdentity(),
        },
        draining: action === 'stop' || session.draining,
        ...(action === 'status' && session.shutdownError ? { error: session.shutdownError } : {}),
      }) + '\n'
    );
    return;
  }
  if (action !== 'open') throw new ConsoleError('Use console open|status|stop.');
  const target = typeof options.target_dir === 'string' ? options.target_dir : undefined;
  // Validate before starting a background process, without changing the registry.
  if (target) {
    if (!path.isAbsolute(target))
      throw new ConsoleError('--target-dir must be an absolute project path.');
    const { previewProject } = await import('../preview/protocol.js');
    previewProject(target);
  }
  const session = await ensureSession(options.legacy_wmi === true).catch((error) => {
    if (options.json === true) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          error: sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error)),
        }) + '\n'
      );
      process.exitCode = 1;
      return undefined;
    }
    throw error;
  });
  if (!session) return;
  const project = target ? await request(session, '/api/projects', { path: target }) : undefined;
  await request(session, '/api/activity', {});
  const query = new URLSearchParams();
  if (project) {
    query.set('projectid', project.projectid);
    const state = await request(session, '/api/state');
    if (
      state.projects.filter((item: { projectid: string }) => item.projectid === project.projectid)
        .length > 1
    )
      query.set('checkout', project.key);
  }
  const url = `${session.origin}/${project ? '?' + query : ''}`;
  if (options.no_open !== true) openBrowser(url);
  process.stdout.write(
    JSON.stringify(
      { ok: true, url, projectKey: project?.key },
      null,
      options.json ? undefined : 2
    ) + '\n'
  );
}
