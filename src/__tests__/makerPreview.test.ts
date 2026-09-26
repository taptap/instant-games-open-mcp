import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  previewDirectory,
  previewProject,
  projectEntry,
  type PreviewRecord,
} from '../maker/preview/protocol.js';
import { probeRuntime, preflightPreview, previewWindow } from '../maker/preview/runtime.js';
import { PreviewSession, previewStatus } from '../maker/preview/session.js';
import * as previewSessionModule from '../maker/preview/session.js';
import { runPreviewValidation } from '../maker/preview/validation.js';
import { PreviewLogs } from '../maker/preview/evidence.js';
import { withPreviewLock } from '../maker/preview/installation.js';
import {
  readPreviewWindowSettings,
  savePreviewWindowSettings,
} from '../maker/preview/windowSettings.js';

jest.mock('../maker/preview/prepare.js', () => ({
  requireManifestPreviewPlatform: jest.fn(),
  preparePreviewProject: jest.fn(async (project: string, directory: string) => {
    const source = path.join(directory, 'source');
    fs.mkdirSync(source, { recursive: true });
    for (const name of ['scripts', 'assets', '.project'])
      fs.cpSync(path.join(project, name), path.join(source, name), { recursive: true });
    fs.mkdirSync(path.join(source, 'dist', '1'), { recursive: true });
    fs.mkdirSync(path.join(source, 'dist', 'assets'));
    fs.writeFileSync(path.join(source, 'dist', 'latest.json'), '{"version":"1","client":"abcd"}');
    fs.writeFileSync(
      path.join(source, 'dist', '1', 'manifest-abcd.json'),
      JSON.stringify({ target: 'client', files: [{ uuid: 'main', hash: '1234', ext: '.lua' }] })
    );
    fs.copyFileSync(
      path.join(source, 'scripts', 'main.lua'),
      path.join(source, 'dist', 'assets', 'main-1234.lua')
    );
    fs.copyFileSync(
      path.join(source, '.project', 'fixture.json'),
      path.join(source, 'dist', 'project.json')
    );
    return { ok: true, source_directory: source, entry: 'main.lua' };
  }),
}));

const fixtureTest = process.platform === 'win32' ? test.skip : test;
let root: string;
let project: string;
let executable: string;
let oldHome: string | undefined;
const sessions: PreviewSession[] = [];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-basic-preview-')));
  oldHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  project = path.join(root, '游戏 A with spaces');
  for (const name of ['.maker-mcp', '.project', 'scripts', 'assets', 'dist'])
    fs.mkdirSync(path.join(project, name), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.maker-mcp', 'config.json'),
    JSON.stringify({ project_id: 'test' })
  );
  fs.writeFileSync(
    path.join(project, '.project', 'project.json'),
    JSON.stringify({ entry: 'main.lua' })
  );
  fs.writeFileSync(path.join(project, '.project', 'resources.json'), '{}');
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), '{}');
  fs.writeFileSync(path.join(project, 'scripts', 'main.lua'), 'ROUND_ONE');
  fs.writeFileSync(path.join(project, 'dist', 'latest.json'), 'old build must not load');
  executable = path.join(root, 'Runtime with spaces');
  fs.writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\n' +
      fs.readFileSync(path.join(__dirname, 'fixtures', 'maker-preview-runtime.cjs'), 'utf8'),
    { mode: 0o700 }
  );
});

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.stop()));
  if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = oldHome;
  fs.rmSync(root, { recursive: true, force: true });
});

async function createSession(): Promise<PreviewSession> {
  const record: PreviewRecord = {
    protocol_version: 1,
    project_realpath: project,
    session_id: randomUUID(),
    reload_id: 0,
    supervisor_id: randomUUID(),
    supervisor_pid: process.pid,
    started_at: new Date().toISOString(),
    token: 'a'.repeat(64),
    port: 12345,
    executable,
    state: 'starting',
    runtime: await probeRuntime(executable),
  };
  const session = new PreviewSession(record, false);
  sessions.push(session);
  return session;
}

async function waitForLogs(session: PreviewSession, marker: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const logs = JSON.stringify(await session.handle('logs'));
    if (logs.includes(marker)) return logs;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Missing log: ' + marker);
}

test('requires explicit bound project and rejects entry path traversal', () => {
  expect(() => previewProject('.')).toThrow('absolute');
  expect(previewProject(project)).toBe(project);
  expect(projectEntry(project)).toBe('main.lua');
  fs.writeFileSync(path.join(project, 'outside.lua'), '');
  fs.writeFileSync(
    path.join(project, '.project', 'project.json'),
    JSON.stringify({ entry: '../outside.lua' })
  );
  expect(() => projectEntry(project)).toThrow('inside');
});

