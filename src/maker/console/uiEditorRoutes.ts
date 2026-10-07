import { editorDemoResource, readDemoResource } from '../demoResources.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { readUiEditorAsset, uiEditorMime } from '../uiEditor/assets.js';
import { readUiFile, saveUiFile, uiEditorManifest } from '../uiEditor/projectFiles.js';
import type { ConsoleProjects } from './projects.js';
import { ConsoleError } from './types.js';

export async function serveUiEditor(url: URL, response: ServerResponse): Promise<boolean> {
  if (!url.pathname.startsWith('/ui-editor/')) return false;
  const relative = decodeURIComponent(url.pathname.slice('/ui-editor/'.length)) || 'index.html';
  const demo = editorDemoResource(relative);
  const bytes = demo ? await readDemoResource(demo) : readUiEditorAsset(relative);
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
  suffix: string
): Promise<boolean> {
  if (!suffix.startsWith('ui-editor/')) return false;
  const project = registry.resolve(key);
  let result: unknown;
  if (request.method === 'GET' && suffix === 'ui-editor/manifest') {
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
