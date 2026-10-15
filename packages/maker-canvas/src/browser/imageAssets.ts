import type { ImageAssetsInfo } from '../contracts.js';
import { validateImageAssetsInfoStructure } from '../features/imageAssets.js';

export async function collectImageAssetEntriesFromReader(
  info: ImageAssetsInfo,
  readBlob: (path: string, name: string) => Promise<Blob>,
  budget = { bytes: 0 }
): Promise<Array<{ name: string; blob: Blob }>> {
  const saved = validateImageAssetsInfoStructure(info);
  const entries = [];
  for (const item of saved.items) {
    const blob = await readBlob(item.assetPath, item.name);
    budget.bytes += blob.size;
    if (!blob.size || blob.size > 20 * 1024 * 1024 || budget.bytes > 128 * 1024 * 1024)
      throw new Error('素材为空或导出包过大，未导出文件。');
    const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      [137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => header[index] !== byte)
    )
      throw new Error('素材不是有效 PNG，未导出文件。');
    const dimensions = new DataView(header.buffer);
    if (dimensions.getUint32(16) !== item.width || dimensions.getUint32(20) !== item.height)
      throw new Error('素材尺寸与保存记录不一致，未导出文件。');
    entries.push({ name: item.name + '.png', blob });
  }
  return entries;
}
