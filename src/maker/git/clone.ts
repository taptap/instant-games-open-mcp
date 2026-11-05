/**
 * Maker project clone / fetch into a local directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerPat } from '../types.js';
import { loadProjectConfig, saveProjectConfig } from '../storage.js';
import { requestMakerPat } from '../auth/pat.js';
import { ensureGitAvailable } from '../system/git.js';
import { finalizeStagedDevKitGitignore } from '../cli/devKit.js';
import { registerMakerProject } from '../projectRegistry.js';
import { ensureMakerProjectBaseDirectories, listMakerProjects } from '../cli/projects.js';
import { toMakerGitFailure } from './failure.js';
import { getMakerGitBase, makeAuthenticatedGitUrl, setOrigin } from './origin.js';
import {
  gitCaptureWithTransientRetry,
  gitStepWithTransientRetry,
  readGit,
  type MakerProjectProgressHandler,
} from './run.js';
import {
  ensureGitHeadCheckedOut,
  ensureOwnGitRoot,
  hasGitHead,
  isOwnGitRoot,
  resolveRemoteDefaultBranch,
} from './workspace.js';

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

const MAKER_FIRST_CLONE_WAIT_MESSAGE =
  'First Maker clone/fetch can take 20+ seconds while the server prepares the repository. Please keep this running; transient 503/5xx errors are retried automatically.';
const MAKER_GIT_SHALLOW_DEPTH = 1;

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
      transientRetries += await gitStepWithTransientRetry(['fetch', '--progress', 'origin'], {
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
      transientRetries += await gitStepWithTransientRetry(['fetch', '--progress', 'origin'], {
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
    ensureMakerProjectBaseDirectories(target);
    finalizeStagedDevKitGitignore(target);
    const registryWarning = registerMakerProject(target);
    if (registryWarning) warnings.push(registryWarning);
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
    transientRetries += await fetchAndCheckoutTarget(
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
    transientRetries += await fetchAndCheckoutTarget(
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
  ensureMakerProjectBaseDirectories(target);
  const registryWarning = registerMakerProject(target);
  if (registryWarning) warnings.push(registryWarning);
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

async function fetchAndCheckoutTarget(
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

  let transientRetries = 0;
  emitFirstCloneWaitNotice(onProgress, 'fetch');
  transientRetries += await gitCaptureWithTransientRetry(['init', target], {
    sanitize: pat,
    onProgress,
  });
  await setOrigin(target, authUrl);
  transientRetries += await gitStepWithTransientRetry(createShallowFetchArgs(), {
    cwd: target,
    onProgress,
  });
  const branch = await resolveRemoteDefaultBranch(target);
  await assertNoCheckoutFileConflicts(target, branch);
  try {
    transientRetries += await gitCaptureWithTransientRetry(
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
  return ['fetch', '--progress', `--depth=${String(MAKER_GIT_SHALLOW_DEPTH)}`, 'origin'];
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
        relativePath === '.maker-preview' ||
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
