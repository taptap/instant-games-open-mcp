/**
 * Shared safe-write behavior for Maker-managed client configuration files.
 */

import fs from 'node:fs';
import path from 'node:path';

export type ConfigWriteResult = {
  changed: boolean;
  backupPath?: string;
};

export function writeConfigWithTapTapBackupIfChanged(
  filePath: string,
  nextContent: string,
  validate?: (content: string) => void
): ConfigWriteResult {
  const existed = fs.existsSync(filePath);
  const previousContent = existed ? fs.readFileSync(filePath, 'utf8') : undefined;
  if (previousContent === nextContent) {
    return { changed: false };
  }

  const backupPath = existed ? `${filePath}.taptap-maker.bak.latest` : undefined;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (previousContent !== undefined && backupPath) {
    fs.writeFileSync(backupPath, previousContent, 'utf8');
  }

  try {
    fs.writeFileSync(filePath, nextContent, 'utf8');
    validate?.(fs.readFileSync(filePath, 'utf8'));
    return { changed: true, backupPath };
  } catch (error) {
    if (previousContent !== undefined) {
      fs.writeFileSync(filePath, previousContent, 'utf8');
    } else {
      fs.rmSync(filePath, { force: true });
    }
    throw error;
  }
}