test('probe checks a file without executing it or requiring V1', async () => {
  expect(await probeRuntime(executable)).toMatchObject({
    runtime_version: 'unknown',
    capabilities: [],
  });
  await expect(probeRuntime(path.join(root, 'missing'))).rejects.toThrow();
  const abort = new AbortController();
  abort.abort();
  await expect(probeRuntime(executable, abort.signal)).rejects.toThrow('CANCELLED');
});

test('a new project previews main.lua without publishing configuration', async () => {
  fs.rmSync(path.join(project, '.project'), { recursive: true });
  expect(projectEntry(project)).toBe('main.lua');
  expect(await preflightPreview(executable, project)).toMatchObject({
    entry: 'main.lua',
    window: { width: 1920, height: 1080, orientation: 'landscape' },
  });
  expect(fs.existsSync(path.join(project, '.project'))).toBe(false);
  fs.unlinkSync(path.join(project, 'scripts/main.lua'));
  expect(() => projectEntry(project)).toThrow('scripts/main.lua');
});

test('preflight only checks local source and does not pretend dependencies are proven', async () => {
  expect(await preflightPreview(executable, project)).toMatchObject({
    entry: 'main.lua',
    dependencies_verified: false,
  });
});

test.each([
  ['portrait', 1080, 1920, false],
  ['landscape', 1920, 1080, false],
  [undefined, 1920, 1080, true],
  ['invalid', 1920, 1080, true],
])('window dimensions follow project orientation %s', (orientation, width, height, defaulted) => {
  fs.writeFileSync(
    path.join(project, '.project', 'project.json'),
    JSON.stringify({ entry: 'main.lua', taptap_publish: { screen_orientation: orientation } })
  );
  expect(previewWindow(project)).toMatchObject({ width, height, defaulted });
});

fixtureTest('refresh rereads orientation and passes explicit window dimensions', async () => {
  const session = await createSession();
  await session.start();
  expect(await waitForLogs(session, 'ROUND_ONE')).toContain('-width=1920');
  fs.writeFileSync(
    path.join(project, '.project', 'project.json'),
    JSON.stringify({ entry: 'main.lua', taptap_publish: { screen_orientation: 'portrait' } })
  );
  expect(await session.refresh()).toMatchObject({
    preflight: { window: { width: 1080, height: 1920 } },
  });
  const logs = await waitForLogs(session, 'ROUND_ONE');
  expect(logs).toContain('-width=1080');
  expect(logs).toContain('-height=1920');
});

fixtureTest('saved custom window reaches Runtime argv and changes only after refresh', async () => {
  savePreviewWindowSettings(project, {
    ...readPreviewWindowSettings(project).settings,
    preset: 'custom',
    orientation: 'portrait',
    custom: { longEdge: 1366, shortEdge: 1024 },
  });
  const session = await createSession();
  expect(await session.start()).toMatchObject({
    preflight: { window: { width: 1024, height: 1366 } },
  });
  expect(await waitForLogs(session, 'ROUND_ONE')).toContain('-height=1366');
  savePreviewWindowSettings(project, {
    ...readPreviewWindowSettings(project).settings,
    orientation: 'landscape',
  });
  expect(session.status()).toMatchObject({ preflight: { window: { width: 1024, height: 1366 } } });
  expect(await session.refresh()).toMatchObject({
    preflight: { window: { width: 1366, height: 1024 } },
  });
  expect(await waitForLogs(session, 'ROUND_ONE')).toContain('-width=1366');
});
test('status without a session is read-only', async () => {
  expect(await previewStatus(project)).toMatchObject({ state: 'stopped', process_alive: false });
  expect(fs.existsSync(previewDirectory(project))).toBe(false);
});

fixtureTest(
  'ordinary Runtime starts without V1; source snapshot excludes dist and preserves original',
  async () => {
    const session = await createSession();
    expect(await session.start()).toMatchObject({ ok: true, state: 'running', ready: false });
    const logs = await waitForLogs(session, 'ROUND_ONE');
    expect(logs).toContain('ROUND_ONE');
    expect(logs).toContain('-skip_login');
    expect(logs).not.toContain('-maker-dev-');
    expect(fs.readFileSync(path.join(project, 'dist', 'latest.json'), 'utf8')).toBe(
      'old build must not load'
    );
    expect((await session.start()).reload_id).toBe(0);
  }
);

