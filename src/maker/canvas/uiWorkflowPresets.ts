import data from './uiWorkflowData.json';
import type { CanvasPreset } from './presets.js';
import { snapshotCanvasSource } from './dependencies.js';

export function createUiWorkflowPreset(): CanvasPreset {
  const template = structuredClone(data) as unknown as CanvasPreset;
  for (const node of template.nodes) {
    const sources = template.edges
      .filter((edge) => edge.to === node.id)
      .flatMap((edge) => {
        const snapshot = snapshotCanvasSource(template.nodes.find((item) => item.id === edge.from));
        return snapshot ? [snapshot] : [];
      });
    if (sources.length) {
      node.sourceSnapshot = sources[0];
      if (node.type === 'image') node.sourceSnapshots = sources;
    }
  }
  return template;
}
