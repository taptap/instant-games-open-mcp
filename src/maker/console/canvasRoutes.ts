import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { CanvasStoreError } from '../canvas/model.js';
import { MakerCanvasFiles } from '../canvas/files.js';
import { TEMPLATE_ARCHIVE_LIMIT } from '../canvas/templateArchive.js';
import { readBuiltinTemplateModel } from '../canvas/templateModelPreview.js';
import type { CanvasAutomationBridge } from '../canvas/automationBridge.js';
import { ConsoleError } from './types.js';
import type { ConsoleProjects } from './projects.js';
import { CanvasGenerationService } from './canvasGeneration.js';
import { CanvasModelService } from './canvasModels.js';
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
  automation?: CanvasAutomationBridge;
}): Promise<boolean> {
  const { request, response, method, suffix, searchParams, key, registry } = options;
  if (!suffix || (!suffix.startsWith('canvases') && suffix !== 'canvas-media')) return false;
  const project = registry.resolve(key);
  const files = new MakerCanvasFiles(project.path);
  try {
    if (suffix.startsWith('canvases/automation/')) {
      if (!options.automation) throw new ConsoleError('画布 CLI 桥接未启动。', 503);
      const action = suffix.slice('canvases/automation/'.length);
      const exported = action.match(/^exports\/([a-zA-Z0-9-]{1,80})$/);
      if (exported) {
        if (method === 'POST') {
          const pageId = searchParams.get('pageId') || '';
          options.automation.checkExport(key, exported[1], pageId);
          options.automation.saveExport(
            key,
            exported[1],
            pageId,
            await readBytes(request, 128 * 1024 * 1024)
          );
          send(response, 200, { ok: true });
        } else if (method === 'GET') {
          const bytes = options.automation.readExport(key, exported[1]);
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': bytes.length,
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(bytes);
        } else if (method === 'DELETE') {
          options.automation.releaseExport(key, exported[1]);
          send(response, 200, { ok: true });
        } else throw new ConsoleError('Unknown canvas export route.', 404);
        return true;
      }
      if (method === 'GET' && action === 'pages') send(response, 200, options.automation.list(key));
      else if (method === 'GET' && action === 'status')
        send(response, 200, options.automation.status(key, searchParams.get('id') || ''));
      else if (method === 'POST' && (action === 'submit' || action === 'exchange')) {
        const body = JSON.parse(
          (await readBytes(request, action === 'exchange' ? 4 * 1024 * 1024 : 128 * 1024)).toString(
            'utf8'
          )
        );
        send(
          response,
          200,
          action === 'submit'
            ? options.automation.submit(key, body)
            : options.automation.exchange(key, body)
        );
      } else throw new ConsoleError('Unknown canvas automation route.', 404);
      return true;
    }
    if (suffix === 'canvases/video-history' && method === 'GET') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      send(
        response,
        200,
        new CanvasGenerationService(project.path, options.remoteProxyManager).history(
          Number(searchParams.get('offset') ?? 0),
          Number(searchParams.get('limit') ?? 30)
        )
      );
      return true;
    }
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
    if (suffix === 'canvases/templates/import' && method === 'POST') {
      send(
        response,
        201,
        await files.importTemplate(await readBytes(request, TEMPLATE_ARCHIVE_LIMIT))
      );
      return true;
    }
    const exportedTemplate = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})\/export$/i);
    if (exportedTemplate && method === 'GET') {
      const bytes = await files.exportTemplate(
        exportedTemplate[1],
        Number(searchParams.get('revision'))
      );
      response.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': bytes.length,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(bytes);
      return true;
    }
    const template = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})$/i);
    const previewImage = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})\/preview-image$/i);
    if (previewImage && method === 'GET') {
      const result = await files.readTemplatePreviewImage(
        previewImage[1],
        Number(searchParams.get('revision')),
        searchParams.get('node') || ''
      );
      response.writeHead(200, {
        'Content-Type': result.type,
        'Content-Length': result.bytes.length,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(result.bytes);
      return true;
    }
    const templateModel = suffix.match(/^canvases\/templates\/([0-9a-f-]{36})\/model-preview$/i);
    if (templateModel && method === 'GET') {
      const current = files.getTemplate(templateModel[1]);
      if (current.revision !== Number(searchParams.get('revision')))
        throw new ConsoleError('模板已更新，请刷新列表。', 409);
      const result = await readBuiltinTemplateModel(templateModel[1], searchParams.get('file'));
      response.writeHead(200, {
        'Content-Type': result.type,
        'Content-Length': result.bytes.length,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(result.bytes);
      return true;
    }
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
      const slot = Number(searchParams.get('slot') || 0);
      if (slot !== 0 && slot !== 1) throw new ConsoleError('预览位置无效。');
      if (method === 'GET') {
        const result = await files.readTemplateCover(cover[1], revision, slot);
        response.writeHead(200, {
          'Content-Type': result.type,
          'Content-Length': result.bytes.length,
          'X-Content-Type-Options': 'nosniff',
          'X-Template-Cover-Source': result.source ? '1' : '0',
          ...(result.animation
            ? { 'X-Template-Cover-Animation': JSON.stringify(result.animation) }
            : {}),
        });
        response.end(result.bytes);
      } else {
        files.saveTemplateCover(
          cover[1],
          revision,
          await readBytes(request, 2 * 1024 * 1024),
          slot
        );
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
    const models = suffix.match(/^canvases\/([0-9a-f-]{36})\/models$/i);
    const modelPreview = suffix.match(/^canvases\/([0-9a-f-]{36})\/models\/preview$/i);
    if (modelPreview && method === 'GET') {
      const service = new CanvasModelService(project.path);
      const nodeId = searchParams.get('nodeId') || '';
      if (searchParams.has('file')) {
        const file = await service.previewFile(
          modelPreview[1],
          nodeId,
          searchParams.get('attemptId') || '',
          searchParams.get('file') || ''
        );
        response.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': file.bytes.length });
        response.end(file.bytes);
      } else {
        const { directory: _directory, ...manifest } = await service.preview(
          modelPreview[1],
          nodeId
        );
        send(response, 200, manifest);
      }
      return true;
    }
    const modelExport = suffix.match(/^canvases\/([0-9a-f-]{36})\/models\/export$/i);
    if (modelExport && method === 'GET') {
      const bytes = await new CanvasModelService(project.path).export(
        modelExport[1],
        searchParams.get('nodeId') || ''
      );
      response.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': bytes.length,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(bytes);
      return true;
    }
    if (models && (method === 'GET' || method === 'POST')) {
      const service = new CanvasModelService(project.path, options.remoteProxyManager);
      if (method === 'GET') send(response, 200, service.list(models[1]));
      else {
        if (!options.remoteProxyManager) throw new ConsoleError('模型生成能力尚未就绪。', 503);
        const body = JSON.parse((await readBytes(request, 4096)).toString('utf8'));
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some(
            (field) => !['nodeId', 'action', 'revision', 'reviewId'].includes(field)
          )
        )
          throw new ConsoleError('模型操作参数无效。');
        send(response, 200, await service.execute(models[1], body));
      }
      return true;
    }
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
      const controller = new AbortController();
      const onClose = () => {
        if (!response.writableEnded) controller.abort();
      };
      response.once('close', onClose);
      if (response.destroyed) onClose();
      try {
        const body = JSON.parse(
          (await readBytes(request, 64 * 1024)).toString('utf8') || '{}'
        ) as Record<string, unknown>;
        if (typeof body.prompt !== 'string' || !body.prompt.trim())
          throw new ConsoleError('缺少视频生成提示词。');
        if (typeof body.sourceImagePath !== 'string') throw new ConsoleError('缺少视频来源图片。');
        const attempt = await new CanvasGenerationService(
          project.path,
          options.remoteProxyManager
        ).createVideo(
          {
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
            referenceImagePaths: stringList(body.referenceImagePaths),
            mode: typeof body.mode === 'string' ? body.mode : undefined,
          },
          controller.signal
        );
        if (!controller.signal.aborted) send(response, 200, attempt);
        return true;
      } catch (error) {
        if (controller.signal.aborted && response.destroyed) return true;
        throw error;
      } finally {
        response.removeListener('close', onClose);
      }
    }
    const generationAction = suffix.match(
      /^canvases\/([0-9a-f-]{36})\/generation\/([0-9a-f-]{36})\/(query|retry|cancel)$/i
    );
    if (generationAction && method === 'POST') {
      if (!options.remoteProxyManager) throw new ConsoleError('画布生成能力尚未就绪。', 503);
      const service = new CanvasGenerationService(project.path, options.remoteProxyManager);
      const action = generationAction[3].toLowerCase();
      const controller = action === 'retry' ? new AbortController() : undefined;
      const onClose = () => {
        if (!response.writableEnded) controller?.abort();
      };
      if (controller) {
        response.once('close', onClose);
        if (response.destroyed) onClose();
      }
      try {
        const attempt =
          action === 'query'
            ? await service.queryVideo(generationAction[2], generationAction[1])
            : action === 'retry'
              ? await service.retry(generationAction[2], generationAction[1], controller?.signal)
              : service.cancel(generationAction[2], generationAction[1]);
        if (!controller?.signal.aborted) send(response, 200, attempt);
        return true;
      } catch (error) {
        if (controller?.signal.aborted && response.destroyed) return true;
        throw error;
      } finally {
        if (controller) response.removeListener('close', onClose);
      }
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
    const image = suffix.match(/^canvases\/([0-9a-f-]{36})\/(images|resource-images)$/i);
    if (image && method === 'POST') {
      await files.load(image[1]);
      const saved = await files.importImage(
        await readBytes(request, 20 * 1024 * 1024),
        image[2] === 'resource-images' ? image[1] : undefined
      );
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
    if ((error as { code?: string }).code === 'CANVAS_PAGE_EXPIRED') {
      send(response, 409, { code: 'CANVAS_PAGE_EXPIRED', error: (error as Error).message });
      return true;
    }
    if (error instanceof CanvasStoreError) {
      throw new ConsoleError(error.message, error.status);
    }
    throw error;
  }
}
