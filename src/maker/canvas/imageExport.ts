import { encodeCanvasImage } from '../../../packages/maker-canvas/src/browser/imageExport.js';
declare const document: any;
declare const window: any;

export async function downloadCanvasImage(
  sourceUrl: string,
  title: string,
  format: 'png' | 'jpg',
  sink?: (blob: Blob, filename: string) => Promise<void>
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
    if (!sink && typeof window.showSaveFilePicker === 'function') {
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
  const blob = await encodeCanvasImage(sourceUrl, format);
  if (sink) {
    await sink(blob, filename);
    return;
  }
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
