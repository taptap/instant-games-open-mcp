import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { CanvasStoreError } from '../canvas/model.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { ConsoleError } from './types.js';
import type { ConsoleProjects } from './projects.js';

async function readBytes(request: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new ConsoleError('Request body is too large.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export async function handleCanvasProjectRoute(options: {
  request: IncomingMessage;
  response: ServerResponse;
  method: string;
  suffix: string | undefined;
  searchParams: URLSearchParams;
  key: string;
  registry: ConsoleProjects;
}): Promise<boolean> {
  const { request, response, method, suffix, searchParams, key, registry } = options;
  if (!suffix || (!suffix.startsWith('canvases') && suffix !== 'canvas-media')) return false;
  const project = registry.resolve(key);
  const files = new MakerCanvasFiles(project.path);
  try {
    if (method === 'GET' && suffix === 'canvas-media') {
      const media = files.readMedia(searchParams.get('path') || '');
      response.setHeader('Content-Type', media.type);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const size = statSync(media.file).size;
      response.setHeader('Accept-Ranges', 'bytes');
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
        const end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
        if (
          !match ||
          (!match[1] && !match[2]) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start >= size ||
          end < start
        ) {
          response.writeHead(416, { 'Content-Range': 'bytes */' + size });
          response.end();
          return true;
        }
        response.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Content-Length': end - start + 1,
        });
        await pipeline(createReadStream(media.file, { start, end }), response);
      } else {
        response.setHeader('Content-Length', size);
        await pipeline(createReadStream(media.file), response);
      }
      return true;
    }
    if (method === 'GET' && suffix === 'canvases') {
      send(response, 200, await files.list());
      return true;
    }
    if (method === 'GET' && suffix === 'canvases/active') {
      send(response, 200, { canvasId: await files.getActiveCanvasId() });
      return true;
    }
    if (method === 'PUT' && suffix === 'canvases/active') {
      const body = JSON.parse((await readBytes(request, 4096)).toString('utf8')) as {
        canvasId?: unknown;
      };
      if (typeof body.canvasId !== 'string') throw new ConsoleError('缺少活动画布标识。');
      await files.setActiveCanvasId(body.canvasId);
      send(response, 200, { ok: true });
      return true;
    }
    if (method === 'POST' && suffix === 'canvases') {
      const body = JSON.parse((await readBytes(request, 16_384)).toString('utf8') || '{}') as {
        title?: string;
      };
      send(
        response,
        201,
        await files.create(typeof body.title === 'string' ? body.title : undefined)
      );
      return true;
    }
    const one = suffix.match(/^canvases\/([0-9a-f-]{36})$/i);
    if (one && method === 'GET') {
      send(response, 200, await files.load(one[1]));
      return true;
    }
    if (one && method === 'PUT') {
      const input = JSON.parse((await readBytes(request, 1024 * 1024)).toString('utf8'));
      if (!input || typeof input !== 'object' || typeof input.revision !== 'number') {
        throw new ConsoleError('缺少画布 revision。');
      }
      send(response, 200, await files.save(one[1], input, input.revision));
      return true;
    }
    const image = suffix.match(/^canvases\/([0-9a-f-]{36})\/images$/i);
    if (image && method === 'POST') {
      await files.load(image[1]);
      const saved = await files.importImage(await readBytes(request, 20 * 1024 * 1024));
      send(response, 201, saved);
      return true;
    }
    const video = suffix.match(/^canvases\/([0-9a-f-]{36})\/videos$/i);
    if (video && method === 'POST') {
      await files.load(video[1]);
      const contentType =
        typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : '';
      const saved = await files.importVideo(
        video[1],
        await readBytes(request, 100 * 1024 * 1024),
        contentType
      );
      send(response, 201, saved);
      return true;
    }
    throw new ConsoleError('Not found.', 404);
  } catch (error) {
    if (error instanceof CanvasStoreError) {
      throw new ConsoleError(error.message, error.status);
    }
    throw error;
  }
}
