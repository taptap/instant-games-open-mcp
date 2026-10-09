import { Script } from 'node:vm';
import { imageCardSize, fitImageCard, renderImageInfo } from '../imageInfo.js';
import { getCanvasPageHtml } from '../page.js';
import { CANVAS_CARD_UI_STYLES } from '../cardUi.js';
import type { CanvasNode } from '../model.js';

test.each([
  [1920, 1080],
  [1080, 1920],
  [2048, 2048],
  [2520, 1080],
  [1700, 1000],
  [10000, 100],
])('image preview follows %i × %i below the header', (width, height) => {
  const size = imageCardSize(400, width, height)!;
  expect(size.width).toBeCloseTo(400, 10);
  expect((size.width - 2) / (size.height - 42)).toBeCloseTo(width / height, 10);
  expect(imageCardSize(size.width, width, height)).toEqual(size);
});

test('tall images shrink proportionally within the existing media card bounds', () => {
  const size = imageCardSize(2000, 1080, 1920)!;
  expect(size.height).toBe(1600);
  expect(size.width).toBeLessThan(2000);
  expect((size.width - 2) / (size.height - 42)).toBeCloseTo(1080 / 1920, 10);
  expect(imageCardSize(size.width, 1080, 1920)).toEqual(size);
});

test('extremely tall images keep a saveable card instead of shrinking below the minimum width', () => {
  const node = imageNode();
  node.imageInfo = { width: 100, height: 4000 };
  const before = { ...node };
  expect(imageCardSize(node.width, 100, 4000)).toBeUndefined();
  expect(fitImageCard(node)).toBe(false);
  expect(node).toEqual(before);
});

test.each([
  [400, 0, 100],
  [400, 100, NaN],
  [400, Infinity, 100],
  [400, 100, -1],
  [NaN, 100, 100],
])(
  'invalid image dimensions leave the card unchanged (%s, %s, %s)',
  (width, imageWidth, imageHeight) => {
    expect(imageCardSize(width, imageWidth, imageHeight)).toBeUndefined();
  }
);

function imageNode(): CanvasNode {
  return {
    id: 'image',
    type: 'image',
    title: 'image',
    x: 100,
    y: 200,
    width: 400,
    height: 755,
    assetPath: 'image.png',
    imageInfo: { width: 1920, height: 1080 },
  };
}

test('existing portrait frames fit the image without changing placement, content or references', () => {
  const node = imageNode();
  const previous = { ...node };
  expect(fitImageCard(node)).toBe(true);
  expect(node.height).toBeCloseTo(265.875);
  expect(node).toEqual({ ...previous, height: 265.875 });
  expect(fitImageCard(node)).toBe(false);
  node.imageInfo = { width: 1080, height: 1920 };
  expect(fitImageCard(node)).toBe(true);
  expect((node.width - 2) / (node.height - 42)).toBeCloseTo(9 / 16, 10);
});

test('empty images and non-image cards keep their custom dimensions', () => {
  const node = imageNode();
  delete node.assetPath;
  expect(fitImageCard(node)).toBe(false);
  node.assetPath = 'image.png';
  delete node.imageInfo;
  expect(fitImageCard(node)).toBe(false);
  node.type = 'image-assets';
  node.imageInfo = { width: 1920, height: 1080 };
  expect(fitImageCard(node)).toBe(false);
  expect(node.height).toBe(755);
});

test('decoded images notify layout only while they still belong to the current asset', () => {
  const node = imageNode();
  const image = { naturalWidth: 0, naturalHeight: 0, addEventListener: jest.fn() };
  const label = { textContent: '', title: '', hidden: false };
  const card = { querySelector: () => image, append: jest.fn() };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => label } as unknown as Document;
  try {
    const onSize = jest.fn();
    renderImageInfo(card as unknown as HTMLElement, undefined, node, onSize);
    expect(onSize).not.toHaveBeenCalled();
    const loaded = image.addEventListener.mock.calls[0][1];
    Object.assign(image, { naturalWidth: 1080, naturalHeight: 1920 });
    loaded();
    expect(node.imageInfo).toEqual({ width: 1080, height: 1920 });
    expect(onSize).toHaveBeenCalledTimes(1);
    node.assetPath = 'replacement.png';
    Object.assign(image, { naturalWidth: 2048, naturalHeight: 2048 });
    loaded();
    expect(node.imageInfo).toEqual({ width: 1080, height: 1920 });
    expect(onSize).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.document = originalDocument;
  }
});

test.each([
  [80, 0],
  [0, 50],
])('dragging either axis resizes the image proportionally (%s, %s)', (dx, dy) => {
  const node = imageNode();
  fitImageCard(node);
  const html = getCanvasPageHtml();
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  const start = script.indexOf("else if (drag.kind === 'resize') {");
  const end = script.indexOf("} else if (drag.kind === 'wire') {", start);
  const render = jest.fn(() => fitImageCard(node));
  new Script(script.slice(start + 5, end + 1)).runInNewContext({
    drag: { kind: 'resize', id: node.id, x: 0, y: 0, width: node.width, height: node.height },
    event: { clientX: dx * 0.5, clientY: dy * 0.5 },
    documentState: { nodes: [node], viewport: { scale: 0.5 } },
    remember: jest.fn(),
    markDirty: jest.fn(),
    render,
  });
  expect(render).toHaveBeenCalledTimes(1);
  expect(node.width).toBeGreaterThan(400);
  expect(node.x).toBe(100);
  expect(node.y).toBe(200);
  expect((node.width - 2) / (node.height - 42)).toBeCloseTo(16 / 9, 10);
});

test('page embeds sizing, decode notifications and proportional resize in its browser script', () => {
  const html = getCanvasPageHtml();
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  expect(() => new Script(script)).not.toThrow();
  const size = new Script('(' + imageCardSize.toString() + ')').runInNewContext();
  expect(size(400, 1920, 1080)).toEqual(imageCardSize(400, 1920, 1080));
  expect(html).toContain('function fitImageCard(');
  expect(html).toContain('if (fitImageCard(node)) markDirty();');
  expect(html).toContain('requestAnimationFrame(render)');
  expect(html).toContain("node.type === 'image' && node.assetPath ? node.imageInfo");
  expect(CANVAS_CARD_UI_STYLES).toContain(
    '.card.image.canvas-card:has(.canvas-card-content > img) { min-width:0; min-height:0; }'
  );
});
