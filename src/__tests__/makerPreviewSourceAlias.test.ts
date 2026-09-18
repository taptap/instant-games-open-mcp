import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPreviewSourceAlias } from '../maker/preview/sourceAlias.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-alias-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('Windows alias reads a long source path and cleanup preserves the source', () => {
  const source = path.join(root, 'nested-'.repeat(20), 'nested-'.repeat(15), 'source');
  fs.mkdirSync(path.join(source, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(source, 'scripts', 'main.lua'), 'print(123)');
  const alias = createPreviewSourceAlias(source, 'win32', root);
  expect(alias.source.length).toBeLessThan(180);
  expect(fs.readFileSync(path.join(alias.source, 'scripts', 'main.lua'), 'utf8')).toBe(
    'print(123)'
  );
  alias.close();
  alias.close();
  expect(fs.existsSync(alias.source)).toBe(false);
  expect(fs.readFileSync(path.join(source, 'scripts', 'main.lua'), 'utf8')).toBe('print(123)');
});

test('does not remove a replaced alias', () => {
  const source = path.join(root, 'original');
  fs.mkdirSync(source);
  const alias = createPreviewSourceAlias(source, 'win32', root);
  fs.unlinkSync(alias.source);
  fs.mkdirSync(alias.source);
  expect(() => alias.close()).toThrow('refusing cleanup');
  expect(fs.existsSync(alias.source)).toBe(true);
  expect(fs.existsSync(source)).toBe(true);
});

test('non-Windows platforms keep the original source path', () => {
  const alias = createPreviewSourceAlias(root, 'darwin', root);
  expect(alias.source).toBe(root);
  alias.close();
  expect(fs.existsSync(root)).toBe(true);
});

test('concurrent aliases remain independent and preserve source contents', () => {
  fs.writeFileSync(path.join(root, 'sentinel'), 'unchanged');
  const first = createPreviewSourceAlias(root, 'win32', root);
  const second = createPreviewSourceAlias(root, 'win32', root);
  expect(first.source).not.toBe(second.source);
  first.close();
  expect(fs.readFileSync(path.join(second.source, 'sentinel'), 'utf8')).toBe('unchanged');
  second.close();
  expect(fs.readFileSync(path.join(root, 'sentinel'), 'utf8')).toBe('unchanged');
});

test('rejects an overlong temporary directory without leaving an alias', () => {
  const temporary = path.join(root, 'nested-'.repeat(22));
  fs.mkdirSync(temporary);
  expect(() => createPreviewSourceAlias(root, 'win32', temporary)).toThrow('shorter TEMP');
  expect(fs.readdirSync(temporary)).toEqual([]);
});

test('refuses to remove a junction redirected to another project', () => {
  const original = path.join(root, 'original');
  const other = path.join(root, 'other');
  fs.mkdirSync(original);
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'sentinel'), 'protected');
  const alias = createPreviewSourceAlias(original, 'win32', root);
  fs.unlinkSync(alias.source);
  fs.symlinkSync(other, alias.source, 'junction');
  expect(() => alias.close()).toThrow('refusing cleanup');
  expect(fs.readFileSync(path.join(other, 'sentinel'), 'utf8')).toBe('protected');
  fs.unlinkSync(alias.source);
});
