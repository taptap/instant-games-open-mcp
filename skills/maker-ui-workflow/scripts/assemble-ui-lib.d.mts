// Types for the Maker console import; the JavaScript implementation stays the single source.
export interface UiAssemblyAsset {
  id: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  role: 'bound' | 'reserve';
  contentRect?: [number, number, number, number];
}
export interface UiAssemblyImage {
  path: string;
  sha256: string;
  width: number;
  height: number;
}
export interface UiAssemblyBbox {
  version: 1;
  coordinateSpace: 'design-pixels';
  bboxFormat: 'xywh';
  design: UiAssemblyImage;
  cutSource: UiAssemblyImage;
  elements: Array<{ id: string; [key: string]: unknown }>;
  texts: Array<{ id: string; [key: string]: unknown }>;
}
export interface UiAssemblyInput {
  bbox: UiAssemblyBbox;
  assets: UiAssemblyAsset[];
  bindings: Array<{
    elementId: string;
    assetId?: string;
    pressedAssetId?: string;
    review?: string;
  }>;
  artTextBindings?: Array<{ textId: string; assetId: string }>;
  backgroundAssetId?: string;
  confirmed?: boolean;
  ui?: { id: string; bboxSha256: string };
}
export interface UiAssemblySummary {
  outputDirectory: string;
  elements: number;
  reserveAssets: number;
  visualReview: 'pending' | 'recorded-agent-review';
}
export function digest(value: string | Uint8Array): string;
export function assembleUiInput(
  project: string,
  input: UiAssemblyInput,
  outputDirectory: string,
  correction?: unknown
): UiAssemblySummary;
export function run(
  project: string,
  layoutFile: string,
  outputDirectory: string,
  correctionFile?: string
): UiAssemblySummary;
