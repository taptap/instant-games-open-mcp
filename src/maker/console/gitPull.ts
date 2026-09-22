import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitCommand } from '../system/git.js';
import { previewStatus } from '../preview/session.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';

const exec = promisify(execFile);
const MAX_CONFLICT_FILES = 30;
const MAX_PATH_LENGTH = 180;
const MAX_DETAIL_LENGTH = 2000;
const INSPECT_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 60000;
const UPDATE_TIMEOUT_MS = 60000;

/** 控制台 Git 拉取的固定结果。提示词只在同一文件两边都改过时出现。 */
export interface ConsoleGitPullResult {
  outcome: 'updated' | 'up_to_date' | 'ahead' | 'blocked' | 'conflict' | 'unavailable';
  message: string;
  detail?: string;
  prompt?: string;
  dialog: boolean;
  aheadCount: number;
  behindCount: number;
  localChangeCount: number;
  conflictFiles: string[];
}

export interface PullConsoleGitOptions {
  projectPath: string;
  signal?: AbortSignal;
  /** 返回 true 时拒绝拉取。缺省时无法确认预览已停止也拒绝。 */
  previewBlocks?: (projectPath: string) => Promise<boolean>;
  /** 写入前再次确认项目仍是这次操作开始时的目录。 */
  ensureProject?: () => void;
  onGit?: (args: readonly string[]) => void;
}

class GitCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly stdout: string
  ) {
    super(message);
  }
}

/**
 * 在已校验的 Maker 项目目录执行控制台拉取。
 * 只允许 main 上的快进，或工作区干净且文件不相交时的 rebase。
 */
export async function pullConsoleGit(
  options: PullConsoleGitOptions
): Promise<ConsoleGitPullResult> {
  try {
    return await pullConsoleGitUnsafe(options);
  } catch (error) {
    if (!(error instanceof GitCommandError)) throw error;
    return {
      outcome: 'unavailable',
      message: '暂时无法完成拉取。控制台没有修改游戏文件，也没有改用其它合并方式。',
      detail: gitDetail(error),
      dialog: false,
      aheadCount: 0,
      behindCount: 0,
      localChangeCount: 0,
      conflictFiles: [],
    };
  }
}

async function pullConsoleGitUnsafe(options: PullConsoleGitOptions): Promise<ConsoleGitPullResult> {
  const root = options.projectPath;
  const run = (args: string[], timeout: number) => git(root, args, timeout, options);
  const blocked = (
    message: string,
    extra: Partial<ConsoleGitPullResult> = {}
  ): ConsoleGitPullResult => ({
    outcome: 'blocked',
    message,
    dialog: false,
    aheadCount: 0,
    behindCount: 0,
    localChangeCount: 0,
    conflictFiles: [],
    ...extra,
  });

  options.ensureProject?.();
  const branch = (await run(['branch', '--show-current'], INSPECT_TIMEOUT_MS)).trim();
  if (branch !== 'main') {
    return blocked('当前不在 main，Maker 只使用 main。');
  }
  if (await gitOperationInProgress(root, run)) {
    return blocked('已有未完成的 Git 操作。控制台没有继续拉取，请让 AI 检查。');
  }
  const previewBlocks = options.previewBlocks ?? defaultPreviewBlocks;
  if (await previewBlocks(root)) {
    return blocked('本地预览仍在运行或无法确认已停止。请先停止预览后再拉取。');
  }

  options.ensureProject?.();
  try {
    await run(['fetch', 'origin'], FETCH_TIMEOUT_MS);
  } catch (error) {
    return {
      outcome: 'unavailable',
      message: '暂时无法确认远端。请检查登录或网络后再试。',
      detail: gitDetail(error),
      dialog: false,
      aheadCount: 0,
      behindCount: 0,
      localChangeCount: 0,
      conflictFiles: [],
    };
  }

  if (!(await refExists(root, run, 'origin/main'))) {
    return blocked('未找到远端 main。请确认这是完整的 Maker 项目。');
  }
  const counts = await aheadBehind(root, run);
  const localChanges = await localChangePaths(root, run);
  const base = {
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
    localChangeCount: localChanges.count,
    conflictFiles: [] as string[],
    dialog: false,
  };
  if (counts.aheadCount === 0 && counts.behindCount === 0) {
    return { outcome: 'up_to_date', message: '本地代码已经和远端一致。', ...base };
  }
  if (counts.behindCount === 0) {
    return {
      outcome: 'ahead',
      message: `本地有 ${counts.aheadCount} 个未推送提交。提交或构建请继续使用 Maker 提交流程。`,
      ...base,
    };
  }

  const incoming = await changedPaths(root, run, 'HEAD', 'origin/main');
  const dirtyOverlap = overlappingPaths(localChanges.paths, incoming);
  if (counts.aheadCount === 0) {
    if (dirtyOverlap.length > 0) {
      return conflictResult(root, counts, localChanges.count, dirtyOverlap);
    }
    return updateByFastForward(root, run, options, counts, localChanges.count);
  }

  const remoteCommitPaths = await changedPaths(root, run, 'HEAD...origin/main');
  const localCommitPaths = await changedPaths(root, run, 'origin/main...HEAD');
  const commitOverlap = overlappingPaths(localCommitPaths, remoteCommitPaths);
  const overlap = uniquePaths([...commitOverlap, ...dirtyOverlap]);
  if (overlap.length > 0) {
    return conflictResult(root, counts, localChanges.count, overlap);
  }
  if (localChanges.count > 0) {
    return {
      outcome: 'blocked',
      message:
        '本地还有未提交修改，同时本地和远端都有新提交。控制台没有修改游戏文件，请让 AI 处理。',
      ...base,
    };
  }
  return updateByRebase(root, run, options, counts);
}

