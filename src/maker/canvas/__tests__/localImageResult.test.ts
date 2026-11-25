import { applyLocalImageResult } from '../localImageResult.js';
import { emptyDocument, type CanvasNode } from '../model.js';

function fixture() {
  const document = emptyDocument('test');
  const source = {
    id: 'source',
    type: 'image' as const,
    title: '角色',
    assetPath: 'old.png',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  document.nodes.push(source);
  return { document, source };
}

test('local edits preserve original and connect a new result without fake generation', () => {
  const { document, source } = fixture();
  const result = applyLocalImageResult(document, source, 'local.png', undefined, () => 'new');
  expect(source.assetPath).toBe('old.png');
  expect(result.generation).toBeUndefined();
  expect(document.edges[0]).toMatchObject({
    from: source.id,
    to: result.id,
    kind: 'image-variant',
  });
  result.generation = { prompt: 'retained attribution', attemptId: 'saved-attempt' };
  expect(applyLocalImageResult(document, source, 'local.png', undefined, () => 'duplicate')).toBe(
    result
  );
  expect(result.generation.attemptId).toBe('saved-attempt');
  expect(document.nodes).toHaveLength(2);
});

test('template edits reuse a selected target; cancellation is outside mutation', () => {
  const { document, source } = fixture();
  const snapshot = { ...source };
  applyLocalImageResult(document, snapshot, 'local.png', source.id, () => 'unused');
  expect(document.nodes).toHaveLength(1);
  expect(document.edges).toHaveLength(0);
  expect(source.assetPath).toBe('local.png');
  expect(() =>
    applyLocalImageResult(document, snapshot, 'other.png', source.id, () => 'unused')
  ).toThrow('来源图片已变更');
});

test('an explicit pending target wins over same-path cards in other instances', () => {
  const { document, source } = fixture();
  const other = { ...source, id: 'other', assetPath: 'local.png', sectionId: 'other-section' };
  const target: CanvasNode = {
    ...source,
    id: 'target',
    assetPath: 'old-demo.png',
    templatePending: true,
    generation: { operation: 'variant', prompt: 'cutout', attemptId: 'old', taskId: 'old' },
  };
  document.nodes.unshift(other);
  document.nodes.push(target);
  document.edges.push({ id: 'wire', from: source.id, to: target.id, kind: 'image-variant' });
  expect(applyLocalImageResult(document, source, 'local.png', target.id, () => 'unused')).toBe(
    target
  );
  expect(source.assetPath).toBe('old.png');
  expect(other.assetPath).toBe('local.png');
  expect(target.assetPath).toBe('local.png');
  expect(target.templatePending).toBeUndefined();
  expect(target.generation).toEqual({ operation: 'variant', prompt: 'cutout' });
  expect(target.sourceSnapshot).toMatchObject({ nodeId: source.id });
  expect(document.edges).toHaveLength(1);
  expect(applyLocalImageResult(document, source, 'local.png', target.id, () => 'unused')).toBe(
    target
  );
  expect(document.nodes).toHaveLength(3);
});

test('same-path results cannot bypass source drift or a deleted explicit target', () => {
  const { document, source } = fixture();
  document.nodes.push({ ...source, id: 'other', assetPath: 'local.png' });
  const snapshot = { ...source };
  source.assetPath = 'changed.png';
  expect(() =>
    applyLocalImageResult(document, snapshot, 'local.png', 'missing', () => 'unused')
  ).toThrow('来源图片已变更');
  expect(() =>
    applyLocalImageResult(document, source, 'local.png', 'missing', () => 'unused')
  ).toThrow('目标图片卡已变更');
  document.nodes = document.nodes.filter((node) => node.id !== source.id);
  expect(() =>
    applyLocalImageResult(document, source, 'local.png', undefined, () => 'unused')
  ).toThrow('来源图片已变更');
});

test('derived-result idempotence is limited to the current source and section', () => {
  const { document, source } = fixture();
  document.nodes.unshift({ ...source, id: 'other-source' });
  const first = applyLocalImageResult(
    document,
    document.nodes[0],
    'local.png',
    undefined,
    () => 'first'
  );
  const second = applyLocalImageResult(document, source, 'local.png', undefined, () => 'second');
  expect(second).not.toBe(first);
  expect(applyLocalImageResult(document, source, 'local.png', undefined, () => 'unused')).toBe(
    second
  );
  expect(document.nodes).toHaveLength(4);
});
