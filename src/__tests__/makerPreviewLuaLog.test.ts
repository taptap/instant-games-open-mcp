import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PreviewLuaLog } from '../maker/preview/luaLog.js';

let root: string;
let executable: string;
let filename: string;
let reader: PreviewLuaLog;
let lines: string[];
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-lua-log-')));
  executable = path.join(root, 'runtime.exe');
  filename = path.join(root, 'logs', 'lua', 'lua-2026-09-27 12_00_00_001.log');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(executable, '');
  fs.writeFileSync(filename, '');
  lines = [];
  reader = new PreviewLuaLog(executable, (line) => lines.push(line));
});
afterEach(() => {
  reader.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const announce = (filename: string): string =>
  'INFO: Lua official log file initialized: ' + filename;

test('reads only the announced file incrementally and flushes on close', () => {
  reader.observe(announce(filename));
  fs.appendFileSync(filename, '{"m":"hello","l":"RAW"}\n{"m":"par');
  reader.poll();
  expect(lines).toEqual(['[lua] hello']);
  fs.appendFileSync(filename, 'tial","l":"ERROR"}\n');
  reader.close();
  expect(lines).toEqual(['[lua] hello', '[lua] ERROR: partial']);
  reader.poll();
  expect(lines).toHaveLength(2);
});

test('ignores unrelated files and a second announcement', () => {
  const foreign = path.join(root, 'secret.log');
  fs.writeFileSync(foreign, '{"m":"secret"}\n');
  reader.observe(announce(foreign));
  reader.poll();
  expect(lines).toEqual([]);
  reader.observe(announce(filename));
  reader.observe(announce(foreign));
  fs.appendFileSync(filename, '{"m":"owned"}\n');
  reader.poll();
  expect(lines).toEqual(['[lua] owned']);
});

test('does not read a replacement file', () => {
  reader.observe(announce(filename));
  fs.renameSync(filename, filename + '.old');
  fs.writeFileSync(filename, '{"m":"replacement"}\n');
  reader.poll();
  expect(lines).toEqual([]);
});

test('follows a bounded engine-announced Lua VM log rotation', () => {
  reader.observe(announce(filename));
  fs.appendFileSync(filename, '{"m":"bootstrap"}\n');
  const next = path.join(path.dirname(filename), 'lua-2026-09-27 12_00_01_002.log');
  fs.writeFileSync(next, '{"m":"game"}\n');
  reader.observe('[2026-09-27 12_00_01_002][31] ' + announce(next));
  expect(lines).toEqual(['[lua] bootstrap', '[lua] game']);
});

test('ignores a log announcement embedded in game output', () => {
  fs.appendFileSync(filename, '{"m":"not trusted"}\n');
  reader.observe('[2026-09-27 12_00_01_002][31][Script] ' + announce(filename));
  reader.poll();
  expect(lines).toEqual([]);
});

test('waits for a log created lazily after its announcement', () => {
  fs.unlinkSync(filename);
  reader.observe(announce(filename));
  reader.poll();
  fs.writeFileSync(filename, '{"m":"late game output"}\n');
  reader.poll();
  expect(lines).toEqual(['[lua] late game output']);
});

test('bounds a malformed row and resumes after its newline', () => {
  reader.observe(announce(filename));
  fs.appendFileSync(filename, 'x'.repeat(70000) + '\n{"m":"valid"}\n');
  reader.poll();
  reader.poll();
  expect(lines).toEqual(['[lua] valid']);
});
