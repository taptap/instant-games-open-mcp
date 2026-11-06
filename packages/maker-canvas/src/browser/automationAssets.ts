import type { CanvasNode, FrameSetInfo } from '../contracts.js';

/** Imported atlases use fixed, untrimmed cells; decoding checks the actual image size too. */
export function validateImportedFrameSet(value: unknown): FrameSetInfo {
  const info = value as FrameSetInfo;
  const number = (n: unknown, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const integer = (n: unknown, min: number, max: number) =>
    number(n, min, max) && Number.isInteger(n);
  if (
    !info ||
    !Array.isArray(info.frames) ||
    !integer(info.frameCount, 1, 120) ||
    info.frames.length !== info.frameCount ||
    !integer(info.width, 1, 4096) ||
    !integer(info.height, 1, 4096) ||
    !integer(info.columns, 1, 4096) ||
    !integer(info.rows, 1, 4096) ||
    !number(info.fps, 1, 30) ||
    info.frames.some(
      (f, index) =>
        !f ||
        f.index !== index ||
        !number(f.time, 0, 86400) ||
        !integer(f.x, 0, 4096) ||
        !integer(f.y, 0, 4096) ||
        !integer(f.width, 1, 2048) ||
        !integer(f.height, 1, 2048) ||
        f.x + f.width > info.width ||
        f.y + f.height > info.height ||
        (f.duration !== undefined && !number(f.duration, Number.MIN_VALUE, 86400000)) ||
        ['sourceWidth', 'sourceHeight', 'offsetX', 'offsetY'].some((key) => key in f)
    )
  )
    throw new Error('动画图集需包含 1～120 帧，帧框必须在图集内；不支持旋转或裁紧帧。');
  return {
    fps: info.fps,
    frameCount: info.frameCount,
    width: info.width,
    height: info.height,
    columns: info.columns,
    rows: info.rows,
    frames: info.frames.map((f) => ({
      index: f.index,
      time: f.time,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      ...(f.duration === undefined ? {} : { duration: f.duration }),
    })),
  };
}

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
  const frames =
    input.frameSetInfo === undefined ? undefined : validateImportedFrameSet(input.frameSetInfo);
  if (frames && (kind !== 'image' || input.prompt !== undefined || input.sourceId !== undefined))
    throw new Error('动画图集只能导入图片，不能同时指定 prompt 或 sourceId。');
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
      if (frames) {
        if (frames.width !== image.naturalWidth || frames.height !== image.naturalHeight)
          throw new Error('动画图集元数据与实际图片尺寸不一致，未添加卡片。');
        node.type = 'animation';
        node.frameSetInfo = frames;
        delete node.imageInfo;
      }
    }
    return node;
  } finally {
    media.removeAttribute('src');
    if (kind === 'video') (media as HTMLVideoElement).load();
  }
}
