/**
 * Maker project submit: sync with the Maker remote, commit, push.
 *
 * When the push is refused because the Maker cloud workspace has uncommitted
 * changes, the cloud changes are committed through the cloud Git API, merged
 * locally, and the push is retried once.
 */

import path from 'node:path';
import { loadProjectConfig } from '../storage.js';
import { ensureGitAvailable } from '../system/git.js';
import { CloudGitError, commitCloudGit, getCloudGitStatus } from './cloud.js';
import {
  createGitFailure,
  nextActionForFailure,
  toMakerGitFailure,
  type MakerGitFailure,
} from './failure.js';
import {
  createGitRunner,
  gitOperationInProgress,
  mergeRemote,
  MAKER_COMMIT_IDENTITY_ARGS,
} from './merge.js';
import { ensureAuthenticatedOrigin } from './origin.js';
import { withQrcodeFastForward } from './qrcode.js';
import {
  getBlockingRemoteSyncFailure,
  inspectMakerRemoteSyncStatus,
  parseGitStatusFiles,
  readAheadBehind,
  readAheadState,
  readUnpushedCommitState,
} from './remoteSync.js';
import {
  gitStep,
  gitStepWithTransientRetry,
  readGit,
  readGitSync,
  type MakerProjectProgressHandler,
} from './run.js';
import { currentBranch, resolveUsableMakerGitWorkspace } from './workspace.js';

export interface PushMakerProjectOptions {
  cwd: string;
  message?: string;
  branch?: string;
  files?: string[];
  allowEmpty?: boolean;
  jwt?: string;
  pat?: string;
  forcePat?: boolean;
  onProgress?: MakerProjectProgressHandler;
  preserveQrcodeChoices?: boolean;
}

export interface MakerCloudRepairResult {
  status: 'repaired' | 'cloud_clean' | 'failed';
  cloudCommitSha?: string | null;
  cloudChangedFiles?: number;
  message?: string;
}

export interface PushMakerProjectResult {
  branch: string;
  committed: boolean;
  commitHash?: string;
  message?: string;
  pushed: boolean;
  status: 'clean' | 'pushed' | 'failed_after_commit';
  failure?: MakerGitFailure;
  ahead?: string;
  transientRetries?: number;
  /** Present when a push was blocked by the Maker cloud workspace. */
  cloudRepair?: MakerCloudRepairResult;
}

export const CLOUD_REPAIR_COMMIT_MESSAGE = [
  'chore(maker): 自动提交云端工作区未提交改动',
  '',
  '本地推送被云端工作区未提交改动阻塞，由 Maker MCP 自动提交以恢复推送。',
].join('\n');

