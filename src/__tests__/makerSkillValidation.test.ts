import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executePreviewOperation } from '../maker/cli/preview.js';
import {
  createValidationRun,
  listValidationRuns,
  readValidationRun,
  updateValidationRun,
} from '../maker/preview/validationHistory.js';
import { PreviewLogs } from '../maker/preview/evidence.js';
import { PreviewOwner } from '../maker/preview/owner.js';
import { screenshotRetryTimeout } from '../maker/preview/validation.js';
import { previewDirectory, writePrivateJson } from '../maker/preview/protocol.js';

jest.mock('../maker/preview/prepare.js', () => ({
  ...jest.requireActual('../maker/preview/prepare.js'),
  requireManifestPreviewPlatform: jest.fn(),
}));

let root: string;
let project: string;
let runtime: string;
let previousHome: string | undefined;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-skill-')));
  previousHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  project = path.join(root, 'game with spaces');
  for (const dir of ['.maker-mcp', '.project', 'scripts', 'assets'])
    fs.mkdirSync(path.join(project, dir), { recursive: true });
  fs.writeFileSync(path.join(project, '.maker-mcp/config.json'), '{"project_id":"fixture"}');
  fs.writeFileSync(path.join(project, '.project/project.json'), '{"entry":"main.lua"}');
  fs.writeFileSync(path.join(project, '.project/resources.json'), '{}');
  fs.writeFileSync(path.join(project, '.project/settings.json'), '{}');
  fs.writeFileSync(path.join(project, 'scripts/main.lua'), '-- game');
  fs.writeFileSync(path.join(project, 'scripts/check.lua'), '-- assertion');
  fs.mkdirSync(path.join(project, 'skills/run-lua-validate'), { recursive: true });
  fs.writeFileSync(path.join(project, 'skills/run-lua-validate/SKILL.md'), '# original');
  runtime = path.join(root, 'Runtime');
  fs.writeFileSync(
    runtime,
    `#!${process.execPath}\n` +
      `const { PNG } = require(${JSON.stringify(require.resolve('pngjs'))});\n` +
      fs.readFileSync(path.join(__dirname, 'fixtures/maker-validation-runtime.cjs'), 'utf8'),
    { mode: 0o700 }
  );
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previousHome;
  fs.rmSync(root, { recursive: true, force: true });
});

const nativeTest = process.platform === 'win32' ? test.skip : test;
test('budgets later screenshots without overriding explicit timeout limits', () => {
  const options = { mode: 'both', screenshot_frame: '120' };
  expect(screenshotRetryTimeout(options, 300, 90000)).toBe(190);
  expect(
    screenshotRetryTimeout({ ...options, validate_timeout: '100' }, 300, 90000)
  ).toBeUndefined();
  expect(screenshotRetryTimeout({ ...options, validate_timeout: '100' }, 300, 10000)).toBe(100);
  expect(screenshotRetryTimeout(options, 2000, 90000)).toBeUndefined();
  expect(screenshotRetryTimeout(options, 2000, 10000)).toBe(580);
  expect(screenshotRetryTimeout({ ...options, validate_frames: '1000' }, 300, 90000)).toBe(100);
  expect(screenshotRetryTimeout({ mode: 'screenshot', screenshot_frame: '120' }, 300, 90000)).toBe(
    250
  );
  expect(
    screenshotRetryTimeout(
      { ...options, screenshot_frame: '300', validate_frames: '380', validate_timeout: '190' },
      600,
      150000,
      false
    )
  ).toBe(340);
});

const validate = (options: Record<string, string | boolean> = {}, signal?: AbortSignal) =>
  executePreviewOperation('validate', { target_dir: project, runtime, ...options }, signal);

