import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ServerResponse } from 'node:http';

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
import { startConsoleServer } from '../server.js';
import { ConsoleProjects } from '../projects.js';

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

  function holdNextRequest() {
    let finish!: (value: ReturnType<typeof response>) => void;
    const result = new Promise<ReturnType<typeof response>>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    remote.mockImplementationOnce(() => {
      started();
      return result;
    });
    return { ready, finish };
  }

  async function addVideoTargets() {
    const document = await files.load(options.canvasId);
    const targets = [randomUUID(), randomUUID()].map((id) => ({
      id,
      type: 'video' as const,
      title: '视频输入',
      x: 0,
      y: 0,
      width: 300,
      height: 250,
    }));
    await files.save(
      document.id,
      { ...document, nodes: [...document.nodes, ...targets] },
      document.revision
    );
    return targets;
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

  test.each(['create', 'retry'])(
    'abort while preparing %s prevents dispatch before a new attempt exists',
    async (method) => {
      remote.mockResolvedValueOnce(response({ status: 'failed' }));
      const previous = method === 'retry' ? await service.createVideo(options) : undefined;
      remote.mockReset();
      const before = service.list();
      const controller = new AbortController();
      let finishPreparation!: () => void;
      const preparing = new Promise<void>((resolve) => {
        finishPreparation = resolve;
      });
      jest
        .spyOn(MakerCanvasFiles.prototype, 'assertWritableForGeneration')
        .mockReturnValueOnce(preparing);
      const submitting = previous
        ? service.retry(previous.id, options.canvasId, controller.signal)
        : service.createVideo(options, controller.signal);
      expect(service.list()).toEqual(before);
      controller.abort();
      finishPreparation();
      await expect(submitting).rejects.toMatchObject({ name: 'AbortError' });
      expect(remote).not.toHaveBeenCalled();
      expect(service.list()).toEqual(before);
      remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
      expect((await service.createVideo(options)).taskId).toBe('new-task');
    }
  );

  test.each(['create', 'retry'])(
    'abort after %s dispatch releases the target and retains the late task ID without canceling remote',
    async (method) => {
      options.targetNodeId = (await addVideoTargets())[0].id;
      remote.mockResolvedValueOnce(response({ status: 'failed' }));
      const previous = method === 'retry' ? await service.createVideo(options) : undefined;
      remote.mockReset();
      const controller = new AbortController();
      const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
      const held = holdNextRequest();
      const submitting = previous
        ? service.retry(previous.id, options.canvasId, controller.signal)
        : service.createVideo(options, controller.signal);
      await held.ready;
      const original = service.list().find((attempt) => attempt.id !== previous?.id)!;
      try {
        expect(original.taskId).toBeUndefined();
        controller.abort();
        expect(service.list().find((attempt) => attempt.id === original.id)).toMatchObject({
          status: 'canceled',
          localWaitCanceledAt: expect.any(String),
        });
        remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
        expect(
          (await new CanvasGenerationService(root, {} as any).createVideo(options)).taskId
        ).toBe('new-task');
        expect(remote.mock.calls[0][0]).not.toHaveProperty('signal');
        expect(remote).toHaveBeenCalledTimes(2);
      } finally {
        held.finish(response({ task_id: 'late-task', status: 'pending' }));
        await submitting;
      }
      expect(await submitting).toMatchObject({
        status: 'canceled',
        taskId: 'late-task',
        localWaitCanceledAt: expect.any(String),
      });
      expect(service.list().find((attempt) => attempt.id === original.id)?.taskId).toBe(
        'late-task'
      );
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    }
  );

  test('abort listener errors are reported by the request without escaping the listener', async () => {
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const held = holdNextRequest();
    const submitting = service.createVideo(options, controller.signal);
    await held.ready;
    jest.spyOn(service, 'cancel').mockImplementationOnce(() => {
      throw new Error('cancel write failed');
    });
    expect(() => controller.abort()).not.toThrow();
    held.finish(response({ task_id: 'late-task', status: 'pending' }));
    await expect(submitting).rejects.toThrow('cancel write failed');
    expect(service.list()[0].taskId).toBe('late-task');
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  test.each([
    ['createVideo', false],
    ['createVideo', true],
    ['retry', false],
    ['retry', true],
  ] as const)(
    '%s route aborts only an unfinished response and removes its listener (ended=%s)',
    async (method, writableEnded) => {
      let finish!: (attempt: CanvasGenerationAttempt) => void;
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      let signal: AbortSignal | undefined;
      jest
        .spyOn(CanvasGenerationService.prototype, method)
        .mockImplementationOnce((...args: any[]) => {
          signal = args[args.length - 1];
          started();
          return new Promise((resolve) => {
            finish = resolve;
          });
        });
      const output = Object.assign(new EventEmitter(), {
        writableEnded,
        destroyed: false,
        writeHead: jest.fn(),
        end: jest.fn(),
      });
      const route = handleCanvasProjectRoute({
        request: Readable.from([Buffer.from(JSON.stringify(options))]) as any,
        response: output as any,
        method: 'POST',
        suffix:
          'canvases/' +
          options.canvasId +
          '/generation/' +
          (method === 'createVideo' ? 'video' : randomUUID() + '/retry'),
        searchParams: new URLSearchParams(),
        key: 'project',
        registry: { resolve: () => ({ path: root }) } as any,
        remoteProxyManager: {} as any,
      });
      await ready;
      output.emit('close');
      expect(signal?.aborted).toBe(!writableEnded);
      finish({ id: randomUUID(), status: 'pending' } as CanvasGenerationAttempt);
      expect(await route).toBe(true);
      expect(output.listenerCount('close')).toBe(0);
      if (!writableEnded) expect(output.end).not.toHaveBeenCalled();
    }
  );

  test.each(['preparation', 'dispatch'])(
    'real HTTP disconnect during %s releases only local waiting',
    async (phase) => {
      const registry = new ConsoleProjects(path.join(directory, 'http-projects.json'));
      const registered = registry.add(root);
      const server = await startConsoleServer({
        registry,
        execute: async () => ({ ok: true }),
        html: '',
        version: 'test',
        remoteProxyManager: { closeAll: async () => {} } as any,
      });
      let aborted!: () => void;
      const serverAborted = new Promise<void>((resolve) => {
        aborted = resolve;
      });
      let finished!: () => void;
      const serviceFinished = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const create = CanvasGenerationService.prototype.createVideo;
      jest
        .spyOn(CanvasGenerationService.prototype, 'createVideo')
        .mockImplementationOnce(function (input, signal) {
          signal!.addEventListener('abort', aborted, { once: true });
          return create.call(this, input, signal).finally(finished);
        });
      let ready!: () => void;
      const preparing = new Promise<void>((resolve) => {
        ready = resolve;
      });
      let finishPreparation!: () => void;
      const preparation = new Promise<void>((resolve) => {
        finishPreparation = resolve;
      });
      if (phase === 'preparation') {
        jest
          .spyOn(MakerCanvasFiles.prototype, 'assertWritableForGeneration')
          .mockImplementationOnce(() => {
            ready();
            return preparation;
          });
      }
      const held = phase === 'dispatch' ? holdNextRequest() : undefined;
      const writeHead = ServerResponse.prototype.writeHead;
      let writesAfterDisconnect = 0;
      jest.spyOn(ServerResponse.prototype, 'writeHead').mockImplementation(function (
        ...args: any[]
      ) {
        if (this.destroyed && !this.writableEnded) writesAfterDisconnect++;
        return (writeHead as any).apply(this, args);
      });
      const url =
        server.origin +
        '/api/projects/' +
        registered.key +
        '/canvases/' +
        options.canvasId +
        '/generation/video';
      const controller = new AbortController();
      const requestOptions = {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.origin },
        body: JSON.stringify(options),
      };
      const request = fetch(url, { ...requestOptions, signal: controller.signal }).catch(
        (error) => error
      );
      try {
        await (held?.ready || preparing);
        if (!held) expect(service.list()).toEqual([]);
        controller.abort();
        await serverAborted;
        if (held) {
          expect(service.list()[0]).toMatchObject({
            status: 'canceled',
            localWaitCanceledAt: expect.any(String),
          });
          remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
          const next = await fetch(url, requestOptions);
          expect(next.status).toBe(200);
          expect(await next.json()).toMatchObject({ taskId: 'new-task' });
          held.finish(response({ task_id: 'late-task', status: 'pending' }));
        } else {
          finishPreparation();
        }
        await serviceFinished;
        await request;
        await new Promise((resolve) => setImmediate(resolve));
        if (held) {
          expect(service.list().find((attempt) => attempt.taskId === 'late-task')).toMatchObject({
            status: 'canceled',
            localWaitCanceledAt: expect.any(String),
          });
          expect(remote).toHaveBeenCalledTimes(2);
        } else {
          expect(remote).not.toHaveBeenCalled();
          expect(service.list()).toEqual([]);
        }
        expect(writesAfterDisconnect).toBe(0);
      } finally {
        controller.abort();
        finishPreparation();
        held?.finish(response({ task_id: 'late-task', status: 'pending' }));
        await request;
        await serviceFinished;
        await server.close();
      }
    }
  );

  test.each([false, true])(
    'rejects only active duplicate submissions across service instances (target: %s)',
    async (withTarget) => {
      if (withTarget) options.targetNodeId = (await addVideoTargets())[0].id;
      const held = holdNextRequest();
      const submitting = service.createVideo(options);
      await held.ready;
      const second = new CanvasGenerationService(root, {} as any);
      try {
        expect(second.history().busy).toBeUndefined();
        await expect(second.createVideo(options)).rejects.toMatchObject({ status: 409 });
        if (withTarget) {
          const otherSource = (await files.load(options.canvasId)).nodes[1];
          await expect(
            second.createVideo({
              ...options,
              sourceImageId: otherSource.id,
              sourceImagePath: otherSource.assetPath!,
            })
          ).rejects.toMatchObject({ status: 409 });
        }
        expect(remote).toHaveBeenCalledTimes(1);
        expect(second.list()).toHaveLength(1);
      } finally {
        held.finish(response({ task_id: 'own-task', status: 'pending' }));
        await submitting;
      }
      remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
      expect((await second.createVideo(options)).taskId).toBe('new-task');
      expect(
        fs.existsSync(path.join(process.env.TAPTAP_MAKER_HOME!, 'console/canvas-video.json'))
      ).toBe(false);
    }
  );

  test('active submission permits other targets, canvases and projects', async () => {
    const targets = await addVideoTargets();
    const held = holdNextRequest();
    const submitting = service.createVideo({ ...options, targetNodeId: targets[0].id });
    await held.ready;
    try {
      remote.mockResolvedValue(response({ task_id: 'new-task', status: 'pending' }));
      expect((await service.createVideo({ ...options, targetNodeId: targets[1].id })).status).toBe(
        'pending'
      );
      const otherCanvas = await files.create('another canvas', 'starter');
      expect(
        (
          await service.createVideo({
            ...options,
            canvasId: otherCanvas.id,
            sourceImageId: otherCanvas.nodes[0].id,
            sourceImagePath: otherCanvas.nodes[0].assetPath!,
          })
        ).status
      ).toBe('pending');
      const otherProject = await project('second');
      expect(
        (
          await new CanvasGenerationService(otherProject.root, {} as any).createVideo(
            otherProject.options
          )
        ).status
      ).toBe('pending');
      expect(remote).toHaveBeenCalledTimes(4);
    } finally {
      held.finish(response({ task_id: 'own-task', status: 'pending' }));
      await submitting;
    }
  });

  test.each(['pending', 'failed', 'succeeded'])(
    'cancel releases the same target immediately and late %s cannot unlock its replacement or modify the canvas',
    async (status) => {
      options.targetNodeId = (await addVideoTargets())[0].id;
      const before = await files.load(options.canvasId);
      const oldRequest = holdNextRequest();
      const submitting = service.createVideo(options);
      await oldRequest.ready;
      const oldAttempt = service.list()[0];
      const second = new CanvasGenerationService(root, {} as any);
      const canceled = second.cancel(oldAttempt.id, options.canvasId);
      const newRequest = holdNextRequest();
      const replacement = second.createVideo(options);
      try {
        await newRequest.ready;
        oldRequest.finish(
          status === 'succeeded' ? videoResult() : response({ task_id: 'own-task', status })
        );
        expect(await submitting).toMatchObject({
          taskId: 'own-task',
          localWaitCanceledAt: canceled.localWaitCanceledAt,
        });
        second.cancel(oldAttempt.id, options.canvasId);
        await expect(service.createVideo(options)).rejects.toMatchObject({ status: 409 });
        expect(await files.load(options.canvasId)).toEqual(before);
        expect(remote).toHaveBeenCalledTimes(2);
      } finally {
        oldRequest.finish(response({ task_id: 'own-task', status: 'pending' }));
        newRequest.finish(response({ task_id: 'new-task', status: 'pending' }));
        await Promise.all([submitting, replacement]);
      }
      expect(await replacement).toMatchObject({ taskId: 'new-task', status: 'pending' });
    }
  );

  test.each(['succeeded', 'failed'])(
    'persists a late stop marker after %s without losing the terminal result',
    async (status) => {
      remote.mockResolvedValueOnce(
        status === 'succeeded'
          ? videoResult()
          : response({ task_id: 'own-task', status, error: 'remote failure' })
      );
      const attempt = await service.createVideo(options);
      const before = await files.load(options.canvasId);
      const canceled = service.cancel(attempt.id, options.canvasId);
      expect(canceled).toMatchObject({
        status: attempt.status,
        taskId: attempt.taskId,
        remoteStatus: attempt.remoteStatus,
        localWaitCanceledAt: expect.any(String),
      });
      expect(canceled.resultAssetPath).toBe(attempt.resultAssetPath);
      expect(canceled.error).toBe(attempt.error);
      expect(new CanvasGenerationService(root, {} as any).list()[0]).toEqual(canceled);
      expect(await files.load(options.canvasId)).toEqual(before);
      expect(remote).toHaveBeenCalledTimes(1);
    }
  );

  test('a canceled query still rejects duplicate queries but cannot block a new submission', async () => {
    remote.mockResolvedValueOnce(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 120_001;
    const held = holdNextRequest();
    const querying = service.queryVideo(attempt.id);
    await held.ready;
    try {
      service.cancel(attempt.id);
      await expect(service.queryVideo(attempt.id)).rejects.toMatchObject({ status: 409 });
      remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
      expect((await service.createVideo(options)).taskId).toBe('new-task');
      expect(remote).toHaveBeenCalledTimes(3);
    } finally {
      held.finish(response({ task_id: 'own-task', status: 'pending' }));
      await querying;
    }
  });

  test.each(['pending', 'unknown', 'canceled', 'running'] as const)(
    'historical %s with an invalid creation time cannot block a new submission',
    async (status) => {
      persist({
        id: randomUUID(),
        canvasId: options.canvasId,
        kind: 'video',
        toolName: 'create_video_task',
        prompt: 'history',
        status,
        taskId: 'own-task',
        createdAt: 'invalid',
        updatedAt: new Date().toISOString(),
      });
      remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
      expect((await service.createVideo(options)).taskId).toBe('new-task');
      expect(remote).toHaveBeenCalledTimes(1);
    }
  );

  test('failed initial persistence releases the submission guard without sending a paid request', async () => {
    const writing = jest.spyOn(service as any, 'writeAttempt').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(service.createVideo(options)).rejects.toThrow('disk full');
    expect(remote).not.toHaveBeenCalled();
    writing.mockRestore();
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    expect((await service.createVideo(options)).taskId).toBe('new-task');
  });

  test('failed cancel persistence keeps the active submission protected', async () => {
    const held = holdNextRequest();
    const submitting = service.createVideo(options);
    await held.ready;
    const attempt = service.list()[0];
    const writing = jest.spyOn(service as any, 'writeAttempt').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    try {
      expect(() => service.cancel(attempt.id)).toThrow('disk full');
      await expect(service.createVideo(options)).rejects.toMatchObject({ status: 409 });
      expect(service.list()[0].localWaitCanceledAt).toBeUndefined();
      expect(remote).toHaveBeenCalledTimes(1);
    } finally {
      writing.mockRestore();
      held.finish(response({ task_id: 'own-task', status: 'pending' }));
      await submitting;
    }
  });

  test('preserves an upstream concurrency rejection without automatically resubmitting', async () => {
    const raw = {
      ...response({ execution_state: 'not_executed', error: 'Maker MCP concurrency limit' }),
      isError: true,
    };
    const rejection = new RemoteProxyToolResultError('create_video_task', raw);
    remote.mockRejectedValueOnce(rejection);
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({
      status: 'failed',
      executionState: 'not_executed',
      error: rejection.message,
    });
    expect(service.list()[0].error).toContain('Maker MCP concurrency limit');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote.mock.calls[0][0].retryExpiredAuth).toBe(false);
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    expect((await service.createVideo(options)).taskId).toBe('new-task');
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('pending and canceled history does not block explicit submissions across projects or recreation', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    const other = await project('second');
    const restarted = new CanvasGenerationService(other.root, {} as any);
    expect(restarted.history().busy).toBeUndefined();
    expect((await restarted.createVideo(other.options)).status).toBe('pending');
    service.cancel(attempt.id);
    expect((await new CanvasGenerationService(root, {} as any).createVideo(options)).status).toBe(
      'pending'
    );
    expect(remote).toHaveBeenCalledTimes(3);
  });

  test('unknown without task ID permits an explicit submission immediately without borrowing or replaying a task', async () => {
    remote.mockRejectedValue(
      new Error('another active task: remote_result: {"task_id":"someone-else"}')
    );
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({ status: 'unknown', failureStage: 'submission' });
    expect(attempt.taskId).toBeUndefined();
    const restarted = new CanvasGenerationService(root, {} as any);
    expect(restarted.history().busy).toBeUndefined();
    await expect(restarted.retry(attempt.id)).rejects.toThrow('不能自动重试');
    expect(remote).toHaveBeenCalledTimes(1);
    expect(restarted.list()[0]).toEqual(attempt);
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    expect(await restarted.createVideo(options)).toMatchObject({ taskId: 'new-task' });
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('another project can submit while the original ID remains queryable', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 120_001;
    const other = await project('second');
    const restarted = new CanvasGenerationService(other.root, {} as any);
    expect(restarted.history().busy).toBeUndefined();
    remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
    await restarted.createVideo(other.options);
    remote.mockResolvedValueOnce(videoResult());
    expect(await service.queryVideo(attempt.id)).toMatchObject({
      taskId: 'own-task',
      status: 'succeeded',
    });
    expect(restarted.history().busy).toBeUndefined();
    expect(service.list().find((item) => item.id === attempt.id)?.createdAt).toBe(
      attempt.createdAt
    );
    expect(
      remote.mock.calls.filter(([request]) => request.name === 'create_video_task')
    ).toHaveLength(2);
  });

  test('querying never extends the six-hour query window', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    elapsed = 120_001;
    await service.queryVideo(attempt.id);
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

  test.each(['invalid JSON', 'stale reservation'])(
    'ignores old reservation files and locks even when the attempt is missing: %s',
    async (reservation) => {
      remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
      const attempt = await service.createVideo(options);
      fs.unlinkSync(path.join(root, '.maker/canvases/attempts', attempt.id + '.json'));
      const filename = path.join(process.env.TAPTAP_MAKER_HOME!, 'console/canvas-video.json');
      fs.mkdirSync(filename + '.lock', { recursive: true });
      const contents =
        reservation === 'invalid JSON'
          ? '{invalid'
          : JSON.stringify({
              projectRoot: root,
              canvasId: attempt.canvasId,
              attemptId: attempt.id,
              createdAt: attempt.createdAt,
            });
      fs.writeFileSync(filename, contents);
      expect(service.history().busy).toBeUndefined();
      expect((await service.createVideo(options)).status).toBe('pending');
      expect(fs.readFileSync(filename, 'utf8')).toBe(contents);
      expect(fs.existsSync(filename + '.lock')).toBe(true);
      expect(remote).toHaveBeenCalledTimes(2);
    }
  );

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
      await expect(service.createVideo(options)).rejects.toMatchObject({ status: 409 });
      return materializeRemoteProxyToolAssets({
        toolName: request.name,
        targetDir: root,
        result: raw,
      });
    });
    const attempt = await service.createVideo(options);
    expect(attempt).toMatchObject({ status: 'unknown', executionState: 'unknown' });
    expect(service.history().busy).toBeUndefined();
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
      expect(service.history().busy).toBeUndefined();
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
      expect(second.history().busy).toBeUndefined();
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
    expect(service.history().busy).toBeUndefined();
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

  test('legacy unknown in another registered project does not block a submission', async () => {
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
    remote.mockResolvedValue(response({ task_id: 'new-task', status: 'pending' }));
    expect(
      await new CanvasGenerationService(other.root, {} as any).createVideo(other.options)
    ).toMatchObject({ taskId: 'new-task' });
    expect(remote).toHaveBeenCalledTimes(1);
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

  test('first pending query waits 120 seconds across refresh and cancel', async () => {
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
    expect(refreshed.history().busy).toBeUndefined();
    expect(remote).toHaveBeenCalledTimes(2);
  });

  test('simultaneous submissions across projects both reach Maker MCP without auth retries', async () => {
    const other = await project('second');
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const results = await Promise.allSettled([
      service.createVideo(options),
      new CanvasGenerationService(other.root, {} as any).createVideo(other.options),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(remote.mock.calls.every(([request]) => request.retryExpiredAuth === false)).toBe(true);
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

  test('running attempts survive a fresh process as unknown without a global slot', async () => {
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
    expect(result.busy).toBeUndefined();
    expect(result.items[0].status).toBe('unknown');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  test('missing attempts do not block new explicit submissions', async () => {
    remote.mockResolvedValue(response({ task_id: 'own-task', status: 'pending' }));
    const attempt = await service.createVideo(options);
    fs.unlinkSync(path.join(root, '.maker/canvases/attempts', attempt.id + '.json'));
    expect(service.history().busy).toBeUndefined();
    expect((await service.createVideo(options)).status).toBe('pending');
    expect(remote).toHaveBeenCalledTimes(2);
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
      expect(service.history().busy).toBeUndefined();
      await expect(service.retry(attempt.id)).rejects.toThrow('不能自动重试');
      expect(remote).toHaveBeenCalledTimes(1);
      persist({ ...attempt, status: 'failed', remoteStatus: 'failed' });
      const reloaded = new CanvasGenerationService(root, {} as any);
      expect(reloaded.history().busy).toBeUndefined();
      expect(reloaded.history().items[0]).toMatchObject({
        status: 'unknown',
        executionState: 'unknown',
      });
      if (taskId) {
        remote.mockResolvedValueOnce(response({ task_id: taskId, status: 'failed' }));
        expect((await reloaded.queryVideo(attempt.id)).status).toBe('failed');
        expect(reloaded.history().busy).toBeUndefined();
      }
      remote.mockResolvedValueOnce(response({ task_id: 'new-task', status: 'pending' }));
      expect((await reloaded.createVideo(options)).taskId).toBe('new-task');
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
      expect(actualService.history().busy).toBeUndefined();
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
