import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  previewDirectory,
  previewProject,
  previewRoundDirectory,
  previewSupervisorLogPath,
  readPreviewRecord,
  samePreviewIdentity,
  writePrivateJson,
  type PreviewRecord,
} from '../preview/protocol.js';
import {
  installPreviewRuntime,
  previewInstallation,
  withRuntimeInstallLock,
  withPreviewLock,
} from '../preview/installation.js';
import { probeRuntime } from '../preview/runtime.js';
import { ensurePreviewRuntimeResources } from '../preview/runtimeResources.js';
import { previewStatus, requestPreview, runPreviewSupervisor } from '../preview/session.js';
import { PreviewOwner } from '../preview/owner.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { readStoredPreviewLogs } from '../preview/evidence.js';
import { preparePreviewProject, previewPreparationDirectory } from '../preview/prepare.js';
import { launchPreviewSupervisorProcess } from '../preview/processLauncher.js';

const ACTIONS = [
  'install',
  'prepare',
  'start',
  'run',
  'status',
  'refresh',
  'stop',
  'logs',
  'screenshot',
  'check',
];

function isRetiredFailure(
  status: Record<string, unknown> | undefined,
  record: PreviewRecord | undefined
): boolean {
  return Boolean(
    status &&
      record &&
      status.state === 'failed' &&
      status.process_alive === false &&
      status.supervisor_retired === true &&
      samePreviewIdentity(status, record) &&
      status.supervisor_id === record.supervisor_id &&
      status.supervisor_pid === record.supervisor_pid &&
      status.started_at === record.started_at &&
      status.executable === record.executable
  );
}

export async function runPreviewCli(
  action: string | undefined,
  options: Record<string, string | boolean>
): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const result = await executePreviewOperation(action, options, controller.signal);
    process.stdout.write(JSON.stringify(result, null, options.json ? undefined : 2) + '\n');
    if (!result.ok || ['FAIL', 'TIMEOUT', 'CANCELLED'].includes(String(result.result)))
      process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