nativeTest(
  'runs the existing validation protocol and leaves game judgment to the Skill',
  async () => {
    const result = await validate();
    expect(result).toMatchObject({
      ok: true,
      result: 'COMPLETED',
      report: { result: 'FAIL', summary: { engine_errors: 1 } },
      exit_code: 1,
    });
    expect(fs.readFileSync(String(result.log_path), 'utf8')).toContain('runtime evidence');
    expect(fs.readFileSync(path.join(project, 'scripts/main.lua'), 'utf8')).toBe('-- game');
  }
);

nativeTest.each([true, false])(
  'repairs a detected legacy Skill exclusion (%s) without blocking execution',
  async (excluded) => {
    const filterPath = path.join(project, '.installer/local-skill-filter.json');
    fs.mkdirSync(path.dirname(filterPath), { recursive: true });
    const original = JSON.stringify({
      exclude_skills: { [process.platform]: excluded ? ['run-lua-validate'] : [] },
    });
    fs.writeFileSync(filterPath, original);
    const result = await validate();
    expect(result.ok).toBe(true);
    const repairs = excluded && process.platform === 'darwin';
    expect(JSON.parse(fs.readFileSync(filterPath, 'utf8'))).toEqual({
      exclude_skills: { [process.platform]: repairs ? [] : excluded ? ['run-lua-validate'] : [] },
    });
    if (repairs) expect((result.warnings as string[]).join('\n')).toMatch(/files are retained/);
    else expect(result.warnings).toEqual([]);
  }
);

nativeTest('an unreadable Skill filter does not block Runtime validation', async () => {
  const filterPath = path.join(project, '.installer/local-skill-filter.json');
  fs.mkdirSync(path.dirname(filterPath), { recursive: true });
  fs.writeFileSync(filterPath, '{invalid');
  const result = await validate();
  expect(result.ok).toBe(true);
  expect(result.warnings).toEqual(
    process.platform === 'darwin' ? [expect.stringMatching(/could not be repaired/)] : []
  );
  expect(fs.readFileSync(filterPath, 'utf8')).toBe('{invalid');
});

nativeTest('passes the Skill assertion script and explicit capture timing to Runtime', async () => {
  const result = await validate({
    mode: 'both',
    screenshot_frame: '800',
    validate_frames: '1000',
    validate_timeout: '150',
    validate_test: 'check.lua',
    width: '800',
    height: '600',
    nosound: true,
    validate_spike_threshold: '500',
  });
  expect(result.ok).toBe(true);
  const invocation = JSON.parse(fs.readFileSync(String(result.invocation_path), 'utf8'));
  expect(invocation.args).toEqual(
    expect.arrayContaining([
      'main.lua',
      '-screenshot-frame=800',
      '-validate-frames=1000',
      '-validate-timeout=150',
      '-validate-test=' + path.join(project, 'scripts/check.lua'),
      '-width=800',
      '-height=600',
      '-nosound',
      '-p=Res',
      '-validate-spike-threshold=500',
    ])
  );
  expect(invocation.args).not.toContain('-graphicsheadless');
  expect(invocation.args).not.toContain('-screenshot-after-start');
  expect(result.artifacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'screenshot' })])
  );
});

nativeTest('supports a controlled test entry without changing project configuration', async () => {
  fs.writeFileSync(path.join(project, 'scripts/state.lua'), '-- controlled state');
  const result = await validate({ entry: 'state.lua' });
  expect(result.ok).toBe(true);
  const invocation = JSON.parse(fs.readFileSync(String(result.invocation_path), 'utf8'));
  expect(invocation.args[0]).toBe('state.lua');
  expect(JSON.parse(fs.readFileSync(path.join(project, '.project/project.json'), 'utf8'))).toEqual({
    entry: 'main.lua',
  });
});

nativeTest('missing screenshot is an execution failure but preserves the report', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"noPng":true}');
  const result = await validate({ mode: 'both', screenshot_frame: '500' });
  expect(result).toMatchObject({ ok: false, report: { result: 'FAIL' } });
  expect(result.artifacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'validate-report' })])
  );
  expect(result.error).toMatch(/screenshot/i);
  expect((await listValidationRuns(project)).runs).toHaveLength(1);
});

