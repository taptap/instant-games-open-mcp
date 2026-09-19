import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import {
  previewDirectory,
  previewRoundDirectory,
  previewSupervisorLogPath,
  readPreviewRecord,
  writePrivateJson,
  samePreviewIdentity,
  type PreviewRecord,
  type PreviewState,
} from './protocol.js';
import { preflightPreview, PreviewRuntime } from './runtime.js';
import { previewInstallation } from './installation.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { trimPreviewEvidence } from './evidence.js';
import { processPresence } from '../system/processPresence.js';
import type { PreviewWindow } from './windowSettings.js';

function previewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unexpected preview error.';
  return String(sanitizeDiagnosticValue(message));
}

export class PreviewSession {
  private runtime?: PreviewRuntime;
  private operation?: Promise<Record<string, unknown>>;
  private queuedRefresh = false;
  private stopping = false;
  private pendingStops = 0;
  private abort = new AbortController();
  private failure?: string;
  private preflight?: Record<string, unknown>;

  constructor(
    readonly record: PreviewRecord,
    private readonly save = true
  ) {}

  get canRetireFailure(): boolean {
    return (
      this.record.state === 'failed' &&
      !this.operation &&
      !this.pendingStops &&
      !this.runtime?.processAlive
    );
  }

  private setState(state: PreviewState): void {
    this.record.state = state;
    this.record.runtime_pid = this.runtime?.processAlive ? this.runtime.pid : 0;
    if (this.save) {
      const current = readPreviewRecord(this.record.project_realpath);
      if (
        current?.session_id !== this.record.session_id ||
        current.supervisor_id !== this.record.supervisor_id
      )
        return;
      writePrivateJson(
        path.join(previewDirectory(this.record.project_realpath), 'session.json'),
        this.record
      );
      writePrivateJson(path.join(previewRoundDirectory(this.record), 'result.json'), this.status());
    }
  }

  private setTerminalState(state: 'stopped' | 'failed'): boolean {
    try {
      this.setState(state);
      return true;
    } catch (error) {
      // Disk failures must not interrupt owned-process cleanup or failure retirement.
      const message = previewErrorMessage(error);
      if (!this.failure?.includes(message))
        this.failure = [this.failure, 'Preview state persistence failed: ' + message]
          .filter(Boolean)
          .join('; ');
      return false;
    }
  }

  status(): Record<string, unknown> {
    return {
      protocol_version: this.record.protocol_version,
      project_realpath: this.record.project_realpath,
      session_id: this.record.session_id,
      reload_id: this.record.reload_id,
      state: this.record.state,
      process_alive: this.runtime?.processAlive ?? false,
      runtime_pid: this.runtime?.pid ?? (this.record.runtime_pid || undefined),
      supervisor_id: this.record.supervisor_id,
      supervisor_pid: process.pid,
      supervisor_log_path: previewSupervisorLogPath(this.record.project_realpath),
      started_at: this.record.started_at,
      executable: this.record.executable,
      runtime_version: this.record.runtime.runtime_version,
      capabilities: this.record.runtime.capabilities,
      launch_mode: this.runtime?.launchMode ?? 'local_manifest',
      preparation: this.runtime?.preparation,
      ready: false,
      screenshots_supported: false,
      message:
        'Process status only; game loading, visuals and cloud/server features are not verified.',
      install_state: 'ready',
      ok: !this.failure && this.record.state !== 'failed',
      error: this.failure,
      errors: this.runtime?.errors ?? [],
      artifacts: this.runtime?.artifacts ?? [],
      preflight: this.preflight,
    };
  }

  async start(): Promise<Record<string, unknown>> {
    if (this.stopping || this.record.state === 'stopped')
      return {
        ...this.status(),
        ok: false,
        error: 'Preview is stopped. Explicitly start a new session.',
      };
    if (this.operation) return this.operation;
    if (this.runtime) return this.status();
    return this.launchLoop(false);
  }

