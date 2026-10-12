import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { CanvasRecognitionService } from '../canvasRecognition.js';
import { webRecognitionInput } from '../../canvas/webRecognition.js';

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
  const replies = { ...prepared, cut, text, model: 'ChatGPT web / unknown model' };
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
            bbox: { texts: [{ text: '购买' }] },
          },
        },
      },
    ],
  });
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
  expect(service.modelsForDisplay()).toEqual([
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
  ['server', '当前选择的是 Server API，但服务端识图尚未开通'],
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
