/**
 * Local change and Maker remote sync inspection.
 */

import { ensureGitAvailable } from '../system/git.js';
import { toMakerGitFailure, type MakerGitFailure } from './failure.js';
import { gitStepWithTransientRetry, readGit } from './run.js';
import { parseStatusZ, statusPaths } from './status.js';
import { currentBranch, resolveUsableMakerGitWorkspace } from './workspace.js';

export interface MakerProjectLocalChanges {
  hasChanges: boolean;
  projectRoot: string;
  files: string[];
  rawStatus: string;
  hasUnpushedCommits?: boolean;
  ahead?: string;
}

export interface MakerRemoteSyncStatus {
  projectRoot: string;
  branch: string;
  remoteRef: string;
  status:
    | 'up_to_date'
    | 'needs_pull'
    | 'diverged'
    | 'ahead'
    | 'branch_not_allowed'
    | 'remote_missing'
    | 'remote_unavailable';
  hasLocalChanges: boolean;
  localChangeCount: number;
  localChanges: string[];
  aheadCount: number;
  behindCount: number;
  failure?: MakerGitFailure;
  nextAction: string;
}

export function parseGitStatusFiles(status: string): string[] {
  return statusPaths(parseStatusZ(status));
}

export function isIgnoredBuildGuardChange(file: string): boolean {
  return file === '.maker-mcp' || file.startsWith('.maker-mcp/');
}

export async function readMakerProjectLocalChanges(cwd: string): Promise<MakerProjectLocalChanges> {
  ensureGitAvailable();
  const { projectRoot } = resolveUsableMakerGitWorkspace(cwd);

  const rawStatus = await readGit(['status', '--porcelain', '-z'], projectRoot);
  const files = parseGitStatusFiles(rawStatus).filter((file) => !isIgnoredBuildGuardChange(file));
  const branch = await currentBranch(projectRoot);
  const unpushed = await readUnpushedCommitState(projectRoot, branch);
  return {
    hasChanges: files.length > 0 || unpushed.hasUnpushedCommits,
    projectRoot,
    files,
    rawStatus,
    hasUnpushedCommits: unpushed.hasUnpushedCommits,
    ahead: unpushed.ahead,
  };
}

export async function inspectMakerRemoteSyncStatus(cwd: string): Promise<MakerRemoteSyncStatus> {
  ensureGitAvailable();
  const { projectRoot } = resolveUsableMakerGitWorkspace(cwd);
  const branch = await currentBranch(projectRoot);
  const remoteRef = `origin/${branch}`;
  const rawStatus = await readGit(['status', '--porcelain', '-z'], projectRoot);
  const localChanges = parseGitStatusFiles(rawStatus).filter(
    (file) => !isIgnoredBuildGuardChange(file)
  );
  const hasLocalChanges = localChanges.length > 0;

  if (branch !== 'main') {
    return {
      projectRoot,
      branch,
      remoteRef,
      status: 'branch_not_allowed',
      hasLocalChanges,
      localChangeCount: localChanges.length,
      localChanges,
      aheadCount: 0,
      behindCount: 0,
      nextAction:
        'Maker 远端只接受 main 分支。开发或提交前请切回 main；如果当前分支已有本地提交，先让本地 AI 确认工作区状态，再把提交迁移到 main 后继续。',
    };
  }

  try {
    await gitStepWithTransientRetry(['fetch', 'origin'], {
      cwd: projectRoot,
    });
  } catch (error) {
    const failure = toMakerGitFailure(error, 'fetch');
    return {
      projectRoot,
      branch,
      remoteRef,
      status: 'remote_unavailable',
      hasLocalChanges,
      localChangeCount: localChanges.length,
      localChanges,
      aheadCount: 0,
      behindCount: 0,
      failure,
      nextAction: getMakerRemoteSyncFailureNextAction(failure),
    };
  }

  const counts = await readRemoteAheadBehindCounts(projectRoot, remoteRef);
  if (!counts) {
    return {
      projectRoot,
      branch,
      remoteRef,
      status: 'remote_missing',
      hasLocalChanges,
      localChangeCount: localChanges.length,
      localChanges,
      aheadCount: 0,
      behindCount: 0,
      nextAction:
        '未找到 origin/main。请先确认当前目录是否是完整 Maker clone；不要新建分支，必要时重新执行 taptap-maker init。',
    };
  }

  return {
    projectRoot,
    branch,
    remoteRef,
    status: classifyRemoteSyncStatus(counts.aheadCount, counts.behindCount),
    hasLocalChanges,
    localChangeCount: localChanges.length,
    localChanges,
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
    nextAction: nextActionForRemoteSync({
      aheadCount: counts.aheadCount,
      behindCount: counts.behindCount,
      hasLocalChanges,
    }),
  };
}

export function getMakerRemoteSyncFailureNextAction(failure: MakerGitFailure): string {
  if (failure.classification === 'auth') {
    return '暂时无法检查 Maker 远端是否有新提交：Git 鉴权失败。请运行 `taptap-maker login` 重新完成 Maker 登录授权后，再重新读取 maker://status。';
  }

  return '暂时无法检查 Maker 远端是否有新提交。请把 failure 信息反馈给用户；如果只是 503、5xx、超时或网络中断，可稍后重新读取 maker://status。';
}

