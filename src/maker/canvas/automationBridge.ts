import { createHash, randomUUID } from 'node:crypto';
import { validateCanvasCommand, type CanvasCommand, type CanvasOperation } from './automation.js';

type Page = { id: string; project: string; canvasId: string; revision: number; updatedAt: number };
type Entry = {
  project: string;
  action: string;
  command?: CanvasCommand;
  fingerprint: string;
  operation: CanvasOperation;
};

export class CanvasAutomationBridge {
  private pages = new Map<string, Page>();
  private operations = new Map<string, Entry>();
  private exports = new Map<string, { bytes: Buffer; expiresAt: number }>();
  constructor(private now = Date.now) {}

  list(project: string) {
    return [...this.pages.values()]
      .filter((page) => page.project === project && this.now() - page.updatedAt < 15000)
      .map(({ project: _project, ...page }) => page);
  }

  submit(project: string, value: unknown): CanvasOperation {
    const command = validateCanvasCommand(value);
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const previous = this.operations.get(command.requestId);
    if (previous) {
      if (previous.project !== project || previous.fingerprint !== fingerprint)
        throw new Error('requestId 已用于其他命令，请勿复用。');
      return this.status(project, command.requestId);
    }
    const page = this.list(project).find((page) => page.id === command.pageId);
    if (!page) throw new Error('画布页面未连接。请打开序列帧动画并重新查询 pages。');
    if (page.canvasId !== command.canvasId) throw new Error('页面已切换画布，请重新 inspect。');
    if (this.operations.size >= 1000)
      throw new Error('本次控制台会话命令记录已满，请完成任务后重启控制台。');
    const active = [...this.operations.values()].some(
      ({ operation }) =>
        operation.pageId === page.id && ['queued', 'running'].includes(operation.status)
    );
    if (active && !['inspect', 'stop'].includes(command.action))
      throw new Error('此页面有 AI 操作未完成，请先查询原 operationId。');
    const operation: CanvasOperation = {
      id: command.requestId,
      pageId: page.id,
      canvasId: command.canvasId,
      status: 'queued',
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.operations.set(operation.id, {
      project,
      action: command.action,
      command,
      fingerprint,
      operation,
    });
    return operation;
  }

  status(project: string, id: string): CanvasOperation {
    this.expireExports();
    const entry = this.operations.get(id);
    if (!entry || entry.project !== project) throw new Error('操作记录不存在；不会自动重发。');
    const operation = entry.operation;
    const page = this.pages.get(operation.pageId);
    if (operation.status === 'queued' && this.now() - operation.createdAt > 10000) {
      operation.status = 'failed';
      operation.error = '命令未派发，页面未及时接收。';
      operation.updatedAt = this.now();
      entry.command = undefined;
    } else if (operation.status === 'running' && (!page || this.now() - page.updatedAt > 15000)) {
      operation.status = 'unknown';
      operation.error = '页面连接中断，执行结果待确认；请检查原卡片或视频历史，不要重新生成。';
      operation.updatedAt = this.now();
    }
    return operation;
  }

  private expireExports() {
    for (const [id, item] of this.exports)
      if (item.expiresAt <= this.now()) this.exports.delete(id);
  }

  checkExport(project: string, id: string, pageId?: string) {
    const entry = this.operations.get(id);
    if (!entry || entry.project !== project || entry.action !== 'export')
      throw new Error('导出操作不存在。');
    if (
      pageId !== undefined &&
      (entry.operation.pageId !== pageId ||
        !['running', 'unknown'].includes(entry.operation.status))
    )
      throw new Error('导出结果与执行页面不匹配。');
    return entry.operation;
  }

  saveExport(project: string, id: string, pageId: string, bytes: Buffer) {
    this.checkExport(project, id, pageId);
    this.expireExports();
    const size = [...this.exports.values()].reduce((total, item) => total + item.bytes.length, 0);
    if (
      !bytes.length ||
      size - (this.exports.get(id)?.bytes.length || 0) + bytes.length > 128 * 1024 * 1024
    )
      throw new Error('导出缓存上限为128 MiB，请先下载已有结果，或缩小导出范围。');
    this.exports.set(id, { bytes, expiresAt: this.now() + 10 * 60 * 1000 });
  }

  readExport(project: string, id: string): Buffer {
    const operation = this.checkExport(project, id);
    this.expireExports();
    if (operation.status !== 'succeeded') throw new Error('导出尚未成功，请查询原操作。');
    const item = this.exports.get(id);
    if (!item) throw new Error('导出缓存已释放或超过10分钟，请重新导出；不需要重新生成素材。');
    return item.bytes;
  }

  releaseExport(project: string, id: string) {
    this.checkExport(project, id);
    this.exports.delete(id);
  }

  exchange(project: string, value: unknown) {
    const body = value as {
      pageId?: string;
      canvasId?: string;
      revision?: number;
      received?: string[];
      results?: Array<{
        id: string;
        status: 'succeeded' | 'failed';
        result?: unknown;
        error?: string;
      }>;
    };
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.canvasId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(body.canvasId) ||
      !Number.isSafeInteger(body.revision)
    )
      throw new Error('无效的画布页面状态。');
    let page = body.pageId ? this.pages.get(body.pageId) : undefined;
    if (body.pageId && (!page || page.project !== project))
      throw Object.assign(
        new Error('画布连接会话已失效，请刷新页面并查询原任务；不会自动重发命令。'),
        { code: 'CANVAS_PAGE_EXPIRED' }
      );
    if (!page) {
      for (const [id, stale] of this.pages)
        if (
          this.now() - stale.updatedAt > 60000 &&
          ![...this.operations.values()].some(
            (entry) =>
              entry.operation.pageId === id &&
              ['queued', 'running', 'unknown'].includes(entry.operation.status)
          )
        )
          this.pages.delete(id);
      if (this.pages.size >= 32) throw new Error('连接的画布页面过多。');
      page = {
        id: randomUUID(),
        project,
        canvasId: body.canvasId,
        revision: body.revision!,
        updatedAt: this.now(),
      };
      this.pages.set(page.id, page);
    }
    page.canvasId = body.canvasId;
    page.revision = body.revision!;
    page.updatedAt = this.now();
    if (
      body.received !== undefined &&
      (!Array.isArray(body.received) ||
        body.received.length > 1000 ||
        body.received.some((id) => typeof id !== 'string'))
    )
      throw new Error('无效的命令接收记录。');
    if (body.results !== undefined && (!Array.isArray(body.results) || body.results.length > 20))
      throw new Error('无效的操作结果。');
    const acknowledged: string[] = [];
    for (const result of body.results || []) {
      const entry = this.operations.get(result.id);
      if (
        !entry ||
        entry.project !== project ||
        entry.operation.pageId !== page.id ||
        !['succeeded', 'failed'].includes(result.status)
      )
        throw new Error('操作结果与页面不匹配。');
      if (['running', 'unknown'].includes(entry.operation.status))
        Object.assign(entry.operation, {
          status: result.status,
          result: result.result,
          error: result.error,
          updatedAt: this.now(),
        });
      acknowledged.push(result.id);
    }
    const commands: CanvasCommand[] = [];
    for (const entry of this.operations.values()) {
      if (entry.operation.pageId !== page.id || entry.project !== project) continue;
      if (entry.operation.status === 'running' && !body.received?.includes(entry.operation.id)) {
        entry.operation.status = 'unknown';
        entry.operation.error = '页面未确认收到命令，执行结果待确认；不会重新派发。';
        entry.operation.updatedAt = this.now();
      }
      if (this.status(project, entry.operation.id).status !== 'queued') continue;
      entry.operation.status = 'running';
      entry.operation.updatedAt = this.now();
      commands.push(entry.command!);
      entry.command = undefined;
    }
    const retained = [...this.operations.values()]
      .filter((entry) => entry.operation.result !== undefined)
      .sort((left, right) => right.operation.updatedAt - left.operation.updatedAt);
    for (const entry of retained.slice(20)) {
      delete entry.operation.result;
      entry.operation.resultExpired = true;
    }
    return { pageId: page.id, acknowledged, commands };
  }
}
