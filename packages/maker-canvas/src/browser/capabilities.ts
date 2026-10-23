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
/** Presentation only: commands are not filtered, so hosts exposing execute must whitelist them. */
export type CanvasPageFeature =
  | 'templates'
  | 'uiRecognition'
  | 'video'
  | 'sequence'
  | 'model3d'
  | 'uiEditor'
  | 'resourceExport'
  | 'sections'
  | 'imageEditing'
  | 'cutout'
  | 'connectors';
/** Omitted keeps the current page; false hides an entry, connectors alone is opt-in (true). */
export type CanvasPageFeatures = Partial<Record<CanvasPageFeature, boolean>>;
export function canvasFeatureEnabled(
  host: { features?: CanvasPageFeatures },
  feature: CanvasPageFeature
): boolean {
  const value = host.features?.[feature];
  // Cutout used to ride on imageEditing; hosts that never set it keep that coupling.
  if (feature === 'cutout' && value === undefined)
    return canvasFeatureEnabled(host, 'imageEditing');
  return feature === 'connectors' ? value === true : value !== false;
}