function fixture(options: Record<string, unknown>): void {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), JSON.stringify(options));
}

function launches(): { frame: number; started: number }[] {
  return fs
    .readFileSync(path.join(project, '.project/validation-launches.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

nativeTest(
  'retries a pre-bootstrap screenshot after three seconds at a later frame',
  async () => {
    fixture({ passReport: true, bootstrapFrame: 1361 });
    const result = await validate({
      mode: 'both',
      screenshot_frame: '120',
      validate_frames: '300',
      output_dir: path.join(root, 'acceptance'),
    });
    expect(result).toMatchObject({
      ok: true,
      result: 'COMPLETED',
      report: { result: 'PASS' },
      screenshot_assessment: { status: 'REVIEW_REQUIRED' },
      next_step: expect.stringMatching(/inspect every PNG.*in-game loading/i),
    });
    const attempts = result.attempt_run_ids as string[];
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts).size).toBe(2);
    expect(result.run_id).toBe(attempts[1]);
    const first = await readValidationRun(project, attempts[0]);
    expect(first.result).toMatchObject({
      ok: false,
      result: 'FAIL',
      report: { result: 'PASS' },
      screenshot_assessment: {
        status: 'NOT_READY',
        effective_visual_evidence: false,
        reasons: ['bootstrap_incomplete'],
        bootstrap_completed_frame: 1361,
      },
    });
    const second = await readValidationRun(project, attempts[1]);
    const args = second.invocation!.args as string[];
    const frame = Number(args.find((arg) => arg.startsWith('-screenshot-frame='))!.split('=')[1]);
    expect(frame).toBeGreaterThanOrEqual(1541);
    expect(
      Number(args.find((arg) => arg.startsWith('-validate-frames='))!.split('=')[1])
    ).toBeGreaterThanOrEqual(frame + 3);
    expect(launches()[1].started - launches()[0].started).toBeGreaterThanOrEqual(3000);
    for (const id of attempts) {
      const detail = await readValidationRun(project, id);
      expect(detail.artifacts).toEqual([{ kind: 'screenshot', id: 'screenshot.png' }]);
      for (const filename of [
        'runtime.log',
        'invocation.json',
        'validate.json',
        'screenshot.png',
        'result.json',
      ]) {
        expect(fs.existsSync(path.join(String(detail.result!.evidence_directory), filename))).toBe(
          true
        );
        expect(fs.existsSync(path.join(root, 'acceptance', id, filename))).toBe(true);
      }
    }
  },
  20000
);

nativeTest(
  'retries a black screenshot using later frames until visible content appears',
  async () => {
    fixture({ blackUntilFrame: 600 });
    const result = await validate({ mode: 'screenshot', screenshot_frame: '120' });
    expect(result).toMatchObject({
      ok: true,
      result: 'COMPLETED',
      screenshot_assessment: { status: 'REVIEW_REQUIRED' },
    });
    expect(result.attempt_run_ids).toHaveLength(3);
    const frames = launches().map((launch) => launch.frame);
    expect(frames[1]).toBeGreaterThanOrEqual(frames[0] + 180);
    expect(frames[2]).toBeGreaterThanOrEqual(frames[1] + 180);
  },
  20000
);

nativeTest.each<{ options: Record<string, string | boolean>; timeout: string }>([
  { options: {}, timeout: '-validate-timeout=190' },
  { options: { validate_timeout: '250' }, timeout: '-validate-timeout=250' },
])(
  'passes the retry timeout budget to Runtime: %j',
  async ({ options, timeout }) => {
    fixture({ blackUntilFrame: 300, passReport: true, minRetryTimeout: 150 });
    const result = await validate({ mode: 'both', screenshot_frame: '120', ...options });
    expect(result.result).toBe('COMPLETED');
    expect(result.attempt_run_ids).toHaveLength(2);
    const invocation = JSON.parse(fs.readFileSync(String(result.invocation_path), 'utf8'));
    expect(invocation.args).toContain(timeout);
    expect(invocation.args).toContain('-validate-frames=380');
    expect(result).not.toHaveProperty('_runtime_duration_ms');
  },
  15000
);

nativeTest.each([{ black: true }, { transparent: true }, { almostBlack: true }])(
  'rejects persistent blank visual evidence %j after exactly two retries',
  async (options) => {
    fixture({ ...options, passReport: true });
    const result = await validate({ mode: 'both', screenshot_frame: '120' });
    expect(result).toMatchObject({
      ok: false,
      result: 'FAIL',
      report: { result: 'PASS' },
      screenshot_assessment: {
        status: 'NOT_READY',
        effective_visual_evidence: false,
        reasons: ['near_total_black_or_transparent'],
      },
      next_step: expect.stringMatching(/not effective visual evidence/i),
    });
    expect(result.attempt_run_ids).toHaveLength(3);
    expect(launches()).toHaveLength(3);
    expect((await listValidationRuns(project)).runs).toHaveLength(3);
  },
  20000
);

nativeTest(
  'does not accept an arbitrary ready phrase while bootstrap remains incomplete',
  async () => {
    fixture({ bootstrapNever: true, arbitraryReady: true });
    const result = await validate({ mode: 'screenshot', screenshot_frame: '120' });
    expect(result).toMatchObject({
      ok: false,
      screenshot_assessment: { status: 'NOT_READY', reasons: ['bootstrap_incomplete'] },
    });
    expect(launches()).toHaveLength(3);
  },
  20000
);

nativeTest(
  'a request before bootstrap completion stays not ready after delayed readback',
  async () => {
    fixture({ requestBeforeBootstrap: true, passReport: true });
    const result = await validate({ mode: 'both', screenshot_frame: '120' });
    expect(result.ok).toBe(false);
    expect(result.screenshot_assessment).toMatchObject({
      status: 'NOT_READY',
      reasons: ['bootstrap_incomplete'],
    });
  },
  20000
);

nativeTest('dark content with a meaningful foreground is retained for AI inspection', async () => {
  fixture({ darkScene: true, noBootstrapLog: true });
  const result = await validate({ mode: 'screenshot', screenshot_frame: '120' });
  expect(result).toMatchObject({
    ok: true,
    screenshot_assessment: { status: 'REVIEW_REQUIRED', bootstrap_at_capture: 'unobserved' },
    visual_check_required: true,
    game_review_required: true,
  });
  expect(launches()).toHaveLength(1);
});

nativeTest.each([
  { noPng: true },
  { corruptPng: true },
  { noReport: true },
  { signal: true },
  { exitCode: 2 },
  { reportTimeout: true },
  { luaErrors: true },
  { passWithLuaErrors: true },
  { ignoreTest: true },
])('never retries blank screenshots alongside execution or game errors %j', async (options) => {
  fixture({ black: true, passReport: true, ...options });
  const result = await validate({
    mode: 'both',
    screenshot_frame: '120',
    validate_test: 'check.lua',
  });
  expect(result.ok).toBe(false);
  expect(launches()).toHaveLength(1);
  expect((await listValidationRuns(project)).runs).toHaveLength(1);
});

nativeTest(
  'a clean authoritative report allows visual retry despite earlier raw log errors',
  async () => {
    fixture({ passReport: true, logError: true, blackUntilFrame: 300 });
    const result = await validate({
      mode: 'both',
      screenshot_frame: '120',
      validate_test: 'check.lua',
    });
    expect(result).toMatchObject({
      ok: true,
      result: 'COMPLETED',
      report: {
        result: 'PASS',
        summary: { lua_errors: 0, resource_errors: 0, engine_errors: 0, total_errors: 0 },
        test_result: 'PASSED',
      },
    });
    expect(result.attempt_run_ids).toHaveLength(2);
    for (const id of result.attempt_run_ids as string[]) {
      const detail = await readValidationRun(project, id);
      expect(detail.report?.result).toBe('PASS');
      expect(fs.readFileSync(String(detail.result!.log_path), 'utf8')).toContain(
        'ERROR: Lua execution failed'
      );
    }
  }
);

nativeTest('screenshot-only remains conservative when Runtime logs contain an error', async () => {
  fixture({ black: true, logError: true });
  const result = await validate({ mode: 'screenshot', screenshot_frame: '120' });
  expect(result).toMatchObject({ ok: false, result: 'FAIL' });
  expect(launches()).toHaveLength(1);
});

nativeTest(
  'an authoritative FAIL report is preserved and never retried for a blank screenshot',
  async () => {
    fixture({ black: true });
    const result = await validate({ mode: 'both', screenshot_frame: '120' });
    expect(result).toMatchObject({
      ok: false,
      result: 'FAIL',
      report: { result: 'FAIL', summary: { engine_errors: 1 } },
    });
    expect(launches()).toHaveLength(1);
    expect((await readValidationRun(project, String(result.run_id))).report?.result).toBe('FAIL');
  }
);

nativeTest('a blank screenshot with failed log persistence is never retried', async () => {
  fixture({ black: true, passReport: true });
  const append = jest.spyOn(PreviewLogs.prototype, 'append').mockImplementationOnce(() => {
    throw new Error('fixture disk full');
  });
  try {
    const result = await validate({ mode: 'both', screenshot_frame: '120' });
    expect(result).toMatchObject({ ok: false, result: 'FAIL' });
    expect(result.error).toMatch(/log.*fixture disk full/);
    expect(launches()).toHaveLength(1);
  } finally {
    append.mockRestore();
  }
});

nativeTest('does not retry an archive failure or replace its retained screenshot', async () => {
  fixture({ black: true });
  const outputDir = path.join(root, 'acceptance');
  fs.writeFileSync(outputDir, 'not a directory');
  const result = await validate({
    mode: 'screenshot',
    screenshot_frame: '120',
    output_dir: outputDir,
  });
  expect(result).toMatchObject({ ok: false, result: 'FAIL' });
  expect(result.error).toMatch(/archive failed/i);
  expect(launches()).toHaveLength(1);
  expect(fs.existsSync(path.join(String(result.evidence_directory), 'screenshot.png'))).toBe(true);
});

nativeTest('cancels the three-second retry delay without launching another Runtime', async () => {
  fixture({ black: true });
  const abort = new AbortController();
  const pending = validate({ mode: 'screenshot', screenshot_frame: '120' }, abort.signal);
  try {
    for (let i = 0; i < 300; i++) {
      const runs = await listValidationRuns(project);
      if (runs.runs[0]?.status === 'finished') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    abort.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, result: 'CANCELLED' });
    expect(result.attempt_run_ids).toHaveLength(1);
    expect(launches()).toHaveLength(1);
    expect(result.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'screenshot' })])
    );
    expect((await readValidationRun(project, String(result.run_id))).result?.result).toBe(
      'CANCELLED'
    );
  } finally {
    abort.abort();
    await pending;
  }
});

