import { applyLocalImageResult } from '../localImageResult.js';
import { emptyDocument } from '../model.js';

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
  expect(applyLocalImageResult(document, source, 'local.png', undefined, () => 'duplicate')).toBe(
    result
  );
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
