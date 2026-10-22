/**
 * Maker git failure model: classification, retry decision and next actions.
 */

import { GitCommandError } from './exec.js';

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
    | 'cloud_workspace_blocked'
    | 'merge_conflict'
    | 'remote_rejected'
    | 'local'
    | 'unknown';
  retryable: boolean;
  retryReason?: string;
  retryAttempts?: number;
  /** Files that conflicted when merging the Maker remote (merge was aborted). */
  conflictFiles?: string[];
  nextAction: string;
}

export interface MakerGitRetryDecision {
  retry: boolean;
  reason?: string;
  fallbackHttpVersion?: 'HTTP/1.1';
}

export class MakerGitError extends Error {
  readonly failure: MakerGitFailure;

  constructor(failure: MakerGitFailure) {
    super(failure.message);
    this.name = 'MakerGitError';
    this.failure = failure;
  }
}

/**
 * Messages from the Maker server repository (`receive.denyCurrentBranch=updateInstead`)
 * when the cloud workspace has uncommitted changes and cannot accept a push.
 */
const CLOUD_WORKSPACE_BLOCKED_PATTERN =
  /Working directory has (?:unstaged|staged) changes|Could not update working tree to new HEAD/i;

export function isCloudWorkspaceBlockedMessage(message: string): boolean {
  return CLOUD_WORKSPACE_BLOCKED_PATTERN.test(message);
}

export function toMakerGitFailure(error: unknown, stage: string): MakerGitFailure {
  if (error instanceof MakerGitError) {
    return error.failure;
  }
  if (error instanceof GitCommandError) {
    return createGitFailure({
      stage,
      command: error.command,
      exitCode: error.exitCode,
      stdout: error.stdout,
      stderr: error.stderr || error.message,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return createGitFailure({
    stage,
    stderr: message,
  });
}

export function createGitFailure(input: {
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

export function redactGitSecrets(value: string): string {
  return value.replace(/(https?:\/\/[^:\s/@]+:)[^@\s]+@/g, '$1***@');
}

export function classifyGitFailure(message: string): MakerGitFailure['classification'] {
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

  if (isCloudWorkspaceBlockedMessage(message)) {
    return 'cloud_workspace_blocked';
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
    /curl\s+92\b|HTTP\/2 stream.*not closed cleanly|HTTP\/2.{0,80}(?:not supported|unsupported)|(?:server|remote).{0,80}does not support HTTP\/2/i.test(
      text
    )
  ) {
    return {
      retry: true,
      reason: 'http2_transport_error',
      fallbackHttpVersion: 'HTTP/1.1',
    };
  }

  if (
    /connection reset|connection refused|connection closed|remote end hung up|unexpected disconnect|early EOF|RPC failed|index-pack failed|SSL_ERROR_SYSCALL|curl\s+(?:18|28|35|52|55|56)/i.test(
      text
    )
  ) {
    return { retry: true, reason: 'connection_interrupted' };
  }

  return { retry: false };
}

function isNonRetryableGitFailure(message: string): boolean {
  return (
    isCloudWorkspaceBlockedMessage(message) ||
    /authentication|authorization|401|403|forbidden|unauthorized|could not read username|repository not found|only refs\/heads\/main is accepted|matches forbidden pattern|forbidden pattern|not a git repository|not empty|already exists and is not an empty directory|permission denied|Operation not permitted|non-fast-forward|fetch first|rejected|failed to push some refs|would be overwritten|conflicting local files/i.test(
      message
    )
  );
}

export function nextActionForFailure(classification: MakerGitFailure['classification']): string {
  switch (classification) {
    case 'git_missing':
      return '本机未检测到可用的 Git。请用户自行安装 Git，并在 `git --version` 可用后重启 MCP 客户端再重试；安装前不要执行 clone、fetch、commit 或 push。';
    case 'auth':
      return 'Maker Git 鉴权失败。请运行 `taptap-maker login` 重新完成 Maker 登录授权后重试。';
    case 'remote_transient':
      return '远端 Maker git 服务临时不可用。本地 commit 会保留，稍后直接重试 maker_build_current_directory。';
    case 'branch_not_allowed':
      return 'Maker 远端只接受 main 分支提交。当前本地 commit 已保留但未推送；不要新建分支。请切回 main 分支（必要时从 origin/main 创建 main），把这次本地 commit cherry-pick 到 main 后，再重试 maker_build_current_directory。';
    case 'forbidden_path':
      return '本地 commit 包含 Maker 远端禁止提交的路径或目录。远端 pre-receive hook 已返回具体 forbidden pattern；这不是鉴权问题，不要刷新 Maker PAT。请按 stderr 中的 pattern 找到对应文件，把这些路径从本地 commit 移除（例如保留工作区文件但取消跟踪后修正当前未推送 commit），确认 git status 不再包含这些路径后，再重试 maker_build_current_directory。';
    case 'cloud_workspace_blocked':
      return 'Maker 云端工作区有未提交改动，远端拒绝了本次推送，自动提交云端改动未完成。请按 failure 信息处理，或运行 `taptap-maker git cloud-status --target-dir <项目目录>` 查看云端改动后重试 maker_build_current_directory。';
    case 'merge_conflict':
      return '合并 Maker 远端 main 时发生冲突，已自动取消合并，本地提交和文件保持原样。请读取 failure.conflict_files 中文件的本地内容和 origin/main 的对应版本，确认保留方案后修改并提交，再重试 maker_build_current_directory。';
    case 'remote_rejected':
      return '远端拒绝了本次推送。运行 `taptap-maker git sync --target-dir <项目目录>` 拉取并合并远端 main 后，再重试 maker_build_current_directory；不要新建分支。';
    case 'local':
      return '本地目录或权限异常。检查当前目录是否是 Maker git repo，以及 AI 客户端是否有目录写权限。';
    default:
      return '保留本地提交，不要重复提交；把错误详情反馈给用户，并在确认后重试 maker_build_current_directory。';
  }
}

export function getMakerGitRetryDecisionFromError(error: unknown): MakerGitRetryDecision {
  if (error instanceof MakerGitError) {
    return getMakerGitRetryDecision(
      [error.failure.stdout, error.failure.stderr, error.failure.message].filter(Boolean).join('\n')
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return getMakerGitRetryDecision(message);
}

export function appendRetryExhausted(
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
