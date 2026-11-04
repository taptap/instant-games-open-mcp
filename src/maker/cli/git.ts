/**
 * `taptap-maker git <subcommand>`: Maker Git capabilities for local AI agents.
 */

import path from 'node:path';
import { loadProjectConfig } from '../storage.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import {
  CloudGitError,
  commitCloudGit,
  ensureAuthenticatedOrigin,
  ensureGitAvailable,
  getCloudGitDiff,
  getCloudGitStatus,
  inspectMakerRemoteSyncStatus,
  pushMakerProject,
  resolveCloudAppId,
  resolveUsableMakerGitWorkspace,
  syncMakerProject,
} from '../git/index.js';

export const GIT_CLI_USAGE = [
  '  taptap-maker git status [--target-dir DIR]          # local state + ahead/behind (fetches)',
  '  taptap-maker git sync [--target-dir DIR]            # fetch, fast-forward or merge origin/main',
  '  taptap-maker git push [--target-dir DIR] [--message MSG]',
  '                                                      # sync, commit, push; commits blocking cloud changes',
  '  taptap-maker git cloud-status [--target-dir DIR]',
  '  taptap-maker git cloud-diff [--target-dir DIR] [--path PATH] [--staged]',
  '  taptap-maker git cloud-commit [--target-dir DIR] --message MSG (--all | PATH...)',
  '                                [--expected-head SHA]',
];

type Options = Record<string, string | boolean>;

export async function runGitCli(
  subcommand: string | undefined,
  options: Options,
  positionals: string[]
): Promise<void> {
  let result: Record<string, unknown>;
  try {
    result = await executeGitCommand(subcommand, options, positionals);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(
    JSON.stringify(sanitizeDiagnosticValue(result), null, options.json ? undefined : 2) + '\n'
  );
  if (!result.ok) process.exitCode = 1;
}

export async function executeGitCommand(
  subcommand: string | undefined,
  options: Options,
  positionals: string[]
): Promise<Record<string, unknown>> {
  const targetDir = path.resolve(
    typeof options.target_dir === 'string' ? options.target_dir : process.cwd()
  );
  const message = typeof options.message === 'string' ? options.message : undefined;
  switch (subcommand) {
    case 'status': {
      const status = await inspectMakerRemoteSyncStatus(targetDir);
      return { ok: !status.failure, ...status };
    }
    case 'sync': {
      ensureGitAvailable();
      const { projectRoot } = resolveUsableMakerGitWorkspace(targetDir);
      const appId = loadProjectConfig(projectRoot)?.project_id;
      if (appId) await ensureAuthenticatedOrigin({ cwd: projectRoot, appId });
      const sync = await syncMakerProject(projectRoot);
      return {
        ok: ['updated', 'up_to_date', 'ahead'].includes(sync.outcome),
        projectRoot,
        ...sync,
      };
    }
    case 'push': {
      const push = await pushMakerProject({ cwd: targetDir, message });
      return { ok: !push.failure && (push.pushed || push.status === 'clean'), ...push };
    }
    case 'cloud-status': {
      const appId = cloudAppId(targetDir);
      return { ok: true, appId, ...(await getCloudGitStatus(appId)) };
    }
    case 'cloud-diff': {
      const appId = cloudAppId(targetDir);
      const diff = await getCloudGitDiff(appId, {
        path: typeof options.path === 'string' ? options.path : undefined,
        staged: options.staged === true,
      });
      return { ok: true, appId, ...diff };
    }
    case 'cloud-commit': {
      const appId = cloudAppId(targetDir);
      if (!message?.trim()) throw new Error('cloud-commit requires --message MSG.');
      const all = options.all === true;
      if (all === positionals.length > 0) {
        throw new Error('cloud-commit requires exactly one of --all or PATH arguments.');
      }
      const expectedHead =
        typeof options.expected_head === 'string'
          ? options.expected_head
          : (await getCloudGitStatus(appId)).head || undefined;
      try {
        const commit = await commitCloudGit(appId, {
          message,
          expectedHead,
          ...(all ? { all: true as const } : { paths: positionals }),
        });
        return { ok: true, appId, ...commit };
      } catch (error) {
        if (error instanceof CloudGitError && error.outcomeUnknown) {
          return {
            ok: false,
            appId,
            outcomeUnknown: true,
            error: `${error.message}。提交可能已经成功：先运行 taptap-maker git cloud-status 确认，不要直接重试 cloud-commit。`,
          };
        }
        throw error;
      }
    }
    default:
      throw new Error(
        ['Unknown taptap-maker git subcommand.', 'Usage:', ...GIT_CLI_USAGE].join('\n')
      );
  }
}

function cloudAppId(targetDir: string): string {
  return resolveCloudAppId(resolveUsableMakerGitWorkspace(targetDir).projectRoot);
}
