import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createValidationRun,
  finishValidationRun,
  listValidationRuns,
  readValidationRun,
  readValidationArtifact,
  readValidationLogs,
  cleanValidationHistory,
  archiveValidationRun,
  requireNoActiveValidationRuntime,
  updateValidationRun,
} from '../maker/preview/validationHistory.js';
import * as presence from '../maker/system/processPresence.js';
import { previewDirectory, writePrivateJson } from '../maker/preview/protocol.js';
import { PreviewLogs } from '../maker/preview/evidence.js';

let root: string;
let project: string;
let home: string | undefined;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'validation-history-')));
  home = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  project = path.join(root, 'game');
  fs.mkdirSync(project);
});
afterEach(() => {
  if (home === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = home;
  fs.rmSync(root, { recursive: true, force: true });
});

test('records start before results exist and separates collection from game status', async () => {
  const run = await createValidationRun(project);
  expect((await listValidationRuns(project)).runs).toEqual([
    expect.objectContaining({ run_id: run.run_id, status: 'running', phase: 'preparing' }),
  ]);
  finishValidationRun(run, { result: 'COMPLETED', report: { result: 'FAIL' } });
  expect((await readValidationRun(project, run.run_id)).run).toMatchObject({
    status: 'finished',
    result: 'COMPLETED',
    game_result: 'FAIL',
  });
});

test('history is isolated by real project path and rejects a foreign run', async () => {
  const run = await createValidationRun(project);
  const other = path.join(root, 'other');
  fs.mkdirSync(other);
  expect((await listValidationRuns(other)).runs).toEqual([]);
  await expect(readValidationRun(other, run.run_id)).rejects.toThrow();
  await expect(readValidationRun(project, '../outside')).rejects.toThrow();
});

test('history pagination is stable when another run starts', async () => {
  for (let i = 0; i < 23; i++) await createValidationRun(project);
  const first = await listValidationRuns(project);
  expect(first.runs).toHaveLength(20);
  await createValidationRun(project);
  const second = await listValidationRuns(project, first.next_cursor);
  expect(second.runs).toHaveLength(3);
  expect(second.runs.some((run) => first.runs.some((item) => item.run_id === run.run_id))).toBe(
    false
  );
});

test('does not serve a partial PNG or a file outside the fixed evidence list', async () => {
  const run = await createValidationRun(project);
  fs.writeFileSync(path.join(run.directory, 'screenshot.png'), 'partial');
  expect((await readValidationRun(project, run.run_id)).artifacts).toEqual([]);
  await expect(readValidationArtifact(project, run.run_id, 'screenshot.png')).rejects.toThrow();
  await expect(readValidationArtifact(project, run.run_id, 'run.json')).rejects.toThrow();
});

test('rejects linked artifacts, run directories and validation roots', async () => {
  const run = await createValidationRun(project);
  const secret = path.join(root, 'secret');
  fs.writeFileSync(secret, '{"secret":true}');
  fs.symlinkSync(secret, path.join(run.directory, 'invocation.json'));
  await expect(readValidationRun(project, run.run_id)).rejects.toThrow();
  fs.renameSync(run.directory, run.directory + '-moved');
  fs.symlinkSync(run.directory + '-moved', run.directory, 'dir');
  await expect(readValidationRun(project, run.run_id)).rejects.toThrow();
  const base = path.join(previewDirectory(project), 'validation');
  fs.renameSync(base, base + '-moved');
  fs.symlinkSync(base + '-moved', base, 'dir');
  await expect(listValidationRuns(project)).rejects.toThrow();
});

test('incremental logs tolerate an in-progress last line and redact credentials', async () => {
  const run = await createValidationRun(project);
  const logs = new PreviewLogs(run.directory);
  logs.append('hello');
  logs.append('Authorization: Bearer secret-credential');
  fs.appendFileSync(path.join(run.directory, 'runtime.log'), '{"cursor":3');
  const first = await readValidationLogs(project, run.run_id, 0);
  expect(first.logs).toHaveLength(2);
  expect(JSON.stringify(first)).not.toContain('secret-credential');
  expect((await readValidationLogs(project, run.run_id, first.next_cursor)).logs).toEqual([]);
});

test('a log rotation between reads cannot silently skip a generation', async () => {
  const run = await createValidationRun(project);
  const logs = new PreviewLogs(run.directory);
  for (let i = 0; i < 130; i++) logs.append('x'.repeat(16000));
  const originalOpen = fs.promises.open.bind(fs.promises);
  const spy = jest.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
    const file = await originalOpen(...args);
    if (String(args[0]).endsWith('runtime.log.1')) {
      const close = file.close.bind(file);
      file.close = async () => {
        await close();
        logs.append('new generation'.padEnd(16000, 'x'));
      };
    }
    return file;
  });
  try {
    const result = await readValidationLogs(project, run.run_id, 65);
    expect(result.next_cursor).toBe(131);
    expect(result.truncated).toBe(true);
  } finally {
    spy.mockRestore();
  }
});

