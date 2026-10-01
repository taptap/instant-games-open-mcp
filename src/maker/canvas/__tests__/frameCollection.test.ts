import { createFrameCollection } from '../frameCollection.js';

const collection = createFrameCollection();
describe('frame selection and organization', () => {
  test('selects noncontiguous frames and a continuous range', () => {
    let selected = collection.select(new Set(), 5, 0, false, false);
    selected = collection.select(selected, 8, 5, false, true);
    expect([...selected]).toEqual([5, 8]);
    selected = collection.select(selected, 11, 8, true, false);
    expect([...selected]).toEqual([5, 8, 9, 10, 11]);
  });
  test('removes arbitrary middle frames without mutating the source', () => {
    const frames = Array.from({ length: 20 }, (_value, index) => ({
      time: index,
      blob: new Blob([String(index)]),
    }));
    const result = collection.change(frames, new Set([5, 8, 11]), 'delete', 120);
    expect(result).toHaveLength(17);
    expect(result.map((frame) => frame.time)).not.toEqual(expect.arrayContaining([5, 8, 11]));
    expect(frames).toHaveLength(20);
  });
  test('duplicates adjacent to the original and preserves its content identity', () => {
    const frames = [
      { time: 1, blob: new Blob(['one']) },
      { time: 2, blob: new Blob(['two']) },
    ];
    const result = collection.change(frames, new Set([0]), 'duplicate', 120);
    expect(result.map((frame) => frame.time)).toEqual([1, 1, 2]);
    expect(result[0]).not.toBe(result[1]);
    expect(result[0].blob).toBe(result[1].blob);
  });
  test('rejects an empty result and an over-capacity copy', () => {
    expect(() => collection.change([1], new Set([0]), 'delete', 120)).toThrow('至少保留');
    expect(() => collection.change([{ time: 1 }], new Set([0]), 'duplicate', 1)).toThrow('上限');
  });
  test('reverses and reduces without rewriting source times', () => {
    expect(collection.change([1, 2, 3, 4], new Set(), 'reverse', 120)).toEqual([4, 3, 2, 1]);
    expect(collection.change([1, 2, 3, 4], new Set(), 'reduce', 120)).toEqual([1, 3]);
  });
});
