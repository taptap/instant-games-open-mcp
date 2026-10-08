import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { CanvasStoreError, createId, emptyDocument } from '../model.js';
import type { SequenceSettings } from '../sequenceModel.js';
import { snapshotCanvasSource } from '../dependencies.js';

function project(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  return fs.realpathSync(root);
}

function gitignore(root: string): void {
  execFileSync('git', ['init'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
}

describe('Maker canvas files', () => {
  test.each(['image', 'video'] as const)(
    'round trips %s draft parameters without inventing a result',
    async (type) => {
      const root = project('maker-canvas-draft-');
      try {
        gitignore(root);
        const files = new MakerCanvasFiles(root);
        const document = await files.create();
        const draft = {
          operation: 'generate' as const,
          prompt: 'new prompt',
          parameters:
            type === 'image'
              ? { model: 'gpt', resolution: '2K' }
              : { model: '2.5', duration: 8, mode: 'first_frame' as const },
        };
        document.nodes.push({
          id: createId(),
          type,
          title: 'draft',
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          generationDraft: draft,
        });
        await files.save(document.id, document, document.revision);
        const saved = (await files.load(document.id)).nodes[0];
        expect(saved.generationDraft).toEqual(draft);
        expect(saved.generation).toBeUndefined();
        expect(saved.assetPath).toBeUndefined();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
  test('persists deleted generation IDs and rejects invalid deletion markers', async () => {
    const root = project('maker-canvas-deletions-');
    try {
      gitignore(root);
      const files = new MakerCanvasFiles(root);
      const document = await files.create();
      const attemptId = createId();
      const saved = await files.save(
        document.id,
        { ...document, deletedGenerationIds: [attemptId] },
        document.revision
      );
      expect((await files.load(document.id)).deletedGenerationIds).toEqual([attemptId]);
      await expect(
        files.save(saved.id, { ...saved, deletedGenerationIds: ['bad-id'] }, saved.revision)
      ).rejects.toThrow('已删除生成记录');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([undefined, 'empty'] as const)(
    'creates a truly empty canvas with template %s',
    async (template) => {
      const root = project('maker-canvas-empty-template-');
      gitignore(root);
      const files = new MakerCanvasFiles(root);
      const created = await files.create('空白画布', template);
      expect(created.title).toBe('空白画布');
      expect(created.nodes).toEqual([]);
      expect(fs.existsSync(path.join(root, 'assets', 'image'))).toBe(false);
    }
  );

  test('does not fake a sequence template when the project has no saved sequence example', async () => {
    const root = project('maker-canvas-sequence-template-missing-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    await expect(files.create('序列帧模板画布', 'sequence')).rejects.toMatchObject({
      code: 'TEMPLATE_UNAVAILABLE',
    });
  });

  test('copies only one complete sequence demo from a canvas with multiple flows', async () => {
    const root = project('maker-canvas-sequence-template-one-demo-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    let source = await files.create('多个流程');
    const videoBytes = Buffer.alloc(16);
    videoBytes.write('ftyp', 4, 'ascii');
    videoBytes.write('isom', 8, 'ascii');
    const firstVideo = await files.importVideo(source.id, videoBytes, 'video/mp4');
    const secondVideo = await files.importVideo(source.id, videoBytes, 'video/mp4');
    const settings: SequenceSettings = {
      start: 0,
      end: 3,
      fps: 4,
      cutout: true,
      backgroundColor: '#ff00ff',
      tolerance: 24,
      duplicateThreshold: 0.985,
      width: 256,
      height: 256,
      fit: 'contain',
      pixel: false,
    };
    const firstVideoId = createId();
    const secondVideoId = createId();
    const firstSequenceId = createId();
    const secondSequenceId = createId();
    source = await files.save(
      source.id,
      {
        ...source,
        nodes: [
          {
            id: firstVideoId,
            type: 'video-source',
            title: '攻击视频',
            x: 0,
            y: 0,
            width: 240,
            height: 210,
            assetPath: firstVideo.relativePath,
          },
          {
            id: firstSequenceId,
            type: 'sequence',
            title: '攻击序列帧',
            x: 300,
            y: 0,
            width: 480,
            height: 300,
            sourceVideoId: firstVideoId,
            sequenceSettings: settings,
          },
          {
            id: secondVideoId,
            type: 'video-source',
            title: '跑步视频',
            x: 0,
            y: 400,
            width: 240,
            height: 210,
            assetPath: secondVideo.relativePath,
          },
          {
            id: secondSequenceId,
            type: 'sequence',
            title: '跑步序列帧',
            x: 300,
            y: 400,
            width: 480,
            height: 300,
            sourceVideoId: secondVideoId,
            sequenceSettings: settings,
          },
        ],
        edges: [
          { id: createId(), from: firstVideoId, to: firstSequenceId, kind: 'sequence-source' },
          { id: createId(), from: secondVideoId, to: secondSequenceId, kind: 'sequence-source' },
        ],
      },
      source.revision
    );

    const template = await files.create('单个序列帧 Demo', 'sequence');
    expect(template.nodes.filter((node) => node.type === 'sequence')).toHaveLength(1);
    expect(template.nodes.filter((node) => node.type === 'video-source')).toHaveLength(1);
    expect(template.edges).toHaveLength(1);
    expect(template.nodes.map((node) => node.title)).toEqual(['攻击视频', '攻击序列帧']);
    expect(
      template.nodes.every((node) => !source.nodes.some((sourceNode) => sourceNode.id === node.id))
    ).toBe(true);
  });

  test('persists reusable template progress and rejects broken flow references', async () => {
    const root = project('maker-template-progress-');
    try {
      gitignore(root);
      const files = new MakerCanvasFiles(root);
      let source = await files.create('首图模板', 'starter');
      const bytes = Buffer.alloc(16);
      bytes.write('ftyp', 4, 'ascii');
      bytes.write('isom', 8, 'ascii');
      const video = await files.importVideo(source.id, bytes, 'video/mp4');
      const image = source.nodes[0];
      const videoId = createId();
      const sequenceId = createId();
      source = await files.save(
        source.id,
        {
          ...source,
          nodes: [
            image,
            {
              id: videoId,
              type: 'video-source',
              title: '示例视频',
              x: 400,
              y: 0,
              width: 300,
              height: 240,
              assetPath: video.relativePath,
              generation: { sourceImageId: image.id, prompt: '挥剑' },
            },
            {
              id: sequenceId,
              type: 'sequence',
              title: '序列帧',
              x: 800,
              y: 0,
              width: 480,
              height: 300,
              sourceVideoId: videoId,
              sequenceSettings: {
                start: 0,
                end: 3,
                fps: 4,
                cutout: true,
                backgroundColor: '#ff00ff',
                tolerance: 24,
                duplicateThreshold: 0.985,
                width: 256,
                height: 256,
                fit: 'contain',
                pixel: false,
              },
            },
          ],
          edges: [
            { id: createId(), from: image.id, to: videoId, kind: 'image-to-video' },
            { id: createId(), from: videoId, to: sequenceId, kind: 'sequence-source' },
          ],
        },
        source.revision
      );
      const copied = await files.create('复用', 'sequence');
      expect(copied.templateFlow?.stage).toBe('image');
      expect(copied.templateFlow?.imageId).not.toBe(image.id);
      const saved = await files.save(
        copied.id,
        { ...copied, templateFlow: { ...copied.templateFlow!, stage: 'ready' } },
        copied.revision
      );
      expect((await files.load(saved.id)).templateFlow?.stage).toBe('ready');
      await expect(
        files.save(
          saved.id,
          { ...saved, templateFlow: { ...saved.templateFlow!, videoId: 'missing' } },
          saved.revision
        )
      ).rejects.toThrow('模板流程');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('creates three persisted local example images only in the initial revision', async () => {
    const root = project('maker-canvas-starter-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    expect(await files.list()).toEqual([]);
    expect(emptyDocument().nodes).toEqual([]);
    const created = await files.create(undefined, 'starter');
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
    await expect(new MakerCanvasFiles(root).create(undefined, 'starter')).rejects.toThrow();
    expect(fs.readdirSync(path.join(root, 'assets', 'image'))).toEqual([]);
  });

  test('does not reseed cleared or legacy empty documents on list, load or save', async () => {
    const root = project('maker-canvas-cleared-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create(undefined, 'starter');
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

  test('persists sections and image derivation edges without changing asset ownership', async () => {
    const root = project('maker-canvas-structure-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create(undefined, 'starter');
    const sectionId = createId();
    const resultId = createId();
    const section = {
      id: sectionId,
      type: 'section' as const,
      x: -20,
      y: -20,
      width: 700,
      height: 460,
      title: '角色迭代',
    };
    const result = {
      ...created.nodes[0],
      id: resultId,
      x: 260,
      title: '变体结果',
      sectionId,
      generation: {
        prompt: '保留角色并升级装备',
        operation: 'variant' as const,
        sourceImageId: created.nodes[0].id,
        sourceImageIds: [created.nodes[0].id],
      },
      sourceSnapshot: snapshotCanvasSource(created.nodes[0]),
    };
    const saved = await files.save(
      created.id,
      {
        ...created,
        nodes: [section, created.nodes[0], result],
        edges: [
          {
            id: createId(),
            from: created.nodes[0].id,
            to: resultId,
            kind: 'image-variant' as const,
          },
        ],
      },
      created.revision
    );
    expect((await files.load(saved.id)).nodes).toEqual(saved.nodes);
    expect((await files.load(saved.id)).edges).toEqual(saved.edges);
  });

  test('persists an image generation slot and validates its saved source', async () => {
    const root = project('maker-canvas-generation-slot-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const created = await files.create(undefined, 'starter');
    const source = created.nodes[0];
    const slot = {
      id: createId(),
      type: 'image' as const,
      x: source.x + source.width + 48,
      y: source.y,
      width: 260,
      height: 220,
      title: '图片变体 · 待生成',
      generationDraft: {
        operation: 'variant' as const,
        sourceImageId: source.id,
        prompt: '角色向右挥剑，保留完整武器和身体',
      },
    };
    const saved = await files.save(
      created.id,
      { ...created, nodes: [...created.nodes, slot] },
      created.revision
    );
    expect((await files.load(saved.id)).nodes.at(-1)).toEqual(slot);
    await expect(
      files.save(
        created.id,
        {
          ...created,
          nodes: [
            ...created.nodes,
            {
              ...slot,
              generationDraft: { operation: 'variant' as const, sourceImageId: createId() },
            },
          ],
        },
        saved.revision
      )
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
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

  test('preserves explicit chroma mode and keeps legacy mode absent', async () => {
    const root = project('maker-canvas-mode-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    let canvas = await files.create();
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4, 'ascii');
    bytes.write('isom', 8, 'ascii');
    const media = await files.importVideo(canvas.id, bytes, 'video/mp4');
    const videoId = createId();
    const sequenceId = createId();
    const settings: SequenceSettings = {
      start: 0,
      end: 3,
      fps: 4,
      cutout: true,
      backgroundColor: '#ff00ff',
      tolerance: 24,
      duplicateThreshold: 0.985,
      width: 256,
      height: 256,
      fit: 'contain',
      pixel: false,
    };
    canvas.nodes = [
      {
        id: videoId,
        type: 'video-source',
        title: 'video',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        assetPath: media.relativePath,
      },
      {
        id: sequenceId,
        type: 'sequence',
        title: 'sequence',
        x: 300,
        y: 0,
        width: 480,
        height: 300,
        sourceVideoId: videoId,
        sequenceSettings: settings,
      },
    ];
    canvas.edges = [{ id: createId(), from: videoId, to: sequenceId, kind: 'sequence-source' }];
    canvas = await files.save(canvas.id, canvas, canvas.revision);
    expect(canvas.nodes[1].sequenceSettings?.cutoutMode).toBeUndefined();
    canvas.nodes[1].sequenceSettings!.cutoutMode = 'chroma';
    canvas = await files.save(canvas.id, canvas, canvas.revision);
    expect((await files.load(canvas.id)).nodes[1].sequenceSettings?.cutoutMode).toBe('chroma');
    await expect(
      files.save(
        canvas.id,
        {
          ...canvas,
          nodes: canvas.nodes.map((node) =>
            node.type === 'sequence'
              ? { ...node, sequenceSettings: { ...node.sequenceSettings, cutoutMode: 'invalid' } }
              : node
          ),
        },
        canvas.revision
      )
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
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

  test('keeps image references at 14 and allows a video card to save 30', async () => {
    const root = project('maker-canvas-refs-');
    gitignore(root);
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
    const image = await files.importImage(png);
    const videoBytes = Buffer.alloc(16);
    videoBytes.write('ftyp', 4, 'ascii');
    videoBytes.write('isom', 8, 'ascii');
    const video = await files.importVideo(canvas.id, videoBytes, 'video/mp4');
    const references = (count: number) => Array.from({ length: count }, () => image.relativePath);
    const card = (type: 'image' | 'video-source', count: number, assetPath: string) => ({
      id: createId(),
      type,
      title: type,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      assetPath,
      generation: { prompt: '参考图', referenceImagePaths: references(count) },
    });
    const fifteen = await files.save(
      canvas.id,
      { ...canvas, nodes: [card('video-source', 15, video.relativePath)] },
      canvas.revision
    );
    expect(fifteen.nodes[0].generation?.referenceImagePaths).toHaveLength(15);
    const thirty = await files.save(
      fifteen.id,
      { ...fifteen, nodes: [card('video-source', 30, video.relativePath)] },
      fifteen.revision
    );
    expect(thirty.nodes[0].generation?.referenceImagePaths).toHaveLength(30);
    await expect(
      files.save(
        thirty.id,
        { ...thirty, nodes: [card('video-source', 31, video.relativePath)] },
        thirty.revision
      )
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH', message: '参考图片路径无效。' });
    await expect(
      files.save(
        thirty.id,
        { ...thirty, nodes: [card('image', 15, image.relativePath)] },
        thirty.revision
      )
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH', message: '参考图片路径无效。' });
    const imageCard = await files.save(
      thirty.id,
      { ...thirty, nodes: [card('image', 14, image.relativePath)] },
      thirty.revision
    );
    expect(imageCard.nodes[0].generation?.referenceImagePaths).toHaveLength(14);
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