export async function executePreviewOperation(
  action: string | undefined,
  options: Record<string, string | boolean>,
  signal?: AbortSignal,
  owner?: PreviewOwner
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let result: Record<string, unknown>;
  try {
    if (controller.signal.aborted) throw new Error('CANCELLED');
    if (!action || !ACTIONS.includes(action))
      throw new Error(
        'Use preview install|prepare|start|run|status|refresh|stop|logs|screenshot|check.'
      );
    if (options.script)
      throw new Error(
        'Preview short scripts are not supported in this version; no script was executed.'
      );
    const project = previewProject(
      typeof options.target_dir === 'string' ? options.target_dir : ''
    );
    if (action === 'prepare')
      result = await withPreviewLock(project, () =>
        preparePreviewProject(project, previewPreparationDirectory(project), controller.signal)
      );
    else if (action === 'status') result = await previewStatus(project);
    else if (action === 'install') {
      result = await withPreviewLock(project, () =>
        withRuntimeInstallLock(async () => {
          const state = await previewStatus(project);
          if (state.process_alive !== false)
            throw new Error('Stop the verified preview before installing Runtime.');
          return {
            ok: true,
            protocol_version: 1,
            project_realpath: project,
            ...(await installPreviewRuntime(project, controller.signal, options.update === true)),
          };
        })
      );
    } else if (action === 'run') {
      result = await runAgentPreview(project, options, controller.signal);
    } else if (action === 'start') {
      if (owner || options.legacy_wmi === true)
        result = await withPreviewLock(project, () =>
          startPreview(project, options, controller.signal, owner)
        );
      else {
        if (options.runtime) throw new Error('Use preview run for an external --runtime.');
        const { startConsolePreview } = await import('../console/cli.js');
        result = await startConsolePreview(project, controller.signal);
      }
    } else {
      const record = readPreviewRecord(project);
      const cursor = options.cursor === undefined ? 0 : Number(options.cursor);
      if (options.session_id && options.session_id !== record?.session_id)
        throw new Error('Preview session changed. Read status again.');
      if (action === 'stop' && record) {
        writePrivateJson(path.join(previewDirectory(project), 'stop.json'), {
          request_id: randomUUID(),
          session_id: record.session_id,
          supervisor_id: record.supervisor_id,
        });
      }
      if (
        action === 'logs' &&
        cursor > 0 &&
        (!options.session_id || options.reload_id === undefined)
      ) {
        throw new Error(
          'Incremental logs require --session-id and --reload-id from the previous response.'
        );
      }
      const failedStatus = record ? await previewStatus(project) : undefined;
      const retired = isRetiredFailure(failedStatus, record);
      if (action === 'logs' && record) {
        const reload =
          options.reload_id === undefined ? record.reload_id : Number(options.reload_id);
        if (!Number.isSafeInteger(reload) || reload < 0 || reload > record.reload_id)
          throw new Error('Invalid preview reload.');
        result = {
          ...(await previewStatus(project)),
          ok: true,
          reload_id: reload,
          ...readStoredPreviewLogs(
            previewRoundDirectory({ ...record, reload_id: reload }),
            cursor,
            options.limit === undefined ? 100 : Number(options.limit),
            options.tail === true
          ),
        };
      } else if (action === 'check' && (!record || record.state === 'stopped' || retired)) {
        const status = failedStatus || (await previewStatus(project));
        result = {
          ...status,
          result:
            status.state === 'failed' ||
            status.error ||
            (Array.isArray(status.errors) && status.errors.length)
              ? 'FAIL'
              : 'UNDETERMINED',
          ready: false,
          expectation: options.expectation ?? null,
          assertions: [],
          scripts_supported: false,
          reason:
            'Preview is stopped; retained evidence is historical and cannot prove current source correctness.',
        };
      } else if (!record || record.state === 'stopped' || retired) {
        result = {
          ...(failedStatus || (await previewStatus(project))),
          ok: action === 'stop',
          error:
            action === 'stop'
              ? undefined
              : 'No active preview. This command never starts a session.',
        };
      } else {
        result = await requestPreview(
          record,
          action,
          {
            cursor,
            limit: options.limit === undefined ? 100 : Number(options.limit),
            reload_id: options.reload_id === undefined ? undefined : Number(options.reload_id),
            expectation: typeof options.expectation === 'string' ? options.expectation : undefined,
          },
          action === 'refresh' ? 360000 : 90000,
          controller.signal
        );
      }
    }
  } catch (error) {
    result = {
      ok: false,
      protocol_version: 1,
      result:
        controller.signal.aborted || String(error).includes('CANCELLED')
          ? 'CANCELLED'
          : String(error).includes('TIMEOUT')
            ? 'TIMEOUT'
            : 'FAIL',
      error: String(sanitizeDiagnosticValue(String(error))),
      artifacts: [],
      ...(action === 'install' ? { install_state: 'failed' } : {}),
    };
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  return result;
}

function windowsLaunchHint(logFile: string): string {
  let empty = true;
  try {
    empty = fs.statSync(logFile).size === 0;
  } catch {
    empty = true;
  }
  return empty
    ? 'Supervisor did not write a log; check the actual launcher and ownership before diagnosing Runtime. Host / Agent normal launch does not use WMI; only explicit --legacy-wmi may encounter CIM or EncodedCommand blocking. Inspect ' +
        logFile +
        ' and the antivirus event log. Read docs/MAKER_LOCAL_PREVIEW.md.'
    : 'Supervisor wrote a log; inspect ' +
        logFile +
        ' before diagnosing prepare or Runtime startup.';
}

async function runAgentPreview(
  project: string,
  options: Record<string, string | boolean>,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const duration = options.duration_ms === undefined ? 600000 : Number(options.duration_ms);
  if (!Number.isSafeInteger(duration) || duration < 1000 || duration > 600000)
    throw new Error('--duration-ms must be 1000..600000.');
  let started: Record<string, unknown> | undefined;
  let current: Record<string, unknown> | undefined;
  let record: PreviewRecord | undefined;
  const owner = new PreviewOwner();
  try {
    started = await withPreviewLock(project, async () => {
      const existing = await previewStatus(project);
      if (existing.process_alive !== false)
        throw new Error('An existing preview cannot be taken over by an Agent run.');
      return startPreview(project, options, signal, owner);
    });
    if (!started.ok) return started;
    record = readPreviewRecord(project);
    if (
      !record ||
      record.session_id !== started.session_id ||
      record.supervisor_id !== started.supervisor_id
    )
      throw new Error(
        'Agent preview identity changed; refusing to take ownership of another session.'
      );
    current = started;
    process.stderr.write(JSON.stringify({ event: 'preview.started', ...started }) + '\n');
    const deadline = Date.now() + duration;
    while (!signal.aborted && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
      current = await previewStatus(project);
      if (
        current.session_id !== record.session_id ||
        !['running', 'reloading'].includes(String(current.state))
      )
        break;
    }
  } finally {
    try {
      if (started?.ok && record) current = await stopAgentPreview(project, record);
    } finally {
      await owner.close();
    }
  }
  const final = await previewStatus(project);
  if (final.session_id !== record!.session_id || final.supervisor_id !== record!.supervisor_id)
    throw new Error('Agent preview session changed; refusing unrelated final evidence.');
  current = final;
  return {
    ...current,
    protocol_version: 1,
    mode: 'agent',
    started,
    evidence: readStoredPreviewLogs(
      previewRoundDirectory({
        ...record!,
        reload_id: Number(current?.reload_id ?? record!.reload_id),
      }),
      0,
      100,
      true
    ),
    result: signal.aborted
      ? 'CANCELLED'
      : current?.state === 'failed' || (Array.isArray(current?.errors) && current.errors.length > 0)
        ? 'FAIL'
        : 'UNDETERMINED',
    scope: 'runtime_evidence_only',
    game_assertions_supported: false,
  };
}
async function stopAgentPreview(
  project: string,
  record: PreviewRecord
): Promise<Record<string, unknown>> {
  const active = readPreviewRecord(project);
  if (
    !active ||
    active.session_id !== record.session_id ||
    active.supervisor_id !== record.supervisor_id
  )
    throw new Error('Agent preview session changed; refusing to stop another session.');
  const status = await previewStatus(project);
  if (status.process_alive === true) return requestPreview(active, 'stop', {}, 10000);
  if (status.process_alive === false) return status;
  throw new Error('Agent preview ownership is unverified; cleaning up only the owned session.');
}

async function startPreview(
  project: string,
  options: Record<string, string | boolean>,
  signal: AbortSignal,
  owner?: PreviewOwner
): Promise<Record<string, unknown>> {
  if (!owner && options.legacy_wmi !== true) throw new Error('A preview owner is required.');
  const sessionId = randomUUID();
  const supervisorId = randomUUID();
  const stopFile = path.join(previewDirectory(project), 'stop.json');
  const checkCancelled = (): void => {
    const stop = fs.existsSync(stopFile)
      ? (JSON.parse(fs.readFileSync(stopFile, 'utf8')) as Record<string, unknown>)
      : undefined;
    if (signal.aborted || (stop?.session_id === sessionId && stop.supervisor_id === supervisorId))
      throw new Error('CANCELLED: preview start was stopped.');
  };
  const status = await previewStatus(project);
  checkCancelled();
  const previous = readPreviewRecord(project);
  if (
    previous &&
    status.supervisor_id === previous.supervisor_id &&
    (status.process_alive === true || status.state === 'starting' || status.state === 'reloading')
  ) {
    if (owner && previous.supervisor_pid !== process.pid)
      throw new Error(
        'Preview belongs to another owner. Stop that session explicitly before starting a user preview.'
      );
    return requestPreview(previous, 'start', {}, 360000, signal);
  }
  if (status.process_alive === null) throw new Error(String(status.error));
  if (previous && previous.state !== 'stopped' && !isRetiredFailure(status, previous)) {
    try {
      await requestPreview(previous, 'stop', {}, 10000, signal);
    } catch {
      throw new Error(
        'Previous preview ownership could not be verified. Refusing to start a duplicate session.'
      );
    }
  }
  const installation = previewInstallation(project);
  const externalRuntime = typeof options.runtime === 'string';
  const configured =
    typeof options.runtime === 'string' ? options.runtime : installation.executable;
  if (!configured)
    return {
      ok: false,
      protocol_version: 1,
      project_realpath: project,
      state: 'stopped',
      install_state: 'missing',
      error:
        'Runtime is missing. With host approval, run taptap-maker preview install --target-dir <PROJECT_ABSOLUTE_PATH>, then retry start.',
    };
  if (!path.isAbsolute(configured))
    throw new Error('--runtime must be an absolute executable path.');
  const executable = fs.realpathSync(configured);
  const resourceWarnings = externalRuntime
    ? []
    : ensurePreviewRuntimeResources(executable).warnings;
  const runtime = await probeRuntime(executable, signal);
  checkCancelled();
  const record: PreviewRecord = {
    protocol_version: 1,
    project_realpath: project,
    session_id: sessionId,
    reload_id: 0,
    supervisor_id: supervisorId,
    supervisor_pid: 0,
    runtime_pid: 0,
    started_at: new Date().toISOString(),
    launch_deadline: Date.now() + 30000,
    token: randomBytes(32).toString('hex'),
    port: 0,
    executable,
    state: 'starting',
    runtime,
  };
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  if (owner) {
    checkCancelled();
    await runPreviewSupervisor(project, record.session_id, owner);
    const active = readPreviewRecord(project)!;
    try {
      const started = await requestPreview(active, 'start', {}, 360000, signal);
      return {
        ...started,
        warnings: [
          ...(Array.isArray(started.warnings) ? started.warnings : []),
          ...resourceWarnings,
        ],
      };
    } catch (error) {
      await requestPreview(active, 'stop', {}, 10000);
      throw error;
    }
  }
  // Broker errors can occur after launch; do not mark an unverified process stopped.
  const launch = await launchPreviewSupervisorProcess({
    execPath: process.execPath,
    execArgv: process.execArgv,
    entry: process.argv[1],
    project,
    sessionId: record.session_id,
    cwd: path.dirname(executable),
    logFile: previewSupervisorLogPath(project),
    env: process.env,
    signal,
  });
  const deadline = record.launch_deadline!;
  let active: PreviewRecord | undefined;
  try {
    while (Date.now() < deadline) {
      checkCancelled();
      const launchError = launch.failure();
      if (launchError) throw launchError;
      active = readPreviewRecord(project);
      if (active?.port && active.supervisor_pid) {
        const started = await requestPreview(active, 'start', {}, 360000, signal);
        return resourceWarnings.length
          ? {
              ...started,
              warnings: [
                ...(Array.isArray(started.warnings) ? started.warnings : []),
                ...resourceWarnings,
              ],
            }
          : started;
      }
      if (launch.exited())
        throw new Error(
          'Preview supervisor exited before opening its control channel. ' +
            windowsLaunchHint(previewSupervisorLogPath(project))
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      'TIMEOUT: preview supervisor did not open its control channel. ' +
        windowsLaunchHint(previewSupervisorLogPath(project))
    );
  } catch (error) {
    active = readPreviewRecord(project);
    if (active?.port) {
      try {
        await requestPreview(active, 'stop', {}, 10000);
      } catch (cleanupError) {
        throw new Error(
          String(error) + '; could not confirm preview stop: ' + String(cleanupError)
        );
      }
    } else {
      if (launch.stopUnpublished()) {
        record.state = 'stopped';
        writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
      } else {
        throw new Error(
          String(error) +
            '; supervisor exit is unverified. ' +
            windowsLaunchHint(previewSupervisorLogPath(project))
        );
      }
    }
    throw error;
  }
}
