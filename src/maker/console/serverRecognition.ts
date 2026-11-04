import { requestCanvasRecognitionStep } from '../../../packages/maker-canvas/src/features/recognitionRequest.js';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { getMakerApiBaseUrl, getMakerEnvironment } from '../config.js';
import { requireMakerPat } from '../auth/pat.js';
import { loadProjectConfig } from '../storage.js';
import type { MakerCanvasFiles } from '../canvas/files.js';
import type { UiBboxImage } from '../canvas/uiBbox.js';
import { ConsoleError } from './types.js';

import type {
  ServerRecognitionStep,
  ServerRecognitionState,
} from '../../../packages/maker-canvas/src/features/serverRecognition.js';
export type {
  ServerRecognitionStep,
  ServerRecognitionState,
} from '../../../packages/maker-canvas/src/features/serverRecognition.js';

export function serverRecognitionContext(root: string) {
  const appId = loadProjectConfig(root)?.project_id;
  if (!appId || !/^[a-f0-9-]{36}$/i.test(appId))
    throw new ConsoleError('识图 Server API 需要当前目录绑定有效的 Maker 项目。');
  const environment = getMakerEnvironment(undefined, root);
  const apiBase = getMakerApiBaseUrl(environment);
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ConsoleError('识图 Server API 地址必须为不带凭证的 HTTPS 地址。');
  return { appId, environment, apiBase };
}

export async function serverRecognitionAvailable(root?: string, fetcher = fetch): Promise<boolean> {
  if (!root) return false;
  try {
    const { appId, apiBase } = serverRecognitionContext(root);
    const response = await fetcher(
      apiBase + '/apps/' + encodeURIComponent(appId) + '/model-inference/' + randomUUID(),
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: 'Bearer ' + requireMakerPat().token },
      }
    );
    if (response.status !== 404) {
      await response.body?.cancel();
      return false;
    }
    const data = await response.json();
    return data?.error?.code === 'MODEL_INFERENCE_NOT_FOUND';
  } catch {
    return false;
  }
}

export function serverRecognitionImage(files: MakerCanvasFiles, image: UiBboxImage) {
  const media = files.readMedia(image.path);
  const bytes = fs.readFileSync(media.file);
  const size = files.imageInfo(image.path);
  if (
    !size ||
    size.width !== image.width ||
    size.height !== image.height ||
    createHash('sha256').update(bytes).digest('hex') !== image.sha256
  )
    throw new ConsoleError('识图原始图片已变化，不能恢复原请求。');
  if (
    bytes.length > 10 * 1024 * 1024 ||
    image.width > 8192 ||
    image.height > 8192 ||
    image.width * image.height > 4096 * 4096 ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(media.type)
  )
    throw new ConsoleError('识图 Server API 图片超过尺寸、像素或 10 MiB 限制，或格式不支持。');
  return { bytes, type: media.type };
}

export function serverRecognitionBody(files: MakerCanvasFiles, step: ServerRecognitionStep) {
  const { prompt, image } = step;
  if (!prompt.trim() || prompt.length > 10000)
    throw new ConsoleError('识图 Server API 提示词必须为 1～10000 字符。');
  const media = serverRecognitionImage(files, image);
  const body = JSON.stringify({
    prompt,
    image: { mime_type: media.type, data: media.bytes.toString('base64') },
    response_format: 'json_object',
  });
  if (Buffer.byteLength(body) > 14 * 1024 * 1024)
    throw new ConsoleError('识图 Server API 请求超过 14 MiB。');
  return body;
}

/** One remote operation only. Queries never submit; recovery requires an explicit paid POST. */
export async function serverRecognitionRequest(
  files: MakerCanvasFiles,
  state: ServerRecognitionState,
  step: ServerRecognitionStep,
  fetcher: typeof fetch,
  persist: () => void,
  allowPost: boolean,
  recover: boolean
): Promise<Record<string, unknown> | undefined> {
  const context = serverRecognitionContext(files.root);
  if (
    context.appId !== state.appId ||
    context.environment !== state.environment ||
    context.apiBase !== state.apiBase
  )
    throw new ConsoleError('识图项目或环境已变化，不能查询或恢复原请求。');
  let body: string | undefined;
  let token = '';
  return requestCanvasRecognitionStep(step, allowPost, recover, {
    prepare: (post) => {
      body = post ? serverRecognitionBody(files, step) : undefined;
      token = requireMakerPat().token;
    },
    persist,
    sanitize: (message) => message.split(token).join('[redacted]'),
    send: (post) => {
      const endpoint =
        state.apiBase + '/apps/' + encodeURIComponent(state.appId) + '/model-inference';
      return fetcher(endpoint + (post ? '' : '/' + encodeURIComponent(step.requestId!)), {
        method: post ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(300000),
        headers: {
          Authorization: 'Bearer ' + token,
          ...(post ? { 'Content-Type': 'application/json', 'Idempotency-Key': step.key } : {}),
        },
        ...(body ? { body } : {}),
      });
    },
  });
}
