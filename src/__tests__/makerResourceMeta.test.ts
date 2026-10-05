import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { generateResourceMeta, RESOURCE_META_TOOL } from '../maker/resourceMeta.js';
import { materializePreviewBuilder } from '../maker/preview/prepare.js';
import { checkMakerPythonEnvironmentAsync } from '../maker/system/python.js';
import { claimRecoveryMutex } from '../maker/system/recoveryMutex.js';
import { RESOURCE_META_RUNNER } from '../maker/resourceMetaSource.js';

jest.mock('../maker/system/python.js', () => ({
  ...jest.requireActual('../maker/system/python.js'),
  checkMakerPythonEnvironmentAsync: jest.fn(),
}));

let temporary: string;
let root: string;
let originalHome: string | undefined;
const python =
  process.env.TAPTAP_MAKER_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

beforeEach(() => {
  temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-meta-test-')));
  root = path.join(temporary, 'game 空格');
  fs.mkdirSync(root);
  originalHome = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = path.join(temporary, 'maker-home');
  jest.mocked(checkMakerPythonEnvironmentAsync).mockResolvedValue({ ready: true, python } as any);
  write(
    '.project/project.json',
    JSON.stringify({ author: { id: 'author-test' }, project_id: 'game-test' })
  );
});
afterEach(() => {
  if (originalHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = originalHome;
  fs.rmSync(temporary, { recursive: true, force: true });
});
function write(relative: string, content = 'asset') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
function readMeta(relative: string) {
  return JSON.parse(fs.readFileSync(path.join(root, relative + '.meta'), 'utf8'));
}
async function generate(paths: string[]) {
  return generateResourceMeta({ target_dir: root, paths }) as Promise<any>;
}

test('generates through the official engine and preserves metadata byte-for-byte on repeat', async () => {
  write('assets/button.png');
  const first = await generate(['assets/button.png']);
  expect(first.success).toBe(true);
  expect(first.results).toEqual([
    expect.objectContaining({
      path: 'assets/button.png',
      status: 'generated',
      uuid: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
    }),
  ]);
  const original = fs.readFileSync(path.join(root, 'assets/button.png.meta'));
  write('assets/button.png', 'new pixels');
  const second = await generate(['assets/button.png']);
  expect(second.results[0]).toMatchObject({ status: 'preserved', uuid: first.results[0].uuid });
  expect(fs.readFileSync(path.join(root, 'assets/button.png.meta'))).toEqual(original);
  write('assets/copy.png', 'new pixels');
  const copy = await generate(['assets/copy.png']);
  expect(copy.results[0].uuid).not.toBe(first.results[0].uuid);
});

test('UUID payload carries official version, author/project hashes and timestamp', async () => {
  write('assets/a.png');
  const start = Date.now();
  const result = await generate(['assets/a.png']);
  const bytes = Buffer.from(result.results[0].uuid, 'base64url');
  expect(bytes.length).toBe(18);
  const header = bytes.readUInt32BE();
  const version = ((header >>> 29) << 3) | (header & 7);
  expect(version).toBe(1);
  // Decode only in the test: production delegates generation to UrhoX unchanged.
  const seed = Buffer.from('5a3c9f1e7b2d8a4f6c1a9e3b5d2f', 'hex');
  const random = Buffer.alloc(4);
  random.writeUInt32BE((header >>> 3) & 0x03ffffff);
  const key = createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from([version]), random]))
    .digest();
  const payload = Buffer.from(bytes.subarray(4).map((value, i) => value ^ key[i]));
  expect(payload.subarray(0, 4)).toEqual(
    createHash('sha256').update('author-test').digest().subarray(0, 4)
  );
  expect(payload.subarray(4, 8)).toEqual(
    createHash('sha256').update('game-test').digest().subarray(0, 4)
  );
  expect(payload.readUIntBE(8, 6)).toBeGreaterThanOrEqual(start);
  expect(payload.readUIntBE(8, 6)).toBeLessThanOrEqual(Date.now());
});

test('matches official config linkage, path_refs, recursion and exclusions', async () => {
  write('assets/ui/button.png');
  write('assets/ui/button.xml', '<texture />');
  write('assets/ui/button.json', '{}');
  write('assets/ui/readme.md');
  write('assets/ui/.hidden.png');
  write('assets/ui/nested/main.lua', 'return {}');
  const result = await generate(['assets/ui/button.png', 'assets/ui']);
  expect(result.success).toBe(true);
  expect(readMeta('assets/ui/button.png').config).toBe(readMeta('assets/ui/button.xml').uuid);
  expect(readMeta('assets/ui/nested/main.lua').path_refs).toBe(true);
  expect(result.results.filter((row: any) => row.path === 'assets/ui/button.png')).toHaveLength(1);
  expect(result.results).toContainEqual({ path: 'assets/ui/readme.md', status: 'skipped' });
  expect(fs.existsSync(path.join(root, 'assets/ui/.hidden.png.meta'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'assets/ui/readme.md.meta'))).toBe(false);
});

test('single-file request reports implicitly generated companion metadata', async () => {
  write('assets/atlas.png');
  write('assets/atlas.json', '{}');
  const result = await generate(['assets/atlas.png']);
  expect(result.success).toBe(true);
  expect(result.results).toHaveLength(2);
  expect(readMeta('assets/atlas.png').config).toBe(readMeta('assets/atlas.json').uuid);
  // This is the exact official _ensure_config_meta behavior, not a second schema.
  expect(readMeta('assets/atlas.json')).not.toHaveProperty('path_refs');
});

