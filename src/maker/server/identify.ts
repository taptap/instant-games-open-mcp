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
    '请按完整 MCP 工具流程初始化当前目录；当前 JWT 过渡方案优先让用户从 Maker 网页复制 `taptap_access_token`：',
    '',
    '1. 调用 `maker_check_environment` 或查看 `maker_status`，确认 Git 已安装。',
    `2. 让用户在 Chrome 打开 Maker 网页 ${makerWebUrl} 并确认已登录。`,
    '3. 引导用户打开 DevTools -> Application -> Local storage。',
    '4. 让用户找到 `taptap_access_token` 并拿到它的 value 给我。',
    '5. 调用 `maker_exchange_jwt`，把该 value 作为 `manual_jwt` 传入并保存。',
    '6. 调用 `maker_list_apps` 列出可用 Maker Apps。',
    '7. 必须把 app 列表展示给用户，让用户选择。',
    '8. 用户选择后，调用 `maker_clone_to_current_directory` 把代码拉到当前对话目录。',
    '',
    'OAuth device flow 工具仍保留为兼容路径，但不是当前默认引导。',
    '',
    `clone 成功后会在当前目录写入 ${getProjectMarkerDirName()}/config.json。`,
  ].join('\n');
}