  async refresh(): Promise<Record<string, unknown>> {
    if (this.stopping) return { ...this.status(), ok: false, error: 'Preview is stopping.' };
    if (this.operation) {
      this.queuedRefresh = true;
      return this.operation;
    }
    if (!this.runtime?.processAlive)
      return {
        ...this.status(),
        ok: false,
        error: 'No active preview. Refresh never starts a stopped session.',
      };
    return this.launchLoop(true);
  }

  private launchLoop(reload: boolean): Promise<Record<string, unknown>> {
    this.operation = (async () => {
      let result: Record<string, unknown>;
      do {
        this.queuedRefresh = false;
        result = await this.launch(reload);
        reload = true;
      } while (this.queuedRefresh && !this.stopping && this.runtime?.processAlive);
      return result;
    })().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }

  private async launch(reload: boolean): Promise<Record<string, unknown>> {
    this.failure = undefined;
    try {
      this.setState(reload ? 'reloading' : 'starting');
      if (reload) {
        await this.runtime?.stop();
        this.runtime = undefined;
      }
      if (this.stopping) throw new Error('CANCELLED');
      if (reload) this.record.reload_id++;
      this.preflight = await preflightPreview(
        this.record.executable,
        this.record.project_realpath,
        this.abort.signal
      );
      if (this.stopping) throw new Error('CANCELLED');
      const directory = previewRoundDirectory(this.record);
      const runtime = new PreviewRuntime(
        this.record.executable,
        {
          protocol_version: this.record.protocol_version,
          project_realpath: this.record.project_realpath,
          session_id: this.record.session_id,
          reload_id: this.record.reload_id,
        },
        directory,
        (state) => {
          if (this.runtime !== runtime || this.stopping) return;
          if (state === 'stopped' && this.record.state === 'reloading') return;
          if (state === 'running') this.setState(state);
          else this.setTerminalState(state);
        },
        undefined,
        (pid) => {
          this.record.runtime_launch_pending = pid === undefined;
          this.setState(this.record.state);
        }
      );
      this.runtime = runtime;
      await runtime.start(
        String(this.preflight.entry),
        path.join(previewDirectory(this.record.project_realpath), 'storage'),
        this.preflight.window as PreviewWindow
      );
      if (this.stopping) throw new Error('CANCELLED');
      return {
        ...this.status(),
        ...(reload ? { warning: 'Preview restarted; in-memory game state was lost.' } : {}),
      };
    } catch (error) {
      this.failure = previewErrorMessage(error);
      this.setTerminalState(this.stopping ? 'stopped' : 'failed');
      return {
        ...this.status(),
        ok: false,
        result: this.stopping ? 'CANCELLED' : this.failure.includes('TIMEOUT') ? 'TIMEOUT' : 'FAIL',
      };
    } finally {
      try {
        trimPreviewEvidence(
          path.join(previewDirectory(this.record.project_realpath), 'sessions'),
          this.record.session_id,
          this.record.reload_id
        );
      } catch {
        // Retention failure must not replace the operation result or stop a live Runtime.
      }
    }
  }

  async stop(): Promise<Record<string, unknown>> {
    this.stopping = true;
    this.queuedRefresh = false;
    this.abort.abort();
    this.pendingStops++;
    try {
      await this.runtime?.stop();
      await this.operation;
    } catch (error) {
      this.failure = previewErrorMessage(error);
      this.setTerminalState('failed');
      return { ...this.status(), ok: false, result: 'TIMEOUT' };
    } finally {
      this.pendingStops--;
    }
    const persisted = this.setTerminalState('stopped');
    return { ...this.status(), ok: persisted };
  }

