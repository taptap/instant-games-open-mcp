import fs from 'node:fs/promises';
import path from 'node:path';
import { previewProject } from '../preview/protocol.js';
import { openUiEditorConsole } from '../console/cli.js';
import { ConsoleError } from '../console/types.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import {
  checkUiDocument,
  createUiDocument,
  inspectUiDocument,
  nanoVGOperations,
  patchUiDocument,
} from './documents.js';
import { MAX_UI_JSON, uiEditorManifest } from './projectFiles.js';
import { readUiEditorAsset } from './assets.js';

export const uiCliCapabilities = {
  version: 1,
  commands: [
    'list',
    'inspect',
    'create',
    'patch',
    'check',
    'open',
    'capabilities',
    'nanovg-adapter',
  ],
  source: 'saved',
  target: '--target-dir <bound project absolute path> --file <assets/.../screen.ui.json>',
  selector: 'Use --id <node ID> or --pointer /children/0. Omitting both selects the root.',
  input:
    '--input-file <JSON file> or --input <JSON>. create takes a UI root; patch takes {operations: [...]}.',
  concurrency:
    'patch requires --revision <SHA-256 from inspect>. All operations validate before one atomic save.',
  dryRun: 'create and patch support --dry-run. No project files or directories are written.',
  open: 'Opens the integrated console editor; --no-open returns the URL only. Other commands need no running browser or server.',
  operations: [
    { op: 'set', id: 'title', props: { text: 'Title', left: 24 }, unset: ['right'] },
    {
      op: 'add',
      parentId: 'screen',
      index: 0,
      node: { type: 'Label', id: 'caption', text: 'Caption' },
    },
    { op: 'move', id: 'caption', parentId: 'screen', index: 1 },
    { op: 'remove', id: 'caption' },
  ],
  hierarchy:
    'Use pointer instead of id, parentPointer instead of parentId. Parent defaults to root. move keeps local properties; index is counted after removal. Set coordinates explicitly in the same batch when reparenting.',
  editor:
    'Unsaved browser drafts are not read or changed. Reload the document from disk in the editor after a CLI write; stale browser saves fail instead of overwriting it.',
  scope: 'Local UI files only. Does not create resource meta, run Lua, build, upload, or publish.',
  nanovg: {
    node: {
      type: 'NanoVG',
      viewBox: [0, 0, 100, 100],
      commands: [['beginPath'], ['circle', 50, 50, 40], ['fillColor', '#22a899'], ['fill']],
    },
    editing:
      'Use patch set to replace commands or viewBox, or edit layout and transforms as for other nodes.',
    runtime:
      'ui nanovg-adapter --json returns MakerNanoVG.lua source. Explicitly capture named Lua draw layers or register the NanoVG widget before UI.LoadJSON. It does not automatically convert or modify game Lua.',
    unsupported:
      'No arbitrary Lua execution, live animation capture, box gradients, path winding, composite operations, fontBlur or reset commands. Unsupported drawing fails capture/check rather than being dropped.',
  },
};

async function readInput(options: Record<string, string | boolean>): Promise<unknown> {
  if ((options.input !== undefined) === (options.input_file !== undefined))
    throw new ConsoleError('请且仅请提供一个 --input 或 --input-file。');
  let content: string;
  if (options.input !== undefined) {
    if (typeof options.input !== 'string') throw new ConsoleError('--input 缺少 JSON 内容。');
    content = options.input;
  } else {
    if (typeof options.input_file !== 'string')
      throw new ConsoleError('--input-file 缺少文件路径。');
    const stat = await fs.stat(options.input_file);
    if (!stat.isFile() || stat.size > MAX_UI_JSON)
      throw new ConsoleError('input 文件必须小于 8 MiB。');
    content = await fs.readFile(options.input_file, 'utf8');
  }
  if (Buffer.byteLength(content) > MAX_UI_JSON) throw new ConsoleError('输入超过 8 MiB。', 413);
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch {
    throw new ConsoleError('输入不是有效 JSON。');
  }
}

