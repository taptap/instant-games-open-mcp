import type { CanvasNode } from './model.js';
import {
  openImageAtlasDialogWithHost,
  type ImageAtlasDialogActions,
} from '../../../packages/maker-canvas/src/browser.js';
export { drawImageAtlasPreview } from '../../../packages/maker-canvas/src/browser.js';

export function openImageAtlasDialog(
  node: CanvasNode,
  mediaUrl: (path: string) => string,
  actions?: ImageAtlasDialogActions
) {
  return openImageAtlasDialogWithHost(
    node,
    {
      async readSource(path) {
        const response = await fetch(mediaUrl(path));
        if (!response.ok) throw new Error('图片读取失败，请重新打开。');
        return response.blob();
      },
      async deliver(blob, filename) {
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return '已发起下载，请查看浏览器下载记录。原图和画布未改变。';
      },
    },
    actions
  );
}
