import { randomUUID } from 'node:crypto';
import type { CanvasNode } from '../model.js';
import { validateUiRecognition } from '../uiRecognition.js';

export function batchRecognitionFixture(design: CanvasNode, cut: CanvasNode) {
  const source = (node: CanvasNode, hash: string) => ({
    path: node.assetPath!,
    sha256: hash.repeat(64),
    width: node.imageInfo!.width,
    height: node.imageInfo!.height,
  });
  const cutSource = source(cut, 'b');
  return validateUiRecognition({
    enabled: true,
    results: [
      {
        id: randomUUID(),
        model: 'test',
        prompt: 'batch fixture',
        createdAt: '2026-01-01T00:00:00.000Z',
        durationMs: 1,
        sourcePath: cutSource.path,
        sourceSha256: cutSource.sha256,
        width: cutSource.width,
        height: cutSource.height,
        elements: [],
        bbox: {
          version: 1,
          coordinateSpace: 'design-pixels',
          bboxFormat: 'xywh',
          design: source(design, 'a'),
          cutSource,
          elements: Array.from({ length: 12 }, (_, index) => ({
            id: 'E' + String(index + 1).padStart(3, '0'),
            name: 'long mark ' + index,
            type: 'icon',
            bbox: [20, 20 + index * 30, 200, 20],
            parent: null,
          })),
          texts: [],
        },
      },
    ],
  }).results[0];
}
