/**
 * Maker Git environment detection and user guidance.
 */

import { spawnSync } from 'node:child_process';

export interface MakerGitEnvironment {
  platform: NodeJS.Platform;
  command: string;
  installed: boolean;
  version?: string;
  error?: string;
  spawnErrorCode?: string;
  verifyCommand: string;
  installGuide: string[];
}

export class MakerGitNotFoundError extends Error {
  readonly environment: MakerGitEnvironment;

  constructor(environment: MakerGitEnvironment) {
    super(formatGitMissingMessage(environment));
    this.name = 'MakerGitNotFoundError';
    this.environment = environment;
  }
}

export function getGitCommand(): string {
  return process.env.TAPTAP_MAKER_GIT_BIN || 'git';
}

export function checkGitEnvironment(): MakerGitEnvironment {
  const command = getGitCommand();
  const verifyCommand = `${command} --version`;
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  const version = result.stdout?.trim();
  const error =
    result.error?.message ||
    (result.status && result.status !== 0 ? result.stderr?.trim() : undefined);
  const spawnErrorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;

  return {
    platform: process.platform,
    command,
    installed: result.status === 0 && !!version,
    version: version || undefined,
    error: error || undefined,
    spawnErrorCode,
    verifyCommand,
    installGuide: isGitSpawnDenied(spawnErrorCode)
      ? [
          '请用同一个 Node 在普通终端和当前客户端分别测试启动 Git，确认是否只有当前宿主限制子进程。',
          '若普通终端成功、当前客户端仍返回 EPERM/EACCES，请检查工作区权限或联系管理员确认进程执行策略。无需重装 Git 或刷新 PAT。',
        ]
      : createGitInstallGuide(process.platform),
  };
}

export function ensureGitAvailable(): MakerGitEnvironment {
  const environment = checkGitEnvironment();
  if (!environment.installed) {
    throw new MakerGitNotFoundError(environment);
  }
  return environment;
}

export function isGitSpawnDenied(code?: string): boolean {
  return code === 'EPERM' || code === 'EACCES';
}

export function createGitInstallGuide(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return [
      'Maker MCP 需要本机可执行的 Git，但不会代替用户安装 Git。',
      'macOS 用户请先在终端执行 `git --version`。',
      '如果系统弹出 Xcode Command Line Tools 安装提示，请由用户自行确认安装。',
      '也可以由用户自行访问 https://git-scm.com/download/mac 下载官方 macOS 安装器。',
      '安装完成后，请重启当前 MCP 客户端或终端，再重新执行 `git --version` 验证。',
    ];
  }

  if (platform === 'win32') {
    return [
      'Maker MCP 需要本机可执行的 Git，但不会代替用户安装 Git。',
      'Windows 用户请自行访问 https://git-scm.com/download/win 下载 Git for Windows。',
      '安装时建议选择 “Git from the command line and also from 3rd-party software”，确保 MCP 客户端能在 PATH 中找到 git。',
      '如果用户使用 winget，可以自行在 PowerShell 中执行 `winget install --id Git.Git -e --source winget`。',
      '安装完成后，请重启当前 MCP 客户端或终端，再执行 `git --version` 验证。',
      '如果 Git 已安装但仍检测不到，可设置 TAPTAP_MAKER_GIT_BIN 为 git.exe 的完整路径。',
    ];
  }

  return [
    'Maker MCP 需要本机可执行的 Git，但不会代替用户安装 Git。',
    '请用户使用当前操作系统的包管理器或访问 https://git-scm.com/downloads 安装 Git。',
    '安装完成后，请重启当前 MCP 客户端或终端，再执行 `git --version` 验证。',
    '如果 Git 已安装但仍检测不到，可设置 TAPTAP_MAKER_GIT_BIN 为 Git 可执行文件完整路径。',
  ];
}

export function formatGitEnvironmentStatus(environment: MakerGitEnvironment): string {
  return [
    `- platform: ${environment.platform}`,
    `- git_installed: ${environment.installed ? 'yes' : 'no'}`,
    `- git_command: ${environment.command}`,
    environment.version ? `- git_version: ${environment.version}` : '',
    environment.error ? `- git_error: ${environment.error}` : '',
    environment.spawnErrorCode ? `- git_spawn_error_code: ${environment.spawnErrorCode}` : '',
    `- git_verify_command: ${environment.verifyCommand}`,
    environment.installed ? '' : formatGitInstallGuide(environment),
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatGitInstallGuide(environment: MakerGitEnvironment): string {
  return [
    isGitSpawnDenied(environment.spawnErrorCode) ? 'Git 启动权限排查：' : 'Git 安装引导：',
    ...environment.installGuide.map((line) => `- ${line}`),
  ].join('\n');
}

function formatGitMissingMessage(environment: MakerGitEnvironment): string {
  return [
    isGitSpawnDenied(environment.spawnErrorCode)
      ? '当前 Maker 进程无权限启动 Git；这不表示 Git 未安装。'
      : '本机未检测到可用的 Git。Maker MCP 不会代替用户安装 Git。',
    '',
    `- platform: ${environment.platform}`,
    `- git_command: ${environment.command}`,
    environment.error ? `- error: ${environment.error}` : '',
    '',
    formatGitInstallGuide(environment),
    '',
    '在当前 Maker 进程可以启动 `git --version` 前，不会执行 clone、fetch、commit 或 push。',
  ]
    .filter(Boolean)
    .join('\n');
}