fixtureTest(
  'two edits and refreshes load new source and new assets without changing the session',
  async () => {
    const session = await createSession();
    const first = await session.start();
    for (const round of [1, 2]) {
      fs.writeFileSync(path.join(project, 'scripts', 'main.lua'), 'MODIFIED_' + round);
      fs.writeFileSync(path.join(project, 'assets', 'new.txt'), 'asset_' + round);
      expect(await session.refresh()).toMatchObject({
        ok: true,
        state: 'running',
        reload_id: round,
        session_id: first.session_id,
      });
      expect(await waitForLogs(session, 'MODIFIED_' + round)).toContain('MODIFIED_' + round);
      const snapshot = path.join(
        previewDirectory(project),
        'sessions',
        String(first.session_id),
        String(round),
        'source'
      );
      expect(fs.readFileSync(path.join(snapshot, 'assets', 'new.txt'), 'utf8')).toBe(
        'asset_' + round
      );
    }
    expect(await session.stop()).toMatchObject({ ok: true, process_alive: false });
    expect(await session.refresh()).toMatchObject({ ok: false, process_alive: false });
    expect(await session.stop()).toMatchObject({ ok: true });
  }
);

fixtureTest(
  'screenshot is unsupported without killing the window and check never invents PASS',
  async () => {
    const session = await createSession();
    await session.start();
    expect(await session.handle('screenshot')).toMatchObject({ ok: false, result: 'UNSUPPORTED' });
    expect(session.status().process_alive).toBe(true);
    expect(await session.handle('check')).toMatchObject({ result: 'UNDETERMINED', ready: false });
  }
);

fixtureTest('one-shot validation returns only real report and screenshot artifacts', async () => {
  const result = await runPreviewValidation(executable, project, 'both');
  expect(result).toMatchObject({ ok: true, result: 'PASS', mode: 'both' });
  expect(result.artifacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'validate-report', bytes: expect.any(Number) }),
      expect.objectContaining({ kind: 'screenshot', bytes: expect.any(Number) }),
    ])
  );
  for (const item of result.artifacts as { path: string }[])
    expect(fs.statSync(item.path).size).toBeGreaterThan(0);
});

fixtureTest('one-shot screenshot succeeds without a validation report', async () => {
  const result = await runPreviewValidation(executable, project, 'screenshot');
  expect(result).toMatchObject({ ok: true, result: 'PASS', mode: 'screenshot' });
  expect(result.artifacts).toEqual([
    expect.objectContaining({ kind: 'screenshot', bytes: expect.any(Number) }),
  ]);
});

fixtureTest('one-shot validation fails when the Runtime reports a Lua error', async () => {
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), JSON.stringify({ error: true }));
  const result = await runPreviewValidation(executable, project, 'validate');
  expect(result).toMatchObject({ ok: false, result: 'FAIL', mode: 'validate' });
  expect(JSON.stringify(result.report)).toContain('FAIL');
});

fixtureTest.each([
  {},
  { result: 'PASS' },
  { result: 'PASS', frames_completed: 0, summary: { total_errors: 0 } },
  {
    version: 2,
    result: 'PASS',
    frames_completed: 60,
    summary: { lua_errors: 1, resource_errors: 0, engine_errors: 0, total_errors: 1 },
    missing_resources: [],
  },
])('one-shot validation rejects incomplete or contradictory reports %j', async (report) => {
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), JSON.stringify({ report }));
  expect(await runPreviewValidation(executable, project, 'validate')).toMatchObject({
    ok: false,
    result: 'FAIL',
  });
});

fixtureTest('one-shot validation rejects a non-PNG screenshot', async () => {
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), '{"invalidPng":true}');
  expect(await runPreviewValidation(executable, project, 'screenshot')).toMatchObject({
    ok: false,
    result: 'FAIL',
  });
});

fixtureTest('an old Runtime must not silently pass screenshot readiness', async () => {
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), '{"legacyScreenshot":true}');
  const result = await runPreviewValidation(executable, project, 'both');
  expect(result).toMatchObject({
    ok: false,
    result: 'UNSUPPORTED',
    error: expect.stringContaining('screenshot-after-start'),
    upgrade_required: true,
    required_capabilities: ['screenshot-after-start'],
    runtime_capabilities: { 'screenshot-after-start': false },
  });
  expect(result.artifacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'validate-report' })])
  );
  expect(result.report).toMatchObject({ result: 'PASS' });
});

