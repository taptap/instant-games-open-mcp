import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { CanvasNode } from '../../canvas/model.js';

jest.mock('../../server/mcp.js', () => ({
  ...jest.requireActual('../../server/mcp.js'),
  callRemoteProxyTool: jest.fn(),
}));

import { callRemoteProxyTool } from '../../server/mcp.js';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { createId } from '../../canvas/model.js';
import { CanvasGenerationService } from '../canvasGeneration.js';
import { RemoteProxyToolResultError, RemoteProxyToolCallError } from '../../server/proxyAssets.js';

const callRemoteProxyToolMock = jest.mocked(callRemoteProxyTool);

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-canvas-generation-'));
  execFileSync('git', ['init'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.maker\n');
  return root;
}

function successfulImageResult(): any {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ localPath: 'assets/image/generated.png' }),
      },
    ],
  };
}

describe('CanvasGenerationService', () => {
  let root: string;
  let originalMakerHome: string | undefined;

  beforeEach(() => {
    root = project();
    originalMakerHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(root, 'maker-home');
    callRemoteProxyToolMock.mockReset();
    fs.writeFileSync(path.join(root, 'placeholder'), '');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
    if (originalMakerHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = originalMakerHome;
  });

  test('source sizing uses original pixels across intermediates and sends dimensions for every reference', async () => {
    const files = new MakerCanvasFiles(root);
    let doc = await files.create('landscape', 'empty');
    const png = (width: number, height: number) => {
      const data = Buffer.alloc(24);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
      data.write('IHDR', 12);
      data.writeUInt32BE(width, 16);
      data.writeUInt32BE(height, 20);
      return data;
    };
    const first = await files.importImage(png(1920, 1080));
    const second = await files.importImage(png(576, 1024));
    const source = {
      id: createId(),
      type: 'image' as const,
      title: 'original',
      x: 0,
      y: 0,
      width: 200,
      height: 300,
      assetPath: first.relativePath,
    };
    const intermediate: CanvasNode = {
      ...source,
      id: createId(),
      title: 'clean',
      assetPath: second.relativePath,
      generation: { prompt: 'clean', operation: 'variant' as const, sourceImageIds: [source.id] },
    };
    const target = {
      ...source,
      id: createId(),
      title: 'marked',
      generation: {
        prompt: 'keep layout',
        operation: 'variant' as const,
        sourceImageIds: [intermediate.id],
        parameters: { aspectRatio: 'source' },
      },
    };
    doc.nodes = [source, intermediate, target];
    doc.edges = [
      { id: createId(), kind: 'image-variant', from: source.id, to: intermediate.id },
      { id: createId(), kind: 'image-variant', from: intermediate.id, to: target.id },
    ];
    doc = await files.save(doc.id, doc, doc.revision);
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), png(576, 1024));
    callRemoteProxyToolMock.mockResolvedValue(successfulImageResult());
    const service = new CanvasGenerationService(root, {} as any);
    const result = await service.generateImage({
      canvasId: doc.id,
      targetNodeId: target.id,
      prompt: 'keep layout',
      aspectRatio: 'source',
      resolution: '2K',
      sourceImageIds: [intermediate.id],
      sourceImagePaths: [second.relativePath],
    });
    expect(callRemoteProxyToolMock.mock.calls[0][0].args).toMatchObject({
      aspect_ratio: '16:9',
      target_size: '2048x1152',
      prompt: expect.stringContaining('1920×1080'),
    });
    expect(result.referenceImages).toEqual([
      { assetPath: second.relativePath, width: 576, height: 1024 },
    ]);
    expect(result.originalImage).toMatchObject({ width: 1920, height: 1080, nodeId: source.id });
    expect(result.parameters?.aspectRatio).toBe('source');
    expect(result.resultImageInfo).toEqual({ width: 576, height: 1024 });
    expect(result.warnings?.join()).toContain('比例与请求不一致');
    const recognitionId = createId();
    doc.nodes.find((node) => node.id === intermediate.id)!.uiRecognition = {
      enabled: true,
      selectedId: recognitionId,
      results: [
        {
          id: recognitionId,
          model: 'fixture',
          prompt: 'identify',
          createdAt: new Date().toISOString(),
          durationMs: 0,
          sourcePath: second.relativePath,
          sourceSha256: createHash('sha256').update(png(576, 1024)).digest('hex'),
          width: 576,
          height: 1024,
          elements: [
            {
              id: 'B1',
              name: 'button',
              category: 'action',
              rect: [10, 20, 50, 30],
              parentId: null,
              zIndex: 0,
              states: [],
              cutout: true,
            },
          ],
        },
      ],
    };
    doc = await files.save(doc.id, doc, doc.revision);
    const recognized = await service.generateImage({
      canvasId: doc.id,
      targetNodeId: target.id,
      prompt: 'extract B1',
      sourceImageIds: [intermediate.id],
      sourceImagePaths: [second.relativePath],
    });
    expect(recognized.submittedPrompt).toContain('原设计稿实际尺寸：1920×1080');
    expect(recognized.submittedPrompt).toContain('元素清单坐标基准为去文字识别输入图：576×1024');
    expect(recognized.submittedPrompt).not.toContain('原设计稿坐标基准');
    const custom = await files.importImage(png(1700, 1000));
    await expect(
      service.generateImage({
        canvasId: doc.id,
        prompt: 'custom',
        aspectRatio: 'source',
        referenceImagePaths: [custom.relativePath],
      })
    ).rejects.toThrow('尚未提交');
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(2);
  });

  test('paired video gate rejects missing slots, reversed roles and alternate modes before remote calls', async () => {
    const files = new MakerCanvasFiles(root);
    let document = await files.create('首尾帧校验', 'starter');
    const [first, last] = document.nodes;
    const target = {
      id: createId(),
      type: 'video' as const,
      videoInputMode: 'first_last_frame' as const,
      title: '视频',
      x: 600,
      y: 0,
      width: 300,
      height: 300,
    };
    document = await files.save(
      document.id,
      {
        ...document,
        nodes: [...document.nodes, target],
        edges: [
          { id: createId(), from: first.id, to: target.id, kind: 'frame-first' },
          { id: createId(), from: last.id, to: target.id, kind: 'frame-last' },
        ],
      },
      document.revision
    );
    const service = new CanvasGenerationService(root, {} as any);
    const input = {
      canvasId: document.id,
      targetNodeId: target.id,
      prompt: '连续变身',
      sourceImageId: first.id,
      sourceImagePath: first.assetPath!,
      sourceImageIds: [first.id, last.id],
      sourceImagePaths: [first.assetPath!, last.assetPath!],
      mode: 'first_last_frame',
    };
    await expect(service.createVideo({ ...input, mode: 'multi_modal_reference' })).rejects.toThrow(
      '固定'
    );
    await expect(
      service.createVideo({
        ...input,
        sourceImageIds: [last.id, first.id],
        sourceImagePaths: [last.assetPath!, first.assetPath!],
      })
    ).rejects.toThrow('固定');
    expect(callRemoteProxyToolMock).not.toHaveBeenCalled();
    document = await files.save(
      document.id,
      { ...document, edges: document.edges.filter((edge) => edge.kind !== 'frame-first') },
      document.revision
    );
    await expect(service.createVideo(input)).rejects.toThrow('必填');
    expect(callRemoteProxyToolMock).not.toHaveBeenCalled();
  });

  test.each([
    { task_id: 'failed-task', error: '内容校验失败', expected: '内容校验失败' },
    { task_id: 'failed-task', error: { message: '上游生成失败' }, expected: '上游生成失败' },
    { agent_instruction: '任务失败：请调整输入', expected: '任务失败：请调整输入' },
  ])('keeps a terminal video failure instead of displaying pending: %j', async (failure) => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('视频失败状态', 'starter');
    const source = document.nodes[0];
    callRemoteProxyToolMock.mockResolvedValue({
      structuredContent: { ...failure, status: 'failed' },
      content: [],
    } as any);
    const service = new CanvasGenerationService(root, {} as any);
    const attempt = await service.createVideo({
      canvasId: document.id,
      prompt: '游戏角色动作',
      sourceImageId: source.id,
      sourceImagePath: source.assetPath!,
      duration: 4,
    });
    expect(attempt.status).toBe('failed');
    expect(attempt.error).toBe(failure.expected);
    expect(service.list(document.id)[0].status).toBe('failed');
    if (attempt.taskId) {
      const queried = await service.queryVideo(attempt.id, document.id);
      expect(queried.status).toBe('failed');
      expect(queried.error).toBe(failure.expected);
    }
  });

  test.each([undefined, -1, '20', 0, 20.5])(
    'records only returned numeric credits: %s',
    async (credits) => {
      const files = new MakerCanvasFiles(root);
      const document = await files.create('积分记录', 'starter');
      fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('generated'));
      callRemoteProxyToolMock.mockResolvedValue({
        structuredContent: {
          localPath: 'assets/image/generated.png',
          credits,
          estimated_credits: 100,
        },
        content: [],
      } as any);
      const service = new CanvasGenerationService(root, {} as any);
      const attempt = await service.generateImage({ canvasId: document.id, prompt: '游戏角色' });
      expect(attempt.status).toBe('succeeded');
      expect(service.list(document.id)[0].credits).toBe(
        typeof credits === 'number' && credits >= 0 ? credits : undefined
      );
    }
  );

  test('retains returned video credits across completion, reload and queries without credits', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('视频积分记录', 'starter');
    const source = document.nodes[0];
    fs.mkdirSync(path.join(root, 'assets/video'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/video/generated.mp4'), Buffer.from('video'));
    const payload = {
      task_id: 'credits-task',
      status: 'succeeded',
      localPath: 'assets/video/generated.mp4',
    };
    callRemoteProxyToolMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ ...payload, credits: 605 }) }],
    } as any);
    const service = new CanvasGenerationService(root, {} as any);
    const attempt = await service.createVideo({
      canvasId: document.id,
      prompt: '游戏角色动作',
      sourceImageId: source.id,
      sourceImagePath: source.assetPath!,
      duration: 5,
    });
    expect(attempt.status).toBe('succeeded');
    expect(attempt.credits).toBe(605);
    callRemoteProxyToolMock.mockResolvedValue({ structuredContent: payload, content: [] } as any);
    expect((await service.queryVideo(attempt.id, document.id)).credits).toBe(605);
    expect(new CanvasGenerationService(root, {} as any).list(document.id)[0].credits).toBe(605);
    callRemoteProxyToolMock.mockResolvedValue({
      structuredContent: { ...payload, credits: 606 },
      content: [],
    } as any);
    expect((await service.queryVideo(attempt.id, document.id)).credits).toBe(606);
  });

  test('first-last video submits explicit roles and retains both source snapshots through retry', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('首尾帧契约验证', 'starter');
    const sources = document.nodes.slice(0, 2);
    const service = new CanvasGenerationService(root, {} as any);
    callRemoteProxyToolMock
      .mockRejectedValueOnce(
        new RemoteProxyToolCallError(
          'create_video_task',
          'not_executed',
          new Error('explicit failure')
        )
      )
      .mockResolvedValue({
        content: [
          { type: 'text', text: JSON.stringify({ task_id: 'two-frame-task', status: 'pending' }) },
        ],
      } as any);
    const attempt = await service.createVideo({
      canvasId: document.id,
      prompt: '灰狼变身狼王',
      sourceImageId: sources[0].id,
      sourceImagePath: sources[0].assetPath!,
      sourceImageIds: sources.map((node) => node.id),
      sourceImagePaths: sources.map((node) => node.assetPath!),
      mode: 'first_last_frame',
      duration: 5,
    });
    expect(attempt.sourceSnapshots?.map((snapshot) => snapshot.nodeId)).toEqual(
      sources.map((node) => node.id)
    );
    expect(attempt.parameters?.mode).toBe('first_last_frame');
    expect(callRemoteProxyToolMock.mock.calls[0][0].args).toMatchObject({
      mode: 'first_last_frame',
      images: [
        { url: sources[0].assetPath, role: 'first_frame' },
        { url: sources[1].assetPath, role: 'last_frame' },
      ],
    });
    await service.retry(attempt.id, document.id);
    expect(callRemoteProxyToolMock.mock.calls[1][0].args).toMatchObject({
      mode: 'first_last_frame',
      images: [
        { url: sources[0].assetPath, role: 'first_frame' },
        { url: sources[1].assetPath, role: 'last_frame' },
      ],
    });
    await expect(
      service.createVideo({
        canvasId: document.id,
        prompt: '缺少尾帧',
        sourceImageId: sources[0].id,
        sourceImagePath: sources[0].assetPath!,
        mode: 'first_last_frame',
      })
    ).rejects.toThrow('两张');
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(2);
  });

  test('two references do not imply first-last mode, and imported references reach video submission', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('多图参考契约验证', 'starter');
    const [head, reference] = document.nodes;
    callRemoteProxyToolMock.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify({ task_id: 'reference-task', status: 'pending' }) },
      ],
    } as any);
    const attempt = await new CanvasGenerationService(root, {} as any).createVideo({
      canvasId: document.id,
      prompt: '狼王动作',
      sourceImageId: head.id,
      sourceImagePath: head.assetPath!,
      referenceImagePaths: [reference.assetPath!],
    });
    expect(attempt.parameters?.mode).toBe('multi_modal_reference');
    expect(callRemoteProxyToolMock.mock.calls[0][0].args).toMatchObject({
      mode: 'multi_modal_reference',
      images: [
        { url: head.assetPath, role: 'reference_image' },
        { url: reference.assetPath, role: 'reference_image' },
      ],
    });
  });

  test('keeps structured unknown errors and previously mislabeled attempts non-retryable', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('结果未知', 'empty');
    const error = new RemoteProxyToolResultError('generate_image', {
      isError: true,
      content: [{ type: 'text', text: 'execution state is unknown' }],
      structuredContent: { execution_state: 'unknown', automatic_retry: false },
    });
    callRemoteProxyToolMock.mockRejectedValue(error);
    const service = new CanvasGenerationService(root, {} as any);
    const attempt = await service.generateImage({ canvasId: document.id, prompt: '游戏角色' });
    expect(attempt.status).toBe('unknown');
    const filename = path.join(root, '.maker/canvases/attempts', attempt.id + '.json');
    fs.writeFileSync(
      filename,
      JSON.stringify({ ...attempt, status: 'failed', executionState: 'not_executed' })
    );
    expect(service.list(document.id)[0].status).toBe('unknown');
    await expect(service.retry(attempt.id, document.id)).rejects.toThrow();
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('passes imported reference assets without creating or replacing canvas cards, including retry', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('参考图测试', 'empty');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9n0AAAAASUVORK5CYII=',
      'base64'
    );
    const referencePath = (await files.importImage(png)).relativePath;
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('generated'));
    callRemoteProxyToolMock
      .mockRejectedValueOnce(
        new RemoteProxyToolCallError(
          'generate_image',
          'not_executed',
          new Error('temporary failure')
        )
      )
      .mockResolvedValueOnce(successfulImageResult());
    const service = new CanvasGenerationService(root, {} as any);
    const attempt = await service.generateImage({
      canvasId: document.id,
      prompt: '参考配色',
      referenceImagePaths: [referencePath],
    });
    expect(attempt.referenceImagePaths).toEqual([referencePath]);
    const retried = await service.retry(attempt.id);
    expect(retried.status).toBe('succeeded');
    expect(retried.referenceImagePaths).toEqual([referencePath]);
    expect(callRemoteProxyToolMock.mock.calls[1][0].args).toMatchObject({
      reference_images: [referencePath],
    });
    expect((await files.load(document.id)).nodes).toEqual([]);
  });

  test.each(['../outside.png', 'assets/video/input.mp4'])(
    'rejects unsafe or non-image reference assets: %s',
    async (referencePath) => {
      const files = new MakerCanvasFiles(root);
      const document = await files.create('参考图校验', 'empty');
      await expect(
        new CanvasGenerationService(root, {} as any).generateImage({
          canvasId: document.id,
          prompt: '参考图',
          referenceImagePaths: [referencePath],
        })
      ).rejects.toThrow();
      expect(callRemoteProxyToolMock).not.toHaveBeenCalled();
    }
  );

  test('rejects more than 14 reference assets before remote generation', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('参考图上限', 'empty');
    await expect(
      new CanvasGenerationService(root, {} as any).generateImage({
        canvasId: document.id,
        prompt: '参考图',
        referenceImagePaths: Array(15).fill('assets/image/reference.png'),
      })
    ).rejects.toThrow('14');
    expect(callRemoteProxyToolMock).not.toHaveBeenCalled();
  });

  test.each([3, 9, 4.5])(
    'rejects video duration %s before submitting a paid task',
    async (duration) => {
      const files = new MakerCanvasFiles(root);
      const document = await files.create('时长校验', 'starter');
      await expect(
        new CanvasGenerationService(root, {} as any).createVideo({
          canvasId: document.id,
          prompt: '动作',
          sourceImageId: document.nodes[0].id,
          sourceImagePath: document.nodes[0].assetPath!,
          duration,
        })
      ).rejects.toThrow('时长');
      expect(callRemoteProxyToolMock).not.toHaveBeenCalled();
    }
  );

  test.each([4, 5, 6, 7, 8])(
    'accepts video duration %s and retains pending task provenance',
    async (duration) => {
      const files = new MakerCanvasFiles(root);
      const document = await files.create('时长校验', 'starter');
      callRemoteProxyToolMock.mockResolvedValue({
        content: [
          { type: 'text', text: JSON.stringify({ task_id: 'video-task', status: 'pending' }) },
        ],
      });
      const service = new CanvasGenerationService(root, {} as any);
      const attempt = await service.createVideo({
        canvasId: document.id,
        prompt: '动作',
        sourceImageId: document.nodes[0].id,
        sourceImagePath: document.nodes[0].assetPath!,
        duration,
      });
      expect(attempt.status).toBe('pending');
      expect(callRemoteProxyToolMock.mock.calls[0][0].args).toMatchObject({ duration });
      callRemoteProxyToolMock.mockRejectedValue(new Error('query network error'));
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_001);
      const queried = await service.queryVideo(attempt.id, document.id);
      clock.mockRestore();
      expect(queried.status).toBe('unknown');
      expect(queried.taskId).toBe('video-task');
      await expect(service.retry(queried.id, document.id)).rejects.toThrow('不能自动重试');
    }
  );

  test('materializes a successful image attempt into a project asset', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('png'));
    callRemoteProxyToolMock.mockResolvedValue(successfulImageResult());

    const attempt = await new CanvasGenerationService(root, {} as any).generateImage({
      canvasId: document.id,
      prompt: 'cartoon warrior',
      targetNodeId: document.nodes[0].id,
    });

    expect(attempt.status).toBe('succeeded');
    expect(attempt.targetNodeId).toBe(document.nodes[0].id);
    expect(attempt.resultAssetPath).toMatch(/^assets\/image\/canvas-[0-9a-f-]+\.png$/);
    expect(fs.existsSync(path.join(root, attempt.resultAssetPath!))).toBe(true);
  });

  test('recovers a delivered image after restart without another paid request', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('local delivery', 'empty');
    fs.mkdirSync(path.join(root, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('image'));
    callRemoteProxyToolMock.mockResolvedValue({
      content: [],
      structuredContent: { localPath: 'assets/image/generated.png', credits: 20 },
    } as any);
    jest.spyOn(MakerCanvasFiles.prototype, 'importGeneratedImage').mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({ canvasId: document.id, prompt: 'image' });
    expect(failed).toMatchObject({
      status: 'failed',
      remoteStatus: 'succeeded',
      failureStage: 'download',
      deliveredAssetPath: 'assets/image/generated.png',
      credits: 20,
    });
    const recovered = await new CanvasGenerationService(root, {} as any).retry(
      failed.id,
      document.id
    );
    expect(recovered).toMatchObject({ id: failed.id, status: 'succeeded', credits: 20 });
    expect(recovered.error).toBeUndefined();
    expect(recovered.failureStage).toBeUndefined();
    expect(fs.readFileSync(path.join(root, recovered.resultAssetPath!), 'utf8')).toBe('image');
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('retries a paid image from its saved URL without generating again', async () => {
    const document = await new MakerCanvasFiles(root).create('remote url', 'empty');
    const previewUrl = 'https://cdn.example/generated/canvas.png';
    callRemoteProxyToolMock.mockResolvedValue({
      content: [],
      structuredContent: {
        success: true,
        previewUrl,
        credits: 12,
        download: { success: false, error: 'Asset download failed: HTTP 502' },
      },
    } as any);
    const failed = await new CanvasGenerationService(root, {} as any).generateImage({
      canvasId: document.id,
      prompt: 'image',
    });
    expect(failed).toMatchObject({
      status: 'failed',
      remoteStatus: 'succeeded',
      failureStage: 'download',
      remoteAssetUrl: previewUrl,
      credits: 12,
    });
    expect(failed.deliveredAssetPath).toBeUndefined();
    expect(failed.error).toContain('不会重新付费生成');
    const persisted = JSON.parse(
      fs.readFileSync(path.join(root, '.maker/canvases/attempts', failed.id + '.json'), 'utf8')
    );
    expect(persisted).toMatchObject({
      status: 'failed',
      failureStage: 'download',
      remoteAssetUrl: previewUrl,
    });
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => png.buffer,
    } as Response);
    const recovered = await new CanvasGenerationService(root, {} as any).retry(
      failed.id,
      document.id
    );
    expect(fetchMock).toHaveBeenCalledWith(
      previewUrl,
      expect.objectContaining({ redirect: 'error' })
    );
    expect(recovered).toMatchObject({ id: failed.id, status: 'succeeded', credits: 12 });
    expect(recovered.resultAssetPath).toMatch(/^assets\/image\/canvas-/);
    expect(fs.readFileSync(path.join(root, recovered.resultAssetPath!)).subarray(0, 4)).toEqual(
      Buffer.from([137, 80, 78, 71])
    );
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('does not fetch a non-https image URL or repeat the paid generation', async () => {
    const document = await new MakerCanvasFiles(root).create('bad url', 'empty');
    callRemoteProxyToolMock.mockResolvedValue({
      content: [],
      structuredContent: {
        success: true,
        previewUrl: 'http://cdn.example/generated.png',
        download: { success: false, error: 'HTTP 500' },
      },
    } as any);
    const failed = await new CanvasGenerationService(root, {} as any).generateImage({
      canvasId: document.id,
      prompt: 'image',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const retried = await new CanvasGenerationService(root, {} as any).retry(
      failed.id,
      document.id
    );
    expect(retried).toMatchObject({
      id: failed.id,
      status: 'failed',
      failureStage: 'download',
      remoteAssetUrl: 'http://cdn.example/generated.png',
    });
    expect(retried.error).toContain('原图片地址无效');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('does not let a second image download retry overwrite a successful recovery', async () => {
    const document = await new MakerCanvasFiles(root).create('concurrent recovery', 'empty');
    const previewUrl = 'https://cdn.example/generated/concurrent.png';
    callRemoteProxyToolMock.mockResolvedValue({
      content: [],
      structuredContent: {
        success: true,
        previewUrl,
        download: { success: false, error: 'Asset download failed: HTTP 502' },
      },
    } as any);
    const failed = await new CanvasGenerationService(root, {} as any).generateImage({
      canvasId: document.id,
      prompt: 'image',
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      started();
      return pending;
    });
    const first = new CanvasGenerationService(root, {} as any).retry(failed.id, document.id);
    await startedPromise;
    await expect(
      new CanvasGenerationService(root, {} as any).retry(failed.id, document.id)
    ).rejects.toMatchObject({
      status: 409,
      message: '该图片正在恢复本地下载，请等待当前操作完成。',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({
      ok: true,
      status: 200,
      arrayBuffer: async () => png.buffer,
    } as Response);
    const recovered = await first;
    expect(recovered).toMatchObject({ id: failed.id, status: 'succeeded' });
    expect(recovered.resultAssetPath).toMatch(/^assets\/image\/canvas-/);
    const persisted = new CanvasGenerationService(root, {} as any).list(document.id)[0];
    expect(persisted).toMatchObject({
      id: failed.id,
      status: 'succeeded',
      resultAssetPath: recovered.resultAssetPath,
    });
    expect(persisted.failureStage).toBeUndefined();
    await expect(
      new CanvasGenerationService(root, {} as any).retry(failed.id, document.id)
    ).rejects.toThrow('只有明确失败');
    expect(new CanvasGenerationService(root, {} as any).list(document.id)[0].status).toBe(
      'succeeded'
    );
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('interrupted local delivery and repeated import failures never resubmit generation', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create('interrupted delivery', 'empty');
    callRemoteProxyToolMock.mockResolvedValue(successfulImageResult());
    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({ canvasId: document.id, prompt: 'image' });
    const filename = path.join(root, '.maker/canvases/attempts', failed.id + '.json');
    fs.writeFileSync(filename, JSON.stringify({ ...failed, status: 'running' }));
    expect(service.list(document.id)[0].status).toBe('failed');
    const retried = await service.retry(failed.id, document.id);
    expect(retried).toMatchObject({ id: failed.id, status: 'failed', failureStage: 'download' });
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test.each(['download error', 'missing result'])(
    '%s does not permit another paid image request',
    async (scenario) => {
      const document = await new MakerCanvasFiles(root).create('unknown delivery', 'empty');
      if (scenario === 'download error')
        callRemoteProxyToolMock.mockRejectedValue(new Error('download failed'));
      else
        callRemoteProxyToolMock.mockResolvedValue({
          content: [],
          structuredContent: { success: true },
        } as any);
      const service = new CanvasGenerationService(root, {} as any);
      const failed = await service.generateImage({ canvasId: document.id, prompt: 'image' });
      expect(failed.status).toBe('unknown');
      await expect(service.retry(failed.id, document.id)).rejects.toThrow('结果未知');
      expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
    }
  );

  test('legacy image failures without non-execution evidence cannot regenerate via retry', async () => {
    const document = await new MakerCanvasFiles(root).create('legacy failure', 'empty');
    callRemoteProxyToolMock.mockRejectedValue(new Error('import failed'));
    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({ canvasId: document.id, prompt: 'image' });
    fs.writeFileSync(
      path.join(root, '.maker/canvases/attempts', failed.id + '.json'),
      JSON.stringify({ ...failed, status: 'failed' })
    );
    await expect(service.retry(failed.id, document.id)).rejects.toThrow('无法确认');
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(1);
  });

  test('keeps the target node when retrying an explicitly failed attempt', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('png'));
    callRemoteProxyToolMock
      .mockRejectedValueOnce(
        new RemoteProxyToolCallError(
          'generate_image',
          'not_executed',
          new Error('temporary failure')
        )
      )
      .mockResolvedValueOnce(successfulImageResult());

    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({
      canvasId: document.id,
      prompt: 'cartoon warrior',
      cutoutColor: '#00FF00',
      targetNodeId: document.nodes[0].id,
    });
    const retried = await service.retry(failed.id);

    expect(failed.status).toBe('failed');
    expect(retried.status).toBe('succeeded');
    expect(retried.targetNodeId).toBe(document.nodes[0].id);
    expect(retried.cutoutColor).toBe('#00FF00');
    expect(
      new CanvasGenerationService(root, {} as any)
        .list(document.id)
        .find((item) => item.id === retried.id)?.cutoutColor
    ).toBe('#00FF00');
    for (const call of callRemoteProxyToolMock.mock.calls)
      expect(call[0].args).not.toHaveProperty('cutoutColor');
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(2);
  });

  test('preserves a single-image variant operation and its source on retry', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('png'));
    callRemoteProxyToolMock
      .mockRejectedValueOnce(
        new RemoteProxyToolCallError(
          'generate_image',
          'not_executed',
          new Error('temporary failure')
        )
      )
      .mockResolvedValueOnce(successfulImageResult());

    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({
      canvasId: document.id,
      prompt: '升级护甲但保留角色轮廓',
      operation: 'outpaint',
      targetNodeId: document.nodes[0].id,
      sourceImagePath: document.nodes[0].assetPath,
      sourceImageId: document.nodes[0].id,
    });
    const retried = await service.retry(failed.id);

    expect(failed.operation).toBe('outpaint');
    expect(retried.operation).toBe('outpaint');
    expect(retried.sourceImageIds).toEqual([document.nodes[0].id]);
    expect(retried.targetAssetPath).toBe(document.nodes[0].assetPath);
    expect(retried.sourceSnapshots).toEqual([retried.sourceSnapshot]);
    expect(service.list(document.id).find((item) => item.id === retried.id)?.targetAssetPath).toBe(
      document.nodes[0].assetPath
    );
    expect(callRemoteProxyToolMock.mock.calls[1][0].args).toMatchObject({
      reference_images: [document.nodes[0].assetPath],
    });
  });

  test('allows a generated video card to be refreshed after its first result', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    const source = document.nodes[0];
    const videoBytes = Buffer.alloc(16);
    videoBytes.write('ftyp', 4, 'ascii');
    videoBytes.write('isom', 8, 'ascii');
    const importedVideo = await files.importVideo(document.id, videoBytes, 'video/mp4');
    const videoId = createId();
    const saved = await files.save(
      document.id,
      {
        ...document,
        nodes: [
          ...document.nodes,
          {
            id: videoId,
            type: 'video-source' as const,
            x: 300,
            y: 0,
            width: 300,
            height: 250,
            title: '视频结果',
            assetPath: importedVideo.relativePath,
            generation: {
              prompt: '向右攻击',
              attemptId: createId(),
              sourceImageId: source.id,
            },
          },
        ],
        edges: [{ id: createId(), from: source.id, to: videoId, kind: 'image-to-video' as const }],
      },
      document.revision
    );
    callRemoteProxyToolMock.mockRejectedValue(new Error('refresh failed'));
    const service = new CanvasGenerationService(root, {} as any);
    const attempt = await service.createVideo({
      canvasId: saved.id,
      prompt: '向左攻击',
      sourceImagePath: source.assetPath!,
      sourceImageId: source.id,
      targetNodeId: videoId,
    });
    expect(attempt.status).toBe('unknown');
    expect(attempt.targetNodeId).toBe(videoId);
    expect(attempt.targetAssetPath).toBe(importedVideo.relativePath);
  });

  test('rejects an attempt used through another canvas route', async () => {
    const files = new MakerCanvasFiles(root);
    const first = await files.create('first', 'starter');
    const second = await files.create('second');
    callRemoteProxyToolMock.mockRejectedValue(new Error('temporary failure'));

    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({
      canvasId: first.id,
      prompt: 'cartoon warrior',
      targetNodeId: first.nodes[0].id,
    });

    await expect(service.retry(failed.id, second.id)).rejects.toThrow('不属于当前画布');
  });
});
