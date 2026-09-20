import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { previewBuilderWarnings } from '../maker/preview/builderDiagnostics.js';

let root: string;
const resource = {
  fs_path: 'Models/Plane.mdl',
  uuid: 'plane-uuid',
  ext: '.mdl',
  hash: 'abcdef',
  size: 336,
};
const reference = {
  fs_path: resource.fs_path,
  uuid: resource.uuid,
  ext: '.mdl',
  source: 'engine-res',
};
const imported = [
  '[INFO] 导入 1 个远端资源: engine-res (client=aa, server=bb)',
  '[INFO] 导入 1 个远端资源: official-res (client=cc, server=dd)',
];
const summary = '[ERROR] 增强引用错误: 1 个远端路径匹配多个 source，已选择第一个';
const detail =
  '[ERROR] Models/Plane.mdl: multiple sources matched; selected engine-res=plane-uuid; candidates=engine-res=plane-uuid, official-res=plane-uuid';
const output = [...imported, summary, detail].join('\n');

function index(name: string, file: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(root, '.build/manifest_cache', name + '.json'),
    JSON.stringify({ files: [file] })
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-builder-diagnostics-'));
  fs.mkdirSync(path.join(root, '.build/manifest_cache'), { recursive: true });
  index('engine-res-aa', resource);
  index('engine-res-bb', resource);
  index('official-res-cc', reference);
  index('official-res-dd', reference);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test.each(['\n', '\r\n'])('verifies forwarded references with line ending %j', (newline) => {
  expect(previewBuilderWarnings(root, output.split('\n').join(newline))).toEqual([
    '[WARN] Verified duplicate public resource reference: Models/Plane.mdl -> engine-res=plane-uuid',
  ]);
});

test('does not require indexes when no errors are present', () => {
  expect(previewBuilderWarnings('/missing', '[WARN] missing optional resource')).toEqual([]);
});

test('accepts the forwarding source first without inventing a new selection', () => {
  const reversed = detail
    .replace('selected engine-res=', 'selected official-res=')
    .replace(
      'candidates=engine-res=plane-uuid, official-res=plane-uuid',
      'candidates=official-res=plane-uuid, engine-res=plane-uuid'
    );
  expect(previewBuilderWarnings(root, [...imported, summary, reversed].join('\n'))).toHaveLength(1);
});

test.each([
  '[ERROR] unrelated build failure',
  output + '\n[ERROR] unrelated build failure',
  output.replace('1 个远端路径匹配', '2 个远端路径匹配'),
  output.replace('1 个远端路径匹配', '50 个远端路径匹配'),
  output.replace('已选择第一个', '已选择第一个（已截断，上限 50）'),
  imported.join('\n') + '\n' + detail,
  output.replace('official-res=plane-uuid', 'official-res=other-uuid'),
  output.replace('selected engine-res=plane-uuid', 'selected unknown=plane-uuid'),
  output.replace('official-res=plane-uuid', 'engine-res=plane-uuid'),
  output.replace('client=aa', 'client=ee'),
  output + '\n' + imported[0],
])('rejects unknown, conflicting or incomplete diagnostics: %s', (stdout) => {
  expect(() => previewBuilderWarnings(root, stdout)).toThrow('ProjectBuilder reported an error');
});

test('stderr errors cannot be hidden by valid stdout diagnostics', () => {
  expect(() => previewBuilderWarnings(root, output, '[ERROR] stderr failure')).toThrow();
});

test.each([
  { ...resource },
  { ...reference, source: 'unverified-source' },
  { ...reference, uuid: 'other-uuid' },
  { ...reference, fs_path: 'Models/Other.mdl' },
  { ...reference, hash: 'different' },
  { ...reference, ext: '.xml' },
  { ...reference, size: 42 },
  { ...reference, 'hash@windows': 'different' },
])('rejects same UUID without matching canonical ownership/content: %j', (file) => {
  index('official-res-cc', file);
  expect(() => previewBuilderWarnings(root, output)).toThrow();
});

test('rejects conflicting client/server owner content', () => {
  index('engine-res-bb', { ...resource, hash: 'different' });
  expect(() => previewBuilderWarnings(root, output)).toThrow();
});

test('rejects cycles rather than treating equal UUIDs as sufficient', () => {
  index('engine-res-aa', { ...reference, source: 'official-res' });
  index('engine-res-bb', { ...reference, source: 'official-res' });
  expect(() => previewBuilderWarnings(root, output)).toThrow();
});

test.each(['missing', 'invalid-json', 'invalid-files'])(
  'rejects %s indexes and ignores stale caches',
  (kind) => {
    index('official-res-ee', reference);
    const filename = path.join(root, '.build/manifest_cache/official-res-cc.json');
    if (kind === 'missing') fs.unlinkSync(filename);
    else fs.writeFileSync(filename, kind === 'invalid-json' ? '{broken' : '{}');
    expect(() => previewBuilderWarnings(root, output)).toThrow();
  }
);