fixtureTest(
  'missing screenshot preserves the report and diagnostics instead of dropping evidence',
  async () => {
    fs.writeFileSync(path.join(project, '.project', 'fixture.json'), '{"missingScreenshot":true}');
    const result = await runPreviewValidation(executable, project, 'both');
    expect(result).toMatchObject({ ok: false, result: 'FAIL' });
    expect(result.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'validate-report' })])
    );
    expect(fs.existsSync(String(result.log_path))).toBe(true);
  }
);

fixtureTest('one-shot validation shares the existing preview operation lock', async () => {
  await withPreviewLock(project, async () => {
    await expect(runPreviewValidation(executable, project, 'validate')).rejects.toThrow(
      /preview operation|ownership/
    );
  });
});

fixtureTest.each(['starting', 'reloading', 'stopping', 'unknown'])(
  'one-shot validation refuses transitional %s even between Runtime processes',
  async (state) => {
    const status = jest.spyOn(previewSessionModule, 'previewStatus').mockResolvedValue({
      state,
      process_alive: false,
    });
    try {
      await expect(runPreviewValidation(executable, project, 'validate')).rejects.toThrow(
        /active local preview/
      );
    } finally {
      status.mockRestore();
    }
  }
);

fixtureTest('one-shot validation rejects server projects without starting Runtime', async () => {
  fs.writeFileSync(path.join(project, 'scripts', 'server.lua'), '-- server fixture');
  const result = await runPreviewValidation(executable, project, 'both');
  expect(result).toMatchObject({ ok: false, result: 'UNSUPPORTED' });
  expect(result.artifacts).toEqual([]);
});

fixtureTest.each([{ missingReport: true }, { invalidJson: true }])(
  'one-shot validation fails closed without a usable report %j',
  async (options) => {
    fs.writeFileSync(path.join(project, '.project', 'fixture.json'), JSON.stringify(options));
    expect(await runPreviewValidation(executable, project, 'validate')).toMatchObject({
      ok: false,
      result: 'FAIL',
    });
  }
);

fixtureTest('one-shot validation cancels and releases the project lock', async () => {
  fs.writeFileSync(path.join(project, '.project', 'fixture.json'), '{"waitForAbort":true}');
  const controller = new AbortController();
  const pending = runPreviewValidation(executable, project, 'both', controller.signal);
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    expect(await pending).toMatchObject({ ok: false, result: 'CANCELLED' });
  } finally {
    clearTimeout(timer);
  }
  await expect(withPreviewLock(project, async () => true)).resolves.toBe(true);
});

fixtureTest(
  'early exit fails startup and resource errors remain visible without blocking the process',
  async () => {
    fs.writeFileSync(
      path.join(project, '.project', 'fixture.json'),
      JSON.stringify({ exitEarly: true })
    );
    const failed = await createSession();
    expect(await failed.start()).toMatchObject({ ok: false, process_alive: false });
    fs.writeFileSync(
      path.join(project, '.project', 'fixture.json'),
      JSON.stringify({ error: true })
    );
    const session = await createSession();
    expect(await session.start()).toMatchObject({ ok: true, process_alive: true });
    await waitForLogs(session, 'fixture Lua failure');
    expect(await session.handle('check')).toMatchObject({ result: 'FAIL' });
    expect(JSON.stringify(await session.handle('logs'))).toContain('fixture Lua failure');
  }
);

fixtureTest('manual close is detected and refresh never revives a closed window', async () => {
  const session = await createSession();
  const started = await session.start();
  process.kill(Number(started.runtime_pid), 'SIGTERM');
  for (let attempt = 0; attempt < 50 && session.status().process_alive; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await session.refresh()).toMatchObject({ ok: false, process_alive: false });
});

fixtureTest('stop wins over startup and queued refreshes', async () => {
  const session = await createSession();
  const starting = session.start();
  const stopping = session.stop();
  await Promise.all([starting, stopping]);
  expect(session.status()).toMatchObject({ state: 'stopped', process_alive: false });
});

test('logs remain bounded and have an incremental cursor', () => {
  const logs = new PreviewLogs(path.join(root, 'logs'));
  logs.append('first');
  logs.append('second');
  const first = logs.read(0, 1);
  expect(JSON.stringify(first)).toContain('first');
  const second = logs.read(Number(first.next_cursor), 1);
  expect(JSON.stringify(second)).toContain('second');
  expect(() => logs.read(-1, 1)).toThrow();
});
