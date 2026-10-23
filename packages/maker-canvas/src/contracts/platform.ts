/** The host supplies this identity; never infer it from URL or browser globals. */
export type CanvasPlatform = 'local' | 'web';

export interface CanvasPlatformScope {
  /** Omitted means both platforms. An empty or unknown scope is invalid. */
  platforms?: CanvasPlatform[];
}

export function validateCanvasPlatforms(
  value: unknown
): asserts value is CanvasPlatform[] | undefined {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 2 ||
    new Set(value).size !== value.length ||
    value.some((item) => item !== 'local' && item !== 'web')
  )
    throw new Error('适用端必须为本地、Web 或双端。');
}

export function canvasSupportsPlatform(
  scope: CanvasPlatformScope,
  platform: CanvasPlatform | undefined
): boolean {
  validateCanvasPlatforms(scope.platforms);
  return (
    scope.platforms === undefined || (platform !== undefined && scope.platforms.includes(platform))
  );
}
