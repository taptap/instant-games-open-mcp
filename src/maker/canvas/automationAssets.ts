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
  const node: CanvasNode = {
    id: crypto.randomUUID(),
    type: kind === 'image' ? 'image' : 'video-source',
    title,
    assetPath,
    x: 0,
    y: 0,
    width: 240,
    height: 240,
  };
  const media = document.createElement(kind === 'image' ? 'img' : 'video') as
    | HTMLImageElement
    | HTMLVideoElement;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error('素材解码超时，未添加卡片；请检查文件。')),
        15000
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        media.onload = null;
        media.onerror = null;
        media.onloadedmetadata = null;
        if (error) reject(error);
        else resolve();
      };
      media.onerror = () =>
        finish(new Error('浏览器无法解码此素材，未添加卡片；请转换为可播放的标准格式。'));
      if (kind === 'image') media.onload = () => finish();
      else {
        (media as HTMLVideoElement).preload = 'metadata';
        media.onloadedmetadata = () => finish();
      }
      media.src = mediaUrl(assetPath);
    });
    if (kind === 'video') {
      const video = media as HTMLVideoElement;
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        throw new Error('视频时长或尺寸无效，未添加卡片。');
      node.videoInfo = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
    } else {
      const image = media as HTMLImageElement;
      if (!image.naturalWidth) throw new Error('图片尺寸无效。');
      node.imageInfo = { width: image.naturalWidth, height: image.naturalHeight };
    }
    return node;
  } finally {
    media.removeAttribute('src');
    if (kind === 'video') (media as HTMLVideoElement).load();
  }
}