test('retains recent and active evidence, expires only old finished evidence', async () => {
  const old = await createValidationRun(project);
  finishValidationRun(old, { result: 'FAIL' });
  const oldRecord = JSON.parse(fs.readFileSync(path.join(old.directory, 'run.json'), 'utf8'));
  oldRecord.finished_at = new Date(Date.now() - 8 * 86400000).toISOString();
  writePrivateJson(path.join(old.directory, 'run.json'), oldRecord);
  const active = await createValidationRun(project);
  const recent = await createValidationRun(project);
  finishValidationRun(recent, { result: 'COMPLETED' });
  await cleanValidationHistory(project);
  expect(fs.existsSync(old.directory)).toBe(false);
  expect(fs.existsSync(active.directory)).toBe(true);
  expect(fs.existsSync(recent.directory)).toBe(true);
});

test('unfinished records with dead owners are incomplete, never successful', async () => {
  const run = await createValidationRun(project);
  const data = JSON.parse(fs.readFileSync(path.join(run.directory, 'run.json'), 'utf8'));
  data.owner_pid = 2147483647;
  writePrivateJson(path.join(run.directory, 'run.json'), data);
  expect((await readValidationRun(project, run.run_id)).run.status).toBe('incomplete');
  expect(fs.existsSync(path.join(run.directory, 'result.json'))).toBe(false);
});

test('launch guard allows projects without validation history and not-yet-launched runs', async () => {
  await expect(requireNoActiveValidationRuntime(project)).resolves.toBeUndefined();
  await createValidationRun(project);
  await expect(requireNoActiveValidationRuntime(project)).resolves.toBeUndefined();
});

test.each(['alive', 'unknown', 'pending', 'missing-pid'] as const)(
  'launch guard rejects unfinished validation with %s Runtime ownership',
  async (state) => {
    const run = await createValidationRun(project);
    updateValidationRun(run, {
      phase: 'running',
      owner_pid: 2147483647,
      runtime_pid: state === 'alive' || state === 'unknown' ? process.pid : undefined,
      runtime_launch_pending: state === 'pending',
    });
    const probe = jest
      .spyOn(presence, 'processPresence')
      .mockReturnValue(state === 'unknown' ? 'unknown' : 'alive');
    try {
      await expect(requireNoActiveValidationRuntime(project)).rejects.toThrow(
        /validation Runtime is active or unverified/
      );
      await expect(requireNoActiveValidationRuntime(project, run.run_id)).resolves.toBeUndefined();
      expect(fs.existsSync(path.join(run.directory, 'run.json'))).toBe(true);
    } finally {
      probe.mockRestore();
    }
  }
);

test('launch guard allows confirmed exited Runtime without deleting its evidence', async () => {
  const run = await createValidationRun(project);
  updateValidationRun(run, {
    phase: 'running',
    owner_pid: 2147483647,
    runtime_pid: 2147483647,
    runtime_launch_pending: false,
  });
  await expect(requireNoActiveValidationRuntime(project)).resolves.toBeUndefined();
  expect(fs.existsSync(path.join(run.directory, 'run.json'))).toBe(true);
  finishValidationRun(run, { result: 'FAIL' });
  await expect(requireNoActiveValidationRuntime(project)).resolves.toBeUndefined();
});

