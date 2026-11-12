import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

type Reference = { module: string; line: number };
type SourceFile = {
  path: string;
  lines: number;
  bytes: number;
  sha256: string;
  functions: Array<{ name: string; line: number }>;
  requires: Reference[];
  dynamicRequires: number[];
};
type Edge = { from: string; to: string; module: string; line: number };
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'urhox-libs',
  'examples',
  'tests',
  'test',
  'tools',
  'templates',
  'docs',
  'dev',
  'local_temp',
  'backup',
  'backups',
  'vendor',
  'logs',
  'temp',
]);

/** Small Lua lexer: preserve source lines and ignore comments; never execute project code. */
function luaFacts(text: string) {
  const pattern =
    /--\[(=*)\[[\s\S]*?\]\1\]|--[^\n]*|\[(=*)\[[\s\S]*?\]\2\]|"(?:\\.|[^"\\])*"|\x27(?:\\.|[^\x27\\])*\x27|[A-Za-z_][\w]*|[^\s]/g;
  const tokens: Array<{ value: string; line: number }> = [];
  let line = 1,
    end = 0;
  for (const match of text.matchAll(pattern)) {
    line += text.slice(end, match.index).split('\n').length - 1;
    if (!match[0].startsWith('--')) tokens.push({ value: match[0], line });
    line += match[0].split('\n').length - 1;
    end = match.index! + match[0].length;
  }
  const requires: Reference[] = [],
    dynamicRequires: number[] = [];
  const functions: Array<{ name: string; line: number }> = [];
  tokens.forEach((token, i) => {
    if (token.value === 'require' && !['.', ':', 'function'].includes(tokens[i - 1]?.value)) {
      let j = i + 1;
      if (
        tokens[j]?.value === ',' &&
        tokens[i - 1]?.value === '(' &&
        ['pcall', 'xpcall'].includes(tokens[i - 2]?.value)
      )
        j++;
      if (tokens[j]?.value === '(') j++;
      const value = tokens[j]?.value ?? '';
      if (/^["']/.test(value) && !['.', '+', '['].includes(tokens[j + 1]?.value))
        requires.push({ module: value.slice(1, -1), line: tokens[j].line });
      else dynamicRequires.push(token.line);
    }
    if (token.value === 'function') {
      const parts: string[] = [];
      for (let j = i + 1; j < tokens.length && tokens[j].value !== '(' && parts.length < 12; j++)
        parts.push(tokens[j].value);
      if (parts.length && parts.every((part) => /^[\w.:]+$/.test(part)))
        functions.push({ name: parts.join(''), line: token.line });
    }
  });
  return { requires, dynamicRequires, functions };
}

/** Collect source evidence for AI analysis without executing project code. */
export async function inspectArchitecture(projectDir: string, signal?: AbortSignal) {
  const root = await fs.realpath(projectDir);
  const files: SourceFile[] = [],
    ui: string[] = [],
    notes: string[] = [],
    skipped: string[] = [];
  let total = 0,
    visited = 0;
  const note = (value: string) => {
    if (notes.length < 100 && !notes.includes(value)) notes.push(value);
  };
  async function readFile(relative: string) {
    signal?.throwIfAborted();
    const filename = path.join(root, relative);
    if ((await fs.realpath(filename)) !== filename) throw new Error('链接文件');
    const handle = await fs.open(filename, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 3 * 1024 * 1024 || total + stat.size > 64 * 1024 * 1024)
        throw new Error('读取上限');
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const read = await handle.read(bytes, size, bytes.length - size, size);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size !== stat.size || (await handle.stat()).mtimeMs !== stat.mtimeMs)
        throw new Error('源码已变动');
      total += size;
      return bytes.subarray(0, size);
    } finally {
      await handle.close();
    }
  }
  async function walk(relative: string, depth = 0): Promise<void> {
    signal?.throwIfAborted();
    if (visited >= 20000 || depth > 24) {
      note('达到 20000 项或 24 层扫描上限，结果不完整。');
      return;
    }
    const directory = path.join(root, relative);
    try {
      if ((await fs.realpath(directory)) !== directory) {
        note('跳过链接：' + relative);
        return;
      }
      if (
        relative &&
        (await fs.stat(path.join(directory, '.project', 'project.json')).then(
          () => true,
          () => false
        ))
      ) {
        note('跳过嵌套项目：' + relative);
        return;
      }
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        signal?.throwIfAborted();
        if (++visited > 20000) {
          note('达到 20000 项扫描上限，结果不完整。');
          break;
        }
        const file = relative ? relative + '/' + entry.name : entry.name;
        if (entry.isSymbolicLink()) {
          note('跳过链接：' + file);
          continue;
        }
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) {
          if (skipped.length < 100) skipped.push(file);
          continue;
        }
        if (entry.isDirectory()) {
          await walk(file, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        if (file.endsWith('.ui.json')) ui.push(file);
        if (!file.endsWith('.lua')) continue;
        try {
          const bytes = await readFile(file),
            text = bytes.toString('utf8');
          files.push({
            path: file,
            bytes: bytes.length,
            lines: text.split('\n').length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            ...luaFacts(text),
          });
        } catch {
          signal?.throwIfAborted();
          note('未读取或文件变化：' + file);
        }
      }
    } catch {
      signal?.throwIfAborted();
      note('无法完整读取目录：' + relative);
    }
  }
  await walk('');
  const paths = new Set(files.map((file) => file.path));
  const entries: Array<{ kind: string; value: string; path: string | null }> = [];
  try {
    const config = JSON.parse((await readFile('.project/project.json')).toString('utf8'));
    for (const kind of ['entry', 'entry@client', 'entry@server']) {
      if (typeof config[kind] !== 'string') continue;
      const value = config[kind].split(String.fromCharCode(92)).join('/').replace(/^\.\//, '');
      entries.push({
        kind,
        value,
        path:
          [value, 'scripts/' + value, 'assets/' + value].find((item) => paths.has(item)) ?? null,
      });
    }
  } catch {
    signal?.throwIfAborted();
    note('项目入口配置未读取，需核对实际启动入口。');
  }
  if (!entries.length)
    for (const file of ['scripts/main.lua', 'main.lua'])
      if (paths.has(file))
        entries.push({ kind: '候选入口（未确认配置）', value: file, path: file });
  const edges: Edge[] = [];
  const unresolved: Array<{ from: string; module: string; line: number; reason: string }> = [];
  for (const file of files)
    for (const ref of file.requires) {
      if (ref.module.includes('..') || ref.module.startsWith('/')) {
        unresolved.push({ from: file.path, ...ref, reason: '非常规模块路径，未跨项目解析' });
        continue;
      }
      const stem = ref.module.endsWith('.lua')
        ? ref.module.slice(0, -4)
        : ref.module.includes('/')
          ? ref.module
          : ref.module.split('.').join('/');
      const matches = [
        ...new Set(
          ['scripts/', 'assets/', '']
            .flatMap((prefix) => [prefix + stem + '.lua', prefix + stem + '/init.lua'])
            .filter((item) => paths.has(item))
        ),
      ];
      if (matches.length === 1) edges.push({ from: file.path, to: matches[0], ...ref });
      else
        unresolved.push({
          from: file.path,
          ...ref,
          reason: matches.length ? '多个候选，需确认 package.path' : '外部库或未在扫描范围解析',
        });
    }
  return { files, entries, edges, unresolved, ui, notes, skipped };
}
