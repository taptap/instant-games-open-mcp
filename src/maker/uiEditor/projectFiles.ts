import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConsoleError, type ConsoleProject } from '../console/types.js';
import { claimRecoveryMutex } from '../system/recoveryMutex.js';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const fontExtensions = new Set(['.ttf', '.otf', '.woff', '.woff2']);
export const MAX_UI_JSON = 8 * 1024 * 1024;

function validateUiPath(relative: string): void {
  if (
    !relative.startsWith('assets/') ||
    relative.includes(String.fromCharCode(92)) ||
    relative.includes(String.fromCharCode(0)) ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new ConsoleError('仅允许访问当前项目 assets 内的资源。', 400);
}

export async function resolveUiFile(root: string, relative: string): Promise<string> {
  validateUiPath(relative);
  let current = await fs.realpath(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new ConsoleError('不允许通过符号链接访问资源。', 403);
  }
  if (!(await fs.stat(current)).isFile()) throw new ConsoleError('资源不是文件。', 400);
  return current;
}

export async function readUiFile(root: string, relative: string): Promise<Buffer> {
  const extension = path.extname(relative).toLowerCase();
  if (
    !imageExtensions.has(extension) &&
    !fontExtensions.has(extension) &&
    extension !== '.json' &&
    extension !== '.meta'
  )
    throw new ConsoleError('UI 编辑器不支持此文件类型。', 415);
  const filename = await resolveUiFile(root, relative);
  const limit = extension === '.json' || extension === '.meta' ? MAX_UI_JSON : 32 * 1024 * 1024;
  if ((await fs.stat(filename)).size > limit) throw new ConsoleError('资源超过读取大小限制。', 413);
  return fs.readFile(filename);
}

export async function uiEditorManifest(project: Pick<ConsoleProject, 'path' | 'key' | 'name'>) {
  const prefix = '/api/projects/' + project.key + '/ui-editor/files/';
  const encode = (relative: string) => relative.split('/').map(encodeURIComponent).join('/');
  const ui: Record<string, unknown>[] = [];
  const assets: Record<string, unknown>[] = [];
  const root = await fs.realpath(project.path);
  let count = 0;
  async function walk(relative: string, depth: number): Promise<void> {
    if (depth > 64) throw new ConsoleError('资源目录层级过深。', 413);
    const directory = path.join(root, relative);
    const stat = await fs.lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' && relative === 'assets') return null;
      throw error;
    });
    if (!stat) return;
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new ConsoleError('资源目录不能是符号链接。', 403);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    for (const entry of entries) {
      if (++count > 20000) throw new ConsoleError('项目资源超过 20000 项，请先整理资源目录。', 413);
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const filename = relative + '/' + entry.name;
      if (entry.isDirectory()) {
        await walk(filename, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const kind = entry.name.endsWith('.ui.json')
        ? 'ui'
        : imageExtensions.has(extension)
          ? 'image'
          : fontExtensions.has(extension)
            ? 'font'
            : null;
      if (!kind) continue;
      const item = {
        path: prefix + encode(filename),
        name: entry.name,
        dir: relative,
        kind,
        ref: filename.slice(7),
        assetRoot: prefix + 'assets/',
        hasMeta: names.has(entry.name + '.meta'),
      };
      (kind === 'ui' ? ui : assets).push(item);
    }
  }
  await walk('assets', 0);
  ui.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  let config;
  const configPath = path.join(root, '.project', 'project.json');
  try {
    if (
      (await fs.realpath(configPath)) !== configPath ||
      (await fs.stat(configPath)).size > MAX_UI_JSON
    )
      throw new Error('项目配置路径或大小无效');
    const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config = {
      orientation: raw.taptap_publish?.screen_orientation,
      designWidth: raw.designWidth ?? raw.design_width,
      designHeight: raw.designHeight ?? raw.design_height,
    };
  } catch {
    /* UI documents retain their own dimensions when project configuration is unavailable. */
  }
  return { name: project.name, projectKey: project.key, ui, assets, config };
}

export async function saveUiFile(root: string, body: Record<string, unknown>) {
  if (
    typeof body.path !== 'string' ||
    !body.path.endsWith('.ui.json') ||
    typeof body.content !== 'string' ||
    typeof body.expectedText !== 'string'
  )
    throw new ConsoleError('保存需要 UI 路径、内容和打开时的原文。', 400);
  if (
    Buffer.byteLength(body.content) > MAX_UI_JSON ||
    Buffer.byteLength(body.expectedText) > MAX_UI_JSON
  )
    throw new ConsoleError('UI 文档超过 8 MiB。', 413);
  let value;
  try {
    value = JSON.parse(body.content);
  } catch {
    throw new ConsoleError('UI JSON 格式无效。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string')
    throw new ConsoleError('UI 文档必须包含根节点 type。');
  const release = await claimRecoveryMutex(
    path.join(root, '.maker', 'ui-editor-save.lock'),
    () => new ConsoleError('该项目正在保存 UI，请稍后再试。', 409)
  );
  let temporary: string | undefined;
  try {
    const filename = await resolveUiFile(root, body.path);
    const original = (await readUiFile(root, body.path)).toString('utf8');
    if (original !== body.expectedText)
      throw new ConsoleError('文件已被外部修改，未覆盖。请保留当前修改后重新打开文档合并。', 409);
    const stat = await fs.stat(filename);
    temporary = filename + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, body.content, { flag: 'wx', mode: stat.mode & 0o777 });
    if (
      (await resolveUiFile(root, body.path)) !== filename ||
      (await readUiFile(root, body.path)).toString('utf8') !== original
    )
      throw new ConsoleError('保存期间文件已变化，未覆盖。', 409);
    await fs.rename(temporary, filename);
    temporary = undefined;
    return { ok: true };
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => {});
    await release();
  }
}

