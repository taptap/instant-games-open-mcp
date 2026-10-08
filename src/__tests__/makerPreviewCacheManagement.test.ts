import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensurePreviewWorkspace, previewWorkspace } from '../maker/preview/workspace.js';
import { previewCacheUsage, clearPreviewCache } from '../maker/preview/cacheManagement.js';
import { previewDirectory } from '../maker/preview/protocol.js';
import {
  createValidationRun,
  updateValidationRun,
  finishValidationRun,
} from '../maker/preview/validationHistory.js';
import { MakerProjectRegistry } from '../maker/projectRegistry.js';
import { saveProjectConfig } from '../maker/storage.js';
import { executePreviewOperation } from '../maker/cli/preview.js';

let root: string;
let previousHome: string | undefined;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-cache-')));
  previousHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  fs.mkdirSync(process.env.TAPTAP_MAKER_HOME);
});
afterEach(() => {
  if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previousHome;
  fs.rmSync(root, { recursive: true, force: true });
});

function project(name: string): string {
  const directory = path.join(root, name);
  fs.mkdirSync(directory);
  saveProjectConfig(directory, { project_id: name } as any);
  return directory;
}
function write(filename: string, content: string): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}
async function completed(directory: string) {
  const run = await createValidationRun(directory);
  finishValidationRun(run, { result: 'COMPLETED' });
  updateValidationRun(run, { owner_pid: 2147483647 });
  return run;
}

test('totals cover other projects, orphaned hashes, unknown files and project-local workspace', async () => {
  const first = project('first');
  const second = project('second');
  await completed(second);
  await ensurePreviewWorkspace(first);
  write(path.join(previewWorkspace(first), 'source/assets/image'), '1234567');
  write(path.join(previewDirectory(first), 'sessions/legacy/source/asset'), '123');
  write(path.join(previewDirectory(second), 'validation-prep/old/source/asset'), '12345');
  const orphan = path.join(process.env.TAPTAP_MAKER_HOME!, 'preview', 'a'.repeat(64));
  write(path.join(orphan, 'unexpected/data'), 'orphan');
  write(path.join(process.env.TAPTAP_MAKER_HOME!, 'preview/loose-file'), 'loose');
  const usage = await previewCacheUsage(first);
  expect(usage.total_bytes).toBeGreaterThan(usage.bytes);
  expect(
    usage.projects.find((entry) => entry.project === second)?.categories['validation-prep']
  ).toBe(5);
  expect(usage.projects.find((entry) => entry.key === 'a'.repeat(64))?.bytes).toBe(6);
  expect(usage.total_categories.unattributed).toBe(5);
  expect(usage.total_bytes).toBe(
    usage.projects.reduce((total, entry) => total + entry.bytes, 0) + 5
  );
  expect(usage.categories['project-workspace']).toBeGreaterThan(7);
  expect(usage.complete).toBe(true);
});

test('a registered project-local cache is counted before it has preview history', async () => {
  const first = project('first');
  const second = project('second');
  new MakerProjectRegistry().add(second);
  await ensurePreviewWorkspace(second);
  write(path.join(previewWorkspace(second), 'source/assets/data'), 'local');
  const usage = await previewCacheUsage(first);
  expect(
    usage.projects.find((entry) => entry.project === second)?.categories['project-workspace']
  ).toBeGreaterThan(5);
});

test('all-project cleanup removes stopped copies but preserves unknown ownership and source', async () => {
  const first = project('first');
  const second = project('second');
  const run = await completed(second);
  for (const directory of [first, second]) {
    await ensurePreviewWorkspace(directory);
    write(path.join(previewWorkspace(directory), 'source/assets/copy'), 'copy');
    write(path.join(directory, 'assets/original'), 'original');
  }
  const orphan = path.join(process.env.TAPTAP_MAKER_HOME!, 'preview', 'a'.repeat(64));
  write(path.join(orphan, 'preparations/keep'), 'unknown');
  const result = await clearPreviewCache(first, true);
  expect(fs.existsSync(run.directory)).toBe(false);
  for (const directory of [first, second]) {
    expect(fs.existsSync(path.join(previewWorkspace(directory), 'source'))).toBe(false);
    expect(fs.readFileSync(path.join(directory, 'assets/original'), 'utf8')).toBe('original');
  }
  expect(fs.existsSync(path.join(orphan, 'preparations/keep'))).toBe(true);
  expect(result.warnings.join(' ')).toContain('归属');
});

