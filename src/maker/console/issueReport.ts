import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MakerIssueCategory, MakerMcpReportContext } from '../cli/mcpIssueReport.js';
import { previewDirectory, readPreviewRecord } from '../preview/protocol.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import type { ConsoleTask } from './types.js';

export function consoleReportOffer(
  task: ConsoleTask
): { category: MakerIssueCategory; fingerprint: string } | undefined {
  if (!['failed', 'unknown'].includes(task.status)) return;
  if (task.action === 'lua-lsp.check' || task.interaction || task.recovery) return;
  const error = task.error || '';
  // Expected project/auth errors already have an actionable recovery, not a product incident.
  if (
    /找不到本地预览入口|Runtime is missing|taptap-maker login|PAT.*(?:expired|invalid)|HTTP 40[13]|cancelled|canceled|用户取消|Please commit your changes|CONFLICT|Need to call maker_build_current_directory|Invalid.*config|配置.*(?:损坏|缺失)|requires a bound Maker project/i.test(
      error
    )
  )
    return;
  const preview = ['preview.start', 'preview.refresh', 'preview.install'].includes(task.action);
  if (
    !preview &&
    !/timeout|timed out|HTTP 5\d\d|internal.*error|unverifiable|verifiable JSON|unexpected|connection closed/i.test(
      error
    )
  )
    return;
  const category: MakerIssueCategory = preview
    ? 'runtime'
    : task.action === 'build' || task.action === 'qrcode'
      ? 'build'
      : 'console';
  const stable = error
    .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, '<id>')
    .replace(/[a-f0-9]{64}/gi, '<hash>')
    .replace(/\b\d+\b/g, '<n>');
  return {
    category,
    fingerprint: createHash('sha256')
      .update(task.projectKey + ':' + task.action + ':' + stable)
      .digest('hex'),
  };
}

// Read only managed, fixed log names. Never follow a filename supplied by the browser or an error.
function logTail(root: string, relative: string): string {
  let fd: number | undefined;
  try {
    if (fs.lstatSync(root).isSymbolicLink()) return '[日志不可用]';
    const file = path.join(fs.realpathSync(root), relative);
    if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) return '[日志不可用]';
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return '[日志不可用]';
    const offset = Math.max(0, stat.size - 6000);
    const buffer = Buffer.alloc(Math.min(stat.size, 6000));
    fs.readSync(fd, buffer, 0, buffer.length, offset);
    let text = buffer.toString('utf8');
    // Drop a cut first line rather than uploading a partial credential.
    if (offset) text = text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : '';
    return (offset ? '[日志仅含尾部]\n' : '') + String(sanitizeDiagnosticValue(text));
  } catch {
    return '[日志不存在或无法读取]';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function consoleReportContext(task: ConsoleTask, project: string): MakerMcpReportContext {
  const offer = consoleReportOffer(task);
  const directory = previewDirectory(project);
  let preview: unknown = { status: 'unavailable' };
  const logs: Record<string, string> = {};
  if (task.action.startsWith('preview.')) {
    try {
      const record = readPreviewRecord(project);
      const result = task.result as { session_id?: string; reload_id?: number } | undefined;
      const sameSession = result?.session_id
        ? result.session_id === record?.session_id &&
          (result.reload_id === undefined || result.reload_id === record?.reload_id)
        : record &&
          Date.parse(record.started_at) >= Date.parse(task.startedAt) &&
          Date.parse(record.started_at) <= Date.parse(task.finishedAt || new Date().toISOString());
      // A later preview must not be attributed to the failed operation.
      if (record && sameSession) {
        logs.supervisor = logTail(directory, 'supervisor.log');
        preview = {
          state: record.state,
          session_id: record.session_id,
          reload_id: record.reload_id,
          supervisor_pid: record.supervisor_pid,
          runtime_pid: record.runtime_pid,
          runtime_launch_pending: record.runtime_launch_pending,
          runtime: record.runtime,
          executable: record.executable,
        };
        const round = path.join('sessions', record.session_id, String(record.reload_id));
        logs.prepare = logTail(directory, path.join(round, 'prepare.log'));
        logs.runtime = logTail(directory, path.join(round, 'runtime.log'));
      }
      if (!record) logs.supervisor = logTail(directory, 'supervisor.log');
    } catch {
      /* Missing or damaged records must not prevent reporting startup failures. */
    }
  }
  return {
    source: 'console',
    category: offer?.category || 'console',
    summary: `${process.platform} ${task.action} 失败：${(task.error || '执行结果未知').split('\n')[0].slice(0, 160)}`,
    failed_operation: task.action,
    error_message: task.error?.slice(0, 3000),
    reproduction_steps: ['在 Maker 控制台选择项目', `执行 ${task.action}`, '出现异常或结果未知'],
    error_data: {
      task_id: task.id,
      started_at: task.startedAt,
      finished_at: task.finishedAt,
      status: task.status,
      os_release: os.release(),
      preview,
      logs,
      output: task.output.slice(-2000),
    },
  };
}
