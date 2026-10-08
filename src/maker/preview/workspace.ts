import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitCommand } from '../system/git.js';
import { sameProjectPathSpelling } from '../system/projectPath.js';

const NAME = '.maker-preview';
const OWNER = 'owner.json';

export function previewWorkspace(project: string): string {
  return path.join(project, NAME);
}

export async function requirePlainTree(directory: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('CANCELLED');
  const stat = await fs.promises.lstat(directory);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
    throw new Error('预览不支持链接或特殊文件：' + directory);
  if (stat.isDirectory())
    for (const name of await fs.promises.readdir(directory))
      await requirePlainTree(path.join(directory, name), signal);
}

export async function requirePlainPreviewSource(
  project: string,
  signal?: AbortSignal
): Promise<void> {
  for (const name of ['scripts', 'assets']) {
    const directory = path.join(project, name);
    if (fs.lstatSync(directory, { throwIfNoEntry: false }))
      await requirePlainTree(directory, signal);
  }
}

export function ownedPreviewWorkspace(project: string): string | undefined {
  const root = previewWorkspace(project);
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync.native(root) !== root)
    throw new Error('预览缓存目录异常，拒绝访问：' + root);
  const marker = path.join(root, OWNER);
  const ownerStat = fs.lstatSync(marker);
  if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.size > 4096)
    throw new Error('预览缓存归属记录异常：' + root);
  const owner = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (
    owner.schema !== 1 ||
    typeof owner.project !== 'string' ||
    !sameProjectPathSpelling(owner.project, project)
  )
    throw new Error('预览缓存归属不匹配，未覆盖或删除：' + root);
  return root;
}

export async function ensurePreviewWorkspace(project: string): Promise<string> {
  const root = previewWorkspace(project);
  const existing = ownedPreviewWorkspace(project);
  const ignore = path.join(project, '.gitignore');
  const stat = fs.lstatSync(ignore, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error('项目 .gitignore 不是普通文件，无法安全排除预览缓存。');
  if (fs.existsSync(path.join(project, '.git'))) {
    const tracked = await promisify(execFile)(
      getGitCommand(),
      ['-C', project, 'ls-files', '--', NAME],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      }
    );
    if (tracked.stdout.trim())
      throw new Error('预览缓存已被 Git 跟踪，请先移出索引，避免提交或上传缓存。');
  }
  const content = stat ? await fs.promises.readFile(ignore, 'utf8') : '';
  if (!content.split(/\r?\n/).includes('/' + NAME + '/'))
    await fs.promises.appendFile(
      ignore,
      (content && !content.endsWith('\n') ? '\n' : '') + '/' + NAME + '/\n'
    );
  if (fs.existsSync(path.join(project, '.git'))) {
    try {
      await promisify(execFile)(
        getGitCommand(),
        [
          '-C',
          project,
          'check-ignore',
          '--quiet',
          '--no-index',
          '--',
          NAME + '/source/cache-probe',
        ],
        { windowsHide: true, timeout: 10000 }
      );
    } catch {
      throw new Error('项目忽略规则未生效，请将 /.maker-preview/ 放在 .gitignore 最后再重试。');
    }
  }
  if (!existing) {
    await fs.promises.mkdir(root, { mode: 0o700 });
    await fs.promises.writeFile(path.join(root, OWNER), JSON.stringify({ schema: 1, project }), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  return ownedPreviewWorkspace(project)!;
}