/** 组装交给 AI 的固定提示词。不包含差异、命令或凭证。 */
export function buildConflictPrompt(input: {
  projectPath: string;
  aheadCount: number;
  behindCount: number;
  localChangeCount: number;
  conflictFiles: string[];
}): string {
  const shown = input.conflictFiles.slice(0, MAX_CONFLICT_FILES).map(clipPath);
  const hidden = input.conflictFiles.length - shown.length;
  const files = shown.join('\n') + (hidden > 0 ? `\n其余 ${hidden} 个文件未列出。` : '');
  return [
    'Maker 控制台无法安全拉取，因为下面的文件在本地和远端都有改动。控制台没有修改这些文件，没有合并，也没有 stash。',
    '',
    `项目：${input.projectPath}`,
    '分支：main',
    `本地未推送提交：${input.aheadCount}`,
    `远端新提交：${input.behindCount}`,
    `本地未提交修改：${input.localChangeCount} 个`,
    '冲突文件：',
    files,
    '',
    '请先读取这些文件的本地内容和远端 main 的对应版本，用普通话说明两边分别改了什么。不要执行 pull、rebase、stash、reset 或 checkout。给出保留方案后，等我确认再改文件。Maker 只使用 main，不要新建分支。',
  ].join('\n');
}

async function defaultPreviewBlocks(projectPath: string): Promise<boolean> {
  try {
    const status = await previewStatus(projectPath);
    return status.process_alive !== false;
  } catch {
    return true;
  }
}

async function updateByFastForward(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>,
  options: PullConsoleGitOptions,
  counts: { aheadCount: number; behindCount: number },
  localChangeCount: number
): Promise<ConsoleGitPullResult> {
  options.ensureProject?.();
  try {
    await run(['-c', 'merge.ff=only', 'merge', '--ff-only', 'origin/main'], UPDATE_TIMEOUT_MS);
  } catch (error) {
    if (await pathExists(root, run, 'MERGE_HEAD')) {
      await abortOwnOperation(run, ['merge', '--abort']);
    }
    const files = overwrittenFiles(error instanceof GitCommandError ? error.stderr : '');
    if (files.length > 0) return conflictResult(root, counts, localChangeCount, files);
    return {
      outcome: 'blocked',
      message: '这次不能安全更新代码。请让 AI 检查当前 Git 状态。控制台没有改用其它合并方式。',
      detail: gitDetail(error),
      dialog: false,
      aheadCount: counts.aheadCount,
      behindCount: counts.behindCount,
      localChangeCount,
      conflictFiles: [],
    };
  }
  const kept = localChangeCount > 0 ? '，本地未提交修改仍保留' : '';
  return {
    outcome: 'updated',
    message: `已拉取 ${counts.behindCount} 个远端提交${kept}。`,
    dialog: false,
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
    localChangeCount,
    conflictFiles: [],
  };
}

