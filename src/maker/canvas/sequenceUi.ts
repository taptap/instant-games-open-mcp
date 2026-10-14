import {
  createSequenceUiControllerWithMedia,
  type SequenceUiOptions as SharedSequenceUiOptions,
} from '../../../packages/maker-canvas/src/browser.js';

export type SequenceUiOptions = Omit<SharedSequenceUiOptions, 'readAtlas'>;

export function createSequenceUiController(options: SequenceUiOptions) {
  return createSequenceUiControllerWithMedia({
    ...options,
    readAtlas: async (path, signal) => {
      const response = await fetch(options.store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error('无法读取已保存图集。');
      return response.blob();
    },
  });
}
