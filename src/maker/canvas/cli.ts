import fs from 'node:fs';
import { canvasExportDirectory, readCanvasImport, writeCanvasExport } from './automationFiles.js';
import { selectCanvasSnapshot } from './automationInfo.js';
import { randomUUID } from 'node:crypto';
import { canvasConsoleConnection } from '../console/cli.js';
import {
  canvasAutomationCapabilities,
  canvasAutomationSnapshot,
  validateCanvasCommand,
} from './automation.js';
import type { CanvasDocument } from './model.js';

export async function runCanvasCli(
  action: string | undefined,
  options: Record<string, string | boolean>
) {
  const print = (value: unknown) =>
    process.stdout.write(JSON.stringify(value) + String.fromCharCode(10));
  if (action === 'capabilities') {
    print(canvasAutomationCapabilities());
    return;
  }
  if (typeof options.target_dir !== 'string')
    throw new Error('canvas 操作必须显式传入 --target-dir 项目绝对路径。');
  const known = [
    'list',
    'templates',
    'pages',
    'status',
    'wait',
    'download',
    ...canvasAutomationCapabilities().actions,
  ];
  if (!action || !known.includes(action))
    throw new Error('未知画布命令，请运行 canvas capabilities。');
  const connection = await canvasConsoleConnection(options.target_dir);
  const outputDirectory =
    ['export', 'download'].includes(action) && options.output_dir !== undefined
      ? canvasExportDirectory(options.output_dir)
      : undefined;
  async function download(operation: Record<string, any>) {
    if (!outputDirectory) throw new Error('下载需要 --output-dir 指定已有目录。');
    if (operation.status !== 'succeeded' || !operation.result?.export)
      throw new Error('此操作尚无导出结果，请先查询 status。');
    const exported = operation.result.export;
    const response = await connection.transfer(
      '/automation/exports/' + encodeURIComponent(operation.id)
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== exported.size)
      throw new Error('导出内容不完整，请重新 download 原操作。');
    const outputPath = writeCanvasExport(outputDirectory, exported.filename, bytes);
    let warning: string | undefined;
    try {
      await connection.transfer('/automation/exports/' + encodeURIComponent(operation.id), {
        method: 'DELETE',
      });
    } catch {
      warning = '文件已保存，临时导出缓存未释放，将在10分钟后过期。';
    }
    return { ...operation, outputPath, ...(warning ? { warning } : {}) };
  }
  if (action === 'download') {
    if (typeof options.operation_id !== 'string') throw new Error('缺少 --operation-id。');
    print(
      await download(
        await connection.request(
          '/automation/status?id=' + encodeURIComponent(options.operation_id)
        )
      )
    );
    return;
  }
  if (action === 'list') {
    print(await connection.request(''));
    return;
  }
  if (action === 'templates') {
    const query = new URLSearchParams({
      page: String(options.page || 1),
      q: String(options.q || ''),
    });
    print(await connection.request('/templates?' + query));
    return;
  }
  if (action === 'pages') {
    print({ url: connection.url, pages: await connection.request('/automation/pages') });
    return;
  }
  if (action === 'inspect' && options.saved === true) {
    if (typeof options.canvas_id !== 'string') throw new Error('缺少 --canvas-id。');
    const saved = await connection.request('/' + encodeURIComponent(options.canvas_id));
    print(
      selectCanvasSnapshot(
        {
          source: 'saved',
          capturedAt: new Date().toISOString(),
          ...canvasAutomationSnapshot(saved as CanvasDocument),
          executionState: 'unavailable',
        },
        typeof options.id === 'string' ? options.id : undefined
      )
    );
    return;
  }
  if (action === 'status' || action === 'wait') {
    if (typeof options.operation_id !== 'string') throw new Error('缺少 --operation-id。');
    const seconds = options.timeout === undefined ? 30 : Number(options.timeout);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60)
      throw new Error('--timeout 范围为 0～60 秒。');
    const deadline = Date.now() + seconds * 1000;
    for (;;) {
      const operation = await connection.request(
        '/automation/status?id=' + encodeURIComponent(options.operation_id)
      );
      if (
        action === 'status' ||
        !['queued', 'running'].includes(operation.status) ||
        Date.now() >= deadline
      ) {
        print(operation);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  let input: unknown = {};
  if (options.input !== undefined && options.input_file !== undefined)
    throw new Error('--input 与 --input-file 不能同时使用。');
  if (typeof options.input === 'string') input = JSON.parse(options.input);
  if (typeof options.input_file === 'string') {
    const stat = fs.statSync(options.input_file);
    if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('input 文件必须小于 128 KiB。');
    const content = fs.readFileSync(options.input_file, 'utf8');
    input = JSON.parse(content.charCodeAt(0) === 0xfeff ? content.slice(1) : content);
  }
  const command = validateCanvasCommand({
    requestId: typeof options.request_id === 'string' ? options.request_id : randomUUID(),
    pageId: options.page_id,
    canvasId: options.canvas_id,
    action,
    input,
    ...(options.revision !== undefined ? { revision: Number(options.revision) } : {}),
    allowPaid: options.allow_paid === true,
  });
  if (action === 'import') {
    if (typeof options.file !== 'string') throw new Error('import 需要 --file 本地素材绝对路径。');
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== 'title')
    )
      throw new Error('import input 只接受可选 title；素材由 --file 指定。');
    if (
      'title' in input &&
      (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 80)
    )
      throw new Error('导入标题必须为1～80字符。');
    if (options.request_id !== undefined) {
      let exists = false;
      try {
        await connection.request('/automation/status?id=' + encodeURIComponent(command.requestId));
        exists = true;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('操作记录不存在')) throw error;
      }
      if (exists) throw new Error('原 request-id 已有记录，请用 status 查询，不要再次导入。');
    }
    const asset = readCanvasImport(options.file);
    const response = await connection.transfer(
      '/' + encodeURIComponent(command.canvasId) + (asset.kind === 'image' ? '/images' : '/videos'),
      {
        method: 'POST',
        headers: { 'Content-Type': asset.mime },
        body: new Uint8Array(asset.bytes),
      }
    );
    const saved = (await response.json()) as { relativePath: string };
    command.input = {
      ...command.input,
      title: command.input.title || asset.title,
      kind: asset.kind,
      assetPath: saved.relativePath,
    };
  }
  try {
    let operation = await connection.request('/automation/submit', command);
    if (action === 'export' && outputDirectory) {
      const deadline = Date.now() + 60000;
      while (['queued', 'running'].includes(operation.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        operation = await connection.request(
          '/automation/status?id=' + encodeURIComponent(operation.id)
        );
      }
      if (operation.status === 'succeeded') {
        try {
          print(await download(operation));
        } catch (error) {
          print({
            ...operation,
            downloadStatus: 'failed',
            error: (error as Error).message,
            next:
              '用 download --operation-id ' +
              operation.id +
              ' --output-dir <目录> 取回原导出；不要重新生成素材。',
          });
          process.exitCode = 1;
        }
        return;
      }
      operation = {
        ...operation,
        next:
          '继续查询原操作；成功后用 download --operation-id ' +
          operation.id +
          ' --output-dir <目录> 取回。',
      };
    }
    print(operation);
  } catch (error) {
    const rejected =
      typeof (error as { status?: unknown }).status === 'number' &&
      (error as { status: number }).status < 500;
    print({
      status: rejected ? 'rejected' : 'unknown',
      operationId: command.requestId,
      error: error instanceof Error ? error.message : String(error),
      next: rejected
        ? '命令未被接受，请根据错误处理后重新 inspect。'
        : '先用 status 查询此 operationId；不要用新 requestId 自动重发。',
    });
    process.exitCode = 1;
  }
}