export async function runUiCli(
  action: string | undefined,
  options: Record<string, string | boolean>,
  positionals: string[] = []
): Promise<void> {
  const print = (value: unknown) =>
    process.stdout.write(JSON.stringify(value, null, options.json ? undefined : 2) + '\n');
  try {
    if (positionals.length)
      throw new ConsoleError('ui 命令请使用命名参数；用 ui capabilities 查看格式。');
    const allowed: Record<string, string[]> = {
      capabilities: [],
      'nanovg-adapter': [],
      list: ['target_dir'],
      inspect: ['target_dir', 'file', 'id', 'pointer'],
      create: ['target_dir', 'file', 'input', 'input_file', 'dry_run'],
      patch: ['target_dir', 'file', 'revision', 'input', 'input_file', 'dry_run'],
      check: ['target_dir', 'file'],
      open: ['target_dir', 'file', 'no_open'],
    };
    if (!action || !Object.hasOwn(allowed, action))
      throw new ConsoleError(
        '使用 ui list|inspect|create|patch|check|open|capabilities|nanovg-adapter。'
      );
    for (const key of Object.keys(options)) {
      if (!['json', 'maker_env', ...allowed[action]].includes(key))
        throw new ConsoleError('不支持的参数：--' + key.replace(/_/g, '-'));
    }
    for (const flag of ['json', 'dry_run', 'no_open']) {
      if (options[flag] !== undefined && typeof options[flag] !== 'boolean')
        throw new ConsoleError('--' + flag.replace(/_/g, '-') + ' 不接受字符串值。');
    }
    if (action === 'capabilities') {
      print({
        ...uiCliCapabilities,
        nanovg: {
          ...uiCliCapabilities.nanovg,
          commands: nanoVGOperations(),
          argumentTypes: {
            n: 'finite number',
            s: 'string',
            c: '#RRGGBB/#RRGGBBAA or [R,G,B,A] in 0..255',
            p: 'paint {kind,args}',
          },
        },
      });
      return;
    }
    if (action === 'nanovg-adapter') {
      const source = readUiEditorAsset('runtime/MakerNanoVG.lua');
      if (!source) throw new ConsoleError('当前分发缺少 NanoVG 适配器，请重新构建。', 500);
      if (options.json)
        print({ ok: true, filename: 'MakerNanoVG.lua', source: source.toString('utf8') });
      else process.stdout.write(source);
      return;
    }
    if (typeof options.target_dir !== 'string' || !path.isAbsolute(options.target_dir))
      throw new ConsoleError('需要 --target-dir 指定已绑定的 Maker 项目绝对路径。');
    const root = previewProject(options.target_dir);
    if (action === 'list') {
      const manifest = await uiEditorManifest({
        path: root,
        key: 'local',
        name: path.basename(root),
      });
      print({
        ok: true,
        project: root,
        source: 'saved',
        documents: manifest.ui.map((item) => ({
          file: 'assets/' + item.ref,
          name: item.name,
          hasMeta: item.hasMeta,
        })),
      });
      return;
    }
    if (typeof options.file !== 'string')
      throw new ConsoleError('需要 --file 指定 assets 内的 .ui.json 文档。');
    const file = options.file;
    if (action === 'create' || action === 'patch') {
      if (action === 'patch' && typeof options.revision !== 'string')
        throw new ConsoleError('patch 需要 inspect 返回的 --revision。');
      const input = await readInput(options);
      const result =
        action === 'create'
          ? await createUiDocument(root, file, input, options.dry_run === true)
          : await patchUiDocument(
              root,
              file,
              options.revision as string,
              input,
              options.dry_run === true
            );
      print(result);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    for (const key of ['id', 'pointer']) {
      if (options[key] !== undefined && typeof options[key] !== 'string')
        throw new ConsoleError('--' + key + ' 缺少值。');
    }
    const snapshot = await inspectUiDocument(root, file, {
      id: options.id as string | undefined,
      pointer: options.pointer as string | undefined,
    });
    if (action === 'inspect') {
      print({
        ok: true,
        project: root,
        file,
        source: snapshot.source,
        revision: snapshot.revision,
        pointer: snapshot.selected.pointer,
        node: snapshot.selected.node,
      });
    } else if (action === 'check') {
      const check = await checkUiDocument(root, file, snapshot.tree);
      print({
        ok: check.errors === 0,
        file,
        source: snapshot.source,
        revision: snapshot.revision,
        check,
      });
      if (check.errors) process.exitCode = 1;
    } else print(await openUiEditorConsole(root, file, options.no_open === true));
  } catch (error) {
    if (!options.json) throw error;
    print({
      ok: false,
      error: sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error)),
      status: error instanceof ConsoleError ? error.status : 400,
    });
    process.exitCode = 1;
  }
}
