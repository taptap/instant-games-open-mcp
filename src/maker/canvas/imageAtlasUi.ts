import type { CanvasExportDelivery } from '../../../packages/maker-canvas/src/browser/exportDelivery.js';
import type { CanvasNode } from './model.js';
import {
  openImageAtlasDialogWithHost,
  type ImageAtlasDialogActions,
} from '../../../packages/maker-canvas/src/browser.js';
export { drawImageAtlasPreview } from '../../../packages/maker-canvas/src/browser.js';

export function openImageAtlasDialog(
  node: CanvasNode,
  mediaUrl: (path: string) => string,
  actions: ImageAtlasDialogActions | undefined,
  deliver: CanvasExportDelivery
) {
  return openImageAtlasDialogWithHost(
    node,
    {
      async readSource(path) {
        const response = await fetch(mediaUrl(path));
        if (!response.ok) throw new Error('图片读取失败，请重新打开。');
        return response.blob();
      },
      deliver,
    },
    actions
  );
}
