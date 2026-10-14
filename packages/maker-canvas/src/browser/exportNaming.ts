declare const window: any;
export { canvasExportIdentity, canvasExportFilename } from '../features/exportNaming.js';

export async function nextCanvasExportCode(): Promise<string> {
  const allocate = () => {
    const key = 'maker-canvas-export-time';
    const seconds = Math.max(0, Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 1000));
    let previous = Number(window.__makerCanvasExportTime) || 0;
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
      const saved = Number(storage?.getItem(key));
      if (Number.isSafeInteger(saved) && saved > 0 && saved < 36 ** 6)
        previous = Math.max(previous, saved);
    } catch {
      storage = undefined;
    }
    const value = Math.max(seconds, previous + 1);
    if (value >= 36 ** 6) throw new Error('导出时间编号超出范围，请检查系统时间。');
    window.__makerCanvasExportTime = value;
    const code = value.toString(36).toUpperCase().padStart(6, '0');
    try {
      storage?.setItem(key, String(value));
    } catch {
      return code;
    }
    return code;
  };
  return window.navigator?.locks
    ? window.navigator.locks.request('maker-canvas-export-name', allocate)
    : allocate();
}
