/**
 * Identify the current Maker project from explicit args, env, or cwd.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerIdentifyResult, MakerProjectConfig } from '../types.js';
import { getProjectConfigPath, getProjectMarkerDirName } from '../storage.js';
import { getMakerPatTokensUrl } from '../config.js';

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
    '初始化流程请参考 taptap-maker-local skill。',
    `Maker PAT 页面：${getMakerPatTokensUrl()}`,
    '',
    `clone 成功后会在当前目录写入 ${getProjectMarkerDirName()}/config.json。`,
  ].join('\n');
}
