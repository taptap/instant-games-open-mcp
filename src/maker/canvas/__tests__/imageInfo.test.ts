import { imageSizeLabel } from '../imageInfo.js';

test('image dimensions report actual pixels without cropping or inventing a target', () => {
  expect(imageSizeLabel(1536, 2304, '1536x2048')).toBe('实际尺寸：1536 × 2304 · 与请求尺寸不一致');
  expect(imageSizeLabel(1024, 1024, '1024x1024')).toBe('实际尺寸：1024 × 1024');
  expect(imageSizeLabel(1024, 1024)).toBe('实际尺寸：1024 × 1024');
  expect(imageSizeLabel(0, 0)).toBe('');
});
