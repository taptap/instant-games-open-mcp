import sample from './templateModelData.json';
import { CanvasStoreError } from './model.js';

export function readBuiltinTemplateModel(id: string, filename: string | null) {
  if (id !== '7e1cb6ad-732f-4dc3-a951-000000000004')
    throw new CanvasStoreError('此模板没有模型预览。', 404, 'NOT_FOUND');
  const files: Record<string, string> = sample.files;
  if (filename !== null) {
    if (!Object.prototype.hasOwnProperty.call(files, filename))
      throw new CanvasStoreError('文件不属于此模板的模型预览。', 404, 'NOT_FOUND');
    return {
      bytes: Buffer.from(files[filename], 'base64'),
      type: filename.endsWith('.jpg')
        ? 'image/jpeg'
        : filename.endsWith('.png')
          ? 'image/png'
          : 'application/octet-stream',
    };
  }
  return {
    bytes: Buffer.from(
      JSON.stringify({
        model: sample.model,
        files: Object.entries(files).map(([path, data]) => ({
          path,
          size: Buffer.byteLength(data, 'base64'),
        })),
      })
    ),
    type: 'application/json; charset=utf-8',
  };
}
