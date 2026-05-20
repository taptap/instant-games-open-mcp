/**
 * Identify the current Maker project from explicit args, env, or cwd.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerIdentifyResult, MakerProjectConfig } from '../types.js';
import { getProjectConfigPath, getProjectMarkerDirName } from '../storage.js';
import { getMakerWebUrl } from '../config.js';

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
  const makerWebUrl = getMakerWebUrl();
  return [
    '当前目录尚未绑定 Maker 项目。',
    '',
    '在 Codex/MCP 场景下，请不要运行 shell 命令 `taptap-maker init`。',
    '初始化前必须先确认本机 Git 可用。若 `maker_status` 或 `maker_check_environment` 显示 Git 缺失，只能提示用户自行安装 Git；在 `git --version` 可用前不要执行 clone。',
    '请按完整 MCP 工具流程初始化当前目录；当前需要准备两类授权：Tap 登录用于远端 MCP tools，网页 JWT 用于 Maker API 和 Git PAT。',
    '',
    '1. 调用 `maker_check_environment` 或查看 `maker_status`，确认 Git 已安装。',
    '2. 调用 `maker_tap_login_start`，展示扫码/授权链接。',
    '3. 用户授权完成后，调用 `maker_tap_login_complete` 保存 Tap token。',
    `4. 让用户在 Chrome 打开 Maker 网页 ${makerWebUrl} 并确认已登录。`,
    '5. 引导用户打开 DevTools -> Application -> Local storage。',
    '6. 让用户找到 `taptap_access_token` 并拿到它的 value 给我。',
    '7. 调用 `maker_exchange_jwt`，把该 value 作为 `manual_jwt` 传入并保存。',
    '8. 调用 `maker_list_apps` 列出可用 Maker Apps。',
    '9. 必须把 app 列表展示给用户，让用户选择。',
    '10. 用户选择后，调用 `maker_clone_to_current_directory` 把代码拉到当前对话目录。',
    '',
    `clone 成功后会在当前目录写入 ${getProjectMarkerDirName()}/config.json。`,
  ].join('\n');
}
