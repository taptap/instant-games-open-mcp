import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { CanvasStoreError, createId, emptyDocument } from '../model.js';

function project(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  return fs.realpathSync(root);
}

function gitignore(root: string): void {
  execFileSync('git', ['init'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
}

describe('Maker canvas files', () => {
  test('creates three persisted local example images only in the initial revision', async () => {
    const root = project('maker-canvas-starter-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    expect(await files.list()).toEqual([]);
    expect(emptyDocument().nodes).toEqual([]);
    const created = await files.create();
    expect(created.revision).toBe(0);
    expect(created.nodes).toHaveLength(3);
    expect(new Set(created.nodes.map((node) => node.id)).size).toBe(3);
    expect(created.nodes.map((node) => node.title)).toEqual([
      '示例图片 01',
      '示例图片 02',
      '示例图片 03',
    ]);
    expect(created.nodes.every((node) => node.type === 'image' && node.assetPath)).toBe(true);
    for (const node of created.nodes) {
      const media = files.readMedia(node.assetPath!);
      expect(media.type).toBe('image/jpeg');
      expect(fs.readFileSync(media.file).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
    }
    expect(created.edges).toEqual([]);
    const file = path.join(root, '.maker', 'canvases', `${created.id}.json`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(created);
    const restarted = new MakerCanvasFiles(root);
    await restarted.list();
    expect(await restarted.load(created.id)).toEqual(created);
    const saved = await restarted.save(created.id, created, 0);
    expect(saved.nodes).toEqual(created.nodes);
    expect(saved.revision).toBe(1);
    expect(fs.readdirSync(path.join(root, 'assets', 'image'))).toHaveLength(3);
  });

  test('removes newly seeded images if creating the document fails', async () => {
    const root = project('maker-canvas-seed-failure-');
    gitignore(root);
    fs.mkdirSync(path.join(root, '.maker'));
    fs.writeFileSync(path.join(root, '.maker', 'canvases'), 'not a directory');
    await expect(new MakerCanvasFiles(root).create()).rejects.toThrow();
    expect(fs.readdirSync(path.join(root, 'assets', 'image'))).toEqual([]);
  });

  test('does not reseed cleared or legacy empty documents on list, load or save', async () => {
    const root = project('maker-canvas-cleared-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create();
    const cleared = await files.save(created.id, { ...created, nodes: [] }, 0);
    const legacy = emptyDocument('旧空画布');
    fs.writeFileSync(
      path.join(root, '.maker', 'canvases', `${legacy.id}.json`),
      JSON.stringify(legacy)
    );
    const restarted = new MakerCanvasFiles(root);
    expect(await restarted.list()).toHaveLength(2);
    for (const document of [cleared, legacy]) {
      expect(await restarted.load(document.id)).toEqual(document);
      const saved = await restarted.save(document.id, document, document.revision);
      expect(saved.nodes).toEqual([]);
      expect((await new MakerCanvasFiles(root).load(document.id)).nodes).toEqual([]);
    }
  });

  test('leaves existing user canvas bytes unchanged when creating another canvas', async () => {
    const root = project('maker-canvas-existing-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create();
    const user = await files.save(
      created.id,
      {
        ...created,
        nodes: [
          {
            id: createId(),
            type: 'note',
            title: '我的计划',
            text: '保留内容',
            x: 19,
            y: 27,
            width: 240,
            height: 180,
          },
        ],
      },
      0
    );
    const file = path.join(root, '.maker', 'canvases', `${user.id}.json`);
    const before = fs.readFileSync(file, 'utf8');
    const restarted = new MakerCanvasFiles(root);
    await restarted.list();
    expect(await restarted.load(user.id)).toEqual(user);
    await restarted.create('另一张画布');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  test('rejects a git repo until .maker is ignored and does not edit gitignore', async () => {
    const root = project('maker-canvas-git-');
    execFileSync('git', ['init'], { cwd: root });
    const files = new MakerCanvasFiles(root);
    await expect(files.create('画布')).rejects.toMatchObject({ code: 'GITIGNORE_REQUIRED' });
    expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.maker'))).toBe(false);
  });

  test('imports a validated video into the current canvas private directory', async () => {
    const root = project('maker-canvas-video-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const document = await files.create();
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4, 'ascii');
    bytes.write('isom', 8, 'ascii');
    const saved = await files.importVideo(document.id, bytes, 'video/mp4');
    expect(saved.relativePath.startsWith('.maker/canvases/' + document.id + '/videos/video-')).toBe(
      true
    );
    expect(saved.relativePath.endsWith('.mp4')).toBe(true);
    const media = files.readMedia(saved.relativePath);
    expect(fs.readFileSync(media.file)).toEqual(bytes);
    expect(media.type).toBe('video/mp4');
    await expect(
      files.importVideo(document.id, Buffer.alloc(16), 'video/mp4')
    ).rejects.toMatchObject({ code: 'INVALID_VIDEO' });
  });

  test('allows imported assets when canvas metadata is not git-ignored', async () => {
    const root = project('maker-canvas-assets-visible-');
    execFileSync('git', ['init'], { cwd: root });
    const files = new MakerCanvasFiles(root);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
    const imported = await files.importImage(png);
    expect(files.readMedia(imported.relativePath).file).toBe(
      path.join(root, imported.relativePath)
    );
    expect(
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    ).toContain('?? assets/');
    expect(fs.existsSync(path.join(root, '.maker'))).toBe(false);
  });

  test('stores video sources under the ignored project canvas folder and serves their MIME type', async () => {
    const root = project('maker-canvas-video-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create();
    const mp4 = Buffer.alloc(16);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('isom', 8, 'ascii');
    const imported = await files.importVideo(canvas.id, mp4, 'video/mp4');
    expect(imported.relativePath).toMatch(
      /^\.maker\/canvases\/[0-9a-f-]+\/videos\/video-[0-9a-f-]+\.mp4$/i
    );
    expect(files.readMedia(imported.relativePath).type).toBe('video/mp4');
    expect(
      execFileSync('git', ['check-ignore', '-q', '--', imported.relativePath], { cwd: root })
    ).toBeDefined();
  });

  test('saves each canvas independently and conflicts without overwriting', async () => {
    const root = project('maker-canvas-save-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const first = await files.create('一');
    const second = await files.create('二');
    const saved = await files.save(first.id, { ...first, title: '一改' }, first.revision);
    expect(saved.revision).toBe(1);
    expect((await files.load(second.id)).title).toBe('二');
    await expect(
      files.save(first.id, { ...first, title: '旧稿' }, first.revision)
    ).rejects.toBeInstanceOf(CanvasStoreError);
    expect((await files.load(first.id)).title).toBe('一改');
  });

  test('rejects duplicate node ids and malformed edge ids', async () => {
    const root = project('maker-canvas-identities-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create();
    await expect(
      files.save(
        created.id,
        {
          ...created,
          nodes: [...created.nodes, { ...created.nodes[0] }],
        },
        created.revision
      )
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
    const imageId = createId();
    const videoId = createId();
    await expect(
      files.save(
        created.id,
        {
          ...created,
          nodes: [
            {
              id: imageId,
              type: 'image',
              x: 0,
              y: 0,
              width: 180,
              height: 120,
              title: '图片',
              assetPath: 'assets/image/canvas-00000000-0000-4000-8000-000000000000.png',
            },
            {
              id: videoId,
              type: 'video',
              x: 220,
              y: 0,
              width: 220,
              height: 150,
              title: '视频输入',
            },
          ],
          edges: [{ id: 'bad-id', from: imageId, to: videoId, kind: 'first-frame' }],
        },
        created.revision
      )
    ).rejects.toMatchObject({ code: 'INVALID_EDGE' });
  });

  test('restores the active canvas independently from canvas document ordering', async () => {
    const root = project('maker-canvas-active-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const first = await files.create('一');
    const second = await files.create('二');
    await files.setActiveCanvasId(second.id);
    const restarted = new MakerCanvasFiles(root);
    expect(await restarted.getActiveCanvasId()).toBe(second.id);
    expect((await restarted.list()).map((item) => item.id)).toContain(first.id);
    expect((await restarted.list()).map((item) => item.id)).toContain(second.id);
  });

  test('imports an image inside the project and rejects symlink escape', async () => {
    const root = project('maker-canvas-img-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
    const imported = await files.importImage(png);
    expect(imported.relativePath.startsWith('assets/image/canvas-')).toBe(true);
    const media = files.readMedia(imported.relativePath);
    expect(media.file.startsWith(root)).toBe(true);
    expect(() => files.readMedia('../outside.png')).toThrow(CanvasStoreError);
    const link = path.join(root, 'assets', 'image', 'linked');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(os.tmpdir(), path.join(root, '.maker'));
    await expect(files.create('链接')).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });
});
