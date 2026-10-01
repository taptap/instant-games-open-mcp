import presetData from './presetData.json';
import type { CanvasWorkflowTemplate } from './templates.js';

export interface CanvasPreset extends CanvasWorkflowTemplate {
  assets: Record<string, { type: string; data: string }>;
}

export function canvasPresets(): CanvasPreset[] {
  return presetData as unknown as CanvasPreset[];
}

export function builtinCanvasTemplates(): CanvasWorkflowTemplate[] {
  return canvasPresets().map(({ assets: _assets, ...template }) => ({
    ...template,
    builtin: true,
  }));
}
