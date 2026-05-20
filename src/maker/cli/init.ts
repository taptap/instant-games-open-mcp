/**
 * taptap-maker init command.
 */

import path from 'node:path';
import { saveProjectConfig } from '../storage.js';
import { getMakerWebUrl } from '../config.js';
import { getStringFlag } from './common.js';
import { runInstall } from './install.js';
import { runLogin } from './login.js';
import { runProjects } from './projects.js';

export async function runInit(flags: Record<string, string | boolean>): Promise<void> {
  const stage = getStringFlag(flags, 'stage');

  if (stage === 'login') {
    await runLogin(flags);
    return;
  }

  if (stage === 'clone') {
    const projectId = getStringFlag(flags, 'project-id') || getStringFlag(flags, 'app-id');
    const target = getStringFlag(flags, 'target') || '.';
    if (!projectId) {
      throw new Error(
        'Usage: taptap-maker init --stage=clone --app-id <id> --target <dir> --jwt <jwt>'
      );
    }

    await runProjects(['clone', projectId, target], flags);
    await runInstall({ ide: getStringFlag(flags, 'ide') || 'codex' });
    printRestartHint();
    return;
  }

  const projectId = getStringFlag(flags, 'project-id') || getStringFlag(flags, 'app-id');
  if (projectId) {
    const target = path.resolve(getStringFlag(flags, 'target') || '.');
    saveProjectConfig(target, {
      project_id: projectId,
      sce_endpoint: getStringFlag(flags, 'sce-endpoint') || process.env.SCE_MCP_URL,
    });
    await runInstall({ ide: getStringFlag(flags, 'ide') || 'codex' });
    process.stdout.write(`✓ Bound Maker project ${projectId} to ${target}\n`);
    printRestartHint();
    return;
  }

  const makerWebUrl = getMakerWebUrl();
  process.stdout.write(
    [
      'taptap-maker init is ready, but Maker API endpoints are not fully configured.',
      '',
      'Current JWT flow:',
      `  1. Open ${makerWebUrl} in Chrome and sign in.`,
      '  2. Open DevTools -> Application -> Local storage.',
      '  3. Find `taptap_access_token` and give me its value.',
      '  4. Run taptap-maker login --jwt <taptap_access_token>',
      '',
      'Agent-friendly stages after JWT is saved:',
      '  taptap-maker projects list --json',
      '  taptap-maker init --stage=clone --app-id <id> --target . --jwt <jwt>',
      '',
      'For local dry binding:',
      '  taptap-maker init --app-id <id> --target . --sce-endpoint <url>',
      '',
    ].join('\n')
  );
}

function printRestartHint(): void {
  process.stdout.write('✓ 初始化完成。请重启 MCP 客户端以加载 taptap-maker。\n');
}
