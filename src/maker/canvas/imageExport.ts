import { deliverCanvasImage } from '../../../packages/maker-canvas/src/browser/imageExport.js';
import { deliverCanvasExport } from './exportDelivery.js';

export async function downloadCanvasImage(
  sourceUrl: string,
  title: string,
  format: 'png' | 'jpg',
  sink?: (blob: Blob, filename: string) => Promise<void>
) {
  return deliverCanvasImage(
    sourceUrl,
    title,
    format,
    sink
      ? async (request) => {
          await sink(await request.produce(), request.filename);
          return { status: 'saved' };
        }
      : deliverCanvasExport
  );
}
