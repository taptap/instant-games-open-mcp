import { prepareCanvasImportedNodeFromMedia } from '../../../packages/maker-canvas/src/browser/automationAssets.js';
import type { CanvasNode } from './model.js';

export async function prepareCanvasImportedNode(
  canvasId: string,
  input: Record<string, unknown>,
  mediaUrl: (path: string) => string
): Promise<CanvasNode> {
  const { assetPath, kind, title } = input;
  if (
    typeof assetPath !== 'string' ||
    !['image', 'video'].includes(String(kind)) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 80
  )
    throw new Error('导入素材参数无效。');
  const valid =
    kind === 'image'
      ? /^assets\/image\/canvas-[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/i.test(assetPath)
      : assetPath.startsWith('.maker/canvases/' + canvasId + '/videos/') &&
        /^video-[a-f0-9-]{36}\.(mp4|mov|webm)$/i.test(assetPath.split('/').pop() || '');
  if (!valid) throw new Error('导入只接受本项目受控素材路径，请使用 CLI --file 上传。');
  return prepareCanvasImportedNodeFromMedia(input, mediaUrl);
}
