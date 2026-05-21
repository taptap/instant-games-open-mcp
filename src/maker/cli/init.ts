/**
 * taptap-maker init command.
 */

import path from 'node:path';
import { saveProjectConfig } from '../storage.js';
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
        'Usage: taptap-maker init --stage=clone --app-id <id> --target <dir> --pat <pat>'
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

  process.stdout.write(
    [
      'taptap-maker init is ready for PAT-first Maker onboarding.',
      '',
      'Current PAT flow:',
      '  1. Get a Maker PAT from the Maker backend or admin UI.',
      '  2. Run taptap-maker login --pat <maker_pat>',
      '',
      'Agent-friendly stages after PAT is saved:',
      '  taptap-maker projects list --json',
      '  taptap-maker init --stage=clone --app-id <id> --target .',
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
