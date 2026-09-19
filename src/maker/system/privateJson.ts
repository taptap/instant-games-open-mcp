import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function writePrivateJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.' + randomUUID() + '.tmp';
  const contents = JSON.stringify(value, null, 2);
  let descriptor: number | undefined;
  let owned = false;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    owned = true;
    fs.writeFileSync(descriptor, contents);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
  } finally {
    // Cleanup must neither remove another writer's file nor mask the original failure.
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        /* Preserve the original write/close error. */
      }
    }
    if (owned) {
      try {
        fs.unlinkSync(temporary);
      } catch {
        /* Rename already removed it, or cleanup is not permitted. */
      }
    }
  }
}
