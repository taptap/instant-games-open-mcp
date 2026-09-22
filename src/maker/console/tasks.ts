import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writePrivateJson } from '../system/privateJson.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { ConsoleProjects } from './projects.js';
import { validQrcodePublication, type MakerQrcodePublication } from '../qrcodePreflight.js';
import { parseQrcodeInteraction, parseQrcodeRecovery } from '../qrcodeInteraction.js';
import { consoleReportContext, consoleReportOffer } from './issueReport.js';
import {
  CONSOLE_ACTIONS,
  ConsoleError,
  type ConsoleAction,
  type ConsoleExecutor,
  type ConsoleTask,
} from './types.js';

export class ConsoleTasks {
  private readonly tasks = new Map<string, ConsoleTask>();
  private readonly running = new Set<Promise<void>>();
  constructor(
    private readonly projects: ConsoleProjects,
    private readonly execute: ConsoleExecutor,
    private readonly historyFile?: string,
    private readonly onSettled: () => void = () => {}
  ) {
    if (historyFile && fs.existsSync(historyFile)) {
      if (fs.statSync(historyFile).size > 40 * 1024 * 1024)
        throw new ConsoleError('Console task history exceeds the supported size.');
      const data = JSON.parse(fs.readFileSync(historyFile, 'utf8')) as ConsoleTask[];
      if (!Array.isArray(data) || data.length > 100)
        throw new ConsoleError('Invalid console task history.');
      for (const task of data) {
        if (!task.id || !CONSOLE_ACTIONS.includes(task.action)) continue;
        if (task.report?.status === 'running') task.report = { status: 'unknown' };
        if (task.status === 'running') {
          task.status = 'unknown';
          task.error =
            'Console restarted before the operation result was recorded. Check the result before retrying.';
        }
        this.tasks.set(task.id, task);
      }
      const before = this.tasks.size;
      this.pruneHistory();
      if (this.tasks.size !== before) this.persist();
    }
  }
  private pruneHistory(): void {
    const counts = new Map<string, number>();
    for (const task of Array.from(this.tasks.values()).reverse()) {
      const count = (counts.get(task.projectKey) || 0) + 1;
      counts.set(task.projectKey, count);
      if (count > 10 && task.status !== 'running' && task.report?.status !== 'running')
        this.tasks.delete(task.id);
    }
    while (this.tasks.size > 100) {
      const old = Array.from(this.tasks.values()).find(
        (task) => task.status !== 'running' && task.report?.status !== 'running'
      );
      if (!old) break;
      this.tasks.delete(old.id);
    }
  }
  list(): ConsoleTask[] {
    return Array.from(this.tasks.values())
      .reverse()
      .map((task) => this.describe(task));
  }
  private describe(task: ConsoleTask): ConsoleTask {
    const result = task.result as { error?: unknown } | undefined;
    const interaction =
      task.action === 'qrcode' && ['failed', 'unknown'].includes(task.status)
        ? parseQrcodeInteraction(result?.error) || parseQrcodeInteraction(task.error)
        : undefined;
    const recovery =
      task.action === 'qrcode' && ['failed', 'unknown'].includes(task.status)
        ? parseQrcodeRecovery(result?.error) || parseQrcodeRecovery(task.error)
        : undefined;
    const described = {
      ...task,
      interaction,
      recovery,
      ...(interaction || recovery ? { status: 'unknown' as const } : {}),
    };
    return { ...described, reportOffer: consoleReportOffer(described) };
  }
  get(id: string): ConsoleTask {
    const task = this.tasks.get(id);
    if (!task) throw new ConsoleError('Task not found.', 404);
    return this.describe(task);
  }
  busy(key: string): boolean {
    return this.list().some(
      (task) =>
        task.projectKey === key && (task.status === 'running' || task.report?.status === 'running')
    );
  }
  get active(): boolean {
    return this.running.size > 0;
  }
  report(id: string, consent: unknown): ConsoleTask {
    if (consent !== true) throw new ConsoleError('Explicit report consent is required.');
    const described = this.get(id);
    if (!described.reportOffer)
      throw new ConsoleError('This task is not eligible for issue reporting.');
    const task = this.tasks.get(id)!;
    if (task.report) return this.describe(task);
    const project = this.projects.resolve(task.projectKey);
    if (task.projectPath !== project.path || task.projectid !== project.projectid)
      throw new ConsoleError('Project binding changed since this operation.');
    if (this.running.size >= 4) throw new ConsoleError('Too many active operations.', 409);
    task.report = { status: 'running' };
    try {
      this.persist();
    } catch (error) {
      delete task.report;
      throw error;
    }
    const operation = Promise.resolve().then(async () => {
      try {
        const result = await this.execute({
          action: 'issue.report',
          project: project.path,
          reportContext: consoleReportContext(described, project.path),
          onOutput: () => {},
        });
        const created =
          result.ok &&
          result.status === 'created' &&
          typeof result.issue_url === 'string' &&
          /^https:\/\/github\.com\/taptap\/instant-games-open-mcp\/issues\/\d+$/.test(
            result.issue_url
          );
        task.report = created
          ? { status: 'created', issue_url: result.issue_url as string }
          : { status: result.unknown ? 'unknown' : 'unavailable' };
      } catch {
        task.report = { status: 'unknown' };
      } finally {
        this.onSettled();
        try {
          this.persist();
        } catch {
          /* The persisted running marker prevents a duplicate submission. */
        }
      }
    });
    this.running.add(operation);
    void operation.finally(() => this.running.delete(operation)).catch(() => {});
    return this.describe(task);
  }
  recordFailure(key: string, action: ConsoleAction, error: string): ConsoleTask {
    if (!CONSOLE_ACTIONS.includes(action)) throw new ConsoleError('Unsupported console action.');
    const project = this.projects.resolve(key);
    const task: ConsoleTask = {
      id: randomUUID(),
      projectKey: key,
      projectName: project.name,
      projectPath: project.path,
      projectid: project.projectid,
      action,
      status: 'failed',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      output: '',
      error: String(sanitizeDiagnosticValue(error)).slice(0, 8192),
    };
    this.tasks.set(task.id, task);
    try {
      this.persist();
    } catch (error) {
      this.tasks.delete(task.id);
      throw error;
    }
    return this.describe(task);
  }
  start(
    key: string,
    action: ConsoleAction,
    confirmedOrientation?: unknown,
    publication?: unknown,
    confirmedBuild?: unknown,
    sourceTaskId?: unknown
  ): ConsoleTask {
    if (!CONSOLE_ACTIONS.includes(action)) throw new ConsoleError('Unsupported console action.');
    if (
      confirmedOrientation !== undefined &&
      (action !== 'qrcode' ||
        typeof confirmedOrientation !== 'string' ||
        !['landscape', 'portrait'].includes(confirmedOrientation))
    )
      throw new ConsoleError('Invalid confirmed screen orientation.');
    if (publication !== undefined && (action !== 'qrcode' || !validQrcodePublication(publication)))
      throw new ConsoleError('Invalid confirmed QR publishing fields.');
    if (
      confirmedBuild !== undefined &&
      (action !== 'qrcode' || typeof confirmedBuild !== 'boolean')
    )
      throw new ConsoleError('Invalid QR build confirmation.');
    const project = this.projects.resolve(key);
    if (
      sourceTaskId !== undefined ||
      (publication as MakerQrcodePublication)?.developer_id !== undefined
    ) {
      const source = typeof sourceTaskId === 'string' ? this.get(sourceTaskId) : undefined;
      const latest = this.list().find(
        (item) => item.projectKey === key && item.action === 'qrcode'
      );
      const developerId = (publication as MakerQrcodePublication)?.developer_id;
      if (
        action !== 'qrcode' ||
        confirmedBuild !== true ||
        !source ||
        source.projectKey !== key ||
        source.action !== 'qrcode' ||
        !['failed', 'unknown'].includes(source.status) ||
        latest?.id !== source.id ||
        (source.projectPath !== undefined && source.projectPath !== project.path) ||
        (source.projectid !== undefined && source.projectid !== project.projectid) ||
        !source.interaction?.options.some((option) => option.value === developerId)
      )
        throw new ConsoleError(
          'Invalid or stale developer selection. Reopen the original QR task.'
        );
    }
    if (this.busy(key))
      throw new ConsoleError('This project already has an operation in progress.', 409);
    this.projects.claimProjectWork(key);
    if (this.running.size >= 4) {
      this.projects.releaseProjectWork(key);
      throw new ConsoleError('Too many active operations. Wait for one to finish.', 409);
    }
    const task: ConsoleTask = {
      id: randomUUID(),
      projectKey: key,
      projectName: project.name,
      projectPath: project.path,
      projectid: project.projectid,
      ...(typeof sourceTaskId === 'string' ? { sourceTaskId } : {}),
      action,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: '',
      ...(action === 'qrcode' && confirmedBuild === true ? { result: { requiresSync: true } } : {}),
    };
    this.tasks.set(task.id, task);
    try {
      this.persist();
    } catch (error) {
      this.tasks.delete(task.id);
      this.projects.releaseProjectWork(key);
      throw error;
    }
    const operation = Promise.resolve().then(async () => {
      try {
        const current = this.projects.resolve(key);
        if (current.path !== project.path || current.projectid !== project.projectid)
          throw new ConsoleError('Project binding changed before task execution.');
        const result = await this.execute({
          project: project.path,
          action,
          confirmedOrientation: confirmedOrientation as 'landscape' | 'portrait' | undefined,
          publication: publication as MakerQrcodePublication | undefined,
          confirmedBuild: confirmedBuild as boolean | undefined,
          onOutput: (text) => {
            task.output = (task.output + String(sanitizeDiagnosticValue(text))).slice(-65536);
          },
          onProgress: (progress) => {
            task.progress = {
              phase: String(sanitizeDiagnosticValue(progress.phase)).slice(0, 64),
              message: String(sanitizeDiagnosticValue(progress.message)).slice(0, 512),
              progress: progress.progress,
              total: progress.total,
            };
          },
        });
        // Retain sync intent if the child disappears before returning its sync outcome.
        const requiresSync =
          action === 'qrcode' &&
          confirmedBuild === true &&
          (!result.ok || result.unknown) &&
          !Object.hasOwn(result, 'requiresSync');
        const sanitized = sanitizeDiagnosticValue({
          ...result,
          ...(requiresSync ? { requiresSync: true } : {}),
        });
        task.result =
          Buffer.byteLength(JSON.stringify(sanitized)) <= 256 * 1024
            ? sanitized
            : {
                ok: result.ok,
                unknown: result.unknown,
                result_truncated: true,
                ...((sanitized as { requiresSync?: boolean }).requiresSync === true
                  ? { requiresSync: true }
                  : {}),
              };
        if ((task.result as { result_truncated?: boolean }).result_truncated)
          task.output = (task.output + '\nLarge CLI result omitted from console history.').slice(
            -65536
          );
        task.status = result.unknown ? 'unknown' : result.ok ? 'succeeded' : 'failed';
        if (result.error) task.error = String(sanitizeDiagnosticValue(result.error)).slice(0, 8192);
      } catch (error) {
        task.status = 'failed';
        task.error = String(
          sanitizeDiagnosticValue(
            error instanceof Error ? error.message : 'Unexpected console task error.'
          )
        ).slice(0, 8192);
      } finally {
        this.projects.releaseProjectWork(key);
        task.finishedAt = new Date().toISOString();
        this.onSettled();
        try {
          this.persist();
        } catch {
          task.output = (task.output + '\nTask result could not be saved to disk.').slice(-65536);
        }
      }
    });
    this.running.add(operation);
    void operation.finally(() => this.running.delete(operation)).catch(() => {});
    return task;
  }
  async settled(): Promise<void> {
    await Promise.all(this.running);
  }
  private persist(): void {
    this.pruneHistory();
    if (this.historyFile) {
      fs.mkdirSync(path.dirname(this.historyFile), { recursive: true, mode: 0o700 });
      while (
        Buffer.byteLength(JSON.stringify(Array.from(this.tasks.values()))) >
        40 * 1024 * 1024
      ) {
        const oldest = this.list()
          .reverse()
          .find((task) => task.status !== 'running' && task.report?.status !== 'running');
        if (!oldest) throw new ConsoleError('Active console history exceeds the supported size.');
        this.tasks.delete(oldest.id);
      }
      writePrivateJson(this.historyFile, Array.from(this.tasks.values()));
    }
  }
}
