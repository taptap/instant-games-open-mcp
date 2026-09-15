import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { getMakerHome } from '../storage.js';
import {
  getMakerProjectRegistryPath,
  getLegacyMakerProjectRegistryPath,
} from '../projectRegistry.js';
import { writePrivateJson } from '../system/privateJson.js';
import { ConsoleProjects } from './projects.js';
import { createConsoleExecutor } from './executor.js';
import { startConsoleServer } from './server.js';
import { ConsoleError } from './types.js';

declare const __MAKER_VERSION__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ === 'undefined' ? 'dev' : __MAKER_VERSION__;
type Session = {
  schema: 1;
  origin: string;
  token: string;
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
function launcherIdentity(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        entry: fs.realpathSync(process.argv[1]),
        stat: fs.statSync(process.argv[1]).mtimeMs,
        version: VERSION,
        distribution: process.env.TAPTAP_MAKER_DISTRIBUTION || '',
      })
    )
    .digest('hex');
}
function readSession(): Session | undefined {
  if (!fs.existsSync(sessionPath())) return undefined;
  const session = JSON.parse(fs.readFileSync(sessionPath(), 'utf8')) as Session;
  if (
    session.schema !== 1 ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(session.origin) ||
    Number(new URL(session.origin).port) > 65535 ||
    !/^[a-f0-9]{64}$/.test(session.token) ||
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
      Authorization: `Bearer ${session.token}`,
      Origin: session.origin,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  const value = (await response.json()) as Record<string, any>;
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
      latest.token === session.token &&
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
  const release = claimConsoleServerLock(home());
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
      token: server.token,
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

export function claimConsoleServerLock(directory: string): () => void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return claimOwnedLock(path.join(directory, 'server.lock'));
}

export function openConsoleLog(filename: string): number {
  const oversized = fs.existsSync(filename) && fs.statSync(filename).size > 1024 * 1024;
  return fs.openSync(filename, oversized ? 'w' : 'a', 0o600);
}

function claimOwnedLock(filename: string): () => void {
  const identity = `${process.pid}:${randomUUID()}`;
  // New acquisition and stale-owner recovery share the same guard. Otherwise
  // recovery can unlink a replacement acquired after the old owner exits.
  let recovery: number;
  try {
    recovery = fs.openSync(filename + '.recovery', 'wx', 0o600);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST')
      throw new ConsoleError('Console ownership recovery is already in progress.', 409);
    throw cause;
  }
  try {
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
    fs.closeSync(recovery);
    fs.unlinkSync(filename + '.recovery');
  }
}

async function ensureSession(): Promise<Session> {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  const existing = await availableSession();
  if (existing) {
    if (existing.launcher !== launcherIdentity())
      throw new ConsoleError(
        'Another Maker version is serving the console. Stop that console before opening this version.'
      );
    return existing;
  }
  const lock = path.join(home(), 'launch.lock');
  let releaseLaunch: (() => void) | undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      releaseLaunch = claimOwnedLock(lock);
      break;
    } catch (error) {
      if (!(error instanceof ConsoleError) || error.status !== 409) throw error;
      const launched = await availableSession();
      if (launched) {
        if (launched.launcher !== launcherIdentity())
          throw new ConsoleError('Another Maker version opened the console.');
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
      if (launched.launcher !== launcherIdentity())
        throw new ConsoleError('Another Maker version opened the console.');
      return launched;
    }
    const stderr = openConsoleLog(path.join(home(), 'server.log'));
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        process.execPath,
        [...process.execArgv, process.argv[1], '__maker-console-server'],
        {
          cwd: home(),
          detached: true,
          windowsHide: true,
          stdio: ['ignore', 'ignore', stderr],
          env: process.env,
        }
      );
    } finally {
      fs.closeSync(stderr);
    }
    let failure: Error | undefined;
    child.on('error', (error) => {
      failure = error;
    });
    child.unref();
    for (let attempt = 0; attempt < 80; attempt++) {
      if (failure) throw failure;
      const session = readSession();
      if (session?.pid === child.pid) {
        const active = await availableSession();
        if (active) return active;
      }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    // Reap only our unadvertised startup child. A published session may already
    // be serving another opener and must not be terminated on a probe failure.
    if (child.exitCode === null && readSession()?.pid !== child.pid) {
      child.kill('SIGTERM');
    }
    throw new ConsoleError('Console did not start. Inspect the Maker console server log.');
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
  const url = `${session.origin}/${project ? '?project=' + project.key : ''}#token=${session.token}`;
  if (options.no_open !== true) openBrowser(url);
  process.stdout.write(
    JSON.stringify(
      { ok: true, url, projectKey: project?.key },
      null,
      options.json ? undefined : 2
    ) + '\n'
  );
}
