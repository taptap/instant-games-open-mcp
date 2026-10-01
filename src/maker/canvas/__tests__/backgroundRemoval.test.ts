import { createBackgroundRemoval, type BackgroundOptions } from '../backgroundRemoval.js';

const removal = createBackgroundRemoval();
const defaults: BackgroundOptions = {
  automatic: true,
  tolerance: 24,
  softness: 16,
  despill: 0.5,
  mode: 'all',
};
function fixture() {
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let pixel = 0; pixel < 400; pixel++) data.set([237, 98, 168, 255], pixel * 4);
  for (let row = 5; row < 15; row++)
    for (let column = 5; column < 15; column++)
      data.set([20, 180, 220, 255], (row * 20 + column) * 4);
  data.set([237, 98, 168, 255], (10 * 20 + 10) * 4);
  return data;
}
describe('automatic solid background removal', () => {
  test('detects the actual pink instead of a preset or a corner sample', () => {
    const data = fixture();
    data.set([20, 180, 220, 255], 0);
    expect(removal.detect(data, 20, 20)?.color).toEqual([237, 98, 168]);
  });
  test('all-color mode removes enclosed background without changing foreground', () => {
    const data = fixture();
    removal.process(data, 20, 20, defaults);
    expect(data[3]).toBe(0);
    expect(data[(10 * 20 + 10) * 4 + 3]).toBe(0);
    expect([...data.slice((8 * 20 + 8) * 4, (8 * 20 + 8) * 4 + 4)]).toEqual([20, 180, 220, 255]);
  });
  test('connected mode preserves the enclosed region', () => {
    const data = fixture();
    removal.process(data, 20, 20, { ...defaults, mode: 'connected' });
    expect(data[3]).toBe(0);
    expect(data[(10 * 20 + 10) * 4 + 3]).toBe(255);
  });
  test('does not guess on a transparent sprite or a complex background', () => {
    const data = fixture();
    for (let pixel = 0; pixel < 400; pixel++) if (data[pixel * 4] === 237) data[pixel * 4 + 3] = 0;
    const before = data.slice();
    expect(() => removal.process(data, 20, 20, defaults)).toThrow('未可靠识别');
    expect(data).toEqual(before);
    const noise = new Uint8ClampedArray(400 * 4);
    for (let pixel = 0; pixel < 400; pixel++)
      noise.set([pixel % 256, (pixel * 13) % 256, (pixel * 37) % 256, 255], pixel * 4);
    expect(removal.detect(noise, 20, 20)).toBeUndefined();
  });
  test('matches small per-frame shifts but rejects a different background', () => {
    expect(() =>
      removal.process(fixture(), 20, 20, { ...defaults, color: [235, 100, 170] })
    ).not.toThrow();
    expect(() => removal.process(fixture(), 20, 20, { ...defaults, color: [0, 255, 0] })).toThrow(
      '差异较大'
    );
  });
  test('edge transition changes only near-background colors and supports no despill', () => {
    const data = fixture();
    data.set([207, 98, 168, 255], 0);
    removal.process(data, 20, 20, { ...defaults, despill: 0 });
    expect([...data.slice(0, 3)]).toEqual([207, 98, 168]);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
  });
});