nativeTest(
  'rechecks Runtime ownership before a retry and leaves an unrelated session alone',
  async () => {
    fixture({ black: true });
    const pending = validate({ mode: 'screenshot', screenshot_frame: '120' });
    for (let i = 0; i < 300; i++) {
      const runs = await listValidationRuns(project);
      if (runs.runs[0]?.status === 'finished') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const orphan = await createValidationRun(project);
    updateValidationRun(orphan, {
      phase: 'running',
      runtime_pid: process.pid,
      runtime_launch_pending: false,
    });
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation.*Runtime.*active or unverified/i);
    expect(launches()).toHaveLength(1);
    expect((await readValidationRun(project, orphan.run_id)).run.runtime_pid).toBe(process.pid);
  }
);

nativeTest('archived result includes the final history cleanup warning', async () => {
  const prior = await createValidationRun(project);
  const file = fs.openSync(path.join(prior.directory, 'large-cache'), 'w');
  fs.ftruncateSync(file, 5 * 1024 ** 3 + 1);
  fs.closeSync(file);
  const result = await validate({ output_dir: path.join(root, 'acceptance') });
  const archived = JSON.parse(
    fs.readFileSync(path.join(String(result.archive_directory), 'result.json'), 'utf8')
  );
  expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('5 GiB')]));
  expect(archived.warnings).toEqual(expect.arrayContaining([expect.stringContaining('5 GiB')]));
  const local = (await readValidationRun(project, String(result.run_id))).result;
  expect(local?.archive_directory).toBe(result.archive_directory);
});

