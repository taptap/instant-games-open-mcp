/**
 * PNG pixels of a JPEG/WebP design, as base64, for the local steps that read it in Node
 * (art-text prelayout and UI assembly). Sent inline with that request only: the project keeps
 * a single design file. Upstream edit_image and recognition keep the original file, since a
 * larger PNG upload can fail there. Returns undefined for PNG input.
 */
export async function designPngData(
  store: { mediaUrl?(path: string): string },
  assetPath: string
): Promise<string | undefined> {
  if (/\.png$/i.test(assetPath)) return undefined;
  if (!store.mediaUrl) throw new Error('当前宿主不能读取原稿。');
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
    const bytes = new Uint8Array(await png.arrayBuffer());
    // Chunked: a single String.fromCharCode spread over megabytes overflows the call stack.
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  } finally {
    bitmap.close();
  }
}
