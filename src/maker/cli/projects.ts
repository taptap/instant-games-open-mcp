/**
 * taptap-maker projects commands.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MakerProjectSummary } from '../types.js';
import { loadProjectConfig, saveProjectConfig } from '../storage.js';
import { getUserIdFromMakerJwt, requireMakerJwt } from '../auth/jwt.js';
import { requestMakerPat } from '../git/pat.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';
import { ensureGitAvailable, getGitCommand } from '../system/git.js';
import { getStringFlag, isJsonMode, printJson } from './common.js';

export interface CloneMakerProjectOptions {
  appId: string;
  targetDir: string;
  jwt?: string;
  patName?: string;
  forcePat?: boolean;
  sceEndpoint?: string;
}

export interface CloneMakerProjectResult {
  appId: string;
  targetDir: string;
  status: 'cloned' | 'fetched';
  retriedWithNewPat: boolean;
  transientRetries: number;
}

export interface PushMakerProjectOptions {
  cwd: string;
  message?: string;
  branch?: string;
  files?: string[];
  allowEmpty?: boolean;
  jwt?: string;
  forcePat?: boolean;
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
    | 'remote_rejected'
    | 'local'
    | 'unknown';
  nextAction: string;
}

class MakerGitError extends Error {
  readonly failure: MakerGitFailure;

  constructor(failure: MakerGitFailure) {
    super(failure.message);
    this.name = 'MakerGitError';
    this.failure = failure;
  }
}

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

function normalizeProjectsResponse(data: unknown): MakerProjectSummary[] {
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
    .map((item) => ({
      id: String(item.id || item.app_id || item.project_id || ''),
      name:
        typeof item.name === 'string'
          ? item.name
          : typeof item.title === 'string'
            ? item.title
            : undefined,
      sce_endpoint:
        typeof item.sce_endpoint === 'string'
          ? item.sce_endpoint
          : typeof item.sce_mcp_url === 'string'
            ? item.sce_mcp_url
            : undefined,
      git_url: typeof item.git_url === 'string' ? item.git_url : undefined,
      raw: item,
    }))
    .filter((project) => project.id.length > 0);
}

export async function runProjects(
  args: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const subcommand = args[0] || 'list';

  if (subcommand === 'list') {
    await listProjects(flags);
    return;
  }

  if (subcommand === 'clone') {
    await cloneProject(args.slice(1), flags);
    return;
  }

  if (subcommand === 'push') {
    await pushProject(flags);
    return;
  }

  throw new Error(`Unknown projects subcommand: ${subcommand}`);
}

export async function listMakerProjects(options?: {
  jwt?: string;
}): Promise<MakerProjectSummary[]> {
  const jwt = requireMakerJwt(options?.jwt);
  const userId = getUserIdFromMakerJwt(jwt);
  const url = new URL(`${getMakerApiBase()}/apps`);
  if (userId) {
    url.searchParams.set('userId', userId);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${options?.jwt || jwt.token}`,
      Accept: 'application/json',
    },
  });
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker project list failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return normalizeProjectsResponse(json);
}

async function listProjects(flags: Record<string, string | boolean>): Promise<void> {
  const projects = await listMakerProjects({
    jwt: getStringFlag(flags, 'jwt'),
  });
  if (isJsonMode(flags)) {
    printJson(projects);
    return;
  }

  if (projects.length === 0) {
    process.stdout.write('No Maker projects found.\n');
    return;
  }

  for (const project of projects) {
    process.stdout.write(`${project.id}\t${project.name || '(untitled)'}\n`);
  }
}

async function cloneProject(
  args: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const projectId = args[0] || getStringFlag(flags, 'project-id') || getStringFlag(flags, 'app-id');
  if (!projectId) {
    throw new Error('Usage: taptap-maker projects clone <app-id> [target-dir] --jwt <jwt>');
  }

  const target = path.resolve(args[1] || getStringFlag(flags, 'target') || '.');
  await cloneMakerProject({
    appId: projectId,
    targetDir: target,
    jwt: getStringFlag(flags, 'jwt'),
    patName: getStringFlag(flags, 'pat-name') || 'first-pat',
    forcePat: flags['force-pat'] === true,
    sceEndpoint: getStringFlag(flags, 'sce-endpoint') || process.env.SCE_MCP_URL,
  });

  process.stdout.write(`✓ Cloned Maker project ${projectId} to ${target}\n`);
}

async function pushProject(flags: Record<string, string | boolean>): Promise<void> {
  const message = getStringFlag(flags, 'message') || getStringFlag(flags, 'm');
  if (!message) {
    throw new Error('Usage: taptap-maker projects push --message <commit-message>');
  }

  const result = await pushMakerProject({
    cwd: path.resolve(getStringFlag(flags, 'target') || '.'),
    message,
    branch: getStringFlag(flags, 'branch'),
    allowEmpty: flags['allow-empty'] === true,
  });

  process.stdout.write(`✓ Maker push ${result.status} on ${result.branch}\n`);
}

export async function cloneMakerProject(
  options: CloneMakerProjectOptions
): Promise<CloneMakerProjectResult> {
  ensureGitAvailable();
  const target = path.resolve(options.targetDir);
  let pat = await requestMakerPat({
    jwt: options.jwt,
    name: options.patName || 'first-pat',
    force: options.forcePat,
  });
  const gitBase = getMakerGitBase();

  const gitUrl = `${gitBase}/${options.appId}.git`;
  let authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
  let retriedWithNewPat = false;
  let transientRetries = 0;

  if (isGitRepo(target)) {
    await setOrigin(target, authUrl);
    try {
      transientRetries += await runGitWithTransientRetry(['fetch', 'origin'], {
        cwd: target,
      });
    } catch (error) {
      if (options.forcePat) {
        throw error;
      }
      pat = await requestMakerPat({
        jwt: options.jwt,
        name: options.patName || 'first-pat',
        force: true,
      });
      authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
      retriedWithNewPat = true;
      await setOrigin(target, authUrl);
      transientRetries += await runGitWithTransientRetry(['fetch', 'origin'], {
        cwd: target,
      });
    }

    saveProjectConfig(target, {
      project_id: options.appId,
      sce_endpoint: options.sceEndpoint,
    });
    return {
      appId: options.appId,
      targetDir: target,
      status: 'fetched',
      retriedWithNewPat,
      transientRetries,
    };
  }

  if (fs.existsSync(target) && hasNonIgnorableFiles(target)) {
    throw new Error(
      [
        `${target} is not empty and is not a git repository.`,
        'Maker clone can be run multiple times after the directory is a git repo, but the first clone requires an empty target directory.',
        'Please open an empty directory, or remove the unrelated files before cloning.',
      ].join('\n')
    );
  }

  try {
    transientRetries += await runGitCaptureWithTransientRetry(['clone', authUrl, target], {
      sanitize: pat.token,
    });
  } catch (error) {
    if (options.forcePat) {
      throw error;
    }
    pat = await requestMakerPat({
      jwt: options.jwt,
      name: options.patName || 'first-pat',
      force: true,
    });
    authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);
    retriedWithNewPat = true;
    transientRetries += await runGitCaptureWithTransientRetry(['clone', authUrl, target], {
      sanitize: pat.token,
    });
  }

  saveProjectConfig(target, {
    project_id: options.appId,
    sce_endpoint: options.sceEndpoint,
  });

  return {
    appId: options.appId,
    targetDir: target,
    status: 'cloned',
    retriedWithNewPat,
    transientRetries,
  };
}

export async function pushMakerProject(
  options: PushMakerProjectOptions
): Promise<PushMakerProjectResult> {
  ensureGitAvailable();
  const cwd = path.resolve(options.cwd);
  if (!isGitRepo(cwd)) {
    throw new Error(`${cwd} is not a git repository.`);
  }

  const configPath = path.join(cwd, '.maker-mcp', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`${cwd} is not bound to a Maker project. .maker-mcp/config.json is missing.`);
  }
  const project = loadProjectConfig(cwd);
  if (!project?.project_id) {
    throw new Error(`${cwd} Maker project config does not contain project_id.`);
  }

  await ensureAuthenticatedOrigin({
    cwd,
    appId: project.project_id,
    jwt: options.jwt,
    forcePat: options.forcePat,
  });

  const statusBefore = await readGit(['status', '--porcelain'], cwd);
  const branch = await currentBranch(cwd, options.branch);
  if (!statusBefore.trim() && !options.allowEmpty) {
    return {
      branch,
      committed: false,
      message: undefined,
      pushed: false,
      status: 'clean',
    };
  }

  if (options.files?.length) {
    await runGit(['add', ...options.files], { cwd });
  } else {
    await runGit(['add', '-A'], { cwd });
  }

  const staged = await readGit(['diff', '--cached', '--name-only'], cwd);
  let committed = false;
  let commitHash: string | undefined;
  const message = options.message || generateCommitMessage(statusBefore);
  if (staged.trim() || options.allowEmpty) {
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

  try {
    await pushGit(['push', 'origin', `HEAD:${branch}`], cwd);
  } catch (error) {
    const failure = toMakerGitFailure(error, 'push');
    return {
      branch,
      committed,
      commitHash,
      message,
      pushed: false,
      status: committed ? 'failed_after_commit' : 'clean',
      failure,
      ahead: await readAheadState(cwd),
    };
  }

  return {
    branch,
    committed,
    commitHash,
    message,
    pushed: true,
    status: 'pushed',
  };
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

async function readAheadState(cwd: string): Promise<string | undefined> {
  try {
    const status = await readGit(['status', '--short', '--branch'], cwd);
    return status.split('\n')[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
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
  const stderr = input.stderr?.trim() || '';
  const stdout = input.stdout?.trim() || '';
  const text = `${stdout}\n${stderr}`.trim();
  const classification = classifyGitFailure(text);
  return {
    stage: input.stage,
    command: input.command,
    exitCode: input.exitCode,
    stdout,
    stderr,
    message: text || `${input.stage} failed`,
    classification,
    nextAction: nextActionForFailure(classification),
  };
}

function classifyGitFailure(message: string): MakerGitFailure['classification'] {
  if (/ENOENT|not found|cannot find|spawn git/i.test(message)) {
    return 'git_missing';
  }

  if (
    /authentication|authorization|401|403|forbidden|unauthorized|could not read username/i.test(
      message
    )
  ) {
    return 'auth';
  }

  if (
    /502|503|504|Bad Gateway|Service Unavailable|Gateway Timeout|connection reset|remote end hung up/i.test(
      message
    )
  ) {
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

function nextActionForFailure(classification: MakerGitFailure['classification']): string {
  switch (classification) {
    case 'git_missing':
      return '本机未检测到可用的 Git。请用户自行安装 Git，并在 `git --version` 可用后重启 MCP 客户端再重试；安装前不要执行 clone、fetch、commit 或 push。';
    case 'auth':
      return '刷新 Maker PAT/JWT 后重试 maker_push_current_directory；如果仍失败，重新走 Tap 登录和 maker_exchange_jwt。';
    case 'remote_transient':
      return '远端 Maker git 服务临时不可用。不要重新提交，稍后直接重试 maker_push_current_directory。';
    case 'remote_rejected':
      return '远端已有新提交。不要新建分支或要任务号，先询问用户是否 pull/rebase 当前 Maker 远端变更，再重试 push。';
    case 'local':
      return '本地目录或权限异常。检查当前目录是否是 Maker git repo，以及 Codex 是否有目录写权限。';
    default:
      return '保留本地提交，不要重复提交；把错误详情反馈给用户，并在确认后重试 push。';
  }
}

function pushGit(args: string[], cwd: string): Promise<void> {
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

async function ensureAuthenticatedOrigin(options: {
  cwd: string;
  appId: string;
  jwt?: string;
  forcePat?: boolean;
}): Promise<void> {
  const pat = await requestMakerPat({
    jwt: options.jwt,
    name: 'first-pat',
    force: options.forcePat,
  });
  const gitBase = getMakerGitBase();
  const gitUrl = `${gitBase}/${options.appId}.git`;
  const authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);

  await setOrigin(options.cwd, authUrl);
}

function makeAuthenticatedGitUrl(gitUrl: string, pat: string): string {
  return gitUrl.replace(/^https:\/\//, `https://git:${encodeURIComponent(pat)}@`);
}

function hasNonIgnorableFiles(target: string): boolean {
  if (!fs.existsSync(target)) {
    return false;
  }

  return fs.readdirSync(target).some((entry) => entry !== '.maker-mcp' && entry !== '.DS_Store');
}

async function setOrigin(cwd: string, authUrl: string): Promise<void> {
  await runGit(['remote', 'get-url', 'origin'], { cwd, quiet: true })
    .then(() => runGit(['remote', 'set-url', 'origin', authUrl], { cwd, quiet: true }))
    .catch(() => runGit(['remote', 'add', 'origin', authUrl], { cwd, quiet: true }));
}

function isGitRepo(repoDir: string): boolean {
  try {
    const gitDir = readGitSync(['-C', repoDir, 'rev-parse', '--git-dir']);
    return gitDir.trim().length > 0;
  } catch {
    return false;
  }
}

async function currentBranch(cwd: string, explicitBranch?: string): Promise<string> {
  if (explicitBranch) {
    return explicitBranch;
  }

  const branch = await readGit(['branch', '--show-current'], cwd);
  return branch.trim() || 'main';
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
  }
): Promise<number> {
  return runWithTransientRetry(() => runGit(args, options));
}

async function runGitCaptureWithTransientRetry(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
  } = {}
): Promise<number> {
  return runWithTransientRetry(() => runGitCapture(args, options));
}

async function runWithTransientRetry(operation: () => Promise<void>): Promise<number> {
  let retries = 0;
  const maxRetries = 2;

  for (;;) {
    try {
      await operation();
      return retries;
    } catch (error) {
      if (retries >= maxRetries || !isTransientGitRemoteError(error)) {
        throw error;
      }

      retries += 1;
      await sleep(1500 * retries);
    }
  }
}

function isTransientGitRemoteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /502|503|504|Bad Gateway|Service Unavailable|Gateway Timeout|The requested URL returned error: 5\d\d/i.test(
    message
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGitCapture(
  args: string[],
  options: {
    cwd?: string;
    sanitize?: string;
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
