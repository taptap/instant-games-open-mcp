import { Script } from 'node:vm';
import { videoCardSize } from '../videoCard';
import { getCanvasPageHtml } from '../page';

describe('video card layout', () => {
  test.each([
    [1920, 1080],
    [1080, 1920],
    [1024, 1024],
    [2520, 1080],
  ])('matches the media ratio for %s × %s below the title', (width, height) => {
    const size = videoCardSize(320, width, height)!;
    expect((size.width - 2) / (size.height - 42)).toBeCloseTo(width / height, 10);
    expect(size.width).toBe(320);
    expect(videoCardSize(size.width, width, height)).toEqual(size);
  });

  test('bounds tall cards without stretching their contents', () => {
    const size = videoCardSize(2000, 1080, 1920)!;
    expect(size.height).toBe(1600);
    expect((size.width - 2) / (size.height - 42)).toBeCloseTo(1080 / 1920, 10);
  });

  test.each([
    [0, 0],
    [NaN, 100],
    [100, Infinity],
    [100, -1],
  ])('waits for valid metadata (%s, %s)', (width, height) =>
    expect(videoCardSize(320, width, height)).toBeUndefined()
  );

  test('bundles the layout helper and moves extraction to the selection menu', () => {
    const html = getCanvasPageHtml();
    const fit = new Script('(' + videoCardSize.toString() + ')').runInNewContext();
    expect(fit(320, 1080, 1920)).toEqual(videoCardSize(320, 1080, 1920));
    expect(html).toContain('function videoCardSize(');
    expect(html).toContain("player.addEventListener('loadedmetadata'");
    expect(html).toContain("actionButton('拆序列帧'");
    expect(html).not.toContain("launch.textContent = '拆序列帧'");
    expect(html).not.toContain('height: 112px');
    expect(html).not.toContain('height: calc(100% - 110px)');
    expect(html).toContain('.card.video-source { padding: 0; }');
  });
});
