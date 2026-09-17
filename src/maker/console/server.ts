import http from 'node:http';
import type { Socket } from 'node:net';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ConsoleProjects } from './projects.js';
import { ConsoleTasks } from './tasks.js';
import { ConsoleError, type ConsoleAction, type ConsoleExecutor } from './types.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { checkMakerLuaLspEnvironment } from '../system/luaLsp.js';
import { ConsolePlugins, type ConsolePlugin } from './plugins.js';
import { readPreviewWindowSettings, savePreviewWindowSettings } from '../preview/windowSettings.js';
import { ConsoleUpdates } from './updates.js';

export async function startConsoleServer(options: {
  registry: ConsoleProjects;
  execute: ConsoleExecutor;
  html: string;
  version: string;
  distribution?: string;
  historyFile?: string;
  token?: string;
  instanceId?: string;
  idleMs?: number;
  now?: () => number;
  drainMs?: number;
  onDraining?: () => void;
  plugins?: readonly ConsolePlugin[];
}) {
  const now = options.now || Date.now;
  const idleMs = options.idleMs ?? 30 * 60 * 1000;
  let lastActivity = now();
  const touch = (): void => {
    lastActivity = now();
  };
  const token = options.token || randomBytes(32).toString('hex');
  const tasks = new ConsoleTasks(options.registry, options.execute, options.historyFile, touch);
  const plugins = new ConsolePlugins(options.registry, options.plugins);
  const updates = new ConsoleUpdates(options.version, options.distribution);
  let luaLspCache: { at: number; value: Record<string, unknown> } | undefined;
  const luaLspStatus = (): Record<string, unknown> => {
    if (luaLspCache && now() - luaLspCache.at < 30_000) return luaLspCache.value;
    const environment = checkMakerLuaLspEnvironment();
    const value = {
      ready: environment.ready,
      status: environment.status,
      version: environment.version || null,
      nextAction: environment.nextAction,
      error: environment.error ? environment.error.slice(0, 512) : null,
    };
    luaLspCache = { at: now(), value };
    return value;
  };
  let origin = '';
  let draining = false;
  let closePromise: Promise<void> | undefined;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const sockets = new Set<Socket>();
  const readers = new Set<Promise<unknown>>();
  const readAbort = new AbortController();
  async function read<T>(operation: () => Promise<T>): Promise<T> {
    if (readers.size >= 4)
      throw new ConsoleError('Too many active project queries. Try again shortly.', 429);
    const pending = Promise.resolve().then(operation);
    readers.add(pending);
    try {
      return await pending;
    } finally {
      readers.delete(pending);
    }
  }
  const scriptHashes = [...options.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`
  );
  const server = http.createServer(async (request, response) => {
    const json = (status: number, value: unknown): void => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    const bodyForMutation = async (): Promise<Record<string, unknown>> => {
      const body = await readBody(request);
      if (draining)
        throw new ConsoleError('Console is shutting down. No new operations are accepted.', 503);
      return body;
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        `script-src ${scriptHashes.join(' ') || "'none'"}`,
        "style-src 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        'frame-src http://127.0.0.1:*',
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
    try {
      if (draining && !(request.method === 'GET' && request.url === '/api/health'))
        throw new ConsoleError('Console is shutting down. No new operations are accepted.', 503);
      if (
        request.headers.host !== new URL(origin).host ||
        (request.headers.origin && request.headers.origin !== origin) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        throw new ConsoleError('Foreign host or origin rejected.', 403);
      }
      const url = new URL(request.url || '/', origin);
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(options.html);
        return;
      }
      const expected = Buffer.from(`Bearer ${token}`);
      const actual = Buffer.from(request.headers.authorization || '');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new ConsoleError('Console session expired. Open the console again from Maker.', 401);
      if (request.method !== 'GET' && request.headers.origin !== origin)
        throw new ConsoleError('Same-origin writes are required.', 403);
      if (request.method === 'GET' && url.pathname === '/api/health') {
        json(200, { instanceId: options.instanceId, draining });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/activity') {
        await bodyForMutation();
        touch();
        json(200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        json(200, {
          version: options.version,
          distribution: options.distribution || 'standalone',
          platform: process.platform,
          instanceId: options.instanceId,
          projects: options.registry.list(),
          tasks: tasks.list(),
          plugins: plugins.list(),
          luaLsp: luaLspStatus(),
          update: updates.job,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/versions') {
        json(200, await updates.list());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/update') {
        const body = await bodyForMutation();
        json(202, await updates.start(body.version));
        touch();
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/projects') {
        const body = await bodyForMutation();
        if (typeof body.path !== 'string') throw new ConsoleError('Project path is required.');
        const project = options.registry.add(body.path);
        touch();
        json(200, project);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/tasks') {
        const body = await bodyForMutation();
        if (typeof body.projectKey !== 'string' || typeof body.action !== 'string')
          throw new ConsoleError('Explicit projectKey and action are required.');
        const task = tasks.start(body.projectKey, body.action as ConsoleAction);
        touch();
        json(202, task);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/shutdown') {
        await bodyForMutation();
        if (
          updates.job.status === 'running' ||
          tasks.list().some((task) => task.status === 'running')
        )
          throw new ConsoleError('Wait for active tasks before stopping the console.', 409);
        json(200, { ok: true });
        setImmediate(() => void close());
        return;
      }
      const task = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)$/);
      if (request.method === 'GET' && task) {
        json(200, tasks.get(task[1]));
        return;
      }
      const project = url.pathname.match(/^\/api\/projects\/([a-f0-9]{64})(?:\/(.*))?$/);
      if (!project) throw new ConsoleError('Not found.', 404);
      const [, key, suffix] = project;
      const plugin = suffix?.match(/^plugins\/([a-z][a-z0-9-]{0,47})\/open$/);
      if (request.method === 'DELETE' && !suffix) {
        await bodyForMutation();
        if (tasks.busy(key)) throw new ConsoleError('Project has an active task.', 409);
        options.registry.remove(key);
        touch();
        json(200, { ok: true });
      } else if (request.method === 'POST' && plugin) {
        await bodyForMutation();
        touch();
        const ready = await read(() => plugins.open(plugin[1], key, origin));
        touch();
        json(200, ready);
      } else if (request.method === 'GET' && !suffix) {
        json(200, await read(() => options.registry.detail(key, readAbort.signal)));
      } else if (request.method === 'GET' && suffix === 'git') {
        json(
          200,
          await read(() =>
            options.registry.git(key, Number(url.searchParams.get('skip') || '0'), readAbort.signal)
          )
        );
      } else if (request.method === 'GET' && suffix?.startsWith('git/')) {
        json(
          200,
          await read(() => options.registry.commit(key, suffix.slice(4), readAbort.signal))
        );
      } else if (request.method === 'POST' && suffix === 'preview/window') {
        const body = await bodyForMutation();
        const directory = options.registry.resolve(key).path;
        if (tasks.busy(key))
          throw new ConsoleError('项目任务执行中，请结束后再保存预览尺寸。', 409);
        json(200, savePreviewWindowSettings(directory, body));
        touch();
      } else if (request.method === 'GET' && (suffix === 'preview' || suffix === 'preview/logs')) {
        const directory = options.registry.resolve(key).path;
        const checkServerChanges =
          suffix === 'preview' && url.searchParams.get('check_server_changes') === '1';
        json(
          200,
          await read(async () => {
            const status = await options.execute({
              project: directory,
              action: suffix === 'preview' ? 'preview.status' : 'preview.logs',
              onOutput: () => {},
              signal: readAbort.signal,
            });
            const result =
              suffix === 'preview'
                ? { ...status, window_settings: readPreviewWindowSettings(directory) }
                : status;
            if (!checkServerChanges) return result;
            const server_changes = await options.registry.previewServerChanges(
              key,
              readAbort.signal
            );
            return { ...result, server_changes };
          })
        );
      } else {
        throw new ConsoleError('Not found.', 404);
      }
    } catch (error) {
      if (!response.headersSent)
        json(error instanceof ConsoleError ? error.status : 400, {
          error: sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error)),
        });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  server.maxConnections = 64;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Console failed to bind loopback.');
  origin = `http://127.0.0.1:${address.port}`;
  const idleTimer = setInterval(
    () => {
      if (
        now() - lastActivity >= idleMs &&
        updates.job.status !== 'running' &&
        !tasks.list().some((task) => task.status === 'running') &&
        !plugins.active
      )
        void close();
    },
    Math.min(30000, idleMs)
  );
  idleTimer.unref();
  async function close(): Promise<void> {
    if (closePromise) return closePromise;
    draining = true;
    clearInterval(idleTimer);
    readAbort.abort();
    try {
      options.onDraining?.();
    } catch {
      /* A full/read-only disk must not prevent an otherwise clean shutdown. */
    }
    closePromise = (async () => {
      await plugins.close();
      await tasks.settled();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          for (const socket of sockets) socket.destroy();
        }, options.drainMs ?? 1000);
        timer.unref();
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
        server.closeIdleConnections();
      });
      await Promise.allSettled(readers);
      resolveClosed();
    })();
    return closePromise;
  }
  return { origin, token, tasks, close, closed };
}

async function readBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new ConsoleError('JSON content type is required.', 415);
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 16384) throw new ConsoleError('Request body is too large.', 413);
    chunks.push(chunk);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ConsoleError('Invalid JSON body.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConsoleError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