async function updateByRebase(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>,
  options: PullConsoleGitOptions,
  counts: { aheadCount: number; behindCount: number }
): Promise<ConsoleGitPullResult> {
  options.ensureProject?.();
  try {
    await run(['rebase', 'origin/main'], UPDATE_TIMEOUT_MS);
  } catch (error) {
    if (await rebaseInProgress(root, run)) {
      const files = await unmergedPaths(root, run);
      const aborted = await abortOwnOperation(run, ['rebase', '--abort']);
      if (!aborted || (await rebaseInProgress(root, run))) {
        return {
          outcome: 'blocked',
          message:
            '拉取未完成，且未能撤销这次 rebase。请让 AI 检查当前 Git 状态，不要再次点击拉取。',
          detail: gitDetail(error),
          dialog: false,
          aheadCount: counts.aheadCount,
          behindCount: counts.behindCount,
          localChangeCount: 0,
          conflictFiles: files,
        };
      }
      return conflictResult(
        root,
        counts,
        0,
        files.length > 0 ? files : ['未能列出具体文件，请检查 git status']
      );
    }
    return {
      outcome: 'blocked',
      message: '这次不能安全更新代码。请让 AI 检查当前 Git 状态。控制台没有改用其它合并方式。',
      detail: gitDetail(error),
      dialog: false,
      aheadCount: counts.aheadCount,
      behindCount: counts.behindCount,
      localChangeCount: 0,
      conflictFiles: [],
    };
  }
  return {
    outcome: 'updated',
    message: `已将 ${counts.aheadCount} 个本地提交接到远端更新之后。`,
    dialog: false,
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
    localChangeCount: 0,
    conflictFiles: [],
  };
}

function conflictResult(
  root: string,
  counts: { aheadCount: number; behindCount: number },
  localChangeCount: number,
  conflictFiles: string[]
): ConsoleGitPullResult {
  const files = uniquePaths(conflictFiles);
  return {
    outcome: 'conflict',
    message: '这些文件两边都改过，控制台没有更新代码。请把提示词复制给 AI。',
    prompt: String(
      sanitizeDiagnosticValue(
        buildConflictPrompt({
          projectPath: root,
          aheadCount: counts.aheadCount,
          behindCount: counts.behindCount,
          localChangeCount,
          conflictFiles: files,
        })
      )
    ),
    dialog: true,
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
    localChangeCount,
    conflictFiles: files.slice(0, MAX_CONFLICT_FILES),
  };
}

