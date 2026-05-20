/**
 * Identify the current Maker project from explicit args, env, or cwd.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerIdentifyResult, MakerProjectConfig } from '../types.js';
import { getProjectConfigPath, getProjectMarkerDirName } from '../storage.js';

function parseConfig(configPath: string): MakerProjectConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as MakerProjectConfig;
    return parsed?.project_id ? parsed : null;
  } catch {
    return null;
  }
}

export function findProjectConfig(startDir: string = process.cwd()): MakerIdentifyResult {
  let current = path.resolve(startDir);

  while (current.length > 0) {
    const configPath = getProjectConfigPath(current);
    if (fs.existsSync(configPath)) {
      const config = parseConfig(configPath);
      if (config) {
        return {
          projectId: config.project_id,
          configPath,
          projectRoot: current,
          config,
          source: 'cwd',
        };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { source: 'none' };
    }
    current = parent;
  }

  return { source: 'none' };
}

export function identifyMakerProject(options?: {
  projectId?: string;
  cwd?: string;
}): MakerIdentifyResult {
  if (options?.projectId) {
    return {
      projectId: options.projectId,
      source: 'argv',
    };
  }

  if (process.env.MAKER_PROJECT_ID) {
    return {
      projectId: process.env.MAKER_PROJECT_ID,
      source: 'env',
    };
  }

  return findProjectConfig(options?.cwd || process.cwd());
}

export function formatIdentifyHint(): string {
  return [
    '当前目录尚未绑定 Maker 项目。',
    '',
    '在 Codex/MCP 场景下，请不要运行 shell 命令 `taptap-maker init`。',
    '初始化前必须先确认本机 Git 可用。若 `maker_status` 或 `maker_check_environment` 显示 Git 缺失，只能提示用户自行安装 Git；在 `git --version` 可用前不要执行 clone。',
    '请按完整 MCP 工具流程初始化当前目录，不要因为本地已有缓存 JWT 而跳过登录流程：',
    '',
    '1. 调用 `maker_check_environment` 或查看 `maker_status`，确认 Git 已安装。',
    '2. 调用 `maker_tap_login_start`，展示扫码/授权链接。',
    '3. 用户在对话框输入“已授权”后，调用 `maker_tap_login_complete`。',
    '4. 调用 `maker_exchange_jwt`。当前实现可以使用缓存或手动提供的 JWT，但流程上必须保留这一步。',
    '5. 调用 `maker_list_apps` 列出可用 Maker Apps。',
    '6. 必须把 app 列表展示给用户，让用户选择。',
    '7. 用户选择后，调用 `maker_clone_to_current_directory` 把代码拉到当前对话目录。',
    '',
    `clone 成功后会在当前目录写入 ${getProjectMarkerDirName()}/config.json。`,
  ].join('\n');
}
