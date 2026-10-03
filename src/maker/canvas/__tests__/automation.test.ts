import { CanvasAutomationBridge } from '../automationBridge.js';
import { prepareCanvasNodeUpdates, validateCanvasCommand } from '../automation.js';
import { defaultSequenceSettings } from '../sequenceModel.js';
import { emptyDocument, type CanvasNode } from '../model.js';

function fixture() {
  let now = 1000;
  const bridge = new CanvasAutomationBridge(() => now);
  const document = emptyDocument();
  const page = bridge.exchange('project', { canvasId: document.id, revision: 1 });
  const command = {
    requestId: 'request-1',
    pageId: page.pageId,
    canvasId: document.id,
    revision: 1,
    action: 'add-node',
    input: { type: 'note' },
  };
  const exchange = (results?: unknown[]) =>
    bridge.exchange('project', {
      pageId: page.pageId,
      canvasId: document.id,
      revision: 1,
      received: [command.requestId],
      results,
    });
  return {
    bridge,
    command,
    exchange,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('commands are scoped to a connected project, page and canvas', () => {
  const { bridge, command } = fixture();
  expect(() => bridge.submit('other', command)).toThrow('未连接');
  expect(() => bridge.submit('project', { ...command, canvasId: 'other' })).toThrow('切换');
  expect(() => validateCanvasCommand({ ...command, revision: undefined })).toThrow('revision');
  expect(() => validateCanvasCommand({ ...command, action: 'eval' })).toThrow('不支持');
  expect(() => validateCanvasCommand({ ...command, script: 'alert(1)' })).toThrow('字段');
});

test('lost exchange does not replay a dispatched command; result acknowledgement is repeatable', () => {
  const { bridge, command, exchange } = fixture();
  expect(bridge.submit('project', command).status).toBe('queued');
  expect(exchange().commands).toEqual([command]);
  expect(exchange().commands).toEqual([]);
  expect(bridge.submit('project', command).status).toBe('running');
  const results = [{ id: command.requestId, status: 'succeeded', result: { revision: 2 } }];
  expect(exchange(results).acknowledged).toEqual([command.requestId]);
  expect(exchange(results).acknowledged).toEqual([command.requestId]);
  expect(bridge.status('project', command.requestId).status).toBe('succeeded');
  expect(() => bridge.submit('project', { ...command, input: { type: 'image' } })).toThrow(
    'requestId'
  );
  expect(() => bridge.status('other', command.requestId)).toThrow('不存在');
});

test('queued expiration proves not dispatched, running page loss is unknown and late results are accepted', () => {
  const stale = fixture();
  stale.bridge.submit('project', stale.command);
  stale.advance(11000);
  expect(stale.exchange().commands).toEqual([]);
  expect(stale.bridge.status('project', stale.command.requestId).status).toBe('failed');
  const active = fixture();
  active.bridge.submit('project', active.command);
  active.exchange();
  active.advance(16000);
  expect(active.bridge.status('project', active.command.requestId).status).toBe('unknown');
  active.exchange([{ id: active.command.requestId, status: 'succeeded' }]);
  expect(active.bridge.status('project', active.command.requestId).status).toBe('succeeded');
});

test('inspection and stop can be submitted during a long task but other changes cannot', () => {
  const { bridge, command, exchange } = fixture();
  bridge.submit('project', { ...command, action: 'run' });
  exchange();
  expect(() => bridge.submit('project', { ...command, requestId: 'edit' })).toThrow('未完成');
  expect(
    bridge.submit('project', { ...command, requestId: 'inspect', action: 'inspect' }).status
  ).toBe('queued');
  expect(bridge.submit('project', { ...command, requestId: 'stop', action: 'stop' }).status).toBe(
    'queued'
  );
});

test('lost delivery is reported unknown instead of permanently blocking the page', () => {
  const { bridge, command, exchange } = fixture();
  bridge.submit('project', command);
  exchange();
  const result = bridge.exchange('project', {
    pageId: command.pageId,
    canvasId: command.canvasId,
    revision: 1,
    received: [],
  });
  expect(result.commands).toEqual([]);
  expect(bridge.status('project', command.requestId).status).toBe('unknown');
});

test('a disconnected page with an unresolved command can report its result after a new page joins', () => {
  const { bridge, command, exchange, advance } = fixture();
  bridge.submit('project', { ...command, action: 'run', allowPaid: true });
  exchange();
  advance(61000);
  expect(bridge.status('project', command.requestId).status).toBe('unknown');
  bridge.exchange('project', { canvasId: command.canvasId, revision: 1 });
  expect(exchange().commands).toEqual([]);
  exchange([{ id: command.requestId, status: 'succeeded', result: { recovered: true } }]);
  expect(bridge.status('project', command.requestId)).toMatchObject({
    status: 'succeeded',
    result: { recovered: true },
  });
});

test('expired idle page identities return an actionable error rather than accepting another session', () => {
  const { bridge, command, advance } = fixture();
  advance(61000);
  bridge.exchange('project', { canvasId: command.canvasId, revision: 1 });
  try {
    bridge.exchange('project', { pageId: command.pageId, canvasId: command.canvasId, revision: 1 });
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toMatchObject({ code: 'CANVAS_PAGE_EXPIRED' });
  }
});

function documentFixture() {
  const document = emptyDocument();
  document.nodes = [
    {
      id: 'image',
      type: 'image',
      generation: { prompt: 'old' },
      assetPath: 'assets/image/old.png',
    },
    { id: 'sequence', type: 'sequence', sequenceSettings: defaultSequenceSettings() },
  ].map((node) => ({
    x: 0,
    y: 0,
    width: 240,
    height: 200,
    title: node.id,
    ...node,
  })) as CanvasNode[];
  return document;
}

test('export artifacts are bound to the originating operation, project and page', () => {
  const { bridge, command, exchange, advance } = fixture();
  bridge.submit('project', { ...command, action: 'export', input: { id: 'card', format: 'png' } });
  expect(() =>
    bridge.saveExport('project', command.requestId, command.pageId, Buffer.from('png'))
  ).toThrow('页面');
  exchange();
  expect(() =>
    bridge.saveExport('other', command.requestId, command.pageId, Buffer.from('png'))
  ).toThrow('不存在');
  expect(() =>
    bridge.saveExport('project', command.requestId, 'other-page', Buffer.from('png'))
  ).toThrow('页面');
  bridge.saveExport('project', command.requestId, command.pageId, Buffer.from('png'));
  expect(() => bridge.readExport('project', command.requestId)).toThrow('尚未');
  exchange([
    { id: command.requestId, status: 'succeeded', result: { export: { filename: 'image.png' } } },
  ]);
  expect(bridge.readExport('project', command.requestId).toString()).toBe('png');
  expect(() => bridge.readExport('other', command.requestId)).toThrow('不存在');
  advance(600001);
  expect(() => bridge.readExport('project', command.requestId)).toThrow('10分钟');
});

test('download release frees only matching export artifacts', () => {
  const { bridge, command, exchange } = fixture();
  bridge.submit('project', { ...command, action: 'export', input: { id: 'card', format: 'png' } });
  exchange();
  expect(() =>
    bridge.saveExport('project', command.requestId, command.pageId, Buffer.alloc(0))
  ).toThrow('128 MiB');
  bridge.saveExport('project', command.requestId, command.pageId, Buffer.from('png'));
  exchange([{ id: command.requestId, status: 'succeeded' }]);
  expect(() => bridge.releaseExport('other', command.requestId)).toThrow();
  bridge.releaseExport('project', command.requestId);
  expect(() => bridge.readExport('project', command.requestId)).toThrow('释放');
});

test('batch validation is atomic and preserves existing result paths and task identities', () => {
  const document = documentFixture();
  const before = JSON.stringify(document);
  expect(() =>
    prepareCanvasNodeUpdates(document, {
      nodes: [
        { id: 'image', prompt: 'cat' },
        { id: 'sequence', assetPath: '../secret' },
      ],
    })
  ).toThrow('字段');
  expect(JSON.stringify(document)).toBe(before);
  const updates = prepareCanvasNodeUpdates(document, {
    nodes: [{ id: 'image', prompt: 'cat', parameters: { model: 'gpt' } }],
  });
  expect(updates[0].node.assetPath).toBe('assets/image/old.png');
  expect(updates[0].node.templatePending).toBeUndefined();
  expect(updates[0].node.generation?.prompt).toBe('cat');
  expect(JSON.stringify(document)).toBe(before);
});

test('imported image parameters require a prompt before changing the document', () => {
  const document = documentFixture();
  delete document.nodes[0].generation;
  expect(() =>
    prepareCanvasNodeUpdates(document, { nodes: [{ id: 'image', parameters: { model: 'gpt' } }] })
  ).toThrow('prompt');
  expect(document.nodes[0].generation).toBeUndefined();
});

test.each([
  { fps: 100 },
  { end: 0 },
  { width: 0 },
  { width: 12.5 },
  { end: 100 },
  { backgroundColor: 'transparent' },
  { cutout: 1 },
  { frames: [] },
  { duplicateThreshold: 0.9 },
])('sequence automation rejects invalid or unsupported settings %j', (settings) => {
  expect(() =>
    prepareCanvasNodeUpdates(documentFixture(), {
      nodes: [{ id: 'sequence', sequenceSettings: settings }],
    })
  ).toThrow();
});
