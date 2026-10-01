import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { CanvasStoreError } from '../canvas/model.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { ConsoleError } from './types.js';
import type { ConsoleProjects } from './projects.js';
import { CanvasGenerationService } from './canvasGeneration.js';
import type { MakerRemoteProxyManager } from '../server/remoteProxyManager.js';

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

function stringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new ConsoleError('参考图列表无效。');
  return value;
}

export async function handleCanvasProjectRoute(options: {
  request: IncomingMessage;
  response: ServerResponse;
  method: string;
  suffix: string | undefined;
  searchParams: URLSearchParams;
  key: string;
  registry: ConsoleProjects;
  remoteProxyManager?: MakerRemoteProxyManager;
}): Promise<boolean> {
  const { request, response, method, suffix, searchParams, key, registry } = options;
  if (!suffix || (!suffix.startsWith('canvases') && suffix !== 'canvas-media')) return false;
  const project = registry.resolve(key);
  const files = new MakerCanvasFiles(project.path);
  try {
    if (suffix === 'canvases/templates' && method === 'GET') {
      send(
        response,
        200,
        await files.listTemplatePage(
          Number(searchParams.get('page') || 1),
          searchParams.get('q') || ''
        )
      );
      return true;
    }
    const template = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})$/i);
    const preset = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})\/prepare$/i);
    if (preset && method === 'POST') {
      const body = JSON.parse((await readBytes(request, 4096)).toString('utf8'));
      if (!body || typeof body.canvasId !== 'string')
        throw new ConsoleError('请选择添加模板的画布。');
      send(response, 200, await files.prepareTemplate(preset[1], body.canvasId));
      return true;
    }
    const cover = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})\/cover$/i);
    if (cover && (method === 'GET' || method === 'PUT')) {
      const revision = Number(searchParams.get('revision'));
      if (!Number.isSafeInteger(revision) || revision < 1) throw new ConsoleError('模板版本无效。');
      if (method === 'GET') {
        const result = files.readTemplateCover(cover[1], revision);
        response.writeHead(200, {
          'Content-Type': result.type,
          'Content-Length': result.bytes.length,
          'X-Content-Type-Options': 'nosniff',
          'X-Template-Cover-Source': result.source ? '1' : '0',
        });
        response.end(result.bytes);
      } else {
        files.saveTemplateCover(cover[1], revision, await readBytes(request, 300 * 1024));
        send(response, 200, { ok: true });
      }
      return true;
    }
    if (template && method === 'GET') {
      send(response, 200, files.getTemplate(template[1]));
      return true;
    }
    if (template && (method === 'PUT' || method === 'DELETE')) {
      const body = JSON.parse((await readBytes(request, 1024 * 1024)).toString('utf8'));
      if (!body || typeof body !== 'object') throw new ConsoleError('模板内容无效。');
      if (method === 'PUT') {
        if (body.id !== template[1]) throw new ConsoleError('模板标识不匹配。');
        send(response, 200, await files.saveTemplate(body));
      } else {
        await files.deleteTemplate(template[1], body.revision);
        send(response, 200, { ok: true });
      }
      return true;
    }
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
        template?: 'starter' | 'empty' | 'sequence';
      };
      if (
        body.template !== undefined &&
        !['starter', 'empty', 'sequence'].includes(body.template)
      ) {
        throw new ConsoleError('画布模板无效。');
      }
      send(
        response,
        201,
        await files.create(
          typeof body.title === 'string' ? body.title : undefined,
          body.template || 'empty'
        )
      );
      return true;
    }
    const generationList = suffix.match(/^canvases\/([0-9a-f-]{36})\/generation$/i);
    if (generationList && method === 'GET') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      const service = new CanvasGenerationService(project.path, options.remoteProxyManager);
      send(response, 200, service.list(generationList[1]));
      return true;
    }
    const generationImage = suffix.match(/^canvases\/([0-9a-f-]{36})\/generation\/image$/i);
    if (generationImage && method === 'POST') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      const body = JSON.parse(
        (await readBytes(request, 64 * 1024)).toString('utf8') || '{}'
      ) as Record<string, unknown>;
      if (typeof body.prompt !== 'string' || !body.prompt.trim())
        throw new ConsoleError('缺少图片生成提示词。');
      const attempt = await new CanvasGenerationService(
        project.path,
        options.remoteProxyManager
      ).generateImage({
        canvasId: generationImage[1],
        prompt: body.prompt,
        name: typeof body.name === 'string' ? body.name : undefined,
        targetSize: typeof body.targetSize === 'string' ? body.targetSize : undefined,
        aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
        operation:
          body.operation === 'generate' ||
          body.operation === 'variant' ||
          body.operation === 'outpaint'
            ? body.operation
            : undefined,
        sourceImagePath:
          typeof body.sourceImagePath === 'string' ? body.sourceImagePath : undefined,
        referenceImagePaths: stringList(body.referenceImagePaths),
        sourceImageId: typeof body.sourceImageId === 'string' ? body.sourceImageId : undefined,
        sourceImagePaths:
          body.sourceImagePaths === undefined
            ? undefined
            : Array.isArray(body.sourceImagePaths) &&
                body.sourceImagePaths.every((value) => typeof value === 'string')
              ? body.sourceImagePaths
              : (() => {
                  throw new ConsoleError('图片来源素材列表无效。');
                })(),
        sourceImageIds:
          body.sourceImageIds === undefined
            ? undefined
            : Array.isArray(body.sourceImageIds) &&
                body.sourceImageIds.every((value) => typeof value === 'string')
              ? body.sourceImageIds
              : (() => {
                  throw new ConsoleError('图片来源节点列表无效。');
                })(),
        targetNodeId: typeof body.targetNodeId === 'string' ? body.targetNodeId : undefined,
      });
      send(response, 200, attempt);
      return true;
    }
    const generationVideo = suffix.match(/^canvases\/([0-9a-f-]{36})\/generation\/video$/i);
    if (generationVideo && method === 'POST') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      const body = JSON.parse(
        (await readBytes(request, 64 * 1024)).toString('utf8') || '{}'
      ) as Record<string, unknown>;
      if (typeof body.prompt !== 'string' || !body.prompt.trim())
        throw new ConsoleError('缺少视频生成提示词。');
      if (typeof body.sourceImagePath !== 'string') throw new ConsoleError('缺少视频来源图片。');
      const attempt = await new CanvasGenerationService(
        project.path,
        options.remoteProxyManager
      ).createVideo({
        canvasId: generationVideo[1],
        prompt: body.prompt,
        sourceImagePath: body.sourceImagePath,
        sourceImageId: typeof body.sourceImageId === 'string' ? body.sourceImageId : undefined,
        targetNodeId: typeof body.targetNodeId === 'string' ? body.targetNodeId : undefined,
        duration: typeof body.duration === 'number' ? body.duration : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
        ratio: typeof body.ratio === 'string' ? body.ratio : undefined,
        userConfirmed: body.userConfirmed === true,
        sourceImagePaths: stringList(body.sourceImagePaths),
        sourceImageIds: stringList(body.sourceImageIds),
      });
      send(response, 200, attempt);
      return true;
    }
    const generationAction = suffix.match(
      /^canvases\/([0-9a-f-]{36})\/generation\/([0-9a-f-]{36})\/(query|retry|cancel)$/i
    );
    if (generationAction && method === 'POST') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      const service = new CanvasGenerationService(project.path, options.remoteProxyManager);
      const action = generationAction[3].toLowerCase();
      const attempt =
        action === 'query'
          ? await service.queryVideo(generationAction[2], generationAction[1])
          : action === 'retry'
            ? await service.retry(generationAction[2], generationAction[1])
            : service.cancel(generationAction[2], generationAction[1]);
      send(response, 200, attempt);
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
