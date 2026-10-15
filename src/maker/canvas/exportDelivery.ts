import type {
  CanvasExportRequest,
  CanvasExportResult,
} from '../../../packages/maker-canvas/src/browser/exportDelivery.js';

/** Local browser delivery; shared business code never chooses this fallback itself. */
export async function deliverCanvasExport(
  request: CanvasExportRequest
): Promise<CanvasExportResult> {
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<any> })
    .showSaveFilePicker;
  let handle: any;
  if (picker) {
    try {
      handle = await picker.call(window, {
        suggestedName: request.filename,
        types: [
          {
            description: request.filename,
            accept: { [request.mime]: ['.' + request.filename.split('.').pop()] },
          },
        ],
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return { status: 'canceled' };
      throw error;
    }
  }
  const blob = await request.produce();
  if (!blob.size) throw new Error('导出文件为空，未保存。');
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return { status: 'saved' };
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = request.filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { status: 'downloaded' };
}
