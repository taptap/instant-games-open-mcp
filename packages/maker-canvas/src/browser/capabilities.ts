export type CanvasCapability =
  | 'imageGeneration'
  | 'videoGeneration'
  | 'recognition'
  | 'model'
  | 'templateExchange'
  | 'uiArchive';

/** Omitted entries retain the existing host behavior; unavailable never implies fallback. */
export type CanvasHostCapabilities = Partial<
  Record<CanvasCapability, { available: boolean; reason?: string }>
>;

export function canvasCapabilityReason(
  host: { capabilities?: CanvasHostCapabilities },
  capability: CanvasCapability
): string | undefined {
  const value = host.capabilities?.[capability];
  return value?.available === false ? value.reason || '当前宿主尚未接入此能力。' : undefined;
}
