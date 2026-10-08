import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getMakerHome } from '../storage.js';
import { MakerProjectRegistry } from '../projectRegistry.js';
import { previewDirectory } from './protocol.js';
import { withPreviewLock } from './installation.js';
import { previewStatus } from './session.js';
import { trimValidationHistory, requireNoActiveValidationRuntime } from './validationHistory.js';
import { ownedPreviewWorkspace, previewWorkspace, requirePlainTree } from './workspace.js';
import { UNVERIFIED_CLEANUP_MARKER } from './cache.js';

const HASH = /^[a-f0-9]{64}$/;
const CATEGORIES = new Set([
  'validation',
  'sessions',
  'preparations',
  'validation-prep',
  'storage',
  'public-index-cache',
]);
type CacheEntry = {
  key: string;
  project?: string;
  directory: string;
  bytes: number;
  categories: Record<string, number>;
};

async function cacheRoot(project: string): Promise<string> {
  const home = await fs.promises.realpath(getMakerHome()).catch((error) => {
    if (error.code === 'ENOENT') return path.resolve(getMakerHome());
    throw error;
  });
  const root = path.join(home, 'preview', path.basename(previewDirectory(project)));
  for (const directory of [path.dirname(root), root]) {
    try {
      const stat = await fs.promises.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('缓存目录异常，拒绝访问链接。');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return root;
}

async function sizeOf(
  filename: string,
  signal?: AbortSignal,
  warnings: string[] = []
): Promise<number> {
  if (signal?.aborted) throw new Error('缓存统计已取消。');
  const stat = await fs.promises.lstat(filename);
  if (stat.isSymbolicLink()) {
    warnings.push('未统计链接目标：' + filename);
    return 0;
  }
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let bytes = 0;
  for (const name of await fs.promises.readdir(filename)) {
    try {
      bytes += await sizeOf(path.join(filename, name), signal, warnings);
    } catch (error) {
      if (signal?.aborted) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        warnings.push('无法完整统计：' + path.join(filename, name));
    }
  }
  return bytes;
}

function smallJson(filename: string): Record<string, any> | undefined {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) return undefined;
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    return undefined;
  }
}