nativeTest('missing report preserves an independently produced screenshot', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"noReport":true}');
  const result = await validate({ mode: 'both', screenshot_frame: '500' });
  expect(result.ok).toBe(false);
  expect(result.artifacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'screenshot' })])
  );
});

nativeTest(
  'log write failure cannot report completed collection or hide other artifacts',
  async () => {
    const append = jest.spyOn(PreviewLogs.prototype, 'append').mockImplementationOnce(() => {
      throw Object.assign(new Error('fixture log disk full'), { code: 'ENOSPC' });
    });
    try {
      const result = await validate({ mode: 'both', screenshot_frame: '500' });
      expect(result).toMatchObject({ ok: false, result: 'FAIL', report: { result: 'FAIL' } });
      expect(result.error).toMatch(/log.*fixture log disk full/i);
      expect(result.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'validate-report' }),
          expect.objectContaining({ kind: 'screenshot' }),
        ])
      );
    } finally {
      append.mockRestore();
    }
  }
);

test('a failed error-log write still returns the original validation failure', async () => {
  const append = jest.spyOn(PreviewLogs.prototype, 'append').mockImplementation(() => {
    throw new Error('fixture error-log disk full');
  });
  try {
    const result = await validate({ mode: 'invalid' });
    expect(result).toMatchObject({ ok: false, result: 'FAIL' });
    expect(result.error).toMatch(/--mode must be/);
    expect(result.error).toMatch(/error log could not be saved/);
    expect(result.error).toMatch(/fixture error-log disk full/);
    expect((await readValidationRun(project, String(result.run_id))).run.status).toBe('finished');
  } finally {
    append.mockRestore();
  }
});

