import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

const WINDOWS_CACHE_OWNER = '.maker-preview-owner.json';

/** Persistent public downloads with cleanup limited to this round's loopback project. */
export interface PreviewDownloadCache {
  root: string;
  clearProject(): void;
}

function requireDirectory(directory: string): void {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory)
    throw new Error('Preview download cache ownership changed; refusing linked directories.');
}

/** Called under the existing project/session ownership guards, never shared across projects. */
export function openPreviewDownloadCache(
  storage: string,
  gameUrl: string,
  platform = process.platform
): PreviewDownloadCache {
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(storage).isSymbolicLink())
    throw new Error('Preview download storage must not be a symbolic link.');
  const owner = fs.realpathSync(storage);
  // Keep Windows paths shallow; the project hash/session directories exceed some Runtime limits.
  const root =
    platform === 'win32'
      ? path.join(
          fs.realpathSync(os.tmpdir()),
          'maker-cache-' + createHash('sha256').update(owner).digest('hex').slice(0, 16)
        )
      : path.join(owner, 'runtime-cache');
  let created = false;
  try {
    fs.mkdirSync(root, { mode: 0o700 });
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  requireDirectory(root);
  const requireOwner = (): void => {
    requireDirectory(root);
    if (platform !== 'win32') return;
    const filename = path.join(root, WINDOWS_CACHE_OWNER);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
      throw new Error('Invalid preview download cache owner.');
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (saved.storage !== owner)
      throw new Error('Preview download cache belongs to another project; refusing reuse.');
  };
  if (platform === 'win32' && created) {
    const filename = path.join(root, WINDOWS_CACHE_OWNER);
    let markerCreated = false;
    try {
      const descriptor = fs.openSync(filename, 'wx', 0o600);
      markerCreated = true;
      try {
        fs.writeFileSync(descriptor, JSON.stringify({ storage: owner }));
      } finally {
        fs.closeSync(descriptor);
      }
    } catch (error) {
      try {
        requireDirectory(root);
        if (markerCreated) fs.unlinkSync(filename);
        fs.rmdirSync(root);
      } catch {
        // Keep replaced or nonempty directories; never delete an unknown cache recursively.
      }
      throw error;
    }
  }
  requireOwner();

  const url = new URL(gameUrl);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-z0-9_-]+\/$/i.test(url.pathname)
  )
    throw new Error('Preview download cache requires the protected loopback project URL.');
  const hostDirectory = path.join(root, url.host.replace(':', '_'));
  const projectDirectory = path.join(hostDirectory, url.pathname.slice(1, -1));
  const requireProjectDirectories = (): void => {
    requireOwner();
    for (const directory of [hostDirectory, projectDirectory]) {
      if (fs.existsSync(directory) || fs.lstatSync(directory, { throwIfNoEntry: false }))
        requireDirectory(directory);
    }
  };
  requireProjectDirectories();
  return {
    root,
    clearProject(): void {
      requireProjectDirectories();
      fs.rmSync(projectDirectory, { recursive: true, force: true });
      if (fs.existsSync(hostDirectory) && !fs.readdirSync(hostDirectory).length)
        fs.rmdirSync(hostDirectory);
    },
  };
}