  async handle(
    action: string,
    options: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    if (action === 'status') return this.status();
    if (action === 'start') return this.start();
    if (action === 'refresh') return this.refresh();
    if (action === 'stop' || action === 'cancel') return this.stop();
    if (action === 'logs') {
      if (options.reload_id !== undefined && options.reload_id !== this.record.reload_id)
        throw new Error(
          'Log cursor belongs to another reload. Query current status and restart the cursor.'
        );
      return {
        ...this.status(),
        ...this.runtime?.logs.read(Number(options.cursor ?? 0), Number(options.limit ?? 100)),
      };
    }
    if (action === 'screenshot') {
      if (!this.runtime) throw new Error('No active preview.');
      const result = await this.runtime.screenshot(signal);
      this.setState(this.record.state);
      if (result.reload_id !== this.record.reload_id) {
        return {
          ...result,
          ok: false,
          result: 'CANCELLED',
          error: 'Preview reload changed during screenshot.',
          artifacts: [],
        };
      }
      return result;
    }
    if (action === 'check') {
      const status = this.status();
      const result = !status.ok || this.runtime?.errors.length ? 'FAIL' : 'UNDETERMINED';
      return {
        ...status,
        result,
        scope: 'readiness_and_evidence_only',
        ready: this.runtime?.isReady ?? false,
        evidence_available: Boolean(this.runtime?.artifacts.length),
        expectation: options.expectation ?? null,
        assertions: [],
        reason:
          result === 'FAIL'
            ? 'Runtime reported a failure.'
            : 'Logs and PNG availability do not establish gameplay or visual correctness. Read current evidence and compare with the explicit expectation.',
        scripts_supported: false,
      };
    }
    throw new Error('Unknown preview action.');
  }
}

export async function requestPreview(
  record: PreviewRecord,
  action: string,
  options: Record<string, unknown> = {},
  timeout = 90000,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (!record.port || !record.supervisor_pid) {
    throw new Error('Preview supervisor has not published a verified control endpoint.');
  }
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: record.port,
        path: '/',
        method: 'POST',
        headers: { authorization: 'Bearer ' + record.token, 'content-type': 'application/json' },
        signal,
      },
      (response) => {
        let output = '';
        response.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8');
          if (output.length > 512 * 1024)
            request.destroy(new Error('Preview response exceeded limit.'));
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const value = JSON.parse(output) as Record<string, unknown>;
            if (
              response.statusCode !== 200 ||
              value.project_realpath !== record.project_realpath ||
              value.session_id !== record.session_id ||
              value.supervisor_id !== record.supervisor_id ||
              value.supervisor_pid !== record.supervisor_pid ||
              value.started_at !== record.started_at ||
              value.executable !== record.executable ||
              value.protocol_version !== record.protocol_version
            ) {
              throw new Error('Preview control handshake mismatch; refusing unverified session.');
            }
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    const timer = setTimeout(
      () => request.destroy(new Error('TIMEOUT: preview control request.')),
      timeout
    );
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end(
      JSON.stringify({
        action,
        options,
        session_id: record.session_id,
        supervisor_id: record.supervisor_id,
        protocol_version: record.protocol_version,
        project_realpath: record.project_realpath,
        supervisor_pid: record.supervisor_pid,
        executable: record.executable,
        started_at: record.started_at,
      })
    );
  });
}

