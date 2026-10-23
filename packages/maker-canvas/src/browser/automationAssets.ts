import type { CanvasNode } from '../contracts.js';

export async function prepareCanvasImportedNodeFromMedia(
  input: Record<string, unknown>,
  mediaUrl: (path: string) => string
): Promise<CanvasNode> {
  const { assetPath } = input;
  const kind = input.kind === undefined ? 'image' : input.kind;
  const title =
    input.title === undefined && typeof assetPath === 'string'
      ? (
          assetPath
            .split('/')
            .pop()!
            .replace(/\.[^.]+$/, '') || '图片'
        ).slice(0, 80)
      : input.title;
  if (
    typeof assetPath !== 'string' ||
    !['image', 'video'].includes(String(kind)) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 80
  )
    throw new Error('导入素材参数无效。');
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
