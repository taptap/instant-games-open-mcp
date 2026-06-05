/**
 * Maker project API and Git helpers used by the Maker MCP server.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MakerPat, MakerProjectSummary } from '../types.js';
import { getProjectConfigPath, loadPat, loadProjectConfig, saveProjectConfig } from '../storage.js';
import { getUserIdFromMakerJwt, requireMakerJwt } from '../auth/jwt.js';
import { getManualMakerPat, requestMakerPat, saveManualMakerPat } from '../git/pat.js';
import { getMakerEndpoints, getMakerPatTokensUrl, requireMakerEndpoint } from '../config.js';
import { ensureGitAvailable, getGitCommand } from '../system/git.js';
import { finalizeStagedDevKitGitignore } from './devKit.js';

export interface CloneMakerProjectOptions {
  appId: string;
  targetDir: string;
  jwt?: string;
  pat?: string;
  userId?: string;
  patName?: string;
  forcePat?: boolean;
  sceEndpoint?: string;
  onProgress?: MakerProjectProgressHandler;
}

export interface CloneMakerProjectResult {
  appId: string;
  targetDir: string;
  status: 'cloned' | 'fetched';
  retriedWithNewPat: boolean;
  transientRetries: number;
  warnings: string[];
}

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
}

export interface MakerProjectProgress {
  progress?: number;
  total?: number;
  message: string;
  phase?: string;
}

export type MakerProjectProgressHandler = (progress: MakerProjectProgress) => void;

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
}

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

export interface MakerDirectoryGitStatus {
  targetDir: string;
  gitRoot?: string;
  gitDir?: string;
  makerProjectRoot?: string;
  configPath?: string;
  isGitWorkTree: boolean;
  isOwnGitRoot: boolean;
  isUsableMakerGitRepo: boolean;
  issue?: 'inside_parent_git_repo' | 'missing_git_repo' | 'missing_maker_config';
  message?: string;
}

export interface MakerGitFailure {
  stage: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  message: string;
  classification:
    | 'git_missing'
    | 'auth'
    | 'remote_transient'
    | 'branch_not_allowed'
    | 'forbidden_path'
    | 'remote_rejected'
    | 'local'
    | 'unknown';
  retryable: boolean;
  retryReason?: string;
  retryAttempts?: number;
  nextAction: string;
}

export interface MakerGitRetryDecision {
  retry: boolean;
  reason?: string;
}

class MakerGitError extends Error {
  readonly failure: MakerGitFailure;

  constructor(failure: MakerGitFailure) {
    super(failure.message);
    this.name = 'MakerGitError';
    this.failure = failure;
  }
}

const MAKER_FIRST_CLONE_WAIT_MESSAGE =
  'First Maker clone/fetch can take 20+ seconds while the server prepares the repository. Please keep this running; transient 503/5xx errors are retried automatically.';
const MAKER_GIT_SHALLOW_DEPTH = '1';

export function getConfiguredMakerApiBase(): string | undefined {
  return getMakerEndpoints().apiBase;
}

export function getConfiguredMakerGitBase(): string | undefined {
  return getMakerEndpoints().gitBase;
}

function getMakerApiBase(): string {
  const apiBase = requireMakerEndpoint('apiBase', getConfiguredMakerApiBase());
  return apiBase.replace(/\/$/, '');
}

function getMakerGitBase(): string {
  return requireMakerEndpoint('gitBase', getConfiguredMakerGitBase()).replace(/\/$/, '');
}

function stringField(item: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function nullableStringField(
  item: Record<string, unknown>,
  ...keys: string[]
): string | null | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' || value === null) {
      return value;
    }
  }
  return undefined;
}

function numberField(item: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

export function normalizeProjectsResponse(data: unknown): MakerProjectSummary[] {
  const body = data as Record<string, unknown>;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.apps)
        ? body.apps
        : Array.isArray(body.projects)
          ? body.projects
          : [];

  return list
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const userId = stringField(item, 'userId', 'user_id');
      return {
        id: String(item.id || item.app_id || item.project_id || ''),
        name: stringField(item, 'name', 'title'),
        userId,
        user_id: userId,
        createdAt: stringField(item, 'createdAt', 'created_at'),
        archivedAt: nullableStringField(item, 'archivedAt', 'archived_at'),
        deletedAt: nullableStringField(item, 'deletedAt', 'deleted_at'),
        gameType: stringField(item, 'gameType', 'game_type'),
        icon: numberField(item, 'icon'),
        iconColor: numberField(item, 'iconColor', 'icon_color'),
        lastAccessedAt: nullableStringField(item, 'lastAccessedAt', 'last_accessed_at'),
        lastConversationAt: stringField(item, 'lastConversationAt', 'last_conversation_at'),
        metadata: item.metadata,
        pinnedAt: nullableStringField(item, 'pinnedAt', 'pinned_at'),
        stage: stringField(item, 'stage'),
        sce_endpoint: stringField(item, 'sce_endpoint', 'sce_mcp_url'),
        git_url: stringField(item, 'git_url'),
        raw: item,
      };
    })
    .filter((project) => project.id.length > 0);
}

export async function listMakerProjects(options?: {
  jwt?: string;
  pat?: string;
}): Promise<MakerProjectSummary[]> {
  const pat = options?.pat ? saveManualMakerPat(options.pat) : getManualMakerPat() || loadPat();
  const url = new URL(`${getMakerApiBase()}/apps`);

  let authToken = pat?.token;
  if (!authToken) {
    const jwt = requireMakerJwt(options?.jwt);
    const userId = getUserIdFromMakerJwt(jwt);
    authToken = options?.jwt || jwt.token;
    if (userId) {
      url.searchParams.set('userId', userId);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
    },
  });
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker project list failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return normalizeProjectsResponse(json);
}

export async function cloneMakerProject(
  options: CloneMakerProjectOptions
): Promise<CloneMakerProjectResult> {
  const target = path.resolve(options.targetDir);
  ensureTargetCanBindApp(target, options.appId);
  const warnings = createPreCloneWarnings(target);
  options.onProgress?.({
    progress: 0,
    total: 100,
    phase: 'pre_clone_check',
    message: formatPreCloneProgressMessage(options.appId, warnings),
  });
  ensureGitAvailable();
  options.onProgress?.({
    progress: 1,
    total: 100,
    phase: 'prepare',
    message: `Preparing Maker project ${options.appId}`,
  });
  let pat = await requestMakerPat({
    jwt: options.jwt,
    pat: options.pat,
    name: options.patName || 'first-pat',
    force: options.forcePat,
  });
  options.onProgress?.({
    progress: 5,
    total: 100,
    phase: 'auth',
    message: 'Maker PAT ready for git authentication',
  });
  const gitBase = getMakerGitBase();

  const gitUrl = `${gitBase}/${options.appId}.git`;
  let authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
  let retriedWithNewPat = false;
  let transientRetries = 0;

  if (isOwnGitRoot(target) && hasGitHead(target)) {
    options.onProgress?.({
      progress: 10,
      total: 100,
      phase: 'fetch',
      message: 'Existing git repository found; fetching origin',
    });
    await setOrigin(target, authUrl);
    try {
      transientRetries += await runGitWithTransientRetry(['fetch', '--progress', 'origin'], {
        cwd: target,
        onProgress: options.onProgress,
      });
    } catch (error) {
      if (options.forcePat || !isAuthGitError(error)) {
        throw withPreCloneWarnings(error, warnings);
      }
      pat = await refreshPatAfterAuthFailure(error, {
        jwt: options.jwt,
        pat: options.pat,
        name: options.patName || 'first-pat',
      });
      authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
      retriedWithNewPat = true;
      await setOrigin(target, authUrl);
      transientRetries += await runGitWithTransientRetry(['fetch', '--progress', 'origin'], {
        cwd: target,
        onProgress: options.onProgress,
      }).catch((retryError) => {
        throw withPreCloneWarnings(retryError, warnings);
      });
    }

    saveProjectConfig(target, {
      project_id: options.appId,
      user_id: options.userId || (await resolveMakerProjectUserId(options)),
      sce_endpoint: options.sceEndpoint,
    });
    finalizeStagedDevKitGitignore(target);
    options.onProgress?.({
      progress: 100,
      total: 100,
      phase: 'done',
      message: 'Maker project fetch completed',
    });
    return {
      appId: options.appId,
      targetDir: target,
      status: 'fetched',
      retriedWithNewPat,
      transientRetries,
      warnings,
    };
  }

  if (isOwnGitRoot(target)) {
    warnings.push(
      'Target directory already contained git metadata but no checked-out commit. Maker MCP will fetch and check out the remote Maker project branch before reporting success.'
    );
  }

  try {
    options.onProgress?.({
      progress: 10,
      total: 100,
      phase: 'clone',
      message: `Checking out Maker project ${options.appId}`,
    });
    transientRetries += await cloneOrInitializeTarget(
      target,
      authUrl,
      pat.token,
      options.onProgress
    );
  } catch (error) {
    if (options.forcePat || !isAuthGitError(error)) {
      throw withPreCloneWarnings(error, warnings);
    }
    pat = await refreshPatAfterAuthFailure(error, {
      jwt: options.jwt,
      pat: options.pat,
      name: options.patName || 'first-pat',
    });
    authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
    retriedWithNewPat = true;
    options.onProgress?.({
      progress: 10,
      total: 100,
      phase: 'clone',
      message: `Retrying Maker project checkout ${options.appId} with refreshed PAT`,
    });
    transientRetries += await cloneOrInitializeTarget(
      target,
      authUrl,
      pat.token,
      options.onProgress
    ).catch((retryError) => {
      throw withPreCloneWarnings(retryError, warnings);
    });
  }

  try {
    ensureGitHeadCheckedOut(target);
    ensureOwnGitRoot(target);
  } catch (error) {
    throw withPreCloneWarnings(error, warnings);
  }
  finalizeStagedDevKitGitignore(target);
  saveProjectConfig(target, {
    project_id: options.appId,
    user_id: options.userId || (await resolveMakerProjectUserId(options)),
    sce_endpoint: options.sceEndpoint,
  });
  options.onProgress?.({
    progress: 100,
    total: 100,
    phase: 'done',
    message: 'Maker project checkout completed',
  });

  return {
    appId: options.appId,
    targetDir: target,
    status: 'cloned',
    retriedWithNewPat,
    transientRetries,
    warnings,
  };
}

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

  if (!statusBefore.trim() && !options.allowEmpty && unpushed.hasUnpushedCommits) {
    commitHash = (await readGit(['rev-parse', '--short', 'HEAD'], cwd)).trim();
  } else if (options.files?.length) {
    options.onProgress?.({
      progress: 20,
      total: 100,
      phase: 'stage',
      message: 'Staging selected files',
    });
    await runGit(['add', ...includeMandatoryMakerSubmitFiles(cwd, options.files)], { cwd });

    const staged = await readGit(['diff', '--cached', '--name-only'], cwd);
    message = options.message || generateCommitMessage(statusBefore);
    if (staged.trim() || options.allowEmpty) {
      options.onProgress?.({
        progress: 45,
        total: 100,
        phase: 'commit',
        message: 'Creating local Maker project commit',
      });
      await runGit(
        [
          '-c',
          'user.email=maker-mcp@local',
          '-c',
          'user.name=taptap-maker',
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
  } else {
    options.onProgress?.({
      progress: 20,
      total: 100,
      phase: 'stage',
      message: 'Staging all local changes',
    });
    await runGit(['add', '-A'], { cwd });

    const staged = await readGit(['diff', '--cached', '--name-only'], cwd);
    message = options.message || generateCommitMessage(statusBefore);
    if (staged.trim() || options.allowEmpty) {
      options.onProgress?.({
        progress: 45,
        total: 100,
        phase: 'commit',
        message: 'Creating local Maker project commit',
      });
      await runGit(
        [
          '-c',
          'user.email=maker-mcp@local',
          '-c',
          'user.name=taptap-maker',
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

  try {
    options.onProgress?.({
      progress: 65,
      total: 100,
      phase: 'push',
      message: `Pushing Maker project to ${branch}`,
    });
    transientRetries += await pushGitWithTransientRetry(
      ['push', 'origin', `HEAD:${branch}`],
      cwd,
      options.onProgress
    );
  } catch (error) {
    const failure = toMakerGitFailure(error, 'push');
    return {
      branch,
      committed,
      commitHash,
      message,
      pushed: false,
      status: committed || unpushed.hasUnpushedCommits ? 'failed_after_commit' : 'clean',
      failure,
      ahead: await readAheadState(cwd),
      transientRetries,
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

function getBlockingRemoteSyncFailure(status: MakerRemoteSyncStatus): MakerGitFailure | undefined {
  if (status.status === 'up_to_date' || status.status === 'ahead') {
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
      `ahead: ${status.aheadCount}`,
      `behind: ${status.behindCount}`,
      status.nextAction,
    ].join('\n'),
    nextAction: status.nextAction,
  };
}

function includeMandatoryMakerSubmitFiles(cwd: string, files: string[]): string[] {
  const unique = new Set(files);
  const changedFiles = parseGitStatusFiles(readGitSync(['-C', cwd, 'status', '--porcelain', '-z']));
  if (changedFiles.includes('.gitignore')) {
    unique.add('.gitignore');
  }
  return [...unique];
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
    await runGitWithTransientRetry(['fetch', 'origin'], {
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
        '未找到 origin/main。请先确认当前目录是否是完整 Maker clone；不要新建分支或手动 git push，必要时重新执行 taptap-maker init。',
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
      branch,
    }),
  };
}

export function getMakerRemoteSyncFailureNextAction(failure: MakerGitFailure): string {
  if (failure.classification === 'auth') {
    return `暂时无法检查 Maker 远端是否有新提交：Git 鉴权失败。PAT 页面：${getMakerPatTokensUrl()}。请在该页面创建新的 Maker PAT，然后运行 \`taptap-maker pat set\` 并粘贴 PAT 后，再重新读取 maker://status。`;
  }

  return '暂时无法检查 Maker 远端是否有新提交。请把 failure 信息反馈给用户；如果只是 503、5xx、超时或网络中断，可稍后重新读取 maker://status。';
}

function isIgnoredBuildGuardChange(file: string): boolean {
  return file === '.maker-mcp' || file.startsWith('.maker-mcp/');
}

async function readRemoteAheadBehindCounts(
  cwd: string,
  remoteRef: string
): Promise<{ aheadCount: number; behindCount: number } | undefined> {
  try {
    await readGit(['rev-parse', '--verify', remoteRef], cwd);
    const text = await readGit(['rev-list', '--left-right', '--count', `HEAD...${remoteRef}`], cwd);
    const [aheadText, behindText] = text.trim().split(/\s+/);
    return {
      aheadCount: Number.parseInt(aheadText || '0', 10) || 0,
      behindCount: Number.parseInt(behindText || '0', 10) || 0,
    };
  } catch {
    return undefined;
  }
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
  branch: string;
}): string {
  if (input.aheadCount > 0 && input.behindCount > 0) {
    return `本地和远端都已有新提交（本地 ahead ${input.aheadCount}，远端 behind ${input.behindCount}）。不要直接 push 或无脑 pull；请让本地 AI 先检查 git status，再选择 rebase 或 merge 当前 Maker 远端变更。`;
  }

  if (input.behindCount > 0) {
    if (input.hasLocalChanges) {
      return `Maker 远端有 ${input.behindCount} 个新提交，但本地有未提交改动。不要直接 pull；请让本地 AI 先查看 git status，然后由用户选择：先提交当前改动、stash 后 pull 再恢复，或暂时取消同步。`;
    }

    return `Maker 远端有 ${input.behindCount} 个新提交，且本地工作区干净。可以让本地 AI 执行 git pull --ff-only origin ${input.branch} 后再开始修改。`;
  }

  if (input.aheadCount > 0) {
    return `本地已有 ${input.aheadCount} 个未推送提交。构建或提交时请继续使用 maker_build_current_directory，不要手动执行通用 git push。`;
  }

  return '本地 main 与 Maker 远端 main 已同步，可以继续开发。';
}

function ensureTargetCanBindApp(target: string, appId: string): void {
  const existingConfig = loadProjectConfig(target);
  if (!existingConfig?.project_id || existingConfig.project_id === appId) {
    return;
  }

  throw new Error(
    [
      `${target} is already bound to Maker project ${existingConfig.project_id}.`,
      `You are trying to clone Maker project ${appId} into the same directory.`,
      'A Maker workspace directory can only be bound to one project at a time.',
      'Please switch to the directory for the existing project, or create/open a new empty directory for the new project.',
    ].join('\n')
  );
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

function parseGitStatusFiles(status: string): string[] {
  const entries = status.split('\0').filter(Boolean);
  const files: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const statusCode = entry.slice(0, 2);
    const file = entry.slice(3);
    if (file) {
      files.push(file);
    }

    if (statusCode.includes('R') || statusCode.includes('C')) {
      index += 1;
    }
  }

  return files;
}

async function readAheadState(cwd: string): Promise<string | undefined> {
  try {
    const status = await readGit(['status', '--short', '--branch'], cwd);
    return status.split('\n')[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function readUnpushedCommitState(
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

function toMakerGitFailure(error: unknown, stage: string): MakerGitFailure {
  if (error instanceof MakerGitError) {
    return error.failure;
  }

  const message = error instanceof Error ? error.message : String(error);
  return createGitFailure({
    stage,
    stderr: message,
  });
}

function createGitFailure(input: {
  stage: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}): MakerGitFailure {
  const stderr = redactGitSecrets(input.stderr?.trim() || '');
  const stdout = redactGitSecrets(input.stdout?.trim() || '');
  const text = `${stdout}\n${stderr}`.trim();
  const classification = classifyGitFailure(text);
  const retryDecision = getMakerGitRetryDecision(text);
  return {
    stage: input.stage,
    command: input.command ? redactGitSecrets(input.command) : undefined,
    exitCode: input.exitCode,
    stdout,
    stderr,
    message: text || `${input.stage} failed`,
    classification,
    retryable: retryDecision.retry,
    retryReason: retryDecision.reason,
    nextAction: nextActionForFailure(classification),
  };
}

function redactGitSecrets(value: string): string {
  return value.replace(/(https?:\/\/[^:\s/@]+:)[^@\s]+@/g, '$1***@');
}

function classifyGitFailure(message: string): MakerGitFailure['classification'] {
  if (
    /ENOENT|cannot find|spawn git|git: command not found|not recognized as an internal or external command/i.test(
      message
    )
  ) {
    return 'git_missing';
  }

  if (/only refs\/heads\/main is accepted/i.test(message)) {
    return 'branch_not_allowed';
  }

  if (/matches forbidden pattern|forbidden pattern/i.test(message)) {
    return 'forbidden_path';
  }

  if (
    /authentication|authorization|401|403|forbidden|unauthorized|could not read username|repository not found/i.test(
      message
    )
  ) {
    return 'auth';
  }

  if (getMakerGitRetryDecision(message).retry) {
    return 'remote_transient';
  }

  if (/non-fast-forward|fetch first|rejected|failed to push some refs/i.test(message)) {
    return 'remote_rejected';
  }

  if (/not a git repository|not empty|permission denied|Operation not permitted/i.test(message)) {
    return 'local';
  }

  return 'unknown';
}

export function getMakerGitRetryDecision(message: string): MakerGitRetryDecision {
  const text = message.trim();
  if (!text) {
    return { retry: false };
  }

  if (isNonRetryableGitFailure(text)) {
    return { retry: false };
  }

  if (
    /(?:HTTP|error|status|code|response|returned)\D*(?:500|502|503|504)\b|Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error/i.test(
      text
    )
  ) {
    return { retry: true, reason: 'remote_http_5xx' };
  }

  if (
    /timed?\s*out|timeout|TLS handshake timeout|Failed to connect|Could not resolve host|Network is unreachable|No route to host/i.test(
      text
    )
  ) {
    return { retry: true, reason: 'network_or_timeout' };
  }

  if (
    /connection reset|connection refused|connection closed|remote end hung up|unexpected disconnect|early EOF|RPC failed|index-pack failed|HTTP\/2 stream.*not closed cleanly|SSL_ERROR_SYSCALL|curl\s+(?:18|28|35|52|55|56|92)/i.test(
      text
    )
  ) {
    return { retry: true, reason: 'connection_interrupted' };
  }

  return { retry: false };
}

function isNonRetryableGitFailure(message: string): boolean {
  return /authentication|authorization|401|403|forbidden|unauthorized|could not read username|repository not found|only refs\/heads\/main is accepted|matches forbidden pattern|forbidden pattern|not a git repository|not empty|already exists and is not an empty directory|permission denied|Operation not permitted|non-fast-forward|fetch first|rejected|failed to push some refs|would be overwritten|conflicting local files/i.test(
    message
  );
}

function nextActionForFailure(classification: MakerGitFailure['classification']): string {
  switch (classification) {
    case 'git_missing':
      return '本机未检测到可用的 Git。请用户自行安装 Git，并在 `git --version` 可用后重启 MCP 客户端再重试；安装前不要执行 clone、fetch、commit 或 push。';
    case 'auth':
      return `Maker Git 鉴权失败。PAT 页面：${getMakerPatTokensUrl()}。请在该页面创建新的 Maker PAT，然后运行 \`taptap-maker pat set\` 并粘贴 PAT 后重试。`;
    case 'remote_transient':
      return '远端 Maker git 服务临时不可用。本地 commit 会保留；不要手动执行通用 git push，稍后直接重试 maker_build_current_directory。';
    case 'branch_not_allowed':
      return 'Maker 远端只接受 main 分支提交。当前本地 commit 已保留但未推送；不要 pull/rebase、不要新建分支、不要手动执行通用 git push。请先确认工作区无未提交改动，切回 main 分支（必要时从 origin/main 创建 main），把这次本地 commit cherry-pick 到 main 后，再重试 maker_build_current_directory。';
    case 'forbidden_path':
      return '本地 commit 包含 Maker 远端禁止提交的路径或目录。远端 pre-receive hook 已返回具体 forbidden pattern；这不是鉴权问题，不要刷新 Maker PAT。请按 stderr 中的 pattern 找到对应文件，把这些路径从本地 commit 移除（例如保留工作区文件但取消跟踪后修正当前未推送 commit），确认 git status 不再包含这些路径后，再重试 maker_build_current_directory。';
    case 'remote_rejected':
      return '远端已有新提交。不要新建分支、不要要任务号、不要手动执行通用 git push；先询问用户是否 pull/rebase 当前 Maker 远端变更，再重试 maker_build_current_directory。';
    case 'local':
      return '本地目录或权限异常。检查当前目录是否是 Maker git repo，以及 Codex 是否有目录写权限。';
    default:
      return '保留本地提交，不要重复提交；把错误详情反馈给用户，并在确认后重试 maker_build_current_directory。';
  }
}

function pushGit(
  args: string[],
  cwd: string,
  onProgress?: MakerProjectProgressHandler
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gitCommand = getGitCommand();
    const child = spawn(gitCommand, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      emitGitProgress(chunk, onProgress);
    });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new MakerGitError(
          createGitFailure({
            stage: 'push',
            command: `${gitCommand} ${args.join(' ')}`,
            exitCode: code,
            stdout,
            stderr,
          })
        )
      );
    });
    child.on('error', (error) => {
      reject(
        new MakerGitError(
          createGitFailure({
            stage: 'push',
            command: `${gitCommand} ${args.join(' ')}`,
            exitCode: null,
            stdout,
            stderr: error.message,
          })
        )
      );
    });
  });
}

function pushGitWithTransientRetry(
  args: string[],
  cwd: string,
  onProgress?: MakerProjectProgressHandler
): Promise<number> {
  return runWithTransientRetry(() => pushGit(args, cwd, onProgress), {
    stage: 'push',
    onProgress,
  });
}

async function resolveMakerProjectUserId(
  options: Pick<CloneMakerProjectOptions, 'appId' | 'jwt' | 'pat'>
): Promise<string | undefined> {
  try {
    const projects = await listMakerProjects({
      jwt: options.jwt,
      pat: options.pat,
    });
    return projects.find((project) => project.id === options.appId)?.user_id;
  } catch {
    return undefined;
  }
}

async function ensureAuthenticatedOrigin(options: {
  cwd: string;
  appId: string;
  jwt?: string;
  pat?: string;
  forcePat?: boolean;
  onProgress?: MakerProjectProgressHandler;
}): Promise<void> {
  const pat = await requestMakerPat({
    jwt: options.jwt,
    pat: options.pat,
    name: 'first-pat',
    force: options.forcePat,
  });
  const gitBase = getMakerGitBase();
  const gitUrl = `${gitBase}/${options.appId}.git`;
  const authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);

  await setOrigin(options.cwd, authUrl);
  options.onProgress?.({
    progress: 8,
    total: 100,
    phase: 'auth',
    message: 'Maker git origin updated with PAT authentication',
  });
}

function makeAuthenticatedGitUrl(gitUrl: string, pat: string): string {
  return gitUrl.replace(/^https:\/\//, `https://git:${encodeURIComponent(pat)}@`);
}

async function cloneOrInitializeTarget(
  target: string,
  authUrl: string,
  pat: string,
  onProgress?: MakerProjectProgressHandler
): Promise<number> {
  if (fs.existsSync(target) && hasDirectoryEntries(target)) {
    onProgress?.({
      progress: 10,
      total: 100,
      phase: 'clone',
      message:
        'Target directory is not empty; initializing git repository in place and keeping existing untracked files unless they conflict with Maker project files.',
    });
  }

  return initializeAndFetchTarget(target, authUrl, pat, onProgress);
}

async function initializeAndFetchTarget(
  target: string,
  authUrl: string,
  pat: string,
  onProgress?: MakerProjectProgressHandler
): Promise<number> {
  let transientRetries = 0;
  emitFirstCloneWaitNotice(onProgress, 'fetch');
  transientRetries += await runGitCaptureWithTransientRetry(['init', target], {
    sanitize: pat,
    onProgress,
  });
  await setOrigin(target, authUrl);
  transientRetries += await runGitWithTransientRetry(createShallowFetchArgs(), {
    cwd: target,
    onProgress,
  });
  const branch = await resolveRemoteDefaultBranch(target);
  await assertNoCheckoutFileConflicts(target, branch);
  try {
    transientRetries += await runGitCaptureWithTransientRetry(
      ['checkout', '-B', branch, `origin/${branch}`],
      {
        cwd: target,
        sanitize: pat,
        onProgress,
      }
    );
  } catch (error) {
    throw enhanceCheckoutConflictError(error, target);
  }
  return transientRetries;
}

function createShallowFetchArgs(): string[] {
  return ['fetch', '--progress', `--depth=${MAKER_GIT_SHALLOW_DEPTH}`, 'origin'];
}

function emitFirstCloneWaitNotice(
  onProgress: MakerProjectProgressHandler | undefined,
  phase: 'clone' | 'fetch'
): void {
  onProgress?.({
    progress: 10,
    total: 100,
    phase,
    message: MAKER_FIRST_CLONE_WAIT_MESSAGE,
  });
}

function hasDirectoryEntries(target: string): boolean {
  if (!fs.existsSync(target)) {
    return false;
  }

  return fs.readdirSync(target).length > 0;
}

function listLocalFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  const visit = (dir: string, relativeDir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (
        entry.name === '.git' ||
        relativePath === '.maker-mcp' ||
        relativePath.startsWith('.maker-mcp/') ||
        entry.name === '.DS_Store'
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, relativePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  visit(root, '');
  return files;
}

function listPreCloneNoticeFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => !isIgnorablePreCloneEntry(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function createPreCloneWarnings(target: string): string[] {
  const preCloneLocalFiles = listPreCloneNoticeFiles(target);
  if (preCloneLocalFiles.length === 0) {
    return [];
  }

  const preview = preCloneLocalFiles.slice(0, 10);
  return [
    [
      'Pre-clone notice: target directory already contains local files. Maker MCP will keep them and continue unless they conflict with Maker project files.',
      `local_file_count: ${preCloneLocalFiles.length}`,
      'local_files:',
      ...preview.map((file) => `  - ${file}`),
      preCloneLocalFiles.length > preview.length
        ? `  - ... ${preCloneLocalFiles.length - preview.length} more`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  ];
}

function formatPreCloneProgressMessage(appId: string, warnings: string[]): string {
  if (warnings.length === 0) {
    return `Pre-clone local directory check passed for Maker project ${appId}`;
  }

  return [
    `Pre-clone local directory check found existing local files for Maker project ${appId}.`,
    ...warnings,
  ].join('\n');
}

function isIgnorablePreCloneEntry(entryName: string): boolean {
  return entryName === '.DS_Store' || entryName.startsWith('.');
}

function isAuthGitError(error: unknown): boolean {
  return toMakerGitFailure(error, 'clone').classification === 'auth';
}

async function refreshPatAfterAuthFailure(
  originalError: unknown,
  options: {
    jwt?: string;
    pat?: string;
    name?: string;
  }
): Promise<MakerPat> {
  try {
    return await requestMakerPat({
      jwt: options.jwt,
      pat: options.pat,
      name: options.name || 'first-pat',
      force: true,
    });
  } catch (refreshError) {
    const originalMessage =
      originalError instanceof Error ? originalError.message : String(originalError);
    const refreshMessage =
      refreshError instanceof Error ? refreshError.message : String(refreshError);
    throw new Error(
      [
        'Maker git authentication failed and PAT refresh also failed.',
        '',
        'original_git_error:',
        originalMessage,
        '',
        'pat_refresh_error:',
        refreshMessage,
      ].join('\n')
    );
  }
}

function withPreCloneWarnings(error: unknown, warnings: string[]): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  if (warnings.length === 0) {
    return original;
  }

  return new Error(
    [
      'Maker clone failed after pre-clone local directory check.',
      '',
      'Pre-clone notices:',
      ...warnings.map((warning) => indentText(warning)),
      '',
      'original_error:',
      original.message,
    ].join('\n')
  );
}

function indentText(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

async function assertNoCheckoutFileConflicts(cwd: string, branch: string): Promise<void> {
  const remoteTree = await readGit(['ls-tree', '-r', '--name-only', `origin/${branch}`], cwd);
  const remoteFiles = new Set(
    remoteTree
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  if (remoteFiles.size === 0) {
    return;
  }

  const conflicts = listLocalFiles(cwd)
    .filter((file) => remoteFiles.has(file))
    .sort();
  if (conflicts.length === 0) {
    return;
  }

  throw new Error(
    [
      'Maker clone cannot continue because existing local files have the same paths as files in the remote Maker project.',
      `target_dir: ${cwd}`,
      '',
      'Conflicting local files:',
      ...conflicts.map((file) => `- ${file}`),
      '',
      'Please move, rename, or delete these local files, then retry taptap-maker init.',
    ].join('\n')
  );
}

async function setOrigin(cwd: string, authUrl: string): Promise<void> {
  await runGit(['remote', 'get-url', 'origin'], { cwd, quiet: true })
    .then(() => runGit(['remote', 'set-url', 'origin', authUrl], { cwd, quiet: true }))
    .catch(() => runGit(['remote', 'add', 'origin', authUrl], { cwd, quiet: true }));
}

function isOwnGitRoot(repoDir: string): boolean {
  const status = inspectMakerDirectoryGitStatus(repoDir);
  return status.isOwnGitRoot;
}

function ensureOwnGitRoot(repoDir: string): void {
  const status = inspectMakerDirectoryGitStatus(repoDir);
  if (status.isOwnGitRoot) {
    return;
  }

  throw new Error(
    [
      'Maker project checkout did not create an independent Git repository.',
      `target_dir: ${status.targetDir}`,
      status.gitRoot ? `detected_git_root: ${status.gitRoot}` : '',
      'A Maker project directory must have its own .git directory. Parent Git repositories must not be reused.',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

export function inspectMakerDirectoryGitStatus(cwd: string): MakerDirectoryGitStatus {
  const targetDir = path.resolve(cwd);
  const gitRoot = resolveGitRoot(targetDir);
  const gitDir = resolveGitDir(targetDir);
  const makerBinding = findMakerProjectBinding(targetDir);
  const isGitWorkTree = Boolean(gitRoot);
  const isOwnGitRoot = Boolean(gitRoot && samePath(gitRoot, targetDir));
  const isUsableMakerGitRepo = Boolean(
    makerBinding?.projectRoot && gitRoot && samePath(makerBinding.projectRoot, gitRoot)
  );

  let issue: MakerDirectoryGitStatus['issue'];
  let message: string | undefined;
  if (makerBinding && gitRoot && !samePath(makerBinding.projectRoot, gitRoot)) {
    issue = 'inside_parent_git_repo';
    message = [
      `${makerBinding.projectRoot} contains Maker binding config, but Git root is ${gitRoot}.`,
      'The Maker directory must be an independent Git repository before build or submit.',
    ].join(' ');
  } else if (makerBinding && !gitRoot) {
    issue = 'missing_git_repo';
    message = `${makerBinding.projectRoot} is bound to Maker but is not a Git repository.`;
  } else if (!makerBinding) {
    issue = 'missing_maker_config';
    message = `${targetDir} is not bound to a Maker project. .maker-mcp/config.json is missing.`;
  }

  return {
    targetDir,
    gitRoot,
    gitDir,
    makerProjectRoot: makerBinding?.projectRoot,
    configPath: makerBinding?.configPath,
    isGitWorkTree,
    isOwnGitRoot,
    isUsableMakerGitRepo,
    issue,
    message,
  };
}

function resolveUsableMakerGitWorkspace(cwd: string): {
  projectRoot: string;
  configPath: string;
  gitRoot: string;
} {
  const status = inspectMakerDirectoryGitStatus(cwd);
  if (!status.makerProjectRoot || !status.configPath) {
    throw new Error(status.message || `${status.targetDir} is not bound to a Maker project.`);
  }
  if (!status.gitRoot) {
    throw new Error(
      [
        `${status.makerProjectRoot} is bound to a Maker project but is not a Git repository.`,
        'The Maker project directory must be an independent Git repository before build or submit.',
      ].join('\n')
    );
  }
  if (!samePath(status.makerProjectRoot, status.gitRoot)) {
    throw new Error(formatMakerGitRootMismatch(status));
  }

  return {
    projectRoot: status.makerProjectRoot,
    configPath: status.configPath,
    gitRoot: status.gitRoot,
  };
}

function formatMakerGitRootMismatch(status: MakerDirectoryGitStatus): string {
  return [
    `${status.makerProjectRoot} must be an independent Git repository before build or submit.`,
    '',
    `maker_project_root: ${status.makerProjectRoot}`,
    `git_root: ${status.gitRoot || '(none)'}`,
    status.configPath ? `config: ${status.configPath}` : '',
    '',
    'The current Maker directory is inside another Git repository, but it does not have its own .git directory.',
    'Re-run taptap-maker init after this fix, or use a fresh independent Maker directory.',
  ]
    .filter(Boolean)
    .join('\n');
}

function findMakerProjectBinding(
  startDir: string
): { projectRoot: string; configPath: string } | null {
  let current = path.resolve(startDir);
  while (current.length > 0) {
    const configPath = getProjectConfigPath(current);
    if (fs.existsSync(configPath) && loadProjectConfig(current)?.project_id) {
      return {
        projectRoot: current,
        configPath,
      };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  return null;
}

function resolveGitRoot(cwd: string): string | undefined {
  try {
    return path.resolve(readGitSync(['-C', cwd, 'rev-parse', '--show-toplevel']).trim());
  } catch {
    return undefined;
  }
}

function resolveGitDir(cwd: string): string | undefined {
  try {
    const gitDir = readGitSync(['-C', cwd, 'rev-parse', '--git-dir']).trim();
    return path.isAbsolute(gitDir) ? path.resolve(gitDir) : path.resolve(cwd, gitDir);
  } catch {
    return undefined;
  }
}

function samePath(left: string, right: string): boolean {
  return normalizePathForCompare(left) === normalizePathForCompare(right);
}

function normalizePathForCompare(value: string): string {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function hasGitHead(repoDir: string): boolean {
  try {
    const head = readGitSync(['-C', repoDir, 'rev-parse', '--verify', 'HEAD']);
    return head.trim().length > 0;
  } catch {
    return false;
  }
}

function ensureGitHeadCheckedOut(repoDir: string): void {
  if (hasGitHead(repoDir)) {
    return;
  }

  throw new Error(
    [
      'Maker clone did not complete checkout: local git repository has no HEAD commit.',
      `target_dir: ${repoDir}`,
      'The remote fetch may have succeeded, but project files were not checked out. Please inspect git status and retry taptap-maker init.',
    ].join('\n')
  );
}

function enhanceCheckoutConflictError(error: unknown, target: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (!/untracked working tree files would be overwritten by checkout/i.test(message)) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(
    [
      'Maker clone could not check out project files because existing local files would be overwritten.',
      `target_dir: ${target}`,
      'Please move, rename, or delete the conflicting local files, then retry taptap-maker init.',
      '',
      message,
    ].join('\n')
  );
}

async function currentBranch(cwd: string, explicitBranch?: string): Promise<string> {
  if (explicitBranch) {
    return explicitBranch;
  }

  const branch = await readGit(['branch', '--show-current'], cwd);
  return branch.trim() || 'main';
}

async function resolveRemoteDefaultBranch(cwd: string): Promise<string> {
  try {
    const branch = await readGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
    return branch.trim().replace(/^origin\//, '') || 'main';
  } catch {
    // `git fetch origin` in an initialized directory does not always create
    // refs/remotes/origin/HEAD, so ask the remote directly before falling back.
  }

  try {
    const remoteHead = await readGit(['ls-remote', '--symref', 'origin', 'HEAD'], cwd);
    const match = remoteHead.match(/^ref:\s+refs\/heads\/([^\s]+)\s+HEAD/m);
    return match?.[1] || 'main';
  } catch {
    return 'main';
  }
}

function readGitSync(args: string[]): string {
  const gitCommand = getGitCommand();
  const result = spawnSync(gitCommand, args, {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${gitCommand} ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function readGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const gitCommand = getGitCommand();
    const child = spawn(gitCommand, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(`${gitCommand} ${args.join(' ')} failed with exit code ${code}: ${stderr}`)
        );
      }
    });
    child.on('error', reject);
  });
}

async function runGitWithTransientRetry(
  args: string[],
  options: {
    cwd: string;
    onProgress?: MakerProjectProgressHandler;
  }
): Promise<number> {
  return runWithTransientRetry(() => runGit(args, options), {
    stage: args[0] || 'git',
    onProgress: options.onProgress,
  });
}

async function runGitCaptureWithTransientRetry(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
    onProgress?: MakerProjectProgressHandler;
  } = {}
): Promise<number> {
  return runWithTransientRetry(() => runGitCapture(args, options), {
    stage: args[0] || 'git',
    onProgress: options.onProgress,
  });
}

async function runWithTransientRetry(
  operation: () => Promise<void>,
  options: {
    stage: string;
    onProgress?: MakerProjectProgressHandler;
  }
): Promise<number> {
  let retries = 0;
  const maxRetries = 2;

  for (;;) {
    try {
      await operation();
      return retries;
    } catch (error) {
      const decision = getMakerGitRetryDecisionFromError(error);
      if (!decision.retry) {
        throw error;
      }

      if (retries >= maxRetries) {
        throw appendRetryExhausted(error, retries, decision);
      }

      retries += 1;
      options.onProgress?.({
        phase: options.stage,
        message: formatGitRetryProgressMessage(options.stage, decision, retries, maxRetries),
      });
      await sleep(getGitRetryDelayMs() * retries);
    }
  }
}

function formatGitRetryProgressMessage(
  stage: string,
  decision: MakerGitRetryDecision,
  retries: number,
  maxRetries: number
): string {
  const reason = decision.reason || 'temporary_remote_failure';
  const prefix =
    (stage === 'clone' || stage === 'fetch') && reason === 'remote_http_5xx'
      ? 'Maker server may still be preparing the repository'
      : 'Maker git remote is temporarily unavailable';
  return `${prefix} (${reason}); retrying ${retries}/${maxRetries}. Please keep this running.`;
}

function getMakerGitRetryDecisionFromError(error: unknown): MakerGitRetryDecision {
  if (error instanceof MakerGitError) {
    return getMakerGitRetryDecision(
      [error.failure.stdout, error.failure.stderr, error.failure.message].filter(Boolean).join('\n')
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return getMakerGitRetryDecision(message);
}

function appendRetryExhausted(
  error: unknown,
  retryAttempts: number,
  decision: MakerGitRetryDecision
): unknown {
  if (error instanceof MakerGitError) {
    return new MakerGitError({
      ...error.failure,
      retryable: decision.retry,
      retryReason: decision.reason,
      retryAttempts,
      message: [
        error.failure.message,
        '',
        `Maker git transient retry exhausted after ${retryAttempts} retry attempts.`,
        decision.reason ? `retry_reason: ${decision.reason}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    [
      message,
      '',
      `Maker git transient retry exhausted after ${retryAttempts} retry attempts.`,
      decision.reason ? `retry_reason: ${decision.reason}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function getGitRetryDelayMs(): number {
  const value = Number.parseInt(process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 1500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGitCapture(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
    onProgress?: MakerProjectProgressHandler;
  } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gitCommand = getGitCommand();
    const child = spawn(gitCommand, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      emitGitProgress(chunk, options.onProgress, options.sanitize);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const pretty = `${gitCommand} ${args.map((arg) => sanitize(arg, options.sanitize)).join(' ')}`;
      const detail = sanitize(
        [stdout.trim(), stderr.trim()].filter(Boolean).join('\n'),
        options.sanitize
      );
      reject(
        new Error([`${pretty} failed with exit code ${code}`, detail].filter(Boolean).join('\n'))
      );
    });
    child.on('error', reject);
  });
}

function runGit(
  args: string[],
  options: {
    cwd: string;
    quiet?: boolean;
    onProgress?: MakerProjectProgressHandler;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gitCommand = getGitCommand();
    const child = spawn(gitCommand, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      emitGitProgress(chunk, options.onProgress);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new MakerGitError(
            createGitFailure({
              stage: args[0] || 'git',
              command: `${gitCommand} ${args.join(' ')}`,
              exitCode: code,
              stdout: options.quiet ? '' : stdout,
              stderr: options.quiet ? '' : stderr,
            })
          )
        );
      }
    });
    child.on('error', (error) => {
      reject(
        new MakerGitError(
          createGitFailure({
            stage: args[0] || 'git',
            command: `${gitCommand} ${args.join(' ')}`,
            exitCode: null,
            stdout: options.quiet ? '' : stdout,
            stderr: error.message,
          })
        )
      );
    });
  });
}

function sanitize(value: string, secret?: string): string {
  if (!secret) {
    return value;
  }
  return value.split(secret).join('***');
}

function emitGitProgress(
  chunk: Buffer | string,
  onProgress?: MakerProjectProgressHandler,
  secret?: string
): void {
  if (!onProgress) {
    return;
  }

  for (const rawLine of String(chunk).split(/\r\n|\n|\r/)) {
    const line = sanitize(rawLine.trim(), secret);
    const progress = parseGitProgressLine(line);
    if (progress) {
      onProgress(progress);
    }
  }
}

export function parseGitProgressLine(line: string): MakerProjectProgress | undefined {
  const message = line.trim();
  if (!message) {
    return undefined;
  }

  const percentMatch = message.match(
    /(?:remote:\s*)?(Counting objects|Compressing objects|Receiving objects|Resolving deltas|Writing objects):\s+(\d+)%/i
  );
  if (percentMatch) {
    return {
      progress: Math.max(0, Math.min(100, Number(percentMatch[2]))),
      total: 100,
      phase: 'git',
      message,
    };
  }

  if (/^(remote:\s*)?(Cloning into|Enumerating objects|Total )/i.test(message)) {
    return {
      phase: 'git',
      message,
    };
  }

  return undefined;
}
