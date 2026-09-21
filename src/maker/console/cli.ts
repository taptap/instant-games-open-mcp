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

declare const __MAKER_VERSION__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ === 'undefined' ? 'dev' : __MAKER_VERSION__;
const CONSOLE_PROTOCOL_VERSION = 2;
type Session = {
  schema: 1;
  origin: string;
  instanceId: string;
  launcher: string;
  pid: number;
  draining?: boolean;
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
export function ensureCompatibleConsoleLauncher(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ConsoleError(
      'Another Maker version is serving the console. Stop that console before opening this version.'
    );
  }
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
    (session.draining !== undefined && typeof session.draining !== 'boolean')
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
): Promise<(Session & { draining: boolean }) | undefined> {
  const session = readSession();
  if (!session) return undefined;
  try {
    const state = await request(session, '/api/health', undefined, timeoutMs);
    if (state.instanceId !== session.instanceId) throw new Error('Console identity mismatch.');
    return { ...session, draining: state.draining === true };
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
      if (!session?.draining) return session;
      sawDraining = true;
    } catch (error) {
      // A verified draining instance may close its socket just before its PID exits.
      if (!sawDraining) throw error;
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
    const server = await startConsoleServer({
      registry,
      html: getConsoleHtml(),
      version: VERSION,
      packageRoot: path.dirname(path.dirname(path.resolve(process.argv[1]))),
      distribution: process.env.TAPTAP_MAKER_DISTRIBUTION,
      historyFile: path.join(home(), 'tasks.json'),
      instanceId,
      execute: createConsoleExecutor({ entry: process.argv[1] }),
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
      void server.close();
    };
    process.once('exit', cleanup);
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
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

async function ensureSession(): Promise<Session> {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  const existing = await availableSession();
  if (existing) {
    ensureCompatibleConsoleLauncher(existing.launcher, launcherIdentity());
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
        ensureCompatibleConsoleLauncher(launched.launcher, launcherIdentity());
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
      ensureCompatibleConsoleLauncher(launched.launcher, launcherIdentity());
      return launched;
    }
    const launch = await launchConsoleServerProcess({
      execPath: process.execPath,
      execArgv: process.execArgv,
      entry: process.argv[1],
      cwd: home(),
      logFile: path.join(home(), 'server.log'),
      env: process.env,
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      const failure = launch.failure();
      if (failure) throw failure;
      const session = readSession();
      if (session && (!launch.expectedPid || session.pid === launch.expectedPid)) {
        const active = await availableSession();
        if (active) {
          ensureCompatibleConsoleLauncher(active.launcher, launcherIdentity());
          return active;
        }
      }
      if (launch.exited()) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    // Reap only our unadvertised startup child. A published session may already
    // be serving another opener and must not be terminated on a probe failure.
    // Windows wrapper PID is not session.pid; never kill after session.json exists.
    const published = readSession();
    if (!published || (launch.expectedPid && published.pid !== launch.expectedPid)) {
      launch.stopUnpublished();
    }
    throw new ConsoleError(
      'Console did not start. Inspect the Maker console server log. An empty log usually means the Windows CIM Hidden PowerShell wrapper never reached Node, often because antivirus blocked EncodedCommand. Read docs/MAKER_CONSOLE.md and skills/taptap-maker-local/SKILL.md.'
    );
  } finally {
    releaseLaunch();
  }
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
    if (action === 'stop' && !session.draining) await request(session, '/api/shutdown', {});
    process.stdout.write(
      JSON.stringify({
        ok: true,
        running: action !== 'stop',
        origin: session.origin,
        draining: action === 'stop' || session.draining,
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
  const session = await ensureSession();
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
