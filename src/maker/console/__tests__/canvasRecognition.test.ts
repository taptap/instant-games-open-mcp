import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../../canvas/files.js';
import { CanvasRecognitionService } from '../canvasRecognition.js';

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
  id: 'B1',
  name: '购买按钮',
  category: 'action',
  rect: [0, 0, 1, 1],
  parentId: null,
  zIndex: 1,
  states: ['normal'],
  cutout: true,
};
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
  document.nodes.push(node);
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

test('persists results, binds image identity and deduplicates concurrent requests', async () => {
  const { canvasId, input } = await setup();
  const fetcher = jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ elements: [element] }) } }],
        })
      )
  );
  const service = new CanvasRecognitionService(root, models, fetcher);
  const [first, duplicate] = await Promise.all([
    service.run(canvasId, input),
    service.run(canvasId, input),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(first).toEqual(duplicate);
  expect(first.status).toBe('succeeded');
  expect(first.result?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(first.result?.elements[0].id).toBe('B1');
  expect(new CanvasRecognitionService(root, models, fetcher).query(canvasId, input.id)).toEqual(
    first
  );
  await service.run(canvasId, input);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(service.modelsForDisplay()).toEqual([{ id: 'vision-a', model: 'test-vision' }]);
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

test.each(['{"elements":[]}', 'null', 'not JSON'])(
  'invalid recognition output %s gives model-switch guidance',
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
    expect(attempt.error).toContain('切换识图模型');
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
  document.nodes[0].sectionId = groupId;
  document.nodes[0].templatePending = true;
  const saved = await files.save(canvasId, document, document.revision);
  const fetcher = jest.fn();
  const service = new CanvasRecognitionService(root, models, fetcher);
  await expect(service.run(canvasId, { ...input, revision: saved.revision })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  [400, 'failed', '切换'],
  [422, 'failed', '切换'],
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