test.each(['validate', 'run', 'start'])(
  '%s refuses an orphaned validation Runtime after recovering its dead owner lock',
  async (action) => {
    const orphan = await createValidationRun(project);
    updateValidationRun(orphan, {
      phase: 'running',
      owner_pid: 2147483647,
      runtime_pid: process.pid,
      runtime_launch_pending: false,
    });
    writePrivateJson(path.join(previewDirectory(project), 'operation.lock'), {
      pid: 2147483647,
    });
    const owner = new PreviewOwner();
    try {
      const result = await executePreviewOperation(
        action,
        { target_dir: project, runtime, duration_ms: '1000' },
        undefined,
        owner
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/validation.*Runtime.*active or unverified/i);
      expect(result.error).toContain(orphan.run_id);
      expect(fs.existsSync(path.join(orphan.directory, 'run.json'))).toBe(true);
      expect(fs.existsSync(path.join(previewDirectory(project), 'session.json'))).toBe(false);
    } finally {
      await owner.close();
    }
  }
);

nativeTest('an old Runtime ignoring the requested assertion cannot claim completion', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"ignoreTest":true}');
  const result = await validate({ validate_test: 'check.lua' });
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/assertion/i);
});

nativeTest('an incomplete report is not treated as collected validation evidence', async () => {
  fs.writeFileSync(
    path.join(project, '.project/validation-fixture.json'),
    '{"invalidReport":true}'
  );
  const result = await validate();
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/report/i);
});

