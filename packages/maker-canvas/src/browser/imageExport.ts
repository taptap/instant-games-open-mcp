export async function encodeCanvasImage(sourceUrl: string, format: 'png' | 'jpg'): Promise<Blob> {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const source = new Image();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('图片加载超时，未导出文件，请重试。')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      source.onload = null;
      source.onerror = null;
      if (error) {
        source.src = '';
        reject(error);
      } else resolve();
    };
    source.onload = () => finish();
    source.onerror = () => finish(new Error('图片无法加载，未导出文件。'));
    source.src = sourceUrl;
  });
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
  return blob;
}