test('unknown Runtime blocks cleanup of the shared project copy', async () => {
  const directory = project('active');
  const run = await createValidationRun(directory);
  updateValidationRun(run, { runtime_launch_pending: true, owner_pid: 2147483647 });
  await ensurePreviewWorkspace(directory);
  write(path.join(previewWorkspace(directory), 'source/keep'), 'keep');
  await expect(clearPreviewCache(directory)).rejects.toThrow();
  await expect(
    executePreviewOperation('prepare', { target_dir: directory })
  ).resolves.toMatchObject({ ok: false, result: 'FAIL' });
  expect(fs.existsSync(path.join(previewWorkspace(directory), 'source/keep'))).toBe(true);
});

test('unverified Builder cleanup marker protects the shared copy during manual cleanup', async () => {
  const directory = project('builder-pending');
  await ensurePreviewWorkspace(directory);
  write(path.join(previewWorkspace(directory), 'source/keep'), 'keep');
  write(path.join(previewWorkspace(directory), '.cleanup-unverified'), 'pending');
  const result = await clearPreviewCache(directory);
  expect(result.warnings.join(' ')).toContain('构建进程退出未确认');
  expect(fs.existsSync(path.join(previewWorkspace(directory), 'source/keep'))).toBe(true);
});

test('Git excludes the complete cache and keeps the exclusion in project changes', async () => {
  const directory = project('git');
  execFileSync('git', ['init', '-q', directory]);
  await ensurePreviewWorkspace(directory);
  write(path.join(previewWorkspace(directory), 'source/assets/data'), 'private');
  execFileSync('git', ['-C', directory, 'add', '-A']);
  const staged = execFileSync('git', ['-C', directory, 'diff', '--cached', '--name-only'], {
    encoding: 'utf8',
  });
  expect(staged).toContain('.gitignore');
  expect(staged).not.toContain('.maker-preview');
  await ensurePreviewWorkspace(directory);
  expect(
    fs.readFileSync(path.join(directory, '.gitignore'), 'utf8').match(/maker-preview/g)
  ).toHaveLength(1);
});

test('existing unowned directories and tracked cache files are never overwritten', async () => {
  const directory = project('occupied');
  write(path.join(previewWorkspace(directory), 'keep'), 'original');
  await expect(ensurePreviewWorkspace(directory)).rejects.toThrow();
  expect(fs.readFileSync(path.join(previewWorkspace(directory), 'keep'), 'utf8')).toBe('original');
  fs.rmSync(previewWorkspace(directory), { recursive: true });
  execFileSync('git', ['init', '-q', directory]);
  await ensurePreviewWorkspace(directory);
  execFileSync('git', ['-C', directory, 'add', '-f', '.maker-preview/owner.json']);
  await expect(ensurePreviewWorkspace(directory)).rejects.toThrow('Git');
});

(process.platform === 'win32' ? test.skip : test)(
  'linked content is excluded from totals, flagged incomplete and never followed during cleanup',
  async () => {
    const directory = project('linked');
    await ensurePreviewWorkspace(directory);
    write(path.join(root, 'outside/data'), 'outside');
    fs.symlinkSync(
      path.join(root, 'outside'),
      path.join(previewWorkspace(directory), 'source'),
      'dir'
    );
    const usage = await previewCacheUsage(directory);
    expect(usage.complete).toBe(false);
    const result = await clearPreviewCache(directory);
    expect(result.warnings.join(' ')).toContain('清理');
    expect(fs.readFileSync(path.join(root, 'outside/data'), 'utf8')).toBe('outside');
  }
);
