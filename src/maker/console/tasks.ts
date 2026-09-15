import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writePrivateJson } from '../system/privateJson.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { ConsoleProjects } from './projects.js';
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
        if (task.status === 'running') {
          task.status = 'unknown';
          task.error =
            'Console restarted before the operation result was recorded. Check the result before retrying.';
        }
        this.tasks.set(task.id, task);
      }
    }
  }
  list(): ConsoleTask[] {
    return Array.from(this.tasks.values()).reverse();
  }
  get(id: string): ConsoleTask {
    const task = this.tasks.get(id);
    if (!task) throw new ConsoleError('Task not found.', 404);
    return task;
  }
  busy(key: string): boolean {
    return this.list().some((task) => task.projectKey === key && task.status === 'running');
  }
  start(key: string, action: ConsoleAction): ConsoleTask {
    if (!CONSOLE_ACTIONS.includes(action)) throw new ConsoleError('Unsupported console action.');
    const project = this.projects.resolve(key);
    if (this.busy(key))
      throw new ConsoleError('This project already has an operation in progress.', 409);
    if (this.running.size >= 4)
      throw new ConsoleError('Too many active operations. Wait for one to finish.', 409);
    const task: ConsoleTask = {
      id: randomUUID(),
      projectKey: key,
      projectName: project.name,
      action,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: '',
    };
    this.tasks.set(task.id, task);
    while (this.tasks.size > 100) {
      const old = Array.from(this.tasks.values()).find((item) => item.status !== 'running');
      if (!old) break;
      this.tasks.delete(old.id);
    }
    try {
      this.persist();
    } catch (error) {
      this.tasks.delete(task.id);
      throw error;
    }
    const operation = Promise.resolve().then(async () => {
      try {
        this.projects.resolve(key);
        const result = await this.execute({
          project: project.path,
          action,
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
        const sanitized = sanitizeDiagnosticValue(result);
        task.result =
          Buffer.byteLength(JSON.stringify(sanitized)) <= 256 * 1024
            ? sanitized
            : { ok: result.ok, unknown: result.unknown, result_truncated: true };
        if ((task.result as { result_truncated?: boolean }).result_truncated)
          task.output = (task.output + '\nLarge CLI result omitted from console history.').slice(
            -65536
          );
        task.status = result.unknown ? 'unknown' : result.ok ? 'succeeded' : 'failed';
        if (result.error) task.error = String(sanitizeDiagnosticValue(result.error)).slice(0, 8192);
      } catch (error) {
        task.status = 'failed';
        task.error = String(
          sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error))
        ).slice(0, 8192);
      } finally {
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
    if (this.historyFile) {
      fs.mkdirSync(path.dirname(this.historyFile), { recursive: true, mode: 0o700 });
      while (
        Buffer.byteLength(JSON.stringify(Array.from(this.tasks.values()))) >
        40 * 1024 * 1024
      ) {
        const oldest = this.list()
          .reverse()
          .find((task) => task.status !== 'running');
        if (!oldest) throw new ConsoleError('Active console history exceeds the supported size.');
        this.tasks.delete(oldest.id);
      }
      writePrivateJson(this.historyFile, Array.from(this.tasks.values()));
    }
  }
}
