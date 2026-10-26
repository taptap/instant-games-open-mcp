import {
  canvasSupportsPlatform,
  type CanvasPlatform,
  type CanvasPlatformScope,
} from '../contracts/platform.js';

export type CanvasCapability =
  | 'imageGeneration'
  | 'videoGeneration'
  | 'recognition'
  | 'model'
  | 'templateExchange'
  | 'uiArchive';

/** Omitted entries retain the existing host behavior; unavailable never implies fallback. */
export type CanvasHostCapabilities = Partial<
  Record<CanvasCapability, CanvasPlatformScope & { available: boolean; reason?: string }>
>;

export function canvasCapabilityReason(
  host: { platform?: CanvasPlatform; capabilities?: CanvasHostCapabilities },
  capability: CanvasCapability
): string | undefined {
  const value = host.capabilities?.[capability];
  if (value && !canvasSupportsPlatform(value, host.platform))
    return value.reason || '此功能不适用于当前平台。';
  return value?.available === false ? value.reason || '当前宿主尚未接入此能力。' : undefined;
}
