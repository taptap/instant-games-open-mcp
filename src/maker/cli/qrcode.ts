import { previewProject } from '../preview/protocol.js';
import { getMakerEnvironment } from '../config.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import type { callRemoteProxyTool, inspectMakerQrcodeToolPreflight } from '../server/mcp.js';
import {
  inspectMakerQrcodePreflight,
  inspectMakerQrcodePreparation,
  type MakerQrcodePublication,
} from '../qrcodePreflight.js';
import { parseQrcodeInteraction, parseQrcodeRecovery } from '../qrcodeInteraction.js';
import { pushMakerProject } from './projects.js';

type QrcodeDependencies = {
  access: () => Promise<{ blocked: boolean; message?: string }>;
  preflight: typeof inspectMakerQrcodeToolPreflight;
  call: typeof callRemoteProxyTool;
  prepare: typeof inspectMakerQrcodePreflight;
  readiness: typeof inspectMakerQrcodePreparation;
  submit: typeof pushMakerProject;
};

export async function executeQrcodeCommand(
  directory: string,
  orientation?: string,
  injected?: QrcodeDependencies,
  options: { publication?: MakerQrcodePublication; confirmedBuild?: boolean } = {}
) {
  let requiresSync = options.confirmedBuild === true;
  try {
    const project = previewProject(directory);
    if (orientation !== undefined && !['landscape', 'portrait'].includes(orientation))
      throw new Error('Invalid confirmed screen orientation.');
    if ((orientation !== undefined || options.publication !== undefined) && !options.confirmedBuild)
      throw new Error(
        'Publishing choices require --confirmed-build to commit and push before generating the QR code.'
      );
    const deps = injected || (await defaultDependencies());
    const access = await deps.access();
    if (access.blocked)
      return { ok: false, requiresSync, error: access.message || 'Maker access restricted.' };
    const preparation = deps.readiness(project);
    if (preparation.status !== 'ready')
      return { ok: false, requiresSync, preparation, error: preparation.message };
    if (options.confirmedBuild) {
      const prepared = deps.prepare(project, orientation, options.publication);
      if (!prepared.ok) return { ok: false, requiresSync, error: prepared.message };
    }
    const preflight = deps.preflight(project, orientation);
    if (!preflight.ok) return { ok: false, requiresSync, error: preflight.message };
    if (options.confirmedBuild) {
      // Push's post-receive hook updates the server workspace. QR performs its own build/upload.
      const submission = await deps.submit({
        cwd: project,
        preserveQrcodeChoices: true,
        onProgress: (progress) =>
          process.stderr.write(JSON.stringify(sanitizeDiagnosticValue(progress)) + '\n'),
      });
      if (submission.failure || (!submission.pushed && submission.status !== 'clean'))
        return {
          ok: false,
          requiresSync: true,
          result: sanitizeDiagnosticValue(submission),
          error: String(
            sanitizeDiagnosticValue(
              [
                submission.failure?.message || '二维码配置提交失败。',
                submission.failure?.nextAction,
              ]
                .filter(Boolean)
                .join('\n')
            )
          ),
        };
    }
    requiresSync = false;
    const result = await deps.call({
      targetDir: project,
      name: 'generate_test_qrcode',
      args: {},
      onProgress: (progress) =>
        process.stderr.write(
          JSON.stringify(
            sanitizeDiagnosticValue({
              ...progress,
              phase: 'qrcode',
              message: progress.message || '正在生成测试二维码',
            })
          ) + '\n'
        ),
    });
    const content = Array.isArray(result.content) ? result.content : [];
    const summary = content
      .filter((item) => item.type === 'text')
      .map((item) => String(item.text))
      .join('\n');
    const interaction = result.isError ? parseQrcodeInteraction(summary) : undefined;
    const recovery = result.isError ? parseQrcodeRecovery(summary) : undefined;
    return sanitizeDiagnosticValue({
      ok: !result.isError,
      result,
      ...(result.isError ? { error: summary || '测试二维码生成失败，请查看完整结果。' } : {}),
      ...(interaction ? { interaction, unknown: true } : {}),
      ...(recovery ? { recovery, unknown: true } : {}),
      requiresSync: false,
    }) as { ok: boolean; result?: unknown; error?: string; unknown?: boolean };
  } catch (error) {
    const message = String(
      sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error))
    );
    const interaction = parseQrcodeInteraction(message);
    const recovery = parseQrcodeRecovery(message);
    return {
      ok: false,
      requiresSync,
      unknown:
        Boolean(interaction || recovery) ||
        (error as { executionState?: string })?.executionState === 'unknown',
      ...(interaction ? { interaction } : {}),
      ...(recovery ? { recovery } : {}),
      error: message,
    };
  }
}

async function defaultDependencies(): Promise<QrcodeDependencies> {
  const mcp = await import('../server/mcp.js');
  return {
    access: () => mcp.resolveMakerMcpAccessState(getMakerEnvironment()),
    preflight: mcp.inspectMakerQrcodeToolPreflight,
    call: mcp.callRemoteProxyTool,
    prepare: inspectMakerQrcodePreflight,
    readiness: inspectMakerQrcodePreparation,
    submit: pushMakerProject,
  };
}

export async function runQrcodeCli(options: Record<string, string | boolean>): Promise<void> {
  const result = await executeQrcodeCommand(
    typeof options.target_dir === 'string' ? options.target_dir : '',
    typeof options.confirmed_screen_orientation === 'string'
      ? options.confirmed_screen_orientation
      : undefined,
    undefined,
    {
      confirmedBuild: options.confirmed_build === true,
      ...(options.confirmed_title !== undefined ||
      options.confirmed_category !== undefined ||
      options.confirmed_developer_id !== undefined
        ? {
            publication: {
              ...(options.confirmed_developer_id !== undefined
                ? {
                    developer_id:
                      typeof options.confirmed_developer_id === 'string' &&
                      /^[1-9]\d*$/.test(options.confirmed_developer_id)
                        ? Number(options.confirmed_developer_id)
                        : NaN,
                  }
                : {}),
              ...(typeof options.confirmed_title === 'string'
                ? { title: options.confirmed_title }
                : {}),
              ...(typeof options.confirmed_category === 'string'
                ? { category: options.confirmed_category }
                : {}),
            },
          }
        : {}),
    }
  );
  process.stdout.write(JSON.stringify(result, null, options.json ? undefined : 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}
