/**
 * Same-size PNG copy of a JPEG/WebP design for the local pixel steps that read it in Node
 * (art-text prelayout and UI assembly). Upstream edit_image and recognition keep the
 * original file, since a larger PNG upload can fail there. Returns undefined for PNG input.
 */
export async function designPngCopy(
  store: {
    mediaUrl?(path: string): string;
    importImage?(
      canvasId: string,
      bytes: ArrayBuffer,
      contentType: string
    ): Promise<{ relativePath: string }>;
  },
  canvasId: string,
  assetPath: string
): Promise<string | undefined> {
  if (/\.png$/i.test(assetPath)) return undefined;
  if (!store.mediaUrl || !store.importImage) throw new Error('当前宿主不能转换原稿为 PNG。');
  const response = await fetch(store.mediaUrl(assetPath));
  if (!response.ok) throw new Error('原稿读取失败，未转换 PNG。');
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('原稿转换 PNG 失败。'))),
        'image/png'
      )
    );
    return (await store.importImage(canvasId, await png.arrayBuffer(), 'image/png')).relativePath;
  } finally {
    bitmap.close();
  }
}