export async function runPreviewSupervisor(project: string, sessionId?: string): Promise<void> {
  const record = readPreviewRecord(project);
  if (!record || record.port || record.supervisor_pid)
    throw new Error('No pending preview supervisor launch.');
  const validateLaunch = (): void => {
    const current = readPreviewRecord(project);
    if (
      !current ||
      current.session_id !== record.session_id ||
      current.supervisor_id !== record.supervisor_id ||
      current.state !== 'starting' ||
      current.port ||
      current.supervisor_pid ||
      (sessionId !== undefined && sessionId !== record.session_id) ||
      (record.launch_deadline !== undefined && sessionId !== record.session_id)
    )
      throw new Error('Preview launch session was replaced or is no longer pending.');
    if (record.launch_deadline !== undefined && Date.now() >= record.launch_deadline)
      throw new Error('Preview supervisor launch expired; retry local preview.');
  };
  validateLaunch();
  const session = new PreviewSession(record);
  let shuttingDown = false;
  const shutdown = async (retireFailure = false): Promise<void> => {
    if (shuttingDown || (retireFailure && !session.canRetireFailure)) return;
    shuttingDown = true;
    try {
      if (!retireFailure) {
        const result = await session.stop();
        // Persistence can fail after a confirmed stop. An unconfirmed stop must
        // retain the control channel so the owned Runtime can still be managed.
        if (!result.ok && (result.state !== 'stopped' || result.process_alive !== false)) return;
      }
      clearInterval(idleTimer);
      clearTimeout(closeTimer);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      if (retireFailure && session.canRetireFailure) {
        try {
          const current = readPreviewRecord(project);
          if (
            current?.session_id === record.session_id &&
            current.supervisor_id === record.supervisor_id &&
            current.reload_id === record.reload_id
          ) {
            writePrivateJson(path.join(previewRoundDirectory(record), 'result.json'), {
              ...session.status(),
              supervisor_retired: true,
            });
          }
        } catch {
          // Without durable retirement evidence, offline status must remain unverified.
        }
      }
    } finally {
      shuttingDown = false;
    }
  };
  const onSignal = (): void => {
    void shutdown();
  };
  const server = http.createServer((request, response) => {
    const expected = Buffer.from('Bearer ' + record.token);
    const supplied = Buffer.from(request.headers.authorization || '');
    if (
      request.method !== 'POST' ||
      request.url !== '/' ||
      request.headers.origin ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      response.writeHead(403).end();
      return;
    }
    let body = '';
    request.on('error', () => response.destroy());
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > 16384) request.destroy();
    });
    request.on('end', async () => {
      const abort = new AbortController();
      let action = '';
      response.on('close', () => {
        if (!response.writableEnded) {
          abort.abort();
          if (action === 'start' || action === 'refresh') void session.stop();
        }
      });
      try {
        if (shuttingDown) throw new Error('Preview supervisor is shutting down.');
        const value = JSON.parse(body) as Record<string, unknown>;
        if (
          value.session_id !== record.session_id ||
          value.supervisor_id !== record.supervisor_id ||
          value.protocol_version !== record.protocol_version ||
          value.project_realpath !== record.project_realpath ||
          value.supervisor_pid !== record.supervisor_pid ||
          value.executable !== record.executable ||
          value.started_at !== record.started_at
        )
          throw new Error('Session identity mismatch.');
        action = String(value.action);
        const result = await session.handle(
          action,
          (value.options || {}) as Record<string, unknown>,
          abort.signal
        );
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ...session.status(), ...result }));
        if (action === 'stop' || action === 'cancel') void shutdown();
      } catch (error) {
        response.end(
          JSON.stringify({
            ...session.status(),
            ok: false,
            error: previewErrorMessage(error),
          })
        );
      }
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Preview control channel failed.');
  // listen() yields: a timed-out launch may have been replaced while it was opening.
  // Recheck before publishing; no Runtime can start before this endpoint is published.
  try {
    validateLaunch();
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
  record.port = address.port;
  record.supervisor_pid = process.pid;
  record.runtime_pid = 0;
  record.runtime_launch_pending = false;
  writePrivateJson(path.join(previewDirectory(project), 'session.json'), record);
  const idleTimer = setInterval(() => {
    if (record.state === 'stopped') void shutdown();
    else if (session.canRetireFailure) void shutdown(true);
  }, 1000);
  const closeTimer = setTimeout(() => {
    if (record.state === 'starting' && !session.status().runtime_pid) void shutdown();
  }, 360000);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

export async function previewStatus(project: string): Promise<Record<string, unknown>> {
  const installation = previewInstallation(project);
  const record = readPreviewRecord(project);
  if (!record)
    return {
      protocol_version: 1,
      project_realpath: project,
      ...installation,
      state: 'stopped',
      process_alive: false,
      ok: true,
    };
  try {
    const status = await requestPreview(record, 'status', {}, 1500);
    return {
      ...status,
      ...installation,
      // The control handshake describes the active session; installation describes the shared Runtime.
      executable: status.executable,
      runtime_version: status.runtime_version,
    };
  } catch {
    const stopped = record.state === 'stopped';
    const filename = path.join(previewRoundDirectory(record), 'result.json');
    let evidence: Record<string, unknown> = {};
    if (fs.existsSync(filename)) {
      const saved = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<string, unknown>;
      if (samePreviewIdentity(saved, record)) {
        evidence = { ...saved };
        delete evidence.token;
      }
    }
    const retiredFailure =
      record.state === 'failed' &&
      evidence.state === 'failed' &&
      evidence.supervisor_retired === true &&
      evidence.process_alive === false &&
      evidence.supervisor_id === record.supervisor_id &&
      evidence.supervisor_pid === record.supervisor_pid &&
      evidence.started_at === record.started_at &&
      evidence.executable === record.executable;
    const runtimePid = Number(record.runtime_pid || evidence.runtime_pid || 0);
    const unpublished =
      record.state === 'starting' && !record.port && !record.supervisor_pid && !record.runtime_pid;
    const expiredLaunch =
      unpublished && record.launch_deadline !== undefined && Date.now() >= record.launch_deadline;
    // Legacy launches have no generation fence. A reboot is the only available
    // proof that an unrecorded process (including a delayed Windows wrapper) exited.
    const beforeBoot =
      record.state === 'starting' &&
      Date.parse(record.started_at) < Date.now() - os.uptime() * 1000 - 60000 &&
      (record.supervisor_pid === 0 || processPresence(record.supervisor_pid) === 'missing') &&
      (runtimePid === 0 || processPresence(runtimePid) === 'missing');
    const interruptedStartup =
      record.state === 'starting' &&
      record.port > 0 &&
      record.supervisor_pid > 0 &&
      record.runtime_launch_pending === false &&
      processPresence(record.supervisor_pid) === 'missing' &&
      (runtimePid === 0 || processPresence(runtimePid) === 'missing');
    const staleSessionRecovered =
      expiredLaunch ||
      beforeBoot ||
      interruptedStartup ||
      (!retiredFailure &&
        (record.state === 'running' || record.state === 'failed') &&
        sameSupervisorEvidence(evidence, record) &&
        processPresence(record.supervisor_pid) === 'missing' &&
        runtimePid > 0 &&
        processPresence(runtimePid) === 'missing');
    if (staleSessionRecovered) {
      evidence = {
        ...evidence,
        supervisor_id: record.supervisor_id,
        supervisor_pid: record.supervisor_pid,
        started_at: record.started_at,
        state: 'failed',
        process_alive: false,
        runtime_pid: 0,
        supervisor_retired: true,
        stale_session_recovered: true,
        error: expiredLaunch
          ? '本地预览启动超时，未启动游戏。可以重新点击“本地预览”。'
          : interruptedStartup
            ? '本地预览启动已中断，已确认相关进程不存在。可以重新点击“本地预览”。'
            : 'Previous preview processes are no longer running. The stale session was retired safely.',
      };
    }
    return {
      protocol_version: 1,
      project_realpath: project,
      session_id: record.session_id,
      reload_id: record.reload_id,
      ...evidence,
      ...installation,
      // Installation metadata may describe a different binary than this session's --runtime.
      executable: record.executable,
      state: stopped ? 'stopped' : 'failed',
      process_alive: stopped || retiredFailure || staleSessionRecovered ? false : null,
      supervisor_retired: retiredFailure || staleSessionRecovered,
      stale_session_recovered: staleSessionRecovered,
      supervisor_log_path: previewSupervisorLogPath(project),
      ok: stopped,
      error:
        stopped || retiredFailure || staleSessionRecovered
          ? evidence.error
          : 'Preview supervisor is unreachable. Process ownership is unverified; no PID was killed and no session was restarted.' +
            (unpublished
              ? record.launch_deadline !== undefined
                ? ' 启动仍在确认中，请稍后重新检测预览状态。'
                : ' 这是旧版本遗留的启动记录；请重启电脑后重新打开控制台，系统将恢复启动入口，无需删除项目或重装 Runtime。'
              : ''),
    };
  }
}

function sameSupervisorEvidence(evidence: Record<string, unknown>, record: PreviewRecord): boolean {
  return (
    samePreviewIdentity(evidence, record) &&
    evidence.supervisor_id === record.supervisor_id &&
    evidence.supervisor_pid === record.supervisor_pid &&
    evidence.started_at === record.started_at &&
    evidence.executable === record.executable
  );
}
