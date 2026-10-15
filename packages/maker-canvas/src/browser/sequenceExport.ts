declare const document: any;
declare const createImageBitmap: any;
import type { FrameSetInfo } from '../contracts.js';
import { createCanvasZip } from './zipArchive.js';
import {
  sequenceExportManifest,
  sequenceExportLua,
  sequenceExportInstructions,
  type SequenceExportPlayback,
} from '../features/sequenceExport.js';

export async function createSequenceExportFromReader(
  readSource: () => Promise<Blob>,
  info: FrameSetInfo,
  mode: 'atlas' | 'frames',
  folder: string,
  progress?: (message: string) => void,
  playback: SequenceExportPlayback = { name: 'default', loop: true }
): Promise<Blob> {
  sequenceExportManifest(info, info.width, info.height, playback);
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(folder)) throw new Error('导出目录名称无效。');
  const source = await readSource();
  if (source.size > 128 * 1024 * 1024) throw new Error('图集过大，无法导出。');
  const signature = new Uint8Array(await source.slice(0, 24).arrayBuffer());
  if (signature.length < 24) throw new Error('图集文件不完整，未导出文件。');
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => signature[index] !== value))
    throw new Error('图集不是有效的 PNG 文件，请重新保存后导出。');
  const header = new DataView(signature.buffer);
  sequenceExportManifest(info, header.getUint32(16), header.getUint32(20), playback);
  const bitmap = await createImageBitmap(source);
  try {
    const manifest = sequenceExportManifest(info, bitmap.width, bitmap.height, playback);
    const entries = [
      {
        name: folder + '/README.md',
        blob: new Blob([sequenceExportInstructions(folder, mode, playback)], {
          type: 'text/markdown;charset=utf-8',
        }),
      },
      {
        name: folder + (mode === 'atlas' ? '/spritesheet.json' : '/animation.lua'),
        blob: new Blob(
          [
            mode === 'atlas'
              ? JSON.stringify(manifest, null, 2)
              : sequenceExportLua(info, folder, playback),
          ],
          { type: mode === 'atlas' ? 'application/json' : 'text/plain;charset=utf-8' }
        ),
      },
    ];
    let totalBytes = entries.reduce((size, entry) => size + entry.blob.size, 0);
    if (mode === 'atlas') {
      entries.push({ name: folder + '/spritesheet.png', blob: source });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = info.frames[0].width;
      canvas.height = info.frames[0].height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建序列帧导出画布。');
      for (let index = 0; index < info.frames.length; index++) {
        const frame = info.frames[index];
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          bitmap,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          0,
          0,
          frame.width,
          frame.height
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value: Blob | null) =>
              value ? resolve(value) : reject(new Error('序列帧编码失败，未导出文件。')),
            'image/png'
          )
        );
        totalBytes += blob.size;
        if (totalBytes > 128 * 1024 * 1024)
          throw new Error('导出包超过 128 MiB，请减少帧数或尺寸后重试。');
        entries.push({
          name: folder + '/frames/frame_' + String(index + 1).padStart(4, '0') + '.png',
          blob,
        });
        if (index % 10 === 0 || index === info.frames.length - 1)
          progress?.('正在打包序列帧：' + (index + 1) + '/' + info.frames.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return await createCanvasZip(entries);
  } finally {
    bitmap.close();
  }
}