test('launch guard scans beyond history pagination without treating volume as unknown ownership', async () => {
  const last = await createValidationRun(project);
  const root = path.dirname(last.directory);
  for (let i = 0; i < 5000; i++) {
    const id = `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
    const directory = path.join(root, id);
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'run.json'),
      JSON.stringify({
        run_id: id,
        project_realpath: project,
        started_at: new Date().toISOString(),
        phase: 'finished',
        owner_pid: process.pid,
        finished_at: new Date().toISOString(),
      })
    );
  }
  finishValidationRun(last, { result: 'COMPLETED' });
  await expect(requireNoActiveValidationRuntime(project)).resolves.toBeUndefined();
  updateValidationRun(last, { phase: 'running', finished_at: undefined, runtime_pid: process.pid });
  await expect(requireNoActiveValidationRuntime(project)).rejects.toThrow(last.run_id);
});

test('launch guard rejects unreadable ownership rather than treating it as no Runtime', async () => {
  const run = await createValidationRun(project);
  fs.writeFileSync(path.join(run.directory, 'run.json'), '{partial');
  await expect(requireNoActiveValidationRuntime(project)).rejects.toThrow(
    /ownership is unverified/
  );
});

test('old interrupted runs with unknown Runtime creation are never removed', async () => {
  const run = await createValidationRun(project);
  const filename = path.join(run.directory, 'run.json');
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  Object.assign(data, {
    owner_pid: 2147483647,
    started_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    runtime_launch_pending: true,
  });
  writePrivateJson(filename, data);
  await cleanValidationHistory(project);
  expect(fs.existsSync(run.directory)).toBe(true);
});

test('disk threshold warns without removing recent evidence', async () => {
  const run = await createValidationRun(project);
  const file = fs.openSync(path.join(run.directory, 'large-cache'), 'w');
  fs.ftruncateSync(file, 5 * 1024 ** 3 + 1);
  fs.closeSync(file);
  finishValidationRun(run, { result: 'COMPLETED' });
  expect((await cleanValidationHistory(project)).join(' ')).toContain('5 GiB');
  expect(fs.existsSync(run.directory)).toBe(true);
});

test('malformed old records are retained rather than treated as cleanup authorization', async () => {
  const run = await createValidationRun(project);
  writePrivateJson(path.join(run.directory, 'run.json'), { run_id: run.run_id });
  expect((await cleanValidationHistory(project)).join(' ')).toContain('Unreadable');
  expect(fs.existsSync(run.directory)).toBe(true);
});

test('explicit archive retains fixed evidence, not managed project source', async () => {
  const run = await createValidationRun(project);
  new PreviewLogs(run.directory).append('evidence');
  fs.mkdirSync(path.join(run.directory, 'source'));
  fs.writeFileSync(path.join(run.directory, 'source', 'secret.lua'), 'not an artifact');
  finishValidationRun(run, {
    result: 'FAIL',
    evidence_directory: run.directory,
    log_path: path.join(run.directory, 'runtime.log'),
    invocation_path: path.join(run.directory, 'invocation.json'),
    artifacts: [{ kind: 'runtime-log', path: path.join(run.directory, 'runtime.log') }],
  });
  const archive = await archiveValidationRun(run, path.join(root, 'acceptance'));
  expect(fs.existsSync(path.join(archive, 'result.json'))).toBe(true);
  expect(fs.existsSync(path.join(archive, 'runtime.log'))).toBe(true);
  expect(fs.existsSync(path.join(archive, 'source'))).toBe(false);
  const result = JSON.parse(fs.readFileSync(path.join(archive, 'result.json'), 'utf8'));
  expect(result.evidence_directory).toBe(archive);
  expect(result.log_path).toBe(path.join(archive, 'runtime.log'));
  expect(result.invocation_path).toBe(path.join(archive, 'invocation.json'));
  expect(result.artifacts[0].path).toBe(path.join(archive, 'runtime.log'));
  await expect(archiveValidationRun(run, run.directory)).rejects.toThrow();
});
