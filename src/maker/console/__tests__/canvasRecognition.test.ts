import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { CanvasRecognitionService } from '../canvasRecognition.js';
import { webRecognitionInput } from '../../canvas/webRecognition.js';
import { saveProjectConfig } from '../../storage.js';
import * as pat from '../../git/pat.js';
import * as config from '../../config.js';
import { serverRecognitionBody } from '../serverRecognition.js';
import { saveVisionSettings } from '../visionSettings.js';

let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-recognition-')));
});
afterEach(() => {
  fs.rmSync(root, { force: true, recursive: true });
});
const models = [
  { id: 'vision-a', model: 'test-vision', endpoint: 'https://example.invalid/chat/completions' },
];
const element = {
  id: 'E001',
  name: '购买按钮',
  type: 'button',
  bbox: [0, 0, 1, 1],
  parent: null,
};
function modelResponse(data: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] })
  );
}
const cutResponse = () =>
  modelResponse({ pass: 'cut', image: { width: 1, height: 1 }, elements: [element] });
const textResponse = () =>
  modelResponse({
    pass: 'text',
    image: { width: 1, height: 1 },
    texts: [
      {
        id: 'T001',
        text: '购买',
        bbox: [0, 0, 1, 1],
        parentId: 'E001',
        role: 'button',
        align: 'center',
        color: '#F2D48A',
        bold: true,
        cutout: false,
      },
    ],
  });

test('web source hands off to the host Agent without sending API requests', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest.fn();
  const service = new CanvasRecognitionService(
    root,
    [{ ...models[0], source: 'chatgpt-web' }],
    fetcher
  );
  await expect(service.run(canvasId, input)).rejects.toThrow('登录可选');
  expect(fetcher).not.toHaveBeenCalled();
  expect(() => service.query(canvasId, input.id)).toThrow('未找到');
});

test('host browser replies support an unknown guest model and reject changed image identities', async () => {
  const { canvasId, input } = await setup();
  const files = new MakerCanvasFiles(root);
  const document = await files.load(canvasId);
  delete document.nodes.find((node) => node.id === input.nodeId)!.uiRecognition!.pendingId;
  await files.save(canvasId, document, document.revision);
  const prepared = await webRecognitionInput(root, canvasId, input.nodeId, {}, false);
  const cut = JSON.parse((await cutResponse().json()).choices[0].message.content);
  const text = JSON.parse((await textResponse().json()).choices[0].message.content);
  const replies = {
    ...prepared,
    cut,
    text,
    model: 'ChatGPT web / unknown model',
    durationMs: 18400,
  };
  const second = await webRecognitionInput(root, canvasId, input.nodeId, replies, false);
  expect(second).toMatchObject({ phase: 'text' });
  const result = await webRecognitionInput(root, canvasId, input.nodeId, replies, true);
  expect(result).toMatchObject({
    nodes: [
      {
        id: input.nodeId,
        uiRecognition: {
          result: {
            model: 'ChatGPT web / unknown model',
            durationMs: 18400,
            bbox: { texts: [{ text: '购买' }] },
          },
        },
      },
    ],
  });
  await expect(
    webRecognitionInput(root, canvasId, input.nodeId, { ...replies, durationMs: 0 }, true)
  ).rejects.toThrow('durationMs');
  await expect(
    webRecognitionInput(
      root,
      canvasId,
      input.nodeId,
      {
        ...replies,
        design: { ...('design' in prepared ? prepared.design : {}), sha256: '0'.repeat(64) },
      },
      true
    )
  ).rejects.toThrow('输入已变化');
});
async function setup() {
  const files = new MakerCanvasFiles(root);
  const document = await files.create('识图测试', 'empty');
  const media = await files.importImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64'
    )
  );
  const id = randomUUID();
  const node = {
    id: randomUUID(),
    type: 'image' as const,
    title: '原稿',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    assetPath: media.relativePath,
    uiRecognition: { enabled: true, model: 'vision-a', results: [], pendingId: id },
  };
  const original = { ...node, id: randomUUID(), title: '原设计稿', uiRecognition: undefined };
  Object.assign(node, {
    generation: {
      operation: 'variant',
      prompt: '去文字',
      sourceImageId: original.id,
      sourceImageIds: [original.id],
      referenceImagePaths: [media.relativePath],
    },
  });
  document.nodes.push(original, node);
  document.edges.push({ id: randomUUID(), from: original.id, to: node.id, kind: 'image-variant' });
  const saved = await files.save(document.id, document, document.revision);
  return {
    canvasId: saved.id,
    input: {
      id,
      nodeId: node.id,
      model: 'vision-a',
      revision: saved.revision,
      width: 1,
      height: 1,
    },
  };
}

