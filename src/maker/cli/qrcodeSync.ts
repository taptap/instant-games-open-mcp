import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { getGitCommand } from '../system/git.js';
import { validQrcodePublication } from '../qrcodePreflight.js';

const file = '.project/project.json';

/** QR-only exception for a formatting-only remote config commit. Never rewrites working files. */
export async function withQrcodeFastForward(
  cwd: string,
  remoteRef: string,
  fastForward: (revision: string) => Promise<void>
): Promise<void> {
  const git = (args: string[], index?: string) =>
    execFileSync(getGitCommand(), args, {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...(index ? { GIT_INDEX_FILE: index } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const head = git(['rev-parse', 'HEAD']).trim();
  const remote = git(['rev-parse', remoteRef]).trim();
  let baseEntry: string, remoteEntry: string, localText: string;
  try {
    const treeEntry = /^100644 blob ([a-f0-9]+)\t\.project\/project\.json\n$/;
    const baseTree = treeEntry.exec(git(['ls-tree', head, '--', file]));
    const remoteTree = treeEntry.exec(git(['ls-tree', remote, '--', file]));
    if (!baseTree || !remoteTree) return await fastForward(remote);
    baseEntry = `100644 ${baseTree[1]} 0\t${file}\n`;
    remoteEntry = `100644 ${remoteTree[1]} 0\t${file}\n`;
    if (baseEntry === remoteEntry || git(['ls-files', '--stage', '--', file]) !== baseEntry)
      return await fastForward(remote);
    const filename = path.join(cwd, file);
    if (
      fs.realpathSync(filename) !== path.join(fs.realpathSync(cwd), file) ||
      !fs.lstatSync(filename).isFile()
    )
      return await fastForward(remote);
    localText = fs.readFileSync(filename, 'utf8');
    const base = JSON.parse(git(['show', `${head}:${file}`]));
    const upstream = JSON.parse(git(['show', `${remote}:${file}`]));
    const local = JSON.parse(localText);
    if (!isDeepStrictEqual(base, upstream) || !base?.taptap_publish || !local?.taptap_publish)
      return await fastForward(remote);
    const choices: Record<string, unknown> = {};
    for (const key of ['title', 'category', 'developer_id', 'screen_orientation']) {
      if (isDeepStrictEqual(base.taptap_publish[key], local.taptap_publish[key])) continue;
      const value = local.taptap_publish[key];
      if (key === 'screen_orientation') {
        if (value !== 'landscape' && value !== 'portrait') return await fastForward(remote);
      } else {
        choices[key] = value;
        if (value === undefined || !validQrcodePublication(choices))
          return await fastForward(remote);
      }
      if (Object.hasOwn(base.taptap_publish, key))
        local.taptap_publish[key] = base.taptap_publish[key];
      else delete local.taptap_publish[key];
    }
    if (!isDeepStrictEqual(base, local)) return await fastForward(remote);
  } catch (error) {
    // Invalid/missing JSON is not a reason to relax the normal Git protection.
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT')
      return await fastForward(remote);
    throw error;
  }

  const index = path.resolve(cwd, git(['rev-parse', '--git-path', 'index']).trim());
  const lock = index + '.lock';
  const replaceEntry = (expected: string, replacement: string, checkLocal: boolean): boolean => {
    const fd = fs.openSync(lock, 'wx', 0o600);
    let installed = false;
    try {
      fs.closeSync(fd);
      if (
        git(['rev-parse', 'HEAD']).trim() !== head ||
        git(['ls-files', '--stage', '--', file]) !== expected ||
        (checkLocal && fs.readFileSync(path.join(cwd, file), 'utf8') !== localText)
      )
        return false;
      // Mutate a locked copy of the CURRENT index, preserving concurrent staging in other files.
      fs.copyFileSync(index, lock);
      const [mode, oid] = replacement.split(' ');
      git(['update-index', '--cacheinfo', mode, oid, file], lock);
      fs.renameSync(lock, index);
      installed = true;
      return true;
    } finally {
      if (!installed) fs.rmSync(lock, { force: true });
    }
  };
  if (!replaceEntry(baseEntry, remoteEntry, true))
    throw new Error(
      'QR configuration or Git index changed during synchronization; retry after checking the project.'
    );
  try {
    await fastForward(remote);
  } catch (error) {
    // Do not undo a concurrent HEAD change or another writer's staging of this file.
    replaceEntry(remoteEntry, baseEntry, false);
    throw error;
  }
}