/**
 * Remote sync states that stop a push before anything is committed. `needs_pull`
 * is fast-forwarded and `diverged` is merged by the push flow itself.
 */
export function getBlockingRemoteSyncFailure(
  status: MakerRemoteSyncStatus
): MakerGitFailure | undefined {
  if (
    status.status === 'up_to_date' ||
    status.status === 'ahead' ||
    status.status === 'needs_pull' ||
    status.status === 'diverged'
  ) {
    return undefined;
  }

  if (status.status === 'branch_not_allowed') {
    return {
      stage: 'remote_sync',
      message: status.nextAction,
      classification: 'branch_not_allowed',
      retryable: false,
      stderr: status.nextAction,
      nextAction: status.nextAction,
    };
  }

  if (status.status === 'remote_unavailable' && status.failure) {
    return {
      ...status.failure,
      stage: 'remote_sync',
      nextAction: status.nextAction,
    };
  }

  return {
    stage: 'remote_sync',
    message: status.nextAction,
    classification: 'remote_rejected',
    retryable: false,
    stderr: [
      `Maker remote sync status: ${status.status}`,
      `branch: ${status.branch}`,
      status.nextAction,
    ].join('\n'),
    nextAction: status.nextAction,
  };
}

async function readRemoteAheadBehindCounts(
  cwd: string,
  remoteRef: string
): Promise<{ aheadCount: number; behindCount: number } | undefined> {
  try {
    await readGit(['rev-parse', '--verify', remoteRef], cwd);
    return await readAheadBehind(cwd, remoteRef);
  } catch {
    return undefined;
  }
}

export async function readAheadBehind(
  cwd: string,
  remoteRef: string
): Promise<{ aheadCount: number; behindCount: number }> {
  const text = await readGit(['rev-list', '--left-right', '--count', `HEAD...${remoteRef}`], cwd);
  const [aheadText, behindText] = text.trim().split(/\s+/);
  return {
    aheadCount: Number.parseInt(aheadText || '0', 10) || 0,
    behindCount: Number.parseInt(behindText || '0', 10) || 0,
  };
}

function classifyRemoteSyncStatus(
  aheadCount: number,
  behindCount: number
): MakerRemoteSyncStatus['status'] {
  if (aheadCount > 0 && behindCount > 0) {
    return 'diverged';
  }
  if (behindCount > 0) {
    return 'needs_pull';
  }
  if (aheadCount > 0) {
    return 'ahead';
  }
  return 'up_to_date';
}

function nextActionForRemoteSync(input: {
  aheadCount: number;
  behindCount: number;
  hasLocalChanges: boolean;
}): string {
  if (input.aheadCount > 0 && input.behindCount > 0) {
    return `本地和远端都已有新提交（本地 ahead ${input.aheadCount}，远端 behind ${input.behindCount}）。运行 \`taptap-maker git sync\` 合并 Maker 远端 main；或直接使用 maker_build_current_directory，它会提交后自动合并再推送。合并冲突时会自动取消合并并列出冲突文件。`;
  }

  if (input.behindCount > 0) {
    if (input.hasLocalChanges) {
      return `Maker 远端有 ${input.behindCount} 个新提交，本地也有未提交改动。运行 \`taptap-maker git sync\` 拉取；如果远端改动和本地未提交改动是同一批文件，git 会拒绝并保留本地文件，此时先提交本地改动再同步。`;
    }

    return `Maker 远端有 ${input.behindCount} 个新提交，且本地工作区干净。运行 \`taptap-maker git sync\` 拉取后再开始修改。`;
  }

  if (input.aheadCount > 0) {
    return `本地已有 ${input.aheadCount} 个未推送提交。构建或提交时继续使用 maker_build_current_directory，或运行 \`taptap-maker git push\`。`;
  }

  return '本地 main 与 Maker 远端 main 已同步，可以继续开发。';
}

export async function readAheadState(cwd: string): Promise<string | undefined> {
  try {
    const status = await readGit(['status', '--short', '--branch'], cwd);
    return status.split('\n')[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function readUnpushedCommitState(
  cwd: string,
  branch: string
): Promise<{ hasUnpushedCommits: boolean; ahead?: string }> {
  const remoteRef = `origin/${branch}`;
  try {
    const countText = await readGit(['rev-list', '--count', `${remoteRef}..HEAD`], cwd);
    const count = Number.parseInt(countText.trim(), 10);
    if (Number.isFinite(count) && count > 0) {
      return {
        hasUnpushedCommits: true,
        ahead: `${remoteRef}..HEAD (${count} commit${count === 1 ? '' : 's'})`,
      };
    }
  } catch {
    // Fall back to `git status --branch` for repositories where origin/<branch>
    // is unavailable but an upstream relation still reports ahead commits.
  }

  const status = await readAheadState(cwd);
  if (status && /\bahead\s+\d+/i.test(status)) {
    return {
      hasUnpushedCommits: true,
      ahead: status,
    };
  }

  return { hasUnpushedCommits: false, ahead: status };
}