async function abortOwnOperation(
  run: (args: string[], timeout: number) => Promise<string>,
  args: string[]
): Promise<boolean> {
  try {
    await run(args, INSPECT_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function git(
  root: string,
  args: string[],
  timeout: number,
  options: PullConsoleGitOptions
): Promise<string> {
  options.signal?.throwIfAborted();
  options.onGit?.(args);
  try {
    const result = await exec(
      getGitCommand(),
      [
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.quotePath=false',
        '-c',
        'gc.auto=0',
        '-c',
        'rebase.autoStash=false',
        '--no-pager',
        ...args,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout,
        maxBuffer: 1024 * 1024,
        signal: options.signal,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
          GIT_EDITOR: 'true',
          GIT_SEQUENCE_EDITOR: 'true',
        },
      }
    );
    return result.stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new GitCommandError(
      failure.message || 'git failed',
      failure.stderr || '',
      failure.stdout || ''
    );
  }
}

async function gitOperationInProgress(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>
): Promise<boolean> {
  for (const name of [
    'MERGE_HEAD',
    'REBASE_HEAD',
    'CHERRY_PICK_HEAD',
    'BISECT_LOG',
    'rebase-merge',
    'rebase-apply',
    'index.lock',
  ]) {
    if (await pathExists(root, run, name)) return true;
  }
  return false;
}

async function rebaseInProgress(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>
): Promise<boolean> {
  return (
    (await pathExists(root, run, 'rebase-merge')) || (await pathExists(root, run, 'rebase-apply'))
  );
}

async function pathExists(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>,
  name: string
): Promise<boolean> {
  const relative = (await run(['rev-parse', '--git-path', name], INSPECT_TIMEOUT_MS)).trim();
  return fs.existsSync(path.resolve(root, relative));
}

async function refExists(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>,
  ref: string
): Promise<boolean> {
  try {
    await run(['rev-parse', '--verify', '--quiet', ref], INSPECT_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function aheadBehind(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>
): Promise<{ aheadCount: number; behindCount: number }> {
  const text = await run(
    ['rev-list', '--left-right', '--count', 'HEAD...origin/main'],
    INSPECT_TIMEOUT_MS
  );
  const [ahead, behind] = text.trim().split(/\s+/);
  return {
    aheadCount: Number.parseInt(ahead || '0', 10) || 0,
    behindCount: Number.parseInt(behind || '0', 10) || 0,
  };
}

async function localChangePaths(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>
): Promise<{ count: number; paths: string[] }> {
  const raw = await run(
    ['status', '--porcelain=v1', '-z', '--untracked-files=normal'],
    INSPECT_TIMEOUT_MS
  );
  const records = raw.split('\0');
  const paths: string[] = [];
  let count = 0;
  for (let index = 0; index < records.length && records[index]; index += 1) {
    const entry = records[index];
    count += 1;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && records[index + 1]) {
      paths.push(records[(index += 1)]);
    }
  }
  return { count, paths };
}

async function changedPaths(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>,
  from: string,
  to?: string
): Promise<string[]> {
  const range = to ? [from, to] : [from];
  const raw = await run(
    ['diff', '--name-status', '-z', '--find-renames', ...range],
    INSPECT_TIMEOUT_MS
  );
  const records = raw.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < records.length && records[index]; index += 1) {
    const status = records[index];
    const first = records[(index += 1)];
    if (!first) break;
    paths.push(first);
    if (/^[RC]\d*$/.test(status)) {
      const second = records[(index += 1)];
      if (second) paths.push(second);
    }
  }
  return paths;
}

async function unmergedPaths(
  root: string,
  run: (args: string[], timeout: number) => Promise<string>
): Promise<string[]> {
  try {
    const raw = await run(['diff', '--name-only', '--diff-filter=U', '-z'], INSPECT_TIMEOUT_MS);
    return raw.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function overlappingPaths(local: string[], incoming: string[]): string[] {
  const remote = incoming.map(normalizePath);
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const file of local) {
    const current = normalizePath(file);
    const directory = current.endsWith('/') ? current : '';
    for (const candidate of remote) {
      const same =
        current === candidate ||
        (directory !== '' && candidate.startsWith(directory)) ||
        (candidate.endsWith('/') && current.startsWith(candidate));
      if (same && !seen.has(candidate)) {
        seen.add(candidate);
        hits.push(candidate);
      }
    }
  }
  return hits;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const file of paths) {
    const key = normalizePath(file);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function clipPath(file: string): string {
  return file.length <= MAX_PATH_LENGTH ? file : file.slice(0, MAX_PATH_LENGTH) + '…';
}

function overwrittenFiles(stderr: string): string[] {
  const match = stderr.match(/would be overwritten by merge:\r?\n([\s\S]*?)\r?\nPlease /);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitDetail(error: unknown): string {
  const text = error instanceof GitCommandError ? error.stderr || error.message : '';
  return String(sanitizeDiagnosticValue(text)).slice(0, MAX_DETAIL_LENGTH);
}
