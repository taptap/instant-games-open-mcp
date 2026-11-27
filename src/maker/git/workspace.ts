/**
 * Maker project directory and Git repository detection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { getProjectConfigPath, loadProjectConfig } from '../storage.js';
import { GitCommandError } from './exec.js';
import { readGit, readGitSync } from './run.js';

export interface MakerDirectoryGitStatus {
  targetDir: string;
  gitRoot?: string;
  gitDir?: string;
  makerProjectRoot?: string;
  configPath?: string;
  isGitWorkTree: boolean;
  isOwnGitRoot: boolean;
  isUsableMakerGitRepo: boolean;
  issue?:
    | 'inside_parent_git_repo'
    | 'missing_git_repo'
    | 'git_inspection_failed'
    | 'missing_maker_config';
  message?: string;
}

export function inspectMakerDirectoryGitStatus(cwd: string): MakerDirectoryGitStatus {
  const targetDir = path.resolve(cwd);
  let gitRoot: string | undefined;
  let gitInspectionError: string | undefined;
  try {
    gitRoot = path.resolve(readGitSync(['-C', targetDir, 'rev-parse', '--show-toplevel']).trim());
  } catch (error) {
    // Both missing repositories and other fatal Git errors can return exit code 128.
    const missingRepository =
      error instanceof GitCommandError &&
      error.exitCode === 128 &&
      /^fatal: not a git repository \(or any\b/im.test(error.stderr);
    if (!missingRepository) {
      const detail = error instanceof Error ? error.message : String(error);
      gitInspectionError = String(sanitizeDiagnosticValue(detail.trim())).slice(0, 4000);
    }
  }
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
  } else if (makerBinding && gitInspectionError !== undefined) {
    issue = 'git_inspection_failed';
    message = [
      'Git could not inspect the bound Maker project: ' + makerBinding.projectRoot,
      'Resolve the Git error below before retrying. Keep the existing repository and project files.',
      'git_error: ' + gitInspectionError,
    ].join('\n');
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

export function resolveUsableMakerGitWorkspace(cwd: string): {
  projectRoot: string;
  configPath: string;
  gitRoot: string;
} {
  const status = inspectMakerDirectoryGitStatus(cwd);
  if (!status.makerProjectRoot || !status.configPath) {
    throw new Error(status.message || `${status.targetDir} is not bound to a Maker project.`);
  }
  if (status.issue === 'git_inspection_failed') {
    throw new Error(status.message);
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

function resolveGitDir(cwd: string): string | undefined {
  try {
    const gitDir = readGitSync(['-C', cwd, 'rev-parse', '--git-dir']).trim();
    return path.isAbsolute(gitDir) ? path.resolve(gitDir) : path.resolve(cwd, gitDir);
  } catch {
    return undefined;
  }
}

export function samePath(left: string, right: string): boolean {
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

export function isOwnGitRoot(repoDir: string): boolean {
  return inspectMakerDirectoryGitStatus(repoDir).isOwnGitRoot;
}

export function ensureOwnGitRoot(repoDir: string): void {
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

export function hasGitHead(repoDir: string): boolean {
  try {
    const head = readGitSync(['-C', repoDir, 'rev-parse', '--verify', 'HEAD']);
    return head.trim().length > 0;
  } catch {
    return false;
  }
}

export function ensureGitHeadCheckedOut(repoDir: string): void {
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

export async function currentBranch(cwd: string, explicitBranch?: string): Promise<string> {
  if (explicitBranch) {
    return explicitBranch;
  }

  const branch = await readGit(['branch', '--show-current'], cwd);
  return branch.trim() || 'main';
}

export async function resolveRemoteDefaultBranch(cwd: string): Promise<string> {
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
