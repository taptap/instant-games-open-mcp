import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ConsoleProjects } from '../maker/console/projects.js';
import { startConsoleServer } from '../maker/console/server.js';
import {
  createValidationRun,
  finishValidationRun,
  updateValidationRun,
} from '../maker/preview/validationHistory.js';
import { PreviewLogs } from '../maker/preview/evidence.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64'
);

describe('Maker console read-only validation history HTTP routes', () => {
  let root: string;
  let oldHome: string | undefined;
  let registry: ConsoleProjects;
  let server: Awaited<ReturnType<typeof startConsoleServer>>;
  let execute: jest.Mock;

  function project(name: string, binding = 'same-remote-game') {
    const directory = path.join(root, name);
    fs.mkdirSync(path.join(directory, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: binding })
    );
    return registry.add(directory);
  }

  function route(key: string, suffix = '') {
    return `/api/projects/${key}/validation${suffix}`;
  }

  function request(
    target: string,
    options: { method?: string; headers?: http.OutgoingHttpHeaders } = {}
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        server.origin,
        { path: target, method: options.method || 'GET', headers: options.headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  async function json(target: string) {
    const response = await request(target);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    return JSON.parse(response.body.toString('utf8'));
  }

  async function completedRun(directory: string) {
    const run = await createValidationRun(directory);
    fs.writeFileSync(path.join(run.directory, 'screenshot.png'), PNG);
    fs.writeFileSync(path.join(run.directory, 'prepare.log'), 'Prepared local fixture\n');
    new PreviewLogs(run.directory).append('Runtime fixture log');
    finishValidationRun(run, {
      result: 'COMPLETED',
      report: { result: 'PASS' },
      artifacts: [{ kind: 'screenshot', path: path.join(run.directory, 'screenshot.png') }],
    });
    return run;
  }

  function endpoints(key: string, id: string) {
    return [
      route(key),
      route(key, `/${id}`),
      route(key, `/${id}/logs?cursor=0`),
      route(key, `/${id}/prepare`),
      route(key, `/${id}/screenshot.png`),
    ];
  }

  beforeEach(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-validation-')));
    oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
    registry = new ConsoleProjects(path.join(root, 'registry.json'));
    execute = jest.fn(async () => ({ ok: true }));
    server = await startConsoleServer({ registry, execute, html: '', version: 'test' });
  });

  afterEach(async () => {
    try {
      await server.close();
      expect(execute).not.toHaveBeenCalled();
      expect(server.tasks.list()).toEqual([]);
    } finally {
      jest.restoreAllMocks();
      if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
      else process.env.TAPTAP_MAKER_HOME = oldHome;
      await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  test('lists empty history and pages by run ID without including a newly started run', async () => {
    const current = project('pagination');
    expect(await json(route(current.key))).toEqual({ runs: [], warnings: [] });
    const runs = [];
    for (let i = 0; i < 23; i++) {
      const run = await createValidationRun(current.path);
      updateValidationRun(run, { started_at: new Date(1700000000000 + i * 1000).toISOString() });
      runs.unshift(run.run_id);
    }
    const first = await json(route(current.key));
    expect(first.runs.map((run: { run_id: string }) => run.run_id)).toEqual(runs.slice(0, 20));
    expect(first.next_cursor).toBe(runs[19]);
    await createValidationRun(current.path);
    const second = await json(route(current.key, `?before=${first.next_cursor}`));
    expect(second.runs.map((run: { run_id: string }) => run.run_id)).toEqual(runs.slice(20));
    expect(second.next_cursor).toBeUndefined();
  });

  test('returns detail, preparation and exact PNG bytes without modifying evidence', async () => {
    const current = project('finished');
    const run = await completedRun(current.path);
    fs.writeFileSync(path.join(run.directory, 'invocation.json'), '{"entry":"scripts/check.lua"}');
    fs.writeFileSync(path.join(run.directory, 'validate.json'), '{"result":"FAIL","checks":2}');
    finishValidationRun(run, {
      result: 'COMPLETED',
      report: { result: 'FAIL' },
      artifacts: [{ kind: 'screenshot' }],
    });
    const before = fs.readdirSync(run.directory).map((name) => ({
      name,
      bytes: fs.readFileSync(path.join(run.directory, name)),
    }));
    const detail = await json(route(current.key, `/${run.run_id}`));
    expect(detail).toMatchObject({
      run: { run_id: run.run_id, status: 'finished', result: 'COMPLETED', game_result: 'FAIL' },
      result: { result: 'COMPLETED', report: { result: 'FAIL' } },
      invocation: { entry: 'scripts/check.lua' },
      report: { result: 'FAIL', checks: 2 },
      artifacts: [{ id: 'screenshot.png', kind: 'screenshot' }],
    });
    expect(await json(route(current.key, `/${run.run_id}/prepare`))).toEqual({
      text: 'Prepared local fixture\n',
      truncated: false,
    });
    const image = await request(route(current.key, `/${run.run_id}/screenshot.png`), {
      headers: { Origin: server.origin },
    });
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('no-store');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['referrer-policy']).toBe('no-referrer');
    expect(image.headers['content-security-policy']).toContain("default-src 'none'");
    expect(image.body).toEqual(PNG);
    expect(fs.readdirSync(run.directory)).toEqual(before.map(({ name }) => name));
    for (const { name, bytes } of before)
      expect(fs.readFileSync(path.join(run.directory, name))).toEqual(bytes);
  });

  test('reads incremental logs while running and waits for a complete last log row', async () => {
    const current = project('running');
    const run = await createValidationRun(current.path);
    const logs = new PreviewLogs(run.directory);
    logs.append('first line');
    logs.append('Authorization: Bearer private-test-credential');
    fs.appendFileSync(path.join(run.directory, 'runtime.log'), '{"cursor":3,"text":"third');
    expect(await json(route(current.key, `/${run.run_id}`))).toMatchObject({
      run: { status: 'running' },
      artifacts: [],
    });
    const first = await json(route(current.key, `/${run.run_id}/logs`));
    expect(first.logs).toHaveLength(2);
    expect(first.logs[0]).toEqual({ cursor: 1, text: 'first line' });
    expect(JSON.stringify(first)).not.toContain('private-test-credential');
    expect(first.next_cursor).toBe(2);
    expect(await json(route(current.key, `/${run.run_id}/logs?cursor=2`))).toEqual({
      logs: [],
      next_cursor: 2,
      truncated: false,
    });
    fs.appendFileSync(path.join(run.directory, 'runtime.log'), ' line"}\n');
    expect(await json(route(current.key, `/${run.run_id}/logs?cursor=2`))).toEqual({
      logs: [{ cursor: 3, text: 'third line' }],
      next_cursor: 3,
      truncated: false,
    });
  });

  test('isolates two checkouts of the same app, including cursors and artifacts', async () => {
    const a = project('checkout-a');
    const b = project('checkout-b');
    const run = await completedRun(a.path);
    const other = await completedRun(b.path);
    expect((await json(route(a.key))).runs.map((item: { run_id: string }) => item.run_id)).toEqual([
      run.run_id,
    ]);
    expect((await json(route(b.key))).runs.map((item: { run_id: string }) => item.run_id)).toEqual([
      other.run_id,
    ]);
    for (const endpoint of endpoints(b.key, run.run_id).slice(1)) {
      const response = await request(endpoint);
      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/json');
    }
    expect((await request(route(b.key, `?before=${run.run_id}`))).status).toBe(400);
  });

  test.each(['rebound', 'removed', 'redirected'])(
    'rejects every history endpoint for a %s project registration',
    async (change) => {
      const current = project('stale');
      const run = await completedRun(current.path);
      if (change === 'rebound') {
        fs.writeFileSync(path.join(current.path, '.maker-mcp/config.json'), '{"project_id":"new"}');
      } else if (change === 'removed') {
        fs.rmSync(current.path, { recursive: true });
      } else {
        const other = project('replacement');
        fs.renameSync(current.path, current.path + '-moved');
        fs.symlinkSync(other.path, current.path, 'dir');
      }
      for (const endpoint of endpoints(current.key, run.run_id))
        expect((await request(endpoint)).status).toBe(409);
    }
  );

  test('never follows query-supplied project or artifact paths', async () => {
    const current = project('path-input');
    const run = await completedRun(current.path);
    const secret = path.join(root, 'secret.txt');
    fs.writeFileSync(secret, 'outside-private-content');
    const open = jest.spyOn(fs.promises, 'open');
    const query = new URLSearchParams({
      path: secret,
      directory: root,
      project: root,
      name: secret,
      file: secret,
    }).toString();
    for (const endpoint of endpoints(current.key, run.run_id)) {
      const response = await request(endpoint + (endpoint.includes('?') ? '&' : '?') + query);
      expect(response.status).toBe(200);
      expect(response.body.toString()).not.toContain('outside-private-content');
      if (endpoint.endsWith('screenshot.png')) expect(response.body).toEqual(PNG);
    }
    expect(open.mock.calls.some(([filename]) => String(filename) === secret)).toBe(false);
  });

  test('rejects unsafe run IDs, arbitrary filenames and unregistered project keys', async () => {
    const current = project('unsafe');
    const run = await completedRun(current.path);
    const suffixes = [
      '/not-a-run',
      '/%2e%2e%2fsecret',
      '/%2Fetc%2Fpasswd',
      '/..%5Csecret',
      '/%00',
      `/${run.run_id}/run.json`,
      `/${run.run_id}/runtime.log`,
      `/${run.run_id}/result.json`,
      `/${run.run_id}/other.png`,
      `/${run.run_id}/screenshot.png/extra`,
      `/${run.run_id}/%2e%2e%2fsecret`,
    ];
    for (const suffix of suffixes) {
      const response = await request(route(current.key, suffix));
      expect([400, 404]).toContain(response.status);
      expect(response.headers['content-type']).toContain('application/json');
    }
    expect((await request(route('a'.repeat(64)))).status).toBe(404);
  });

  test.each([
    '',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '1e2',
    '0x10',
    '01',
    '%20',
    '%2B1',
    '9007199254740992',
    '1&cursor=2',
  ])('rejects malformed log cursor %s', async (cursor) => {
    const current = project('cursor');
    const run = await createValidationRun(current.path);
    expect((await request(route(current.key, `/${run.run_id}/logs?cursor=${cursor}`))).status).toBe(
      400
    );
  });

  test.each(['', '../outside', 'not-a-run', '00000000-0000-0000-0000-000000000000'])(
    'rejects malformed or expired history cursor %s',
    async (before) => {
      const current = project('history-cursor');
      expect(
        (await request(route(current.key, `?before=${encodeURIComponent(before)}`))).status
      ).toBe(400);
    }
  );

  test('rejects ambiguous history cursors', async () => {
    const current = project('duplicate-cursor');
    const run = await createValidationRun(current.path);
    expect(
      (await request(route(current.key, `?before=${run.run_id}&before=${run.run_id}`))).status
    ).toBe(400);
  });

  test.each(['uncollected', 'incomplete'])('does not serve an %s PNG', async (state) => {
    const current = project('partial');
    const run = await createValidationRun(current.path);
    fs.writeFileSync(
      path.join(run.directory, 'screenshot.png'),
      state === 'uncollected' ? PNG : PNG.subarray(0, -12)
    );
    if (state === 'incomplete')
      finishValidationRun(run, { result: 'COMPLETED', artifacts: [{ kind: 'screenshot' }] });
    const response = await request(route(current.key, `/${run.run_id}/screenshot.png`));
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.subarray(0, 8)).not.toEqual(PNG.subarray(0, 8));
  });

  test.each(['screenshot.png', 'runtime.log', 'prepare.log'])(
    'rejects a linked evidence file: %s',
    async (name) => {
      const current = project('linked');
      const run = await completedRun(current.path);
      const secret = path.join(root, 'outside');
      fs.writeFileSync(secret, name === 'screenshot.png' ? PNG : 'outside-private-content');
      fs.unlinkSync(path.join(run.directory, name));
      fs.symlinkSync(secret, path.join(run.directory, name));
      const suffix = {
        'screenshot.png': 'screenshot.png',
        'runtime.log': 'logs',
        'prepare.log': 'prepare',
      }[name];
      const response = await request(route(current.key, `/${run.run_id}/${suffix}`));
      expect(response.status).toBe(400);
      expect(response.body.toString()).not.toContain('outside-private-content');
    }
  );

  test('applies Host, Origin and cross-site checks to every history endpoint', async () => {
    const current = project('security');
    const run = await completedRun(current.path);
    for (const endpoint of endpoints(current.key, run.run_id)) {
      for (const headers of [
        { Host: 'foreign.invalid' },
        { Origin: 'https://foreign.invalid' },
        { Origin: 'http://localhost:' + new URL(server.origin).port },
        { 'Sec-Fetch-Site': 'cross-site' },
      ]) {
        const response = await request(endpoint, { headers });
        expect(response.status).toBe(403);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
      }
    }
  });

  test('does not expose mutation endpoints or create tasks', async () => {
    const current = project('read-only');
    const run = await completedRun(current.path);
    for (const endpoint of endpoints(current.key, run.run_id)) {
      for (const method of ['POST', 'PUT', 'DELETE']) {
        expect(
          (await request(endpoint, { method, headers: { Origin: server.origin } })).status
        ).toBe(404);
      }
    }
  });

  test('uses the shared four-reader limit without blocking health requests', async () => {
    const current = project('limiter');
    const run = await completedRun(current.path);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let count = 0;
    jest.spyOn(registry, 'detail').mockImplementation(async () => {
      if (++count === 4) entered();
      await gate;
      throw new Error('Fixture read released.');
    });
    const pending = Array.from({ length: 4 }, () => request(`/api/projects/${current.key}`));
    try {
      await ready;
      for (const endpoint of endpoints(current.key, run.run_id))
        expect((await request(endpoint)).status).toBe(429);
      expect((await request('/api/health')).status).toBe(200);
    } finally {
      release();
      await Promise.all(pending);
    }
    expect((await request(route(current.key))).status).toBe(200);
  });
});
