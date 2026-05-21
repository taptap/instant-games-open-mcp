/**
 * Identify the current Maker project from explicit args, env, or cwd.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerIdentifyResult, MakerProjectConfig } from '../types.js';
import { getProjectConfigPath, getProjectMarkerDirName } from '../storage.js';
import { TEMP_MAKER_PAT_TOKENS_URL } from '../config.js';

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
    '常见触发意图：我要开发maker游戏 / 本地maker开发 / 拉取maker游戏到本地 / 把maker游戏代码拉到本地 / 初始化maker开发目录。',
    '在 Codex/MCP 场景下，请不要运行 shell 命令 `taptap-maker init`。',
    '初始化前必须先调用 `maker_status` 确认本机 Git 可用。若 Git 缺失，只能提示用户自行安装 Git；在 `git --version` 可用前不要执行 clone。',
    '请按完整 MCP 工具流程初始化当前目录；当前默认使用 Maker PAT 获取 app 列表并执行 clone 和提交。',
    '',
    '1. 调用 `maker_status`，确认 Git 已安装。',
    `2. 如果还没有 PAT，主动让用户打开临时 PAT 页面 ${TEMP_MAKER_PAT_TOKENS_URL} 新建 PAT，并把 PAT 发给你。`,
    '3. 调用 `maker_exchange_pat` 把 PAT 作为 `manual_pat` 保存；工具会自动获取 TapTap token 并列出可用 Maker Apps。',
    '4. 必须把 app 列表展示给用户，让用户选择。',
    '5. 用户选择后，调用 `maker_clone_to_current_directory` 把代码拉到当前对话目录。',
    '6. 如果 PAT 获取 TapTap token 失败，请确认 PAT 是否有效后重新调用 `maker_exchange_pat`。',
    '',
    `clone 成功后会在当前目录写入 ${getProjectMarkerDirName()}/config.json。`,
  ].join('\n');
}
