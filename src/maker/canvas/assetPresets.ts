import assetPresetData from './assetPresetData.json';
import type { CanvasPreset } from './presets.js';

export function createAssetPresets(): CanvasPreset[] {
  return (assetPresetData as unknown as CanvasPreset[]).map(({ assets, ...definition }) => {
    const template = structuredClone(definition);
    let correctedReferences = false;
    for (const node of template.nodes) {
      if (!node.referenceInput || !node.generation?.referenceImagePaths?.length) continue;
      const sources = new Set(
        template.edges
          .filter((edge) => edge.to === node.id && edge.kind === 'image-variant')
          .map((edge) => template.nodes.find((source) => source.id === edge.from)?.assetPath)
      );
      const references = node.generation.referenceImagePaths.filter((path) => !sources.has(path));
      if (references.length !== node.generation.referenceImagePaths.length) {
        node.generation.referenceImagePaths = references;
        correctedReferences = true;
      }
    }
    if (correctedReferences) template.revision++;
    return {
      ...template,
      assets: Object.fromEntries(
        Object.entries(assets).map(([path, asset]) => [path, { ...asset }])
      ),
    };
  });
}
