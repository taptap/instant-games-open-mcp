/**
 * Maker cloud workspace Git API: status, diff and commit of the project's
 * server-side workspace. Authenticated with the user-level Maker PAT.
 */

import { requireMakerPat } from '../auth/pat.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';
import { fetchWithTimeout } from '../fetchTimeout.js';
import { loadProjectConfig } from '../storage.js';

export interface CloudGitStatusFile {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  originalPath?: string;
}

export interface CloudGitStatus {
  gitMode: 'standard' | 'bare';
  branch: string | null;
  head: string | null;
  clean: boolean;
  files: CloudGitStatusFile[];
}

export interface CloudGitDiff {
  patch: string;
  staged: boolean;
}

export interface CloudGitCommitResult {
  status: 'committed' | 'noop';
  commitSha: string | null;
  changedFiles: number;
}

export type CloudGitCommitInput = {
  message: string;
  expectedHead?: string;
} & ({ paths: string[]; all?: undefined } | { all: true; paths?: undefined });

export class CloudGitError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: string,
    /** True when a commit request may have succeeded (timeout, network error, 5xx, or a lost success body). */
    readonly outcomeUnknown = false
  ) {
    super(message);
    this.name = 'CloudGitError';
  }
}

const READ_TIMEOUT_MS = 15_000;
const COMMIT_TIMEOUT_MS = 60_000;

export function resolveCloudAppId(projectRoot: string): string {
  const appId = loadProjectConfig(projectRoot)?.project_id;
  if (!appId) {
    throw new Error(`${projectRoot} is not bound to a Maker project (.maker-mcp/config.json).`);
  }
  return appId;
}

function cloudGitUrl(appId: string, action: 'status' | 'diff' | 'commit'): URL {
  const apiBase = requireMakerEndpoint('apiBase', getMakerEndpoints().apiBase).replace(/\/$/, '');
  return new URL(`${apiBase}/apps/${encodeURIComponent(appId)}/git/${action}`);
}

export async function getCloudGitStatus(appId: string): Promise<CloudGitStatus> {
  return (await readJson(cloudGitUrl(appId, 'status'))) as CloudGitStatus;
}

export async function getCloudGitDiff(
  appId: string,
  options: { path?: string; staged?: boolean } = {}
): Promise<CloudGitDiff> {
  const url = cloudGitUrl(appId, 'diff');
  if (options.path) url.searchParams.set('path', options.path);
  if (options.staged !== undefined) url.searchParams.set('staged', String(options.staged));
  return (await readJson(url)) as CloudGitDiff;
}

/** Never retried: the API has no idempotency key. */
export async function commitCloudGit(
  appId: string,
  input: CloudGitCommitInput
): Promise<CloudGitCommitResult> {
  const body: Record<string, unknown> = { message: input.message };
  if (input.all) body.all = true;
  else body.paths = input.paths;
  if (input.expectedHead) body.expectedHead = input.expectedHead;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetch,
      cloudGitUrl(appId, 'commit').toString(),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      COMMIT_TIMEOUT_MS,
      'Maker cloud git commit'
    );
  } catch (error) {
    throw new CloudGitError(
      error instanceof Error ? error.message : String(error),
      0,
      undefined,
      true
    );
  }
  if (!response.ok) throw await responseError(response, response.status >= 500);
  try {
    return (await response.json()) as CloudGitCommitResult;
  } catch (error) {
    // Headers already said success. Losing the body must not look like a
    // definite failure, or the caller would skip cloud-status and might retry.
    throw new CloudGitError(
      `云端 Git 提交响应读取失败，提交可能已经成功（${
        error instanceof Error ? error.message : String(error)
      }）`,
      response.status,
      undefined,
      true
    );
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireMakerPat().token}`, Accept: 'application/json' };
}

async function readJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetch,
      url.toString(),
      { headers: authHeaders() },
      READ_TIMEOUT_MS,
      'Maker cloud git request'
    );
  } catch (error) {
    throw new CloudGitError(error instanceof Error ? error.message : String(error), 0);
  }
  if (!response.ok) throw await responseError(response);
  return response.json();
}

async function responseError(response: Response, outcomeUnknown = false): Promise<CloudGitError> {
  let code: string | undefined;
  let detail = '';
  try {
    const body = (await response.json()) as { code?: unknown; error?: unknown; message?: unknown };
    code = typeof body.code === 'string' ? body.code : undefined;
    detail = [body.error, body.message].filter((item) => typeof item === 'string').join(' ');
  } catch {
    // Non-JSON error body; the HTTP status is enough.
  }
  return new CloudGitError(
    `${cloudGitHint(response.status)}（HTTP ${response.status}${code ? ` ${code}` : ''}${detail ? `: ${detail}` : ''}）`,
    response.status,
    code,
    outcomeUnknown
  );
}

function cloudGitHint(status: number): string {
  switch (status) {
    case 401:
      return 'Maker 用户 PAT 无效或已过期，请运行 `taptap-maker login` 重新登录';
    case 403:
      return '没有该项目的云端 Git 权限（提交云端改动仅限项目 owner）';
    case 404:
      return '项目不存在或已删除';
    case 409:
      return '云端仓库当前不能提交（HEAD 已变化、云端存在暂存区内容、有未完成的 Git 操作或项目繁忙），请在 Maker 网页端检查后重试';
    case 413:
      return '请求或 Git 输出超出上限，请按单个路径查看';
    case 503:
    case 504:
      return '云端运行时暂不可用或正在唤醒，请稍后重试';
    default:
      return '云端 Git 请求失败';
  }
}