test('preserved asset does not generate newly added companion metadata', async () => {
  write('assets/a.png');
  await generate(['assets/a.png']);
  write('assets/a.json', '{}');
  const result = await generate(['assets/a.png']);
  expect(result.success).toBe(true);
  expect(result.results).toHaveLength(1);
  expect(fs.existsSync(path.join(root, 'assets/a.json.meta'))).toBe(false);
});

test.each(['{bad', '{}', '{"uuid":"not-a-uuid"}'])(
  'invalid existing meta fails before writing any new metadata (%s)',
  async (invalid) => {
    write('assets/new.png');
    write('assets/bad.png');
    write('assets/bad.png.meta', invalid);
    const result = await generate(['assets/new.png', 'assets/bad.png']);
    expect(result.success).toBe(false);
    expect(fs.existsSync(path.join(root, 'assets/new.png.meta'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'assets/bad.png.meta'), 'utf8')).toBe(invalid);
  }
);

test('invalid implicit companion and duplicate UUIDs are rejected without rewriting', async () => {
  write('assets/a.png');
  write('assets/a.xml', '<texture />');
  write('assets/a.xml.meta', '{}');
  expect((await generate(['assets/a.png'])).success).toBe(false);
  fs.unlinkSync(path.join(root, 'assets/a.xml.meta'));
  expect((await generate(['assets/a.png'])).success).toBe(true);
  write('assets/b.png');
  write('assets/b.png.meta', JSON.stringify(readMeta('assets/a.png')));
  const duplicate = await generate(['assets']);
  expect(duplicate.success).toBe(false);
  expect(duplicate.error).toContain('重复 UUID');
});

test.each([
  '../outside.png',
  '/outside.png',
  'assets/../outside.png',
  'assets\\a.png',
  '.maker/cache.png',
  'dist/a.png',
  'C:/a.png',
  'assets/missing.png',
])('rejects unsafe or missing path %s', async (relative) => {
  const result = await generate([relative]);
  expect(result.success).toBe(false);
});

test('rejects directory, sidecar and companion symlinks before writing outside project', async () => {
  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'a.png'), 'asset');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.symlinkSync(
    outside,
    path.join(root, 'assets/link'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  expect((await generate(['assets'])).success).toBe(false);
  expect(fs.existsSync(path.join(outside, 'a.png.meta'))).toBe(false);
  fs.unlinkSync(path.join(root, 'assets/link'));
  write('assets/a.png');
  fs.symlinkSync(path.join(outside, 'a.png'), path.join(root, 'assets/a.png.meta'));
  expect((await generate(['assets/a.png'])).success).toBe(false);
  fs.unlinkSync(path.join(root, 'assets/a.png.meta'));
  fs.symlinkSync(path.join(outside, 'a.png'), path.join(root, 'assets/a.xml'));
  expect((await generate(['assets/a.png'])).success).toBe(false);
  expect(fs.readFileSync(path.join(outside, 'a.png'), 'utf8')).toBe('asset');
});

test('missing project identity never falls back to Maker binding or caller-provided identity', async () => {
  write('assets/a.png');
  write('.project/project.json', '{}');
  write('.maker/config.json', JSON.stringify({ user_id: 'fake', project_id: 'fake' }));
  expect((await generate(['assets/a.png'])).success).toBe(false);
  await expect(
    generateResourceMeta({ target_dir: root, paths: ['assets/a.png'], uuid: 'x' })
  ).rejects.toThrow('不允许');
  expect(fs.existsSync(path.join(root, 'assets/a.png.meta'))).toBe(false);
});

test('reuses official legacy config lookup and id priority', async () => {
  fs.unlinkSync(path.join(root, '.project/project.json'));
  write('project.json', JSON.stringify({ author: { id: 'author-test' }, id: 'legacy-game' }));
  write('assets/a.png');
  expect((await generate(['assets/a.png'])).success).toBe(true);
});

test('Python unavailable and concurrent calls fail explicitly without resource changes', async () => {
  write('assets/a.png');
  const release = await claimRecoveryMutex(
    path.join(root, '.maker/resource-meta.lock'),
    () => new Error('busy')
  );
  try {
    await expect(generate(['assets/a.png'])).rejects.toThrow('正在生成 meta');
  } finally {
    await release();
  }
  jest.mocked(checkMakerPythonEnvironmentAsync).mockResolvedValue({ ready: false } as any);
  await expect(generate(['assets/a.png'])).rejects.toThrow('python setup');
  expect(fs.existsSync(path.join(root, 'assets/a.png.meta'))).toBe(false);
});

test('adapter matches official UUID reference vector under fixed entropy/time', () => {
  write('assets/a.png');
  const official = path.dirname(materializePreviewBuilder());
  const runner = path.join(temporary, 'run.py');
  const request = path.join(temporary, 'request.json');
  fs.writeFileSync(runner, RESOURCE_META_RUNNER);
  fs.writeFileSync(request, JSON.stringify({ project: root, paths: ['assets/a.png'] }));
  // Fixed inputs produce a stable official UUID reference vector.
  const script = [
    'import sys, json, runpy',
    'sys.path.insert(0, sys.argv[1])',
    'import uuid_generator',
    'uuid_generator.time.time = lambda: 1700000000.123',
    'uuid_generator.secrets.randbits = lambda n: 123456',
    'official, runner, request = sys.argv[1:]',
    'sys.argv = [runner, official, request]',
    "runpy.run_path(runner, run_name='__main__')",
  ].join('\n');
  const output = execFileSync(python, ['-I', '-B', '-c', script, official, runner, request], {
    encoding: 'utf8',
  }).trim();
  const result = JSON.parse(output);
  expect(result.success).toBe(true);
  expect(result.results[0].uuid).toBe('AA8SAZIvCijt3f2YP-uwFPeX');
  expect(RESOURCE_META_TOOL.inputSchema.required).toEqual(['target_dir', 'paths']);
});
