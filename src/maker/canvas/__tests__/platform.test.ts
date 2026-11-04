import {
  canvasSupportsPlatform,
  validateCanvasPlatforms,
} from '../../../../packages/maker-canvas/src/contracts/platform.js';
import { canvasCapabilityReason } from '../../../../packages/maker-canvas/src/browser/capabilities.js';

test('legacy templates support both hosts; explicit scopes do not leak', () => {
  expect(canvasSupportsPlatform({}, 'local')).toBe(true);
  expect(canvasSupportsPlatform({}, 'web')).toBe(true);
  expect(canvasSupportsPlatform({ platforms: ['web'] }, 'local')).toBe(false);
  expect(canvasSupportsPlatform({ platforms: ['local'] }, 'web')).toBe(false);
  expect(canvasSupportsPlatform({ platforms: ['web'] }, undefined)).toBe(false);
  expect(canvasSupportsPlatform({ platforms: ['local', 'web'] }, 'web')).toBe(true);
});

test.each([[], ['desktop'], ['web', 'web'], 'web', null])(
  'invalid scope is never treated as both: %j',
  (scope) => {
    expect(() => validateCanvasPlatforms(scope)).toThrow('适用端');
  }
);

test('platform and availability are independent checks', () => {
  const capabilities = { imageGeneration: { available: true, platforms: ['local'] as const } };
  const host = {
    platform: 'web' as const,
    capabilities: {
      imageGeneration: { ...capabilities.imageGeneration, platforms: ['local' as const] },
    },
  };
  expect(canvasCapabilityReason(host, 'imageGeneration')).toBe('此功能不适用于当前平台。');
  expect(canvasCapabilityReason({ ...host, platform: 'local' }, 'imageGeneration')).toBeUndefined();
  expect(
    canvasCapabilityReason(
      {
        platform: 'web',
        capabilities: { imageGeneration: { available: false, reason: '未接通' } },
      },
      'imageGeneration'
    )
  ).toBe('未接通');
});