test('preserves low reasoning for the existing Sol model', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(cutResponse())
    .mockResolvedValueOnce(textResponse());
  const service = new CanvasRecognitionService(
    root,
    [{ ...models[0], model: 'gpt-6.1-sol' }],
    fetcher
  );
  expect((await service.run(canvasId, input)).status).toBe('succeeded');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).reasoning_effort).toBe('low');
});

test('persists results, binds image identity and deduplicates concurrent requests', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(cutResponse())
    .mockResolvedValueOnce(textResponse());
  const service = new CanvasRecognitionService(root, models, fetcher);
  const [first, duplicate] = await Promise.all([
    service.run(canvasId, input),
    service.run(canvasId, input),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(first).toEqual(duplicate);
  expect(first.status).toBe('succeeded');
  expect(first.result?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(first.result?.elements[0].id).toBe('E001');
  expect(first.result?.bbox?.texts[0].text).toBe('购买');
  const firstBody = JSON.parse(fetcher.mock.calls[0][1].body);
  const secondBody = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(firstBody.reasoning_effort).toBeUndefined();
  expect(secondBody.reasoning_effort).toBeUndefined();
  expect(firstBody.messages[0].content[0].text).toContain('不要输出文字层');
  expect(secondBody.messages[0].content[0].text).toContain('这次只识别');
  expect(secondBody.messages[0].content[0].text).toContain('E001');
  expect(new CanvasRecognitionService(root, models, fetcher).query(canvasId, input.id)).toEqual(
    first
  );
  await service.run(canvasId, input);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(await service.modelsForDisplay()).toEqual([
    { id: 'vision-a', model: 'test-vision', source: 'custom' },
  ]);
});

test('a lost response stays unknown and reusing the ID never repeats a paid request', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest.fn(async () => {
    throw new Error('network failure with secret URL');
  });
  const service = new CanvasRecognitionService(root, models, fetcher);
  expect((await service.run(canvasId, input)).status).toBe('unknown');
  const again = await service.run(canvasId, input);
  expect(again.status).toBe('unknown');
  expect(again.error).not.toContain('secret');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([
  ['local', '画布不能直接调用客户端模型'],
  ['server', '需要当前目录绑定有效的 Maker 项目'],
])(
  'unsupported vision source %s stops clearly before submitting a local request',
  async (source, message) => {
    const { canvasId, input } = await setup();
    const fetcher = jest.fn();
    const service = new CanvasRecognitionService(
      root,
      [
        {
          id: 'vision-a',
          model: 'gpt-6.1-sol',
          endpoint: '',
          source: source as 'local' | 'server',
        },
      ],
      fetcher
    );
    await expect(service.run(canvasId, input)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  }
);

test.each(['{"elements":[]}', 'null', 'not JSON'])(
  'invalid recognition output %s stops without switching models',
  async (content) => {
    const { canvasId, input } = await setup();
    const service = new CanvasRecognitionService(
      root,
      models,
      async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))
    );
    const attempt = await service.run(canvasId, input);
    expect(attempt.status).toBe('failed');
    expect(attempt.result).toBeUndefined();
    expect(attempt.error).toContain('所选模型');
  }
);

test('stale revisions and cross-canvas result access cannot submit or leak records', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest.fn();
  const service = new CanvasRecognitionService(root, models, fetcher);
  await expect(service.run(canvasId, { ...input, revision: input.revision - 1 })).rejects.toThrow(
    '画布已变化'
  );
  expect(fetcher).not.toHaveBeenCalled();
  const valid = new CanvasRecognitionService(
    root,
    models,
    async () => new Response('{}', { status: 400 })
  );
  await valid.run(canvasId, input);
  expect(() => valid.query(randomUUID(), input.id)).toThrow('不属于当前画布');
});

test('querying missing attempts does not create storage', () => {
  const service = new CanvasRecognitionService(root, models);
  expect(() => service.query(randomUUID(), randomUUID())).toThrow('未找到');
  expect(fs.existsSync(path.join(root, '.maker', 'canvases', 'recognition-attempts'))).toBe(false);
});

test.each([503, 'invalid'])(
  'second-pass failure %s retains cut results without replay',
  async (failure) => {
    const { canvasId, input } = await setup();
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(cutResponse())
      .mockResolvedValueOnce(
        failure === 503
          ? new Response('provider detail', { status: 503 })
          : modelResponse({
              pass: 'text',
              image: { width: 1, height: 1 },
              texts: [{ id: 'invalid' }],
            })
      );
    const service = new CanvasRecognitionService(root, models, fetcher);
    const attempt = await service.run(canvasId, input);
    expect(attempt.status).toBe(failure === 503 ? 'unknown' : 'failed');
    expect(attempt.phase).toBe('text');
    expect(attempt.cut?.elements[0].id).toBe('E001');
    expect(attempt.result).toBeUndefined();
    await service.run(canvasId, input);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
);

test('actual image sizes and a unique original are checked before billing', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest.fn();
  const service = new CanvasRecognitionService(root, models, fetcher);
  await expect(service.run(canvasId, { ...input, width: 2 })).rejects.toThrow('真实尺寸');
  const files = new MakerCanvasFiles(root);
  const document = await files.load(canvasId);
  document.edges = [];
  const saved = await files.save(canvasId, document, document.revision);
  await expect(service.run(canvasId, { ...input, revision: saved.revision })).rejects.toThrow(
    '唯一'
  );
  expect(fetcher).not.toHaveBeenCalled();
});

test('pending text removal cannot submit recognition of an old image', async () => {
  const { canvasId, input } = await setup();
  const files = new MakerCanvasFiles(root);
  const document = await files.load(canvasId);
  const groupId = randomUUID();
  document.nodes.push({
    id: groupId,
    type: 'section',
    title: 'UI',
    x: 0,
    y: 0,
    width: 400,
    height: 400,
  });
  const source = document.nodes.find((node) => node.id === input.nodeId)!;
  source.sectionId = groupId;
  source.templatePending = true;
  const saved = await files.save(canvasId, document, document.revision);
  const fetcher = jest.fn();
  const service = new CanvasRecognitionService(root, models, fetcher);
  await expect(service.run(canvasId, { ...input, revision: saved.revision })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  [400, 'failed', '模型名称'],
  [422, 'failed', '模型名称'],
  [401, 'failed', '密钥'],
  [429, 'failed', '限流'],
  [503, 'unknown', '原请求'],
])(
  'HTTP %i gives actionable guidance without replay or credential exposure',
  async (status, state, hint) => {
    const { canvasId, input } = await setup();
    const fetcher = jest.fn(
      async () => new Response('secret-provider-detail', { status: Number(status) })
    );
    const service = new CanvasRecognitionService(root, models, fetcher);
    const attempt = await service.run(canvasId, input);
    expect(attempt.status).toBe(state);
    expect(attempt.error).toContain(hint);
    expect(attempt.error).not.toContain('secret-provider-detail');
    await service.run(canvasId, input);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
);

describe('Server API integration', () => {
  const appId = '11111111-1111-4111-8111-111111111111';
  beforeEach(() => {
    saveProjectConfig(root, { project_id: appId });
    jest.spyOn(pat, 'requireMakerPat').mockReturnValue({ token: 'mock-pat-secret' });
    jest.spyOn(config, 'getMakerEnvironment').mockReturnValue('rnd');
    jest.spyOn(config, 'getMakerApiBaseUrl').mockReturnValue('https://example.invalid/api/v1');
  });
  afterEach(() => jest.restoreAllMocks());
  const serverModels = [
    { id: 'vision-a', model: 'gpt-6.1-sol', endpoint: '', source: 'server' as const },
  ];
  const reply = (pass: 'cut' | 'text', extra: Record<string, unknown> = {}, status = 200) =>
    new Response(
      JSON.stringify({
        request_id: pass + '-request',
        model: 'gpt-6.1-sol',
        reasoning_effort: 'low',
        output_format: 'json_object',
        status: 'succeeded',
        credits: 5,
        output: {
          pass,
          image: { width: 1, height: 1 },
          ...(pass === 'cut' ? { elements: [element] } : { texts: [] }),
        },
        ...extra,
      }),
      { status }
    );

  test.each([true, false])(
    'new submissions honor availability (%s) without changing existing attempts',
    async (available) => {
      const previousHome = process.env.TAPTAP_MAKER_HOME;
      process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
      try {
        saveVisionSettings({ source: 'server' });
        const { canvasId, input } = await setup();
        input.model = 'gpt-6.1-sol';
        const fetcher = jest
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                error: { code: available ? 'MODEL_INFERENCE_NOT_FOUND' : 'PROJECT_NOT_FOUND' },
              }),
              { status: 404 }
            )
          )
          .mockResolvedValueOnce(reply('cut', { status: 'running', output: null }, 202))
          .mockResolvedValueOnce(reply('cut'));
        const service = new CanvasRecognitionService(root, undefined, fetcher);
        if (available) {
          expect((await service.run(canvasId, input)).status).toBe('running');
          await service.refresh(canvasId, input.id);
          expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'POST', 'GET']);
          expect(fetcher.mock.calls[2][0]).toContain('/cut-request');
        } else {
          await expect(service.run(canvasId, input)).rejects.toMatchObject({ status: 409 });
          expect(fetcher).toHaveBeenCalledTimes(1);
          expect(() => service.query(canvasId, input.id)).toThrow('未找到识图请求记录');
        }
      } finally {
        if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
        else process.env.TAPTAP_MAKER_HOME = previousHome;
      }
    }
  );

  test('two persisted calls use PAT, bound project, fixed protocol and deduplicated credits', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest
      .fn()
      .mockImplementationOnce(async () => {
        const stored = new CanvasRecognitionService(root).query(canvasId, input.id);
        expect(stored.server?.cut.submittedAt).toBeDefined();
        return reply('cut');
      })
      .mockResolvedValueOnce(reply('text', { credits: 3 }));
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    const [result, concurrent] = await Promise.all([
      service.run(canvasId, input),
      service.run(canvasId, input),
    ]);
    expect(result.status).toBe('succeeded');
    expect(concurrent.result?.id).toBe(result.result?.id);
    expect(result.result?.credits).toBe(8);
    expect(result.result?.bbox?.elements).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://example.invalid/api/v1/apps/' + appId + '/model-inference');
    expect(options.headers.Authorization).toBe('Bearer mock-pat-secret');
    expect(options.headers['Idempotency-Key']).toBe(input.id + ':cut');
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual(['image', 'prompt', 'response_format']);
    expect(body.response_format).toBe('json_object');
    expect(body.image.mime_type).toBe('image/png');
    expect(body.image.data).not.toContain('data:');
    expect(JSON.stringify(result)).not.toContain('mock-pat-secret');
    expect((await service.refresh(canvasId, input.id)).result?.credits).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('202 survives restart; GET finishes cut without submitting text; explicit recovery continues', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(reply('cut', { status: 'running', output: null }, 202))
      .mockResolvedValueOnce(reply('cut'))
      .mockResolvedValueOnce(reply('text'));
    const first = new CanvasRecognitionService(root, serverModels, fetcher);
    expect((await first.run(canvasId, input)).status).toBe('running');
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    const queried = await service.refresh(canvasId, input.id);
    expect(queried.phase).toBe('text');
    expect(queried.result).toBeUndefined();
    expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'GET']);
    expect(fetcher.mock.calls[1][0]).toContain('/cut-request');
    const result = await service.run(canvasId, { ...input, recover: true });
    expect(result.result?.credits).toBe(10);
    expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'GET', 'POST']);
  });

  test('lost response requires explicit recovery with exactly the same key and body', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('mock-pat-secret'))
      .mockResolvedValueOnce(reply('cut'))
      .mockResolvedValueOnce(reply('text'));
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    const unknown = await service.run(canvasId, input);
    expect(unknown.status).toBe('unknown');
    expect(unknown.error).not.toContain('mock-pat-secret');
    await service.refresh(canvasId, input.id);
    await service.run(canvasId, input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await service.run(canvasId, { ...input, recover: true })).status).toBe('succeeded');
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[1][1].headers).toEqual(fetcher.mock.calls[0][1].headers);
  });

  test('500 elements keep the text prompt bounded and attach text to the smallest known panel', async () => {
    const { canvasId, input } = await setup();
    const elements = Array.from({ length: 500 }, (_, index) => ({
      ...element,
      id: 'E' + String(index + 1).padStart(3, '0'),
      name: '素材'.repeat(100),
      type: index === 0 ? 'panel' : index === 1 ? 'button' : 'icon',
      bbox: index === 1 ? [0, 0, 0.5, 0.5] : [0, 0, 1, 1],
    }));
    const text = {
      id: 'T001',
      text: '购买',
      bbox: [0.1, 0.1, 0.1, 0.1],
      parentId: null,
      role: 'button',
      align: 'center',
      color: '#FFFFFF',
      bold: true,
      cutout: false,
    };
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        reply('cut', {
          output: { pass: 'cut', image: { width: 1, height: 1 }, elements },
        })
      )
      .mockResolvedValueOnce(
        reply('text', {
          output: { pass: 'text', image: { width: 1, height: 1 }, texts: [text] },
        })
      );
    const result = await new CanvasRecognitionService(root, serverModels, fetcher).run(
      canvasId,
      input
    );
    expect(result.status).toBe('succeeded');
    expect(result.result?.bbox?.elements).toHaveLength(500);
    expect(result.result?.bbox?.texts[0]).toEqual({ ...text, parentId: 'E002' });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).prompt.length).toBeLessThanOrEqual(10000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each(['cut-bytes', 'design-bytes', 'cut-path', 'design-path'])(
    'completed cut cannot continue text after %s changes',
    async (change) => {
      const { canvasId, input } = await setup();
      const files = new MakerCanvasFiles(root);
      let document = await files.load(canvasId);
      const cutNode = document.nodes.find((node) => node.id === input.nodeId)!;
      const designNode = document.nodes.find((node) => node.id !== input.nodeId)!;
      cutNode.assetPath = (
        await files.importImage(fs.readFileSync(files.readMedia(cutNode.assetPath!).file))
      ).relativePath;
      document = await files.save(canvasId, document, document.revision);
      input.revision = document.revision;
      const fetcher = jest
        .fn()
        .mockResolvedValueOnce(reply('cut', { status: 'running', output: null }, 202))
        .mockResolvedValueOnce(reply('cut'));
      const service = new CanvasRecognitionService(root, serverModels, fetcher);
      await service.run(canvasId, input);
      expect((await service.refresh(canvasId, input.id)).phase).toBe('text');
      const node = document.nodes.find(
        (item) => item.id === (change.startsWith('cut') ? cutNode.id : designNode.id)
      )!;
      if (change.endsWith('bytes'))
        fs.appendFileSync(files.readMedia(node.assetPath!).file, 'changed');
      else {
        node.assetPath = (
          await files.importImage(fs.readFileSync(files.readMedia(node.assetPath!).file))
        ).relativePath;
        await files.save(canvasId, document, document.revision);
      }
      const result = await service.run(canvasId, { ...input, recover: true });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('变化');
      expect(result.result).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );

  test('server recognition duration excludes waiting between explicit recovery operations', async () => {
    const { canvasId, input } = await setup();
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const fetcher = jest
      .fn()
      .mockImplementationOnce(async () => {
        now += 100;
        return reply('cut', { status: 'running', output: null }, 202);
      })
      .mockImplementationOnce(async () => {
        now += 200;
        return reply('cut');
      })
      .mockImplementationOnce(async () => {
        now += 300;
        return reply('text');
      });
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    await service.run(canvasId, input);
    now += 3600000;
    await service.refresh(canvasId, input.id);
    now += 3600000;
    const result = await new CanvasRecognitionService(root, serverModels, fetcher).run(canvasId, {
      ...input,
      recover: true,
    });
    expect(result.result?.durationMs).toBe(600);
    expect(result.server?.durationMs).toBe(600);
  });

  test('HTTP 200 business failure cannot trigger text generation or paid retry', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest.fn().mockImplementation(async () =>
      reply('cut', {
        status: 'failed',
        output: null,
        error: { code: 'MODEL_OUTPUT_INVALID', message: '无效输出', retryable: false },
      })
    );
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    const result = await service.run(canvasId, input);
    expect(result.status).toBe('failed');
    expect(result.server?.cut.credits).toBe(5);
    expect(result.error).toContain('MODEL_OUTPUT_INVALID');
    expect(result.result).toBeUndefined();
    await service.run(canvasId, { ...input, recover: true });
    expect(fetcher.mock.calls.filter((call) => call[1].method === 'POST')).toHaveLength(1);
  });

  test('billing recovery preserves key and replaces credits', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        reply('cut', {
          status: 'failed',
          output: null,
          error: { code: 'MODEL_INFERENCE_BILLING_FAILED', message: '等待结算', retryable: true },
        })
      )
      .mockResolvedValueOnce(reply('cut', { credits: 7 }))
      .mockResolvedValueOnce(reply('text'));
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    expect((await service.run(canvasId, input)).status).toBe('unknown');
    const result = await service.run(canvasId, { ...input, recover: true });
    expect(result.result?.credits).toBe(12);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[0][1].headers).toEqual(fetcher.mock.calls[1][1].headers);
  });

  test.each(['project', 'environment', 'expiry', 'image'])(
    'refuses unsafe %s recovery',
    async (change) => {
      const { canvasId, input } = await setup();
      const fetcher = jest.fn().mockRejectedValue(new Error('lost'));
      const service = new CanvasRecognitionService(root, serverModels, fetcher);
      const attempt = await service.run(canvasId, input);
      if (change === 'project') saveProjectConfig(root, { project_id: randomUUID() });
      if (change === 'environment')
        jest.spyOn(config, 'getMakerEnvironment').mockReturnValue('production');
      if (change === 'expiry') {
        attempt.server!.cut.submittedAt = '2020-01-01T00:00:00.000Z';
        fs.writeFileSync(
          path.join(root, '.maker/canvases/recognition-attempts', input.id + '.json'),
          JSON.stringify(attempt)
        );
      }
      if (change === 'image')
        fs.appendFileSync(new MakerCanvasFiles(root).readMedia(attempt.sourcePath).file, 'changed');
      expect((await service.run(canvasId, { ...input, recover: true })).status).toBe('failed');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  test('simple HTTP errors preserve diagnostics and never imply free usage', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INVALID_REQUEST', error: '请求无效' }), {
        status: 400,
      })
    );
    const service = new CanvasRecognitionService(root, serverModels, fetcher);
    const result = await service.run(canvasId, input);
    expect(result.server?.cut.error).toEqual({
      httpStatus: 400,
      code: 'INVALID_REQUEST',
      message: '请求无效',
    });
    expect(result.result).toBeUndefined();
    expect(result.server?.cut.credits).toBeUndefined();
    await service.refresh(canvasId, input.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('validates prompt and total pixels before any POST', async () => {
    const { canvasId, input } = await setup();
    const fetcher = jest.fn().mockRejectedValue(new Error('lost'));
    const result = await new CanvasRecognitionService(root, serverModels, fetcher).run(
      canvasId,
      input
    );
    const step = result.server!.cut;
    const files = new MakerCanvasFiles(root);
    expect(() => serverRecognitionBody(files, { ...step, prompt: 'x'.repeat(10001) })).toThrow(
      '10000'
    );
    jest.spyOn(files, 'imageInfo').mockReturnValue({ width: 8192, height: 8192 });
    expect(() =>
      serverRecognitionBody(files, { ...step, image: { ...step.image, width: 8192, height: 8192 } })
    ).toThrow('像素');
  });
});

test('invalid server Bbox preserves charged result without generating again', async () => {
  const { canvasId, input } = await setup();
  saveProjectConfig(root, { project_id: randomUUID() });
  const credential = jest.spyOn(pat, 'requireMakerPat').mockReturnValue({ token: 'mock' });
  const fetcher = jest.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          request_id: 'cut-request',
          status: 'succeeded',
          model: 'gpt-6.1-sol',
          reasoning_effort: 'low',
          output_format: 'json_object',
          credits: 5,
          output: {
            pass: 'cut',
            image: { width: 1, height: 1 },
            elements: [{ ...element, bbox: [0, 0, 20, 20] }],
          },
        })
      )
  );
  try {
    const service = new CanvasRecognitionService(
      root,
      [{ ...models[0], source: 'server' }],
      fetcher
    );
    const result = await service.run(canvasId, input);
    expect(result.status).toBe('failed');
    expect(result.server?.cut.credits).toBe(5);
    expect(result.result).toBeUndefined();
    await service.run(canvasId, { ...input, recover: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    credential.mockRestore();
  }
});