nativeTest('preserves a signal exit independently of the report and exit code', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"signal":true}');
  const result = await validate();
  expect(result).toMatchObject({ ok: false, exit_code: null, exit_signal: 'SIGTERM' });
  expect(result.report).toMatchObject({ result: 'FAIL' });
});

nativeTest('cancellation waits for Runtime exit and retains written artifacts', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"wait":true}');
  const abort = new AbortController();
  const pending = validate({}, abort.signal);
  const marker = path.join(project, '.project/validation-ready');
  for (let i = 0; i < 200 && !fs.existsSync(marker); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  abort.abort();
  const result = await pending;
  expect(result).toMatchObject({ ok: false, result: 'CANCELLED' });
  expect(result.artifacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'validate-report' })])
  );
});

test.each<Record<string, string | boolean>>([
  { mode: 'screenshot' },
  { mode: 'both', screenshot_frame: '120', validate_frames: '120' },
  { validate_test: '../outside.lua' },
  { entry: '../outside.lua' },
  { validate_timeout: '0' },
  { mode: 'screenshot', screenshot_frame: '120', validate_test: 'check.lua' },
])('rejects invalid local Skill invocation %j', async (options) => {
  const result = await validate(options);
  expect(result.ok).toBe(false);
});

test('does not turn a multiplayer project into an offline validation', async () => {
  fs.writeFileSync(
    path.join(project, '.project/settings.json'),
    '{"@runtime":{"multiplayer":{"enabled":true}}}'
  );
  const result = await validate();
  expect(result).toMatchObject({ ok: false, result: 'UNSUPPORTED' });
});

nativeTest('publishes live evidence before Runtime exits and finalizes the same run', async () => {
  fs.writeFileSync(path.join(project, '.project/validation-fixture.json'), '{"wait":true}');
  const abort = new AbortController();
  const pending = validate({}, abort.signal);
  let live: Awaited<ReturnType<typeof listValidationRuns>> | undefined;
  try {
    for (let i = 0; i < 200; i++) {
      live = await listValidationRuns(project);
      if (live.runs[0]?.phase === 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(live?.runs[0]).toMatchObject({ phase: 'running', status: 'running' });
    expect((await readValidationRun(project, live!.runs[0].run_id)).invocation).toBeDefined();
  } finally {
    abort.abort();
    await pending;
  }
  const result = await pending;
  expect(result.run_id).toBe(live!.runs[0].run_id);
  expect((await readValidationRun(project, String(result.run_id))).run.result).toBe('CANCELLED');
});

test('retains Runtime discovery failures and invalid invocation diagnostics', async () => {
  const result = await validate({ runtime: path.join(root, 'missing') });
  expect(result.ok).toBe(false);
  expect(result.evidence_directory).toBeDefined();
  const detail = await readValidationRun(project, String(result.run_id));
  expect(detail.run).toMatchObject({ status: 'finished', result: 'FAIL' });
  expect(detail.result?.error).toContain('ENOENT');
});

nativeTest(
  'archives each run independently and keeps original preview history untouched',
  async () => {
    const output_dir = path.join(root, 'acceptance');
    const first = await validate({ output_dir, mode: 'both', screenshot_frame: '500' });
    const second = await validate({ output_dir });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.archive_directory).not.toBe(second.archive_directory);
    expect(fs.existsSync(path.join(String(first.archive_directory), 'screenshot.png'))).toBe(true);
    expect(fs.existsSync(path.join(String(second.archive_directory), 'result.json'))).toBe(true);
    const archived = JSON.parse(
      fs.readFileSync(path.join(String(first.archive_directory), 'result.json'), 'utf8')
    );
    expect(archived.log_path).toBe(path.join(String(first.archive_directory), 'runtime.log'));
    expect(
      archived.artifacts.find((item: { kind: string }) => item.kind === 'screenshot').path
    ).toBe(path.join(String(first.archive_directory), 'screenshot.png'));
    expect((await listValidationRuns(project)).runs).toHaveLength(2);
  }
);
