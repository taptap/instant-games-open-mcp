import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyUiOperations,
  checkUiDocument,
  createUiDocument,
  inspectUiDocument,
  patchUiDocument,
  type UiNode,
} from '../maker/uiEditor/documents';
import { runUiCli } from '../maker/uiEditor/cli';
import { saveUiFile } from '../maker/uiEditor/projectFiles';
import { openUiEditorConsole } from '../maker/console/cli';

jest.mock('../maker/console/cli', () => ({
  openUiEditorConsole: jest.fn(async (_root, file) => ({
    ok: true,
    file,
    url: 'http://127.0.0.1:1234/',
  })),
}));

describe('Maker UI document CLI', () => {
  let root: string;
  const file = 'assets/ui/main.ui.json';
  const initial: UiNode = {
    type: 'Panel',
    id: 'screen',
    width: 882,
    height: 1568,
    children: [
      {
        type: 'Panel',
        id: 'group',
        position: 'absolute',
        left: 20,
        top: 40,
        children: [{ type: 'Label', id: 'title', text: 'Before', left: 5, right: 8 }],
      },
      { type: 'Button', id: 'buy', text: 'Buy' },
    ],
  };
  const read = () => fs.readFileSync(path.join(root, file), 'utf8');
  const batch = (...operations: unknown[]) => ({ operations });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-cli-'));
    fs.mkdirSync(path.join(root, '.maker-mcp'));
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: 'ui-cli-test' })
    );
    fs.mkdirSync(path.join(root, 'assets/ui'), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(initial));
    process.exitCode = 0;
    jest.clearAllMocks();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  test('reads saved nodes by ID or child pointer with a document-wide revision', async () => {
    const full = await inspectUiDocument(root, file);
    const byId = await inspectUiDocument(root, file, { id: 'title' });
    const byPointer = await inspectUiDocument(root, file, { pointer: '/children/0/children/0' });
    expect(byId.revision).toBe(full.revision);
    expect(byId.selected).toEqual(byPointer.selected);
    expect(byId.selected.node.text).toBe('Before');
    expect(full.source).toBe('saved');
    await expect(inspectUiDocument(root, file, { pointer: '/__proto__' })).rejects.toThrow(
      'pointer'
    );
    await expect(inspectUiDocument(root, file, { id: 'title', pointer: '' })).rejects.toThrow(
      '同时'
    );
  });

  test('adds, edits, reparents, orders and removes nodes in one atomic batch', async () => {
    const snapshot = await inspectUiDocument(root, file);
    const result = await patchUiDocument(
      root,
      file,
      snapshot.revision,
      batch(
        { op: 'set', id: 'title', props: { text: 'After', left: 30 }, unset: ['right'] },
        { op: 'add', parentId: 'group', node: { type: 'Label', id: 'added', text: 'New' } },
        { op: 'move', id: 'title', parentId: 'screen', index: 1 },
        { op: 'remove', id: 'buy' }
      )
    );
    expect(result).toMatchObject({ ok: true, written: true, check: { errors: 0 } });
    expect(result.revision).not.toBe(snapshot.revision);
    const tree = JSON.parse(read());
    expect(tree.children.map((node: UiNode) => node.id)).toEqual(['group', 'title']);
    expect(tree.children[0].children[0].id).toBe('added');
    expect(tree.children[1]).toMatchObject({ text: 'After', left: 30 });
    expect(tree.children[1].right).toBeUndefined();
    expect(fs.readdirSync(path.join(root, 'assets/ui'))).toEqual(['main.ui.json']);
  });

  test('dry-run checks proposed output without creating directories or modifying bytes', async () => {
    const snapshot = await inspectUiDocument(root, file);
    const result = await patchUiDocument(
      root,
      file,
      snapshot.revision,
      batch({ op: 'set', id: 'title', props: { text: 'Dry' } }),
      true
    );
    expect(result).toMatchObject({
      ok: true,
      written: false,
      revision: snapshot.revision,
      dryRun: true,
    });
    expect(read()).toBe(snapshot.text);
    const created = await createUiDocument(root, 'assets/new/deep/screen.ui.json', initial, true);
    expect(created).toMatchObject({ written: false, revision: null });
    expect(fs.existsSync(path.join(root, 'assets/new'))).toBe(false);
    await expect(createUiDocument(root, '../outside.ui.json', initial, true)).rejects.toThrow();
    await expect(createUiDocument(root, file, initial, true)).rejects.toMatchObject({
      status: 409,
    });
  });

  test('stale CLI and browser saves cannot overwrite each other', async () => {
    const snapshot = await inspectUiDocument(root, file);
    await patchUiDocument(
      root,
      file,
      snapshot.revision,
      batch({ op: 'set', id: 'title', props: { text: 'CLI' } })
    );
    const cliText = read();
    await expect(
      saveUiFile(root, { path: file, expectedText: snapshot.text, content: snapshot.text })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      patchUiDocument(root, file, snapshot.revision, batch({ op: 'remove', id: 'buy' }))
    ).rejects.toMatchObject({ status: 409 });
    expect(read()).toBe(cliText);
    const fresh = await inspectUiDocument(root, file);
    await saveUiFile(root, { path: file, expectedText: fresh.text, content: snapshot.text });
    await expect(
      patchUiDocument(root, file, fresh.revision, batch({ op: 'remove', id: 'buy' }))
    ).rejects.toMatchObject({ status: 409 });
    expect(read()).toBe(snapshot.text);
  });

  test('concurrent patches with one revision have one winner', async () => {
    const snapshot = await inspectUiDocument(root, file);
    const results = await Promise.allSettled(
      ['A', 'B'].map((text) =>
        patchUiDocument(
          root,
          file,
          snapshot.revision,
          batch({ op: 'set', id: 'title', props: { text } })
        )
      )
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(['A', 'B']).toContain(JSON.parse(read()).children[0].children[0].text);
  });

  test('concurrent creates never overwrite the winner and no-op patches retain bytes', async () => {
    const newFile = 'assets/ui/race/new.ui.json';
    const results = await Promise.allSettled(
      ['first', 'second'].map((id) => createUiDocument(root, newFile, { type: 'Panel', id }))
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, 'assets/ui/race'))).toEqual(['new.ui.json']);
    const snapshot = await inspectUiDocument(root, file);
    expect(
      await patchUiDocument(
        root,
        file,
        snapshot.revision,
        batch({ op: 'set', id: 'title', props: { text: 'Before' } })
      )
    ).toMatchObject({ ok: true, written: false, revision: snapshot.revision });
    expect(read()).toBe(snapshot.text);
  });

  test('a bad final operation leaves the entire document unchanged', async () => {
    const snapshot = await inspectUiDocument(root, file);
    await expect(
      patchUiDocument(
        root,
        file,
        snapshot.revision,
        batch(
          { op: 'set', id: 'title', props: { text: 'Must not persist' } },
          { op: 'remove', id: 'missing' }
        )
      )
    ).rejects.toThrow('找不到');
    expect(read()).toBe(snapshot.text);
    const duplicate = await patchUiDocument(
      root,
      file,
      snapshot.revision,
      batch({ op: 'set', id: 'title', props: { id: 'buy' } })
    );
    expect(duplicate).toMatchObject({ ok: false, written: false });
    expect(duplicate.check.diagnostics.some((item) => item.code === 'UI_DUPLICATE_ID')).toBe(true);
    expect(read()).toBe(snapshot.text);
  });

  test('rejects cyclic moves, root deletion, ambiguous IDs and structural property patches', () => {
    for (const operation of [
      { op: 'move', id: 'group', parentId: 'title' },
      { op: 'remove', id: 'screen' },
      { op: 'set', id: 'title', props: { children: [] } },
      { op: 'set', id: 'title', props: { _layout: {} } },
      { op: 'add', node: { type: 'Label' }, index: -1 },
      { op: 'move', id: 'buy', index: 99 },
      { op: 'remove', id: 'buy', typo: true },
    ])
      expect(() => applyUiOperations(initial, batch(operation))).toThrow();
    const poison = JSON.parse(
      '{"operations":[{"op":"set","id":"title","props":{"__proto__":{"polluted":true}}}]}'
    );
    expect(() => applyUiOperations(initial, poison)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const duplicates = {
      type: 'Panel',
      children: [
        { type: 'Label', id: 'x' },
        { type: 'Label', id: 'x' },
      ],
    };
    expect(() => applyUiOperations(duplicates, batch({ op: 'remove', id: 'x' }))).toThrow('不唯一');
    const repaired = applyUiOperations(
      duplicates,
      batch({ op: 'set', pointer: '/children/1', props: { id: 'y' } })
    );
    expect(repaired.children![1].id).toBe('y');
  });

  test('missing normal and pressed textures block writing', async () => {
    const snapshot = await inspectUiDocument(root, file);
    const result = await patchUiDocument(
      root,
      file,
      snapshot.revision,
      batch({
        op: 'set',
        id: 'buy',
        props: {
          backgroundImage: 'image/missing.png',
          pressedBackgroundImage: 'image/missing-pressed.png',
        },
      })
    );
    expect(result).toMatchObject({ ok: false, written: false });
    expect(
      result.check.diagnostics.filter((item) => item.code === 'UI_RESOURCE_MISSING')
    ).toHaveLength(2);
    expect(read()).toBe(snapshot.text);
  });

  test('checks retain custom node warnings without rejecting valid engine declarations', async () => {
    const report = await checkUiDocument(root, file, { type: 'CustomWidget', id: 'custom' });
    expect(report.errors).toBe(0);
    expect(report.diagnostics.some((item) => item.code === 'UI_PREVIEW_TYPE')).toBe(true);
  });

  test('creates atomically in new directories and never replaces a document', async () => {
    const newFile = 'assets/ui/new/screen.ui.json';
    const created = await createUiDocument(root, newFile, initial);
    expect(created).toMatchObject({ ok: true, written: true });
    expect((await inspectUiDocument(root, newFile)).revision).toBe(created.revision);
    await expect(createUiDocument(root, newFile, { type: 'Panel' })).rejects.toMatchObject({
      status: 409,
    });
    expect(JSON.parse(fs.readFileSync(path.join(root, newFile), 'utf8'))).toEqual(initial);
    expect(fs.readdirSync(path.dirname(path.join(root, newFile)))).toEqual(['screen.ui.json']);
  });

  test('rejects traversal and symlink reads, creates, edits and resource bindings', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-other-'));
    try {
      fs.writeFileSync(path.join(other, 'foreign.ui.json'), JSON.stringify(initial));
      fs.symlinkSync(other, path.join(root, 'assets/linked'), 'junction');
      for (const name of ['assets/../foreign.ui.json', 'assets/linked/foreign.ui.json'])
        await expect(inspectUiDocument(root, name)).rejects.toThrow();
      await expect(createUiDocument(root, 'assets/linked/new.ui.json', initial)).rejects.toThrow();
      await expect(
        createUiDocument(root, 'assets/linked/new.ui.json', initial, true)
      ).rejects.toThrow();
      const report = await checkUiDocument(root, file, {
        type: 'Panel',
        backgroundImage: 'linked/foreign.ui.json',
      });
      expect(report.errors).toBe(1);
      expect(fs.readdirSync(other)).toEqual(['foreign.ui.json']);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  async function cli(action: string, options: Record<string, string | boolean> = {}) {
    const output: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    try {
      await runUiCli(action, { json: true, ...options });
    } finally {
      spy.mockRestore();
    }
    return JSON.parse(output.join(''));
  }

  test('CLI discovers saved documents, accepts input files and returns structured results', async () => {
    expect((await cli('capabilities')).commands).toContain('patch');
    expect((await cli('list', { target_dir: root })).documents).toEqual([
      { file, name: 'main.ui.json', hasMeta: false },
    ]);
    const snapshot = await cli('inspect', { target_dir: root, file, id: 'title' });
    expect(snapshot.node.text).toBe('Before');
    const input = path.join(root, 'patch.json');
    fs.writeFileSync(
      input,
      JSON.stringify(batch({ op: 'set', id: 'title', props: { text: 'From CLI' } }))
    );
    expect(
      await cli('patch', { target_dir: root, file, revision: snapshot.revision, input_file: input })
    ).toMatchObject({ ok: true, written: true });
    expect(await cli('check', { target_dir: root, file })).toMatchObject({
      ok: true,
      check: { errors: 0 },
    });
    expect(await cli('open', { target_dir: root, file, no_open: true })).toMatchObject({
      ok: true,
      file,
    });
    expect(openUiEditorConsole).toHaveBeenCalledWith(fs.realpathSync(root), file, true);
  });

  test('CLI rejects missing targets, invalid options and stale revisions with nonzero exit status', async () => {
    for (const [action, options] of [
      ['list', {}],
      ['check', { target_dir: root }],
      ['patch', { target_dir: root, file, input: '{}' }],
      ['inspect', { target_dir: root, file, typo: true }],
      ['inspect', { target_dir: root, file, id: true }],
      [
        'create',
        { target_dir: root, file: 'assets/ui/new.ui.json', input: '{}', dry_run: 'false' },
      ],
    ] as [string, Record<string, string | boolean>][]) {
      expect(await cli(action, options)).toMatchObject({ ok: false });
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    }
    const snapshot = await cli('inspect', { target_dir: root, file });
    fs.appendFileSync(path.join(root, file), ' ');
    expect(
      await cli('patch', {
        target_dir: root,
        file,
        revision: snapshot.revision,
        input: JSON.stringify(batch({ op: 'remove', id: 'buy' })),
      })
    ).toMatchObject({ ok: false, status: 409 });
    expect(process.exitCode).toBe(1);
  });
});
