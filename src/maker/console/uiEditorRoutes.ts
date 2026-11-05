import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { readUiEditorAsset, uiEditorMime } from '../uiEditor/assets.js';
import { readUiFile, saveUiFile, uiEditorManifest } from '../uiEditor/projectFiles.js';
import type { ConsoleProjects } from './projects.js';
import { ConsoleError } from './types.js';
import type { UiRenderBridge } from '../uiEditor/renderBridge.js';

export async function serveUiEditor(url: URL, response: ServerResponse): Promise<boolean> {
  if (!url.pathname.startsWith('/ui-editor/')) return false;
  const relative = decodeURIComponent(url.pathname.slice('/ui-editor/'.length)) || 'index.html';
  const bytes = readUiEditorAsset(relative);
  if (!bytes) throw new ConsoleError('编辑器文件不存在。', 404);
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' blob:",
      "connect-src 'self' data:",
      "frame-ancestors 'self'",
      "frame-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')
  );
  response.writeHead(200, { 'Content-Type': uiEditorMime[path.extname(relative)] || 'text/plain' });
  response.end(bytes);
  return true;
}

export async function handleUiEditorRoute(
  request: IncomingMessage,
  response: ServerResponse,
  registry: ConsoleProjects,
  key: string,
  suffix: string,
  render?: UiRenderBridge
): Promise<boolean> {
  if (!suffix.startsWith('ui-editor/')) return false;
  const project = registry.resolve(key);
  let result: unknown;
  if (suffix.startsWith('ui-editor/render/') && render) {
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json'))
        throw new ConsoleError('需要 JSON 请求。', 415);
      const chunks: Buffer[] = [];
      let size = 0;
      const limit = suffix.endsWith('/complete') ? 48 * 1024 * 1024 : 16384;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) throw new ConsoleError('预览请求过大。', 413);
        chunks.push(chunk);
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new ConsoleError('预览请求不是有效 JSON。');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new ConsoleError('预览请求必须是对象。');
    }
    const route = suffix.slice('ui-editor/render/'.length);
    if (request.method === 'POST' && route === 'submit')
      result = await render.submit(key, project.path, body);
    else if (request.method === 'POST' && route === 'claim')
      result = render.claim(key, body.pageId, body.busy);
    else {
      const match = route.match(/^([a-f0-9-]{36})\/(input|result|complete|release)$/);
      if (!match) throw new ConsoleError('未知预览操作。', 404);
      const [, id, action] = match;
      const job = render.get(key, id);
      if (request.method === 'GET' && action === 'input') {
        if (job.state !== 'running') throw new ConsoleError('预览已结束。', 409);
        result = { action: job.action, file: job.file, tree: job.tree, options: job.options };
      } else if (request.method === 'GET' && action === 'result') {
        result = {
          id,
          state: job.state,
          error: job.error,
          source: 'saved',
          file: job.file,
          revision: job.revision,
          result: job.result,
          png: job.png?.toString('base64'),
        };
      } else if (request.method === 'POST' && action === 'complete')
        result = render.complete(key, id, body);
      else if (request.method === 'POST' && action === 'release') result = render.release(key, id);
      else throw new ConsoleError('不支持的预览请求。', 405);
    }
  } else if (request.method === 'GET' && suffix === 'ui-editor/manifest') {
    result = await uiEditorManifest(project);
  } else if (request.method === 'GET' && suffix.startsWith('ui-editor/files/')) {
    const relative = decodeURIComponent(suffix.slice('ui-editor/files/'.length));
    const bytes = await readUiFile(project.path, relative);
    response.writeHead(200, {
      'Content-Type': uiEditorMime[path.extname(relative).toLowerCase()] || 'application/json',
    });
    response.end(bytes);
    return true;
  } else if (request.method === 'POST' && suffix === 'ui-editor/save') {
    if (!request.headers['content-type']?.startsWith('application/json'))
      throw new ConsoleError('保存需要 JSON 请求。', 415);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) throw new ConsoleError('保存请求过大。', 413);
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ConsoleError('保存请求格式无效。');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new ConsoleError('保存请求格式无效。');
    result = await saveUiFile(project.path, body);
  } else throw new ConsoleError('未知编辑器操作。', 404);
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(result));
  return true;
}
