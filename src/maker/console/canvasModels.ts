import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { callRemoteProxyTool } from '../server/mcp.js';
import {
  getRemoteProxyExecutionState,
  RemoteProxyToolCallError,
  RemoteProxyToolResultError,
} from '../server/proxyAssets.js';
import type { MakerRemoteProxyManager } from '../server/remoteProxyManager.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { canvasNodeVersion } from '../canvas/dependencies.js';
import {
  canvasModelInput,
  canvasModelIsCurrent,
  type CanvasModelAttempt,
} from '../canvas/model3d.js';
import { ConsoleError } from './types.js';
import { createCanvasZip } from '../canvas/zipArchive.js';

const active = new Set<string>();
const idPattern = /^[0-9a-f-]{36}$/i;
function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function payload(value: unknown): Record<string, any> {
  const result = record(value);
  if (result.structuredContent) return record(result.structuredContent);
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (item.type !== 'text') continue;
    try {
      return record(JSON.parse(item.text));
    } catch {
      continue;
    }
  }
  return {};
}

export class CanvasModelService {
  private readonly files: MakerCanvasFiles;
  constructor(
    private readonly root: string,
    private readonly manager?: MakerRemoteProxyManager,
    private readonly call: typeof callRemoteProxyTool = callRemoteProxyTool
  ) {
    this.files = new MakerCanvasFiles(root);
  }
  private safe(relative: string, createDirectory = false): string {
    if (
      !relative ||
      relative.includes('\\') ||
      path.posix.isAbsolute(relative) ||
      relative
        .split('/')
        .some((part) => !part || part === '.' || part === '..' || part.includes(':'))
    )
      throw new ConsoleError('模型文件路径无效。');
    let current = this.files.root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (!fs.existsSync(current) && createDirectory) fs.mkdirSync(current);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        throw new ConsoleError('模型文件不能经过符号链接。');
    }
    return current;
  }
  private folder(create = false): string {
    return this.safe('.maker/canvases/model-attempts', create);
  }
  private write(attempt: CanvasModelAttempt) {
    const filename = path.join(this.folder(true), attempt.id + '.json');
    if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
      throw new ConsoleError('模型记录路径无效。');
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(attempt), { flag: 'wx' });
      fs.renameSync(temporary, filename);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  list(canvasId: string): CanvasModelAttempt[] {
    if (!idPattern.test(canvasId)) throw new ConsoleError('画布 ID 无效。');
    const folder = this.folder();
    if (!fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder)
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .flatMap((name) => {
        const filename = this.safe('.maker/canvases/model-attempts/' + name);
        const attempt = JSON.parse(fs.readFileSync(filename, 'utf8')) as CanvasModelAttempt;
        if (attempt.canvasId !== canvasId) return [];
        if (
          attempt.status === 'running' &&
          !active.has(this.root + ':' + canvasId + ':' + attempt.nodeId)
        )
          return [
            {
              ...attempt,
              status: 'unknown' as const,
              retrySafe: false,
              error: '本地等待已中断，请查询原模型任务，不会自动重新生成。',
            },
          ];
        return [attempt];
      })
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
      );
  }
  async export(canvasId: string, nodeId: string): Promise<Buffer> {
    const document = await this.files.load(canvasId);
    const { target, views } = canvasModelInput(document, nodeId);
    const attempt = this.list(canvasId).find((item) => item.nodeId === views.id);
    if (target.type !== 'model' || !attempt?.modelPath || attempt.status !== 'completed')
      throw new ConsoleError('此模型尚无已交付的资源。');
    if (!canvasModelIsCurrent(document, attempt))
      throw new ConsoleError('来源已经变化，请先处理当前模型流程。');
    const directory = attempt.modelDirectory;
    if (!directory?.startsWith('assets/model/') || !attempt.modelPath.startsWith(directory + '/'))
      throw new ConsoleError('缺少完整模型目录，不能导出可能缺少材质的文件；模型仍保留在项目中。');
    const entries: Array<{ name: string; blob: Blob }> = [];
    let total = 0;
    const visit = (relative: string) => {
      const filename = this.safe(relative);
      const stat = fs.statSync(filename);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(filename)) visit(relative + '/' + name);
      } else {
        if (!stat.isFile()) throw new ConsoleError('模型目录包含不支持的文件。');
        total += stat.size;
        if (total > 128 * 1024 * 1024 || entries.length >= 121)
          throw new ConsoleError(
            '模型包超过 128 MiB 或 121 个资源文件，请从项目模型目录直接复制。'
          );
        entries.push({
          name: relative,
          blob: new Blob([new Uint8Array(fs.readFileSync(filename))]),
        });
      }
    };
    visit(directory);
    entries.push({
      name: 'README.txt',
      blob: new Blob([
        'Copy the assets folder into your Maker project, preserving model/material/texture paths. Model: ' +
          attempt.modelPath,
      ]),
    });
    return Buffer.from(await (await createCanvasZip(entries)).arrayBuffer());
  }
  async execute(
    canvasId: string,
    input: {
      nodeId: string;
      action: 'start' | 'query' | 'confirm';
      revision?: number;
      reviewId?: string;
    }
  ): Promise<CanvasModelAttempt> {
    if (!['start', 'query', 'confirm'].includes(input.action))
      throw new ConsoleError('不支持的模型操作。');
    const document = await this.files.load(canvasId);
    const { target, views, character, quality } = canvasModelInput(document, input.nodeId);
    const key = this.root + ':' + canvasId + ':' + views.id;
    if (active.has(key))
      throw new ConsoleError('此模型请求仍在执行，请等待或刷新本地状态，不要重复提交。', 409);
    const previous = this.list(canvasId).find((item) => item.nodeId === views.id);
    if (input.action !== 'query' && document.revision !== input.revision)
      throw new ConsoleError('画布版本已变化，请重新读取后操作。', 409);
    if (input.action !== 'query' && (!character.assetPath || character.templatePending))
      throw new ConsoleError('请先完成并确认角色图片。');
    if (input.action === 'start' && target.type !== 'model-views')
      throw new ConsoleError('请先生成多视图并确认，不允许跳过预览直接生成模型。');
    if (
      input.action === 'start' &&
      previous &&
      !(previous.status === 'failed' && previous.retrySafe) &&
      !(
        canvasModelIsCurrent(document, previous) === false &&
        ['review', 'completed', 'failed'].includes(previous.status)
      )
    )
      throw new ConsoleError(
        '已有模型任务，请查询原任务；需要新模型时复制模板，不会重复扣费。',
        409
      );
    if (input.action !== 'start' && !previous) throw new ConsoleError('还没有模型任务。');
    if (
      input.action === 'confirm' &&
      (target.type !== 'model' ||
        previous?.status !== 'review' ||
        !previous.assetId ||
        !previous.stepId ||
        !previous.reviewId ||
        input.reviewId !== previous.reviewId ||
        !canvasModelIsCurrent(document, previous))
    )
      throw new ConsoleError('预览已过期或尚未完整就绪。请重新查询并确认全部视图。', 409);
    if (input.action === 'query' && !previous?.assetId && !previous?.taskId)
      throw new ConsoleError(
        '尚未取得模型任务 ID，请先刷新本地记录；结果未知时不要重提付费请求。',
        409
      );
    active.add(key);
    let attempt: CanvasModelAttempt | undefined;
    try {
      await this.files.assertWritableForGeneration();
      if (
        input.action !== 'query' &&
        (await this.files.load(canvasId)).revision !== document.revision
      )
        throw new ConsoleError('画布版本已变化，模型请求未提交。', 409);
      const now = new Date().toISOString();
      attempt =
        input.action === 'start'
          ? {
              id: randomUUID(),
              canvasId,
              nodeId: views.id,
              sourceId: character.id,
              sourceVersion: canvasNodeVersion(character)!,
              quality,
              phase: 'views',
              status: 'running',
              previews: [],
              createdAt: now,
              updatedAt: now,
            }
          : { ...previous!, status: 'running', retrySafe: false, error: undefined, updatedAt: now };
      if (input.action === 'confirm') {
        attempt.phase = 'model';
        delete attempt.reviewId;
      }
      this.write(attempt);
      const args =
        input.action === 'start'
          ? {
              action: 'start',
              payload: {
                generation_strategy: 'reviewed',
                quality_tier: quality,
                images: { front: character.assetPath },
              },
            }
          : input.action === 'confirm'
            ? {
                action: 'continue',
                asset_id: attempt.assetId,
                step_id: attempt.stepId,
                payload: { confirm: true },
              }
            : {
                action: 'query',
                ...(attempt.assetId ? { asset_id: attempt.assetId } : { task_id: attempt.taskId }),
              };
      const result = await this.call({
        targetDir: this.root,
        name: 'create_3d_asset',
        args,
        manager: this.manager,
        retryExpiredAuth: false,
        onRawResult: (raw) => {
          const response = payload(raw);
          if (typeof response.asset_id === 'string') attempt!.assetId = response.asset_id;
          if (typeof response.task_id === 'string') attempt!.taskId = response.task_id;
          attempt!.updatedAt = new Date().toISOString();
          this.write(attempt!);
        },
      });
      await this.apply(attempt, payload(result));
      this.write(attempt);
      return attempt;
    } catch (error) {
      if (!attempt) throw error;
      const state =
        error instanceof RemoteProxyToolCallError
          ? error.executionState
          : error instanceof RemoteProxyToolResultError
            ? getRemoteProxyExecutionState(error.result)
            : undefined;
      attempt.status = state === 'not_executed' && input.action === 'start' ? 'failed' : 'unknown';
      attempt.retrySafe = state === 'not_executed' && input.action === 'start';
      attempt.error = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
      attempt.updatedAt = new Date().toISOString();
      this.write(attempt);
      return attempt;
    } finally {
      active.delete(key);
    }
  }
  private async apply(attempt: CanvasModelAttempt, response: Record<string, any>) {
    if (typeof response.asset_id === 'string') attempt.assetId = response.asset_id;
    if (typeof response.task_id === 'string') attempt.taskId = response.task_id;
    attempt.updatedAt = new Date().toISOString();
    const next = record(response.next_action);
    const local = record(response.local_delivery);
    const model = record(local.model);
    if (local.status === 'success' && typeof model.local_path === 'string') {
      const relative = model.local_path as string;
      if (!relative.startsWith('assets/model/')) throw new Error('模型结果不在项目模型目录。');
      const stat = fs.statSync(this.safe(relative));
      if (!stat.isFile() || !stat.size) throw new Error('模型结果文件为空或不存在。');
      attempt.modelPath = relative;
      attempt.format =
        typeof model.format === 'string' ? model.format : path.extname(relative).slice(1);
      const delivery = (Array.isArray(response.model_files) ? response.model_files : []).find(
        (item: any) =>
          typeof item.targetDirectory === 'string' &&
          relative.startsWith(item.targetDirectory + '/')
      );
      if (
        delivery &&
        delivery.targetDirectory.startsWith('assets/model/') &&
        delivery.targetDirectory !== 'assets/model/'
      )
        attempt.modelDirectory = delivery.targetDirectory;
      attempt.status = 'completed';
      delete attempt.reviewId;
      return;
    }
    if (next.action === 'continue' && typeof next.step_id === 'string') {
      const previews = Object.entries(record(response.preview_assets));
      const expected = Object.keys(record(response.preview));
      if (
        !previews.length ||
        previews.length > 8 ||
        expected.some((view) => !record(response.preview_assets)[view])
      )
        throw new Error('多视图预览未完整下载，请查询原任务恢复，不能直接确认。');
      const imported: CanvasModelAttempt['previews'] = [];
      const fingerprint = createHash('sha256').update(attempt.id + next.step_id);
      for (const [view, value] of previews) {
        const relative = record(value).localPath;
        if (typeof relative !== 'string' || !relative.startsWith('assets/image/'))
          throw new Error('预览图片没有可用的本地文件，请查询原任务恢复。');
        const filename = this.safe(relative);
        if (!fs.statSync(filename).isFile() || fs.statSync(filename).size > 20 * 1024 * 1024)
          throw new Error('预览图片超出可读取范围。');
        const bytes = fs.readFileSync(filename);
        fingerprint.update(view).update(bytes);
        const saved = await this.files.importImage(bytes);
        imported.push({ view: view.slice(0, 80), path: saved.relativePath });
      }
      attempt.previews = imported;
      attempt.stepId = next.step_id;
      attempt.reviewId = fingerprint.digest('hex');
      attempt.status = 'review';
      return;
    }
    if (response.status === 'failed' || response.success === false) {
      attempt.status = 'failed';
      attempt.error =
        typeof response.error === 'string'
          ? response.error.slice(0, 4000)
          : '上游模型任务失败，请查看原任务；不会自动重新生成。';
    } else if (response.status === 'completed' || local.status === 'failed') {
      attempt.status = 'unknown';
      attempt.error = '远端已返回，但本地模型尚未交付成功，请查询原任务恢复下载。';
    } else {
      attempt.status = attempt.assetId || attempt.taskId ? 'pending' : 'unknown';
      if (attempt.status === 'unknown')
        attempt.error = '上游未返回可识别的任务或结果，请核实后继续，不能自动重提。';
    }
  }
}
