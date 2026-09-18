import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createPreviewSourceAlias(
  source: string,
  platform: NodeJS.Platform = process.platform,
  temporaryDirectory = os.tmpdir()
): { source: string; close: () => void } {
  if (platform !== 'win32') return { source, close: () => {} };
  const target = fs.realpathSync(source);
  const directory = fs.mkdtempSync(path.join(temporaryDirectory, 'maker-preview-'));
  const alias = path.join(directory, 'source');
  try {
    if (alias.length > 180)
      throw new Error('Windows preview needs a shorter TEMP directory (Runtime path limit).');
    fs.symlinkSync(target, alias, 'junction');
  } catch (error) {
    fs.rmdirSync(directory);
    throw error;
  }
  let closed = false;
  return {
    source: alias,
    close: () => {
      if (closed) return;
      if (!fs.lstatSync(alias).isSymbolicLink() || fs.realpathSync(alias) !== target)
        throw new Error('Preview source alias changed; refusing cleanup.');
      fs.unlinkSync(alias);
      fs.rmdirSync(directory);
      closed = true;
    },
  };
}