async function directoryEntries(directory: string): Promise<fs.Dirent[]> {
  try {
    const stat = await fs.promises.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('缓存目录异常：' + directory);
    return await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function cacheInventory(project: string, signal?: AbortSignal) {
  const root = path.dirname(await cacheRoot(project));
  const warnings: string[] = [];
  const known = new Map<string, string>();
  const inspectEntries = async (directory: string): Promise<fs.Dirent[]> => {
    try {
      return await directoryEntries(directory);
    } catch {
      warnings.push('无法完整读取缓存目录：' + directory);
      return [];
    }
  };
  const remember = (candidate: unknown, expected?: string): void => {
    if (
      typeof candidate !== 'string' ||
      !path.isAbsolute(candidate) ||
      path.normalize(candidate) !== candidate
    )
      return;
    const key = path.basename(previewDirectory(candidate));
    if (!expected || key === expected) known.set(key, candidate);
  };
  remember(project);
  try {
    for (const entry of new MakerProjectRegistry().list()) remember(entry.path);
  } catch {
    warnings.push('项目登记表无法读取，未登记的项目内缓存可能未计入。');
  }
  const children = await directoryEntries(root);
  for (const entry of children) {
    if (!entry.isDirectory() || !HASH.test(entry.name)) continue;
    const directory = path.join(root, entry.name);
    remember(smallJson(path.join(directory, 'session.json'))?.project_realpath, entry.name);
    if (known.has(entry.name)) continue;
    for (const run of await inspectEntries(path.join(directory, 'validation'))) {
      if (signal?.aborted) throw new Error('缓存统计已取消。');
      if (!run.isDirectory()) continue;
      remember(
        smallJson(path.join(directory, 'validation', run.name, 'run.json'))?.project_realpath,
        entry.name
      );
      if (known.has(entry.name)) break;
    }
  }
  const entries: CacheEntry[] = [];
  const keys = new Set([
    ...known.keys(),
    ...children
      .filter((entry) => entry.isDirectory() && HASH.test(entry.name))
      .map((entry) => entry.name),
  ]);
  for (const key of keys) {
    const directory = path.join(root, key);
    const candidate = known.get(key);
    const categories: Record<string, number> = {};
    for (const entry of await inspectEntries(directory)) {
      const category = CATEGORIES.has(entry.name)
        ? entry.name
        : entry.name.startsWith('runtime-')
          ? 'legacy-runtime'
          : 'other';
      categories[category] =
        (categories[category] || 0) +
        (await sizeOf(path.join(directory, entry.name), signal, warnings).catch((error) => {
          if (signal?.aborted) throw error;
          if (error.code !== 'ENOENT')
            warnings.push('无法完整统计：' + path.join(directory, entry.name));
          return 0;
        }));
    }
    if (candidate) {
      try {
        if (fs.realpathSync(candidate) !== candidate) throw new Error('项目路径已变化');
        const workspace = previewWorkspace(candidate);
        categories['project-workspace'] = await sizeOf(workspace, signal, warnings);
      } catch (error) {
        if (signal?.aborted) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          warnings.push('无法完整统计项目缓存：' + candidate);
      }
    }
    entries.push({
      key,
      project: candidate,
      directory,
      categories,
      bytes: Object.values(categories).reduce((total, bytes) => total + bytes, 0),
    });
  }
  let unattributed = 0;
  for (const entry of children) {
    if (entry.isDirectory() && HASH.test(entry.name)) continue;
    unattributed += await sizeOf(path.join(root, entry.name), signal, warnings);
  }
  let temporary = 0;
  if (process.platform === 'win32')
    for (const entry of await directoryEntries(os.tmpdir())) {
      if (!entry.isDirectory() || !/^maker-cache-[a-f0-9]{16}$/.test(entry.name)) continue;
      const directory = path.join(os.tmpdir(), entry.name);
      if (!smallJson(path.join(directory, '.maker-preview-owner.json'))?.storage) continue;
      temporary += await sizeOf(directory, signal, warnings);
    }
  return { root, entries, warnings, unattributed, temporary };
}

export async function previewCacheUsage(project: string, signal?: AbortSignal) {
  const inventory = await cacheInventory(project, signal);
  const current = inventory.entries.find((entry) => entry.project === project)!;
  const totalCategories: Record<string, number> = {
    unattributed: inventory.unattributed,
    'windows-downloads': inventory.temporary,
  };
  for (const entry of inventory.entries)
    for (const [category, bytes] of Object.entries(entry.categories))
      totalCategories[category] = (totalCategories[category] || 0) + bytes;
  return {
    directory: current.directory,
    bytes: current.bytes,
    categories: current.categories,
    total_bytes: Object.values(totalCategories).reduce((total, bytes) => total + bytes, 0),
    total_categories: totalCategories,
    projects: inventory.entries,
    global_directory: inventory.root,
    project_directory: previewWorkspace(project),
    warnings: inventory.warnings,
    complete: inventory.warnings.length === 0,
  };
}

async function clearProjectCache(project: string) {
  const root = await cacheRoot(project);
  return withPreviewLock(project, async () => {
    await cacheRoot(project);
    const status = await previewStatus(project);
    if (
      status.process_alive !== false ||
      ['starting', 'running', 'reloading'].includes(String(status.state))
    )
      throw new Error('预览仍在运行或退出状态不明，请先停止预览并重新检测。');
    await requireNoActiveValidationRuntime(project);
    const warnings = await trimValidationHistory(project, 0);
    try {
      const workspace = ownedPreviewWorkspace(project);
      if (workspace) {
        if (fs.existsSync(path.join(workspace, UNVERIFIED_CLEANUP_MARKER)))
          throw new Error('上次构建进程退出未确认');
        await requirePlainTree(workspace);
        for (const name of ['source'])
          await fs.promises.rm(path.join(workspace, name), { recursive: true, force: true });
      }
    } catch (error) {
      warnings.push('保留无法安全清理的项目副本：' + String(error));
    }
    for (const name of ['sessions', 'preparations', 'validation-prep', 'public-index-cache']) {
      const directory = path.join(root, name);
      try {
        const stat = await fs.promises.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          warnings.push('保留异常缓存目录：' + name);
          continue;
        }
        if (name === 'sessions' && status.state !== 'stopped') {
          warnings.push('保留普通预览记录以供退出状态核验。');
          continue;
        }
        if (name === 'preparations' || name === 'validation-prep') {
          for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
            const target = path.join(directory, entry.name);
            if (
              !entry.isDirectory() ||
              !/^[0-9a-f-]{36}$/.test(entry.name) ||
              fs.existsSync(path.join(target, '.cleanup-unverified'))
            ) {
              warnings.push('保留未确认的准备缓存：' + entry.name);
              continue;
            }
            await fs.promises.rm(target, { recursive: true, force: true });
          }
        } else await fs.promises.rm(directory, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          warnings.push('未能清理 ' + name + '：' + String(error));
      }
    }
    return warnings;
  });
}

export async function clearPreviewCache(project: string, allProjects = false) {
  const warnings: string[] = [];
  if (allProjects) {
    const inventory = await cacheInventory(project);
    for (const entry of inventory.entries) {
      if (!entry.project) {
        if (entry.bytes) warnings.push('保留无法确认归属的缓存：' + entry.directory);
        continue;
      }
      try {
        warnings.push(...(await clearProjectCache(entry.project)));
      } catch (error) {
        warnings.push('保留 ' + entry.project + '：' + String(error));
      }
    }
  } else warnings.push(...(await clearProjectCache(project)));
  const usage = await previewCacheUsage(project);
  return { ...usage, warnings: [...warnings, ...usage.warnings] };
}
