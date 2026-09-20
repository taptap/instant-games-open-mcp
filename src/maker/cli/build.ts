import { previewProject } from '../preview/protocol.js';
import { getMakerEnvironment } from '../config.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { isMakerBuildActivitySuccessful } from '../tracking.js';
import type { buildCurrentDirectory, formatBuildResult } from '../server/mcp.js';

type BuildDependencies = {
  build: typeof buildCurrentDirectory;
  access: () => Promise<{ blocked: boolean; message?: string }>;
  format: typeof formatBuildResult;
};

export async function executeBuildCommand(
  directory: string,
  injected?: BuildDependencies
): Promise<{
  ok: boolean;
  unknown?: boolean;
  error?: string;
  summary?: string;
  result?: unknown;
}> {
  const project = previewProject(directory);
  const deps = injected || (await defaultDependencies());
  const access = await deps.access();
  if (access.blocked) return { ok: false, error: access.message || 'Maker access restricted.' };
  const startedAt = Date.now();
  let progressEvents = 0;
  const result = await deps.build({
    targetDir: project,
    onProgress: (progress) => {
      progressEvents++;
      process.stderr.write(JSON.stringify(sanitizeDiagnosticValue(progress)) + '\n');
    },
  });
  const ok = isMakerBuildActivitySuccessful(result.mode);
  const unknown =
    result.mode === 'build_failed_after_submit' &&
    result.buildFailure.name !== 'RemoteBuildFailedError' &&
    !Object.prototype.hasOwnProperty.call(result.buildFailure, 'remote_result');
  const elapsedMs = Date.now() - startedAt;
  const summary = deps.format(result, {
    elapsedMs,
    elapsed: `${Math.round(elapsedMs / 1000)}s`,
    progressEvents,
  });
  return sanitizeDiagnosticValue({
    ok,
    unknown,
    summary,
    result,
    ...(!ok ? { error: summary } : {}),
  }) as {
    ok: boolean;
    unknown: boolean;
    summary: string;
    result: unknown;
    error?: string;
  };
}

async function defaultDependencies(): Promise<BuildDependencies> {
  const mcp = await import('../server/mcp.js');
  return {
    build: mcp.buildCurrentDirectory,
    format: mcp.formatBuildResult,
    access: () => mcp.resolveMakerMcpAccessState(getMakerEnvironment()),
  };
}

export async function runBuildCli(options: Record<string, string | boolean>): Promise<void> {
  let result: any;
  try {
    result = await executeBuildCommand(
      typeof options.target_dir === 'string' ? options.target_dir : ''
    );
  } catch (error) {
    result = {
      ok: false,
      error: sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error)),
    };
  }
  process.stdout.write(JSON.stringify(result, null, options.json ? undefined : 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}
