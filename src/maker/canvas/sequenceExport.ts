import type { FrameSetInfo } from '../../../packages/maker-canvas/src/contracts.js';
import type { SequenceExportPlayback } from '../../../packages/maker-canvas/src/domain.js';
import { createSequenceExportFromReader } from '../../../packages/maker-canvas/src/browser.js';
export type { SequenceExportPlayback } from '../../../packages/maker-canvas/src/domain.js';
export {
  sequenceExportManifest,
  sequenceExportLua,
  sequenceExportInstructions,
} from '../../../packages/maker-canvas/src/domain.js';

export async function createSequenceExport(
  sourceUrl: string,
  info: FrameSetInfo,
  mode: 'atlas' | 'frames',
  folder: string,
  progress?: (message: string) => void,
  playback: SequenceExportPlayback = { name: 'default', loop: true }
): Promise<Blob> {
  return createSequenceExportFromReader(
    async () => {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error('图集读取失败，未导出文件。');
      return response.blob();
    },
    info,
    mode,
    folder,
    progress,
    playback
  );
}
