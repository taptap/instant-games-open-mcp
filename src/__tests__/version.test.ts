/**
 * 基础测试 - 确保测试框架正常工作
 */

describe('Basic Tests', () => {
  test('simple math should work', () => {
    expect(1 + 1).toBe(2);
  });

  test('string concatenation should work', () => {
    expect('hello' + ' ' + 'world').toBe('hello world');
  });

  test('array operations should work', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr[0]).toBe(1);
  });
});
