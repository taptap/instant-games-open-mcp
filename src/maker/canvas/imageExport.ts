declare const document: any;
declare const window: any;
declare const Image: any;

export async function downloadCanvasImage(
  sourceUrl: string,
  title: string,
  format: 'png' | 'jpg'
): Promise<void> {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const safeTitle = Array.from(title, (character) =>
    character.charCodeAt(0) < 32 ? '_' : character
  ).join('');
  const filename =
    (safeTitle
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\.(png|jpe?g|webp)$/i, '')
      .trim()
      .slice(0, 100) || '图片') +
    '.' +
    format;
  let handle: any;
  try {
    if (typeof window.showSaveFilePicker === 'function') {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          { description: format.toUpperCase() + ' 图片', accept: { [mime]: ['.' + format] } },
        ],
      });
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return;
    throw error;
  }
  const source = new Image();
  source.src = sourceUrl;
  await source.decode();
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) throw new Error('图片无法解码，未导出文件。');
  if (format === 'jpg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result: Blob | null) =>
        result ? resolve(result) : reject(new Error('图片转换失败，请重试。')),
      mime,
      0.95
    );
  });
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
