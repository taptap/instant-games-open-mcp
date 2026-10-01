import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../../server/mcp.js', () => ({
  ...jest.requireActual('../../server/mcp.js'),
  callRemoteProxyTool: jest.fn(),
}));

import { callRemoteProxyTool } from '../../server/mcp.js';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { createId } from '../../canvas/model.js';
import { CanvasGenerationService } from '../canvasGeneration.js';
import { RemoteProxyToolResultError } from '../../server/proxyAssets.js';

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

  beforeEach(() => {
    root = project();
    callRemoteProxyToolMock.mockReset();
    fs.writeFileSync(path.join(root, 'placeholder'), '');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
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
    callRemoteProxyToolMock.mockRejectedValueOnce(new Error('explicit failure')).mockResolvedValue({
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
      .mockRejectedValueOnce(new Error('temporary failure'))
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
      const queried = await service.queryVideo(attempt.id, document.id);
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

  test('keeps the target node when retrying an explicitly failed attempt', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('png'));
    callRemoteProxyToolMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(successfulImageResult());

    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({
      canvasId: document.id,
      prompt: 'cartoon warrior',
      targetNodeId: document.nodes[0].id,
    });
    const retried = await service.retry(failed.id);

    expect(failed.status).toBe('failed');
    expect(retried.status).toBe('succeeded');
    expect(retried.targetNodeId).toBe(document.nodes[0].id);
    expect(callRemoteProxyToolMock).toHaveBeenCalledTimes(2);
  });

  test('preserves a single-image variant operation and its source on retry', async () => {
    const files = new MakerCanvasFiles(root);
    const document = await files.create(undefined, 'starter');
    fs.writeFileSync(path.join(root, 'assets/image/generated.png'), Buffer.from('png'));
    callRemoteProxyToolMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(successfulImageResult());

    const service = new CanvasGenerationService(root, {} as any);
    const failed = await service.generateImage({
      canvasId: document.id,
      prompt: '升级护甲但保留角色轮廓',
      operation: 'outpaint',
      sourceImagePath: document.nodes[0].assetPath,
      sourceImageId: document.nodes[0].id,
    });
    const retried = await service.retry(failed.id);

    expect(failed.operation).toBe('outpaint');
    expect(retried.operation).toBe('outpaint');
    expect(retried.sourceImageIds).toEqual([document.nodes[0].id]);
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
    expect(attempt.status).toBe('failed');
    expect(attempt.targetNodeId).toBe(videoId);
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
