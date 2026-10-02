import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

jest.mock('../../server/mcp.js', () => ({ callRemoteProxyTool: jest.fn() }));

import { callRemoteProxyTool } from '../../server/mcp.js';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { CanvasGenerationService, type CanvasGenerationAttempt } from '../canvasGeneration.js';
import { MakerProjectRegistry } from '../../projectRegistry.js';
import {
  RemoteProxyToolResultError,
  materializeRemoteProxyToolAssets,
} from '../../server/proxyAssets.js';
import { getTapAuthPath, saveTapAuth, saveProjectConfig } from '../../storage.js';
import * as proxyAssets from '../../server/proxyAssets.js';
import { handleCanvasProjectRoute } from '../canvasRoutes.js';

const remote = jest.mocked(callRemoteProxyTool);
const response = (payload: Record<string, unknown>) =>
  ({ structuredContent: payload, content: [] }) as any;

describe('durable console video recovery', () => {
  let directory: string;
  let root: string;
  let oldHome: string | undefined;
  let files: MakerCanvasFiles;
  let options: Parameters<CanvasGenerationService['createVideo']>[0];
  let service: CanvasGenerationService;
  let elapsed: number;

  async function project(name: string) {
    const projectRoot = path.join(directory, name);
    fs.mkdirSync(projectRoot);
    execFileSync('git', ['init', '--quiet'], { cwd: projectRoot });
    fs.writeFileSync(path.join(projectRoot, '.gitignore'), '.maker\n');
    fs.mkdirSync(path.join(projectRoot, '.maker-mcp'));
    fs.writeFileSync(
      path.join(projectRoot, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: name })
    );
    new MakerProjectRegistry().add(projectRoot);
    const projectFiles = new MakerCanvasFiles(projectRoot);
    const document = await projectFiles.create(name, 'starter');
    return {
      root: projectRoot,
      files: projectFiles,
      options: {
        canvasId: document.id,
        prompt: '动作',
        sourceImageId: document.nodes[0].id,
        sourceImagePath: document.nodes[0].assetPath!,
      },
    };
  }

  function persist(attempt: CanvasGenerationAttempt) {
    const attempts = path.join(root, '.maker/canvases/attempts');
    fs.mkdirSync(attempts, { recursive: true });
    fs.writeFileSync(path.join(attempts, attempt.id + '.json'), JSON.stringify(attempt));
  }

  function videoResult(taskId = 'own-task') {
    fs.mkdirSync(path.join(root, 'assets/video'), { recursive: true });
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4, 'ascii');
    bytes.write('isom', 8, 'ascii');
    fs.writeFileSync(path.join(root, 'assets/video/result.mp4'), bytes);
    return response({ task_id: taskId, status: 'succeeded', localPath: 'assets/video/result.mp4' });
  }

  beforeEach(async () => {
    elapsed = 0;
    const now = Date.now.bind(Date);
    jest.spyOn(Date, 'now').mockImplementation(() => now() + elapsed);
    oldHome = process.env.TAPTAP_MAKER_HOME;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-video-recovery-'));
    process.env.TAPTAP_MAKER_HOME = path.join(directory, 'home');
    const initialized = await project('first');
    root = initialized.root;
    files = initialized.files;
    options = initialized.options;
    service = new CanvasGenerationService(root, {} as any);
    remote.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
    if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = oldHome;
  });

  test('blocks across projects after HTTP completion and service recreation, and cancel does not release', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    const other = await project('second');
    const restarted = new CanvasGenerationService(other.root, {} as any);
    expect(restarted.history().busy).toMatchObject({
      attemptId: attempt.id,
      taskId: 'own-task',
      projectLabel: 'first',
    });
    await expect(restarted.createVideo(other.options)).rejects.toMatchObject({ status: 409 });
    service.cancel(attempt.id);
    await expect(restarted.createVideo(other.options)).rejects.toThrow('未完成');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test('unknown without task ID releases after ten minutes without borrowing or replaying a task', async () => {
    remote.mockRejectedValue(
      new Error('another active task: remote_result: {"task_id":"someone-else"}')
    );
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({ status: 'unknown', failureStage: 'submission' });
    expect(attempt.taskId).toBeUndefined();
    const restarted = new CanvasGenerationService(root, {} as any);
    expect(restarted.history().busy?.reason).toContain('10 分钟');
    await expect(restarted.createVideo(options)).rejects.toThrow('未完成');
    elapsed = 600_001;
    expect(restarted.history().busy).toBeUndefined();
    await expect(restarted.retry(attempt.id)).rejects.toThrow('不能自动重试');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(restarted.list()[0]).toEqual(attempt);
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    expect(await restarted.createVideo(options)).toMatchObject({ taskId: 'new-task' });
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('expired occupancy allows another project while the original ID remains queryable', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 599_000;
    expect(service.history().busy?.attemptId).toBe(attempt.id);
    elapsed = 600_001;
    const other = await project('second');
    const restarted = new CanvasGenerationService(other.root, {} as any);
    expect(restarted.history().busy).toBeUndefined();
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    const next = await restarted.createVideo(other.options);
    const nextPath = path.join(other.root, '.maker/canvases/attempts', next.id + '.json');
    fs.writeFileSync(
      nextPath,
      JSON.stringify({ ...next, createdAt: new Date(Date.now()).toISOString() })
    );
    remote.mockResolvedValueOnce(videoResult());
    expect(await service.queryVideo(attempt.id)).toMatchObject({
      taskId: 'own-task',
      status: 'succeeded',
    });
    expect(restarted.history().busy?.attemptId).toBe(next.id);
    expect(service.list().find((item) => item.id === attempt.id)?.createdAt).toBe(
      attempt.createdAt
    );
    expect(
      remote.mock.calls.filter(([request]) => request.name === 'create_video_task')
    ).toHaveLength(2);
  });

  test('querying never extends occupancy or the six-hour query window', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 599_000;
    await service.queryVideo(attempt.id);
    elapsed = 600_001;
    expect(service.history().busy).toBeUndefined();
    elapsed = 21_599_000;
    await service.queryVideo(attempt.id);
    const before = service.list();
    const calls = remote.mock.calls.length;
    elapsed = 21_600_001;
    await expect(
      new CanvasGenerationService(root, {} as any).queryVideo(attempt.id)
    ).rejects.toMatchObject({ status: 410 });
    expect(remote).toHaveBeenCalledTimes(calls);
    expect(service.list()).toEqual(before);
  });

  test('missing attempt files stop blocking after the reservation deadline without deleting history', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    fs.unlinkSync(path.join(root, '.maker/canvases/attempts', attempt.id + '.json'));
    expect(service.history().busy?.attemptId).toBe(attempt.id);
    elapsed = 600_001;
    expect(service.history().busy).toBeUndefined();
    expect(
      fs.existsSync(path.join(process.env.TAPTAP_MAKER_HOME!, 'console/canvas-video.json'))
    ).toBe(true);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test('persists raw task ID before a download failure and recovers without a second paid submission', async () => {
    remote.mockImplementationOnce(async (request) => {
      await request.onRawResult?.(
        response({ task_id: 'own-task', status: 'succeeded', credits: 45 })
      );
      expect(service.list()[0]).toMatchObject({ taskId: 'own-task', remoteStatus: 'succeeded' });
      throw new Error('download failed');
    });
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({
      status: 'unknown',
      failureStage: 'download',
      taskId: 'own-task',
      credits: 45,
      targetAssetPath: '',
    });
    await expect(service.retry(attempt.id)).rejects.toThrow('不能自动重试');
    remote.mockResolvedValue(videoResult());
    const recovered = await new CanvasGenerationService(root, {} as any).queryVideo(
      attempt.id,
      options.canvasId
    );
    expect(recovered.status).toBe('succeeded');
    expect(recovered.credits).toBe(45);
    expect(service.history().busy).toBeUndefined();
    expect(remote.mock.calls.map(([request]) => request.name)).toEqual([
      'create_video_task',
      'query_video_task',
    ]);
  });

  test('preserves raw task ID before an isError response is thrown and recovers unknown records', async () => {
    const raw = {
      ...response({ task_id: 'own-task', status: 'failed', error: 'remote failed' }),
      isError: true,
    };
    remote.mockImplementationOnce(async (request) => {
      await request.onRawResult?.(raw);
      throw new RemoteProxyToolResultError('create_video_task', raw);
    });
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({
      status: 'unknown',
      failureStage: 'submission',
      taskId: 'own-task',
    });
    remote.mockResolvedValue(videoResult());
    expect((await service.queryVideo(attempt.id)).status).toBe('succeeded');
  });

  test('an unclassified raw isError cannot briefly release the gate before normalization', async () => {
    const raw = { ...response({ status: 'failed' }), isError: true };
    remote.mockImplementationOnce(async (request) => {
      await request.onRawResult?.(raw);
      expect(service.list()[0]).toMatchObject({ status: 'unknown', executionState: 'unknown' });
      await expect(service.createVideo(options)).rejects.toThrow('未完成');
      return materializeRemoteProxyToolAssets({
        toolName: request.name,
        targetDir: root,
        result: raw,
      });
    });
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({ status: 'unknown', executionState: 'unknown' });
    expect(service.history().busy?.attemptId).toBe(attempt.id);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, 'own-task'])(
    'explicit execution unknown wins over failed with ID %s',
    async (taskId) => {
      remote.mockResolvedValue(
        response({ task_id: taskId, status: 'failed', execution_state: 'unknown' })
      );
      const attempt = await service.createVideo(options);
      expect(attempt.status).toBe('unknown');
      expect(service.history().busy?.attemptId).toBe(attempt.id);
      await expect(service.retry(attempt.id)).rejects.toThrow('不能自动重试');
    }
  );

  test.each(['pending', 'failed'] as const)(
    'rejects duplicate concurrent queries and retains cancel from %s',
    async (status) => {
      remote.mockResolvedValueOnce(response({ task_id: 'own-task', status: 'pending' }));
      const attempt = await service.createVideo(options);
      persist({ ...attempt, status });
      elapsed = 120_001;
      let resolveQuery!: (value: any) => void;
      remote.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveQuery = resolve;
          })
      );
      const querying = service.queryVideo(attempt.id);
      while (!resolveQuery) await new Promise((resolve) => setImmediate(resolve));
      const second = new CanvasGenerationService(root, {} as any);
      await expect(second.queryVideo(attempt.id)).rejects.toMatchObject({ status: 409 });
      const canceled = second.cancel(attempt.id);
      resolveQuery(response({ task_id: 'own-task', status: 'pending' }));
      expect(await querying).toMatchObject({
        status: 'canceled',
        localWaitCanceledAt: canceled.localWaitCanceledAt,
      });
      expect(second.history().busy?.attemptId).toBe(attempt.id);
      expect(remote).toHaveBeenCalledTimes(2);
    }
  );

  test('cancel during initial submission retains the task ID from a late response', async () => {
    remote.mockImplementationOnce(async (request) => {
      const current = service.list()[0];
      service.cancel(current.id);
      const raw = response({ task_id: 'own-task', status: 'pending' });
      await request.onRawResult?.(raw);
      return raw;
    });
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({ status: 'canceled', taskId: 'own-task' });
    expect(attempt.localWaitCanceledAt).toBeTruthy();
    expect(service.history().busy?.attemptId).toBe(attempt.id);
  });

  test('does not replace its own task ID with a mismatched query response', async () => {
    remote.mockResolvedValueOnce(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 120_001;
    remote.mockResolvedValue(response({ task_id: 'other-task', status: 'succeeded' }));
    expect(await service.queryVideo(attempt.id)).toMatchObject({
      taskId: 'own-task',
      status: 'unknown',
      failureStage: 'query',
    });
    expect(service.list()[0].taskId).toBe('own-task');
  });

  test('legacy unknown in another registered project blocks without requiring a reservation', async () => {
    persist({
      id: randomUUID(),
      canvasId: options.canvasId,
      kind: 'video',
      toolName: 'create_video_task',
      prompt: 'legacy',
      status: 'unknown',
      createdAt: new Date(Date.now()).toISOString(),
      updatedAt: new Date(Date.now()).toISOString(),
    });
    const other = await project('second');
    await expect(
      new CanvasGenerationService(other.root, {} as any).createVideo(other.options)
    ).rejects.toThrow('未完成');
    expect(remote).not.toHaveBeenCalled();
  });

  test('history is project-scoped and paginated, and reads do not modify the canvas', async () => {
    const before = await files.load(options.canvasId);
    for (let index = 0; index < 65; index++) {
      persist({
        id: randomUUID(),
        canvasId: options.canvasId,
        kind: 'video',
        toolName: 'create_video_task',
        prompt: 'history',
        status: 'failed',
        remoteStatus: 'failed',
        createdAt: new Date(index * 1000).toISOString(),
        updatedAt: new Date(index * 1000).toISOString(),
      });
    }
    expect(service.history()).toMatchObject({ total: 65 });
    expect(service.history().items).toHaveLength(30);
    expect(service.history(60).items).toHaveLength(5);
    expect(service.history().items[0].updatedAt).toBe(new Date(64000).toISOString());
    expect(() => service.history(0, 51)).toThrow('分页');
    expect(() => service.history(-1)).toThrow('分页');
    const other = await project('second');
    expect(new CanvasGenerationService(other.root, {} as any).history().total).toBe(0);
    const output = { writeHead: jest.fn(), end: jest.fn() };
    expect(
      await handleCanvasProjectRoute({
        request: {} as any,
        response: output as any,
        method: 'GET',
        suffix: 'canvases/video-history',
        searchParams: new URLSearchParams('offset=60&limit=30'),
        key: 'project',
        registry: { resolve: () => ({ path: root }) } as any,
        remoteProxyManager: {} as any,
      })
    ).toBe(true);
    expect(JSON.parse(output.end.mock.calls[0][0]).items).toHaveLength(5);
    expect(await files.load(options.canvasId)).toEqual(before);
    expect(remote).not.toHaveBeenCalled();
  });

  test('history query downloads without changing canvas nodes or its revision', async () => {
    remote.mockResolvedValueOnce(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 120_001;
    const before = await files.load(options.canvasId);
    remote.mockResolvedValue(videoResult());
    await service.queryVideo(attempt.id, options.canvasId);
    expect(await files.load(options.canvasId)).toEqual(before);
    await expect(service.queryVideo(attempt.id, randomUUID())).rejects.toThrow('不属于');
  });

  test('first pending query waits 120 seconds across refresh and cancel, without releasing ownership', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    expect(attempt.nextQueryAt).toBeTruthy();
    const refreshed = new CanvasGenerationService(root, {} as any);
    await expect(refreshed.queryVideo(attempt.id)).rejects.toMatchObject({ status: 429 });
    refreshed.cancel(attempt.id);
    elapsed = 119_000;
    await expect(refreshed.queryVideo(attempt.id)).rejects.toMatchObject({ status: 429 });
    expect(remote).toHaveBeenCalledTimes(1);
    elapsed = 120_001;
    expect((await refreshed.queryVideo(attempt.id)).taskId).toBe('own-task');
    expect(refreshed.history().busy?.attemptId).toBe(attempt.id);
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('simultaneous submissions across projects admit only one paid request', async () => {
    const other = await project('second');
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const results = await Promise.allSettled([
      service.createVideo(options),
      new CanvasGenerationService(other.root, {} as any).createVideo(other.options),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote.mock.calls[0][0].retryExpiredAuth).toBe(false);
  });

  test('concurrent explicit retries do not queue another paid attempt', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'failed' }));
    const attempt = await service.createVideo(options);
    const results = await Promise.allSettled([
      service.retry(attempt.id),
      service.retry(attempt.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('running attempts survive a fresh process as unknown and still occupy the global slot', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    persist({ ...attempt, status: 'running' });
    const script =
      "const {CanvasGenerationService} = require('./src/maker/console/canvasGeneration.ts'); console.log(JSON.stringify(new CanvasGenerationService(process.argv[1], {}).history()));";
    const result = JSON.parse(
      execFileSync(process.execPath, ['--require', 'tsx/cjs', '-e', script, root], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    );
    expect(result.busy).toMatchObject({ attemptId: attempt.id, taskId: 'own-task' });
    expect(result.items[0].status).toBe('unknown');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test('missing reserved attempt stays busy instead of releasing ownership', async () => {
    remote.mockResolvedValueOnce(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    fs.unlinkSync(path.join(root, '.maker/canvases/attempts', attempt.id + '.json'));
    expect(service.history().busy?.reason).toContain('不可读取');
    await expect(service.createVideo(options)).rejects.toThrow('未完成');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test.each([
    [undefined, undefined],
    ['not_executed', undefined],
    [undefined, 'own-task'],
    ['not_executed', 'own-task'],
  ])(
    'top-level unknown overrides structured state %s with task %s before and after normalization',
    async (structuredState, taskId) => {
      const raw = {
        ...response({ status: 'failed', execution_state: structuredState, task_id: taskId }),
        isError: true,
        execution_state: 'unknown',
      };
      remote.mockImplementationOnce(async (request) => {
        await request.onRawResult?.(raw);
        const recorded = service.list()[0];
        const saved = JSON.parse(
          fs.readFileSync(
            path.join(root, '.maker/canvases/attempts', recorded.id + '.json'),
            'utf8'
          )
        );
        expect(saved).toMatchObject({ status: 'unknown', executionState: 'unknown' });
        expect(saved.remoteStatus).toBeUndefined();
        return materializeRemoteProxyToolAssets({
          toolName: request.name,
          targetDir: root,
          result: raw,
        });
      });
      const attempt = await service.createVideo(options);
      expect(attempt).toMatchObject({ status: 'unknown', executionState: 'unknown' });
      expect(attempt.remoteStatus).toBeUndefined();
      expect(service.history().busy?.attemptId).toBe(attempt.id);
      await expect(service.retry(attempt.id)).rejects.toThrow('不能自动重试');
      await expect(service.createVideo(options)).rejects.toThrow('未完成');
      expect(remote).toHaveBeenCalledTimes(1);
      persist({ ...attempt, status: 'failed', remoteStatus: 'failed' });
      const reloaded = new CanvasGenerationService(root, {} as any);
      expect(reloaded.history().busy?.attemptId).toBe(attempt.id);
      expect(reloaded.history().items[0]).toMatchObject({
        status: 'unknown',
        executionState: 'unknown',
      });
      if (taskId) {
        remote.mockResolvedValueOnce(response({ task_id: taskId, status: 'failed' }));
        expect((await reloaded.queryVideo(attempt.id)).status).toBe('failed');
        expect(reloaded.history().busy).toBeUndefined();
      }
    }
  );

  test.each([
    'context',
    'arguments',
    'context-refresh',
    'manager-before-dispatch',
    'manager-after-dispatch',
  ])('real adapter classifies %s using the actual dispatch boundary', async (failure) => {
    const realCall =
      jest.requireActual<typeof import('../../server/mcp.js')>(
        '../../server/mcp.js'
      ).callRemoteProxyTool;
    let dispatches = 0;
    const manager = {
      callTool: jest.fn(async (_context, _request, _options, onDispatch) => {
        if (failure === 'manager-before-dispatch') throw new Error('manager unavailable');
        onDispatch?.();
        dispatches++;
        if (failure === 'manager-after-dispatch') throw new Error('connection lost after dispatch');
        return response({ task_id: 'own-task', status: 'pending' });
      }),
    };
    saveProjectConfig(root, { project_id: 'first', user_id: 'user-first' });
    if (failure !== 'context')
      saveTapAuth({ kid: 'test', mac_key: 'test', token_type: 'mac', mac_algorithm: 'hmac-sha-1' });
    remote.mockImplementationOnce((request) => {
      if (failure === 'arguments')
        jest
          .spyOn(proxyAssets, 'prepareRemoteProxyToolArgsAsync')
          .mockRejectedValueOnce(new Error('reference conversion failed'));
      const result = realCall(request);
      if (failure === 'context-refresh') fs.unlinkSync(getTapAuthPath());
      return result;
    });
    const actualService = new CanvasGenerationService(root, manager as any);
    const attempt = await actualService.createVideo(options);
    if (failure === 'manager-after-dispatch') {
      expect(dispatches).toBe(1);
      expect(attempt).toMatchObject({ status: 'unknown', executionState: 'unknown' });
      expect(actualService.history().busy?.attemptId).toBe(attempt.id);
      await expect(actualService.retry(attempt.id)).rejects.toThrow('不能自动重试');
    } else {
      expect(dispatches).toBe(0);
      expect(attempt).toMatchObject({ status: 'failed', executionState: 'not_executed' });
      expect(actualService.history().busy).toBeUndefined();
      expect(new CanvasGenerationService(root, manager as any).history().busy).toBeUndefined();
    }
    expect(attempt.taskId).toBeUndefined();
    expect(remote).toHaveBeenCalledTimes(1);
  });
});