export async function pushMakerProject(
  options: PushMakerProjectOptions
): Promise<PushMakerProjectResult> {
  ensureGitAvailable();
  options.onProgress?.({
    progress: 0,
    total: 100,
    phase: 'prepare',
    message: 'Preparing Maker project push',
  });
  const requestedCwd = path.resolve(options.cwd);
  const workspace = resolveUsableMakerGitWorkspace(requestedCwd);
  const cwd = workspace.projectRoot;
  const project = loadProjectConfig(cwd);
  if (!project?.project_id) {
    throw new Error(`${cwd} Maker project config does not contain project_id.`);
  }

  await ensureAuthenticatedOrigin({
    cwd,
    appId: project.project_id,
    jwt: options.jwt,
    pat: options.pat,
    forcePat: options.forcePat,
    onProgress: options.onProgress,
  });
  options.onProgress?.({
    progress: 10,
    total: 100,
    phase: 'auth',
    message: 'Authenticated Maker git origin ready',
  });

  const remoteSyncStatus = await inspectMakerRemoteSyncStatus(cwd);
  if (remoteSyncStatus.status === 'needs_pull') {
    options.onProgress?.({
      progress: 15,
      total: 100,
      phase: 'pull',
      message: `Fast-forwarding Maker project from ${remoteSyncStatus.remoteRef}`,
    });
    try {
      const fastForward = (revision: string) =>
        gitStep(['merge', '--ff-only', revision], { cwd, stage: 'pull' });
      if (options.preserveQrcodeChoices)
        await withQrcodeFastForward(cwd, remoteSyncStatus.remoteRef, fastForward);
      else await fastForward(remoteSyncStatus.remoteRef);
    } catch (error) {
      const failure = toMakerGitFailure(error, 'pull');
      const failedBecauseLocalChangesWouldBeOverwritten =
        /would be overwritten|conflicting local files/iu.test(
          `${failure.stdout || ''}\n${failure.stderr || ''}`
        );
      return {
        branch: remoteSyncStatus.branch,
        committed: false,
        pushed: false,
        status: 'clean',
        failure: failedBecauseLocalChangesWouldBeOverwritten
          ? {
              ...failure,
              nextAction:
                'Maker 远端有新提交，但自动 fast-forward 会覆盖本地修改，因此已在提交前停止。请先处理提示的冲突文件，再重试 maker_build_current_directory。',
            }
          : failure,
        ahead: await readAheadState(cwd),
        transientRetries: 0,
      };
    }
  }
  const remoteSyncFailure = getBlockingRemoteSyncFailure(remoteSyncStatus);
  if (remoteSyncFailure) {
    return {
      branch: remoteSyncStatus.branch,
      committed: false,
      pushed: false,
      status: 'clean',
      failure: remoteSyncFailure,
      ahead: await readAheadState(cwd),
      transientRetries: 0,
    };
  }

  const statusBefore = await readGit(['status', '--porcelain'], cwd);
  const branch = await currentBranch(cwd, options.branch);
  const unpushed = await readUnpushedCommitState(cwd, branch);
  if (!statusBefore.trim() && !options.allowEmpty && !unpushed.hasUnpushedCommits) {
    options.onProgress?.({
      progress: 100,
      total: 100,
      phase: 'done',
      message: 'Maker project has no local changes to push',
    });
    return {
      branch,
      committed: false,
      message: undefined,
      pushed: false,
      status: 'clean',
    };
  }

  let committed = false;
  let commitHash: string | undefined;
  let message: string | undefined;
  let transientRetries = 0;

  const failed = async (failure: MakerGitFailure, cloudRepair?: MakerCloudRepairResult) => ({
    branch,
    committed,
    commitHash,
    message,
    pushed: false,
    status:
      committed || unpushed.hasUnpushedCommits
        ? ('failed_after_commit' as const)
        : ('clean' as const),
    failure,
    ahead: await readAheadState(cwd),
    transientRetries,
    ...(cloudRepair ? { cloudRepair } : {}),
  });

  if (!statusBefore.trim() && !options.allowEmpty && unpushed.hasUnpushedCommits) {
    commitHash = (await readGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  } else {
    // An unfinished merge/rebase must be refused before add/commit. Otherwise
    // `git add -A` can stage conflict markers and `git commit` completes the
    // user's merge, then the later merge check never sees it.
    if (await gitOperationInProgress(cwd, createGitRunner(cwd))) {
      return failed(operationInProgressFailure('commit'));
    }
    options.onProgress?.({
      progress: 20,
      total: 100,
      phase: 'stage',
      message: options.files?.length ? 'Staging selected files' : 'Staging all local changes',
    });
    await gitStep(
      options.files?.length
        ? ['add', ...includeMandatoryMakerSubmitFiles(cwd, options.files)]
        : ['add', '-A'],
      { cwd }
    );

    const staged = await readGit(['diff', '--cached', '--name-only'], cwd);
    message = options.message || generateCommitMessage(statusBefore);
    if (staged.trim() || options.allowEmpty) {
      options.onProgress?.({
        progress: 45,
        total: 100,
        phase: 'commit',
        message: 'Creating local Maker project commit',
      });
      await gitStep(
        [
          ...MAKER_COMMIT_IDENTITY_ARGS,
          'commit',
          ...(options.allowEmpty ? ['--allow-empty'] : []),
          '-m',
          message,
        ],
        { cwd }
      );
      committed = true;
      commitHash = (await readGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
    }
  }

  // Local and remote both have new commits: merge the remote after the local commit.
  if (remoteSyncStatus.status === 'diverged') {
    const mergeFailure = await mergeMakerRemote(cwd, branch, options.onProgress);
    if (mergeFailure) return failed(mergeFailure);
    commitHash = (await readGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  }

  const push = () => {
    options.onProgress?.({
      progress: 65,
      total: 100,
      phase: 'push',
      message: `Pushing Maker project to ${branch}`,
    });
    return gitStepWithTransientRetry(['push', 'origin', `HEAD:${branch}`], {
      cwd,
      stage: 'push',
      onProgress: options.onProgress,
    });
  };

  try {
    transientRetries += await push();
  } catch (error) {
    const failure = toMakerGitFailure(error, 'push');
    if (failure.classification !== 'cloud_workspace_blocked') return failed(failure);

    const cloudRepair = await repairCloudWorkspace(project.project_id, options.onProgress);
    if (cloudRepair.status !== 'repaired') {
      return failed(
        {
          ...failure,
          nextAction:
            cloudRepair.status === 'cloud_clean'
              ? '远端拒绝推送并提示云端工作区有未提交改动，但云端 Git 接口显示工作区是干净的。请稍后重试 maker_build_current_directory；仍然失败时，把 failure 信息反馈给用户。'
              : `远端拒绝推送：云端工作区有未提交改动，自动提交云端改动失败（${cloudRepair.message}）。`,
        },
        cloudRepair
      );
    }
    try {
      options.onProgress?.({
        progress: 75,
        total: 100,
        phase: 'fetch',
        message: 'Fetching cloud workspace commit',
      });
      transientRetries += await gitStepWithTransientRetry(['fetch', 'origin'], {
        cwd,
        onProgress: options.onProgress,
      });
    } catch (fetchError) {
      return failed(toMakerGitFailure(fetchError, 'fetch'), cloudRepair);
    }
    const mergeFailure = await mergeMakerRemote(cwd, branch, options.onProgress);
    if (mergeFailure) return failed(mergeFailure, cloudRepair);
    commitHash = (await readGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
    try {
      transientRetries += await push();
    } catch (retryError) {
      return failed(toMakerGitFailure(retryError, 'push'), cloudRepair);
    }
    options.onProgress?.({
      progress: 100,
      total: 100,
      phase: 'done',
      message: 'Maker project push completed after committing cloud workspace changes',
    });
    return {
      branch,
      committed,
      commitHash,
      message,
      pushed: true,
      status: 'pushed',
      transientRetries,
      cloudRepair,
    };
  }
  options.onProgress?.({
    progress: 100,
    total: 100,
    phase: 'done',
    message: 'Maker project push completed',
  });

  return {
    branch,
    committed,
    commitHash,
    message,
    pushed: true,
    status: 'pushed',
    transientRetries,
  };
}

function operationInProgressFailure(stage: 'commit' | 'merge'): MakerGitFailure {
  return {
    ...createGitFailure({ stage, stderr: 'A git operation is already in progress.' }),
    classification: 'local',
    nextAction:
      '本地有未完成的 Git 操作（merge、rebase、cherry-pick 或 index.lock）。请先完成或取消该操作，再重试 maker_build_current_directory。',
  };
}

/** Merges origin/<branch> after the local commit. Returns a failure when the merge did not happen. */
async function mergeMakerRemote(
  cwd: string,
  branch: string,
  onProgress?: MakerProjectProgressHandler
): Promise<MakerGitFailure | undefined> {
  const remoteRef = `origin/${branch}`;
  const counts = await readAheadBehind(cwd, remoteRef);
  if (counts.behindCount === 0) return undefined;
  const run = createGitRunner(cwd);
  if (await gitOperationInProgress(cwd, run)) return operationInProgressFailure('merge');
  onProgress?.({
    progress: 55,
    total: 100,
    phase: 'merge',
    message: `Merging ${remoteRef} into local ${branch}`,
  });
  const result = await mergeRemote(cwd, remoteRef, run);
  if (result.outcome === 'merged') return undefined;
  const failure = createGitFailure({
    stage: 'merge',
    command: result.error?.command,
    exitCode: result.error?.exitCode,
    stdout: result.error?.stdout,
    stderr: result.error?.stderr || result.error?.message,
  });
  if (result.outcome === 'conflict') {
    return {
      ...failure,
      classification: 'merge_conflict',
      retryable: false,
      conflictFiles: result.conflictFiles,
      nextAction: nextActionForFailure('merge_conflict'),
    };
  }
  return {
    ...failure,
    classification: 'local',
    retryable: false,
    nextAction: result.overwrittenFiles.length
      ? `合并 ${remoteRef} 会覆盖本地未提交的文件（${result.overwrittenFiles.join(', ')}），git 已拒绝合并，本地文件保持原样。请先提交或处理这些文件，再重试 maker_build_current_directory。`
      : `无法合并 ${remoteRef}，本地文件保持原样。请查看 failure.stderr 处理后重试 maker_build_current_directory。`,
  };
}

/** Commits all cloud workspace changes. Never retries the commit request. */
export async function repairCloudWorkspace(
  appId: string,
  onProgress?: MakerProjectProgressHandler
): Promise<MakerCloudRepairResult> {
  onProgress?.({
    progress: 70,
    total: 100,
    phase: 'cloud_repair',
    message: 'Push blocked by Maker cloud workspace changes; committing cloud changes',
  });
  let status;
  try {
    status = await getCloudGitStatus(appId);
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
  if (status.clean) return { status: 'cloud_clean' };
  try {
    const result = await commitCloudGit(appId, {
      message: CLOUD_REPAIR_COMMIT_MESSAGE,
      all: true,
      ...(status.head ? { expectedHead: status.head } : {}),
    });
    return {
      status: 'repaired',
      cloudCommitSha: result.commitSha,
      cloudChangedFiles: result.changedFiles,
    };
  } catch (error) {
    if (error instanceof CloudGitError && error.outcomeUnknown) {
      // The commit may have landed; decide from the current cloud state instead of retrying.
      const after = await getCloudGitStatus(appId).catch(() => undefined);
      if (after?.clean) return { status: 'repaired', cloudCommitSha: after.head };
    }
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

function includeMandatoryMakerSubmitFiles(cwd: string, files: string[]): string[] {
  const unique = new Set(files);
  const changedFiles = parseGitStatusFiles(readGitSync(['-C', cwd, 'status', '--porcelain', '-z']));
  if (changedFiles.includes('.gitignore')) {
    unique.add('.gitignore');
  }
  return [...unique];
}

function generateCommitMessage(status: string): string {
  const files = status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter(Boolean);

  if (files.length === 0) {
    return 'chore: update maker project';
  }

  if (files.every((file) => file.endsWith('.md') || file.startsWith('docs/'))) {
    return 'docs: update maker project documents';
  }

  const hasDependencyFile = files.some((file) =>
    /(^|\/)(package-lock\.json|package\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file)
  );
  if (hasDependencyFile) {
    return 'chore: update maker project dependencies';
  }

  return 'chore: update maker project';
}