/** Publish a new document under the same project lock without replacing any existing file. */
export async function createUiFile(root: string, relative: string, content: string) {
  validateUiPath(relative);
  if (!relative.endsWith('.ui.json') || Buffer.byteLength(content) > MAX_UI_JSON)
    throw new ConsoleError('新建需要 assets 内的 .ui.json 路径，文档须小于 8 MiB。');
  const tree = JSON.parse(content);
  if (!tree || typeof tree !== 'object' || Array.isArray(tree) || typeof tree.type !== 'string')
    throw new ConsoleError('UI 文档必须包含根节点 type。');
  root = await fs.realpath(root);
  const release = await claimRecoveryMutex(
    path.join(root, '.maker', 'ui-editor-save.lock'),
    () => new ConsoleError('该项目正在保存 UI，请稍后再试。', 409)
  );
  let temporary: string | undefined;
  try {
    await validateNewUiFile(root, relative);
    let parent = root;
    const parts = relative.split('/');
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      await fs.mkdir(parent).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const stat = await fs.lstat(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new ConsoleError('资源目录不能是符号链接或普通文件。', 403);
    }
    const filename = path.join(root, relative);
    temporary = filename + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, content, { flag: 'wx' });
    if ((await fs.realpath(parent)) !== parent)
      throw new ConsoleError('创建期间资源目录已变化，未写入文档。', 409);
    // A hard link publishes the complete file atomically and fails if the destination exists.
    await fs.link(temporary, filename).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new ConsoleError('UI 文档已存在，未覆盖。', 409);
      throw error;
    });
    return { ok: true };
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => {});
    await release();
  }
}

export async function validateNewUiFile(root: string, relative: string): Promise<void> {
  validateUiPath(relative);
  if (!relative.endsWith('.ui.json')) throw new ConsoleError('新建路径必须以 .ui.json 结尾。');
  let current = await fs.realpath(root);
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new ConsoleError('不允许通过符号链接创建资源。', 403);
    if (i === parts.length - 1) throw new ConsoleError('UI 文档已存在，未覆盖。', 409);
    if (!stat.isDirectory()) throw new ConsoleError('资源父路径不是目录。');
  }
}
