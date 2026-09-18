import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { ConsoleProjects } from '../maker/console/projects';
import { startConsoleServer } from '../maker/console/server';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function withinDeadline(operation: Promise<void>, ms: number) {
  let timer!: NodeJS.Timeout;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Console missed shutdown deadline')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Maker console lifecycle', () => {
  let directory: string;
  let registry: ConsoleProjects;
  let now: number;
  let servers: Awaited<ReturnType<typeof startConsoleServer>>[];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-lifetime-'));
    registry = new ConsoleProjects(path.join(directory, 'projects.json'));
    now = 0;
    servers = [];
  });
  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function start(execute = async (_options: any) => ({ ok: true })) {
    const server = await startConsoleServer({
      registry,
      html: '',
      version: 'test',
      execute,
      idleMs: 100,
      now: () => now,
      drainMs: 50,
    });
    servers.push(server);
    return server;
  }
  function headers(server: Awaited<ReturnType<typeof start>>) {
    return {
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
  }
  function project() {
    const root = path.join(directory, 'game');
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(path.join(root, '.maker-mcp/config.json'), '{"project_id":"game"}');
    return registry.add(root);
  }
  async function expectClosed(server: Awaited<ReturnType<typeof start>>) {
    expect(server.closed).toBeInstanceOf(Promise);
    await withinDeadline(server.closed, 1500);
    await expect(fetch(server.origin)).rejects.toThrow();
  }

  test('allocates distinct free loopback ports without changing another server', async () => {
    const a = await start();
    const b = await start();
    expect(a.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(a.origin).not.toBe(b.origin);
    await a.close();
    expect((await fetch(b.origin)).status).toBe(200);
  });

  test('passive polling and rejected requests do not renew the idle deadline', async () => {
    const server = await start();
    now = 90;
    await fetch(server.origin + '/api/state', { headers: headers(server) });
    await fetch(server.origin + '/api/health', { headers: headers(server) });
    await fetch(server.origin + '/api/activity', { method: 'POST' });
    await fetch(server.origin);
    now = 101;
    await expectClosed(server);
  });

  test('health and shutdown stay available when the project registry is corrupt', async () => {
    const server = await start();
    fs.writeFileSync(path.join(directory, 'projects.json'), 'broken');
    expect((await fetch(server.origin + '/api/state', { headers: headers(server) })).status).toBe(
      400
    );
    const health = await fetch(server.origin + '/api/health', { headers: headers(server) });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ draining: false });
    expect((await fetch(server.origin + '/api/health')).status).toBe(200);
    const stop = await fetch(server.origin + '/api/shutdown', {
      method: 'POST',
      headers: headers(server),
      body: '{}',
    });
    expect(stop.status).toBe(200);
    await expectClosed(server);
  });

  test('only authenticated same-origin explicit activity renews the deadline', async () => {
    const server = await start();
    now = 90;
    expect(
      (
        await fetch(server.origin + '/api/activity', {
          method: 'POST',
          headers: headers(server),
          body: '{}',
        })
      ).status
    ).toBe(200);
    now = 101;
    await delay(140);
    expect((await fetch(server.origin + '/api/state', { headers: headers(server) })).status).toBe(
      200
    );
    now = 191;
    await expectClosed(server);
  });

  test('holds running tasks and renews the full idle window on completion', async () => {
    const item = project();
    let finish!: (value: { ok: boolean }) => void;
    const server = await start(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await fetch(server.origin + '/api/tasks', {
      method: 'POST',
      headers: headers(server),
      body: JSON.stringify({ projectKey: item.key, action: 'build' }),
    });
    now = 1000;
    await delay(140);
    expect((await fetch(server.origin + '/api/state', { headers: headers(server) })).status).toBe(
      200
    );
    finish({ ok: true });
    await server.tasks.settled();
    now = 1090;
    await delay(140);
    expect((await fetch(server.origin)).status).toBe(200);
    now = 1101;
    await expectClosed(server);
  });

  test('bounds preview readers and aborts them when the service closes', async () => {
    const item = project();
    const signals: AbortSignal[] = [];
    const server = await start(
      ({ signal }) =>
        new Promise((resolve) => {
          signals.push(signal);
          signal?.addEventListener('abort', () => resolve({ ok: false }), { once: true });
        })
    );
    const reads = Array.from({ length: 4 }, () =>
      fetch(server.origin + `/api/projects/${item.key}/preview`, {
        headers: headers(server),
      }).catch(() => undefined)
    );
    for (let i = 0; i < 50 && signals.length !== 4; i++) await delay(10);
    try {
      const extra = await fetch(server.origin + `/api/projects/${item.key}/preview`, {
        headers: headers(server),
      });
      expect(extra.status).toBe(429);
    } finally {
      await server.close();
      await Promise.all(reads);
    }
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test('shutdown reclaims incomplete sockets within the drain bound', async () => {
    const server = await start();
    const socket = net.connect(Number(new URL(server.origin).port), '127.0.0.1');
    socket.on('error', () => {});
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    socket.write('GET / HTTP/1.1\r\n');
    const ended = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    try {
      await withinDeadline(server.close(), 1000);
      await ended;
    } finally {
      socket.destroy();
    }
  });

  (process.platform === 'win32' ? test.skip : test)(
    'cancels Git reads without launching their next stage during shutdown',
    async () => {
      const item = project();
      const calls = path.join(directory, 'git-calls');
      const release = path.join(directory, 'release-git');
      const executable = path.join(directory, 'fake-git');
      fs.writeFileSync(
        executable,
        [
          `#!${process.execPath}`,
          `const fs=require('fs');`,
          `fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');`,
          `const timer=setInterval(()=>{ if(!fs.existsSync(${JSON.stringify(release)}))return; clearInterval(timer); const args=process.argv; process.stdout.write(args.includes('--show-current')?'main':args.includes('--verify')?'abc':args.includes('--is-shallow-repository')?'false':''); },20);`,
        ].join('\n'),
        { mode: 0o755 }
      );
      const previous = process.env.TAPTAP_MAKER_GIT_BIN;
      process.env.TAPTAP_MAKER_GIT_BIN = executable;
      const server = await start();
      const query = fetch(server.origin + `/api/projects/${item.key}/git`, {
        headers: headers(server),
      }).catch(() => undefined);
      try {
        for (let i = 0; i < 500; i++) {
          if (
            fs.existsSync(calls) &&
            fs.readFileSync(calls, 'utf8').trim().split('\n').length === 3
          )
            break;
          await delay(10);
        }
        expect(fs.existsSync(calls)).toBe(true);
        expect(fs.readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(3);
        const started = Date.now();
        await server.close();
        await query;
        expect(Date.now() - started).toBeLessThan(750);
        const commands = fs.readFileSync(calls, 'utf8');
        expect(commands).not.toContain('--verify');
        expect(commands).not.toContain('"log"');
      } finally {
        fs.writeFileSync(release, '');
        if (previous === undefined) delete process.env.TAPTAP_MAKER_GIT_BIN;
        else process.env.TAPTAP_MAKER_GIT_BIN = previous;
      }
    }
  );
});
