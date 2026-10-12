import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { getMakerApiBaseUrl, getMakerEnvironment } from '../config.js';
import { requireMakerPat } from '../git/pat.js';
import { loadProjectConfig } from '../storage.js';
import type { MakerCanvasFiles } from '../canvas/files.js';
import type { UiBboxImage } from '../canvas/uiBbox.js';
import { ConsoleError } from './types.js';

export interface ServerRecognitionStep {
  key: string;
  prompt: string;
  image: UiBboxImage;
  submittedAt?: string;
  requestId?: string;
  status?: 'running' | 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  credits?: number;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { code?: string; message: string; retryable?: boolean; httpStatus: number };
}

export interface ServerRecognitionState {
  appId: string;
  environment: string;
  apiBase: string;
  startedAt: string;
  design: UiBboxImage;
  cut: ServerRecognitionStep;
  text?: ServerRecognitionStep;
}

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

export function serverRecognitionBody(files: MakerCanvasFiles, step: ServerRecognitionStep) {
  const { prompt, image } = step;
  if (!prompt.trim() || prompt.length > 10000)
    throw new ConsoleError('识图 Server API 提示词必须为 1～10000 字符。');
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
  const body = JSON.stringify({
    prompt,
    image: { mime_type: media.type, data: bytes.toString('base64') },
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
  if (step.status === 'succeeded') return step.output;
  const billingRecovery =
    recover &&
    step.error?.code === 'MODEL_INFERENCE_BILLING_FAILED' &&
    step.error.retryable === true;
  const post = !step.requestId || billingRecovery;
  if (post) {
    if (!allowPost || (step.submittedAt && !recover)) return undefined;
    if (step.error?.retryable === false) return undefined;
    if (step.submittedAt && Date.now() - Date.parse(step.submittedAt) >= 24 * 60 * 60 * 1000)
      throw new ConsoleError('识图原请求已超过 24 小时，不能安全重放；请先核对远端结果。');
  }
  const body = post ? serverRecognitionBody(files, step) : undefined;
  const token = requireMakerPat().token;
  if (post) {
    step.submittedAt ||= new Date().toISOString();
    persist();
  }
  const endpoint = state.apiBase + '/apps/' + encodeURIComponent(state.appId) + '/model-inference';
  const response = await fetcher(
    endpoint + (post ? '' : '/' + encodeURIComponent(step.requestId!)),
    {
      method: post ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(300000),
      headers: {
        Authorization: 'Bearer ' + token,
        ...(post ? { 'Content-Type': 'application/json', 'Idempotency-Key': step.key } : {}),
      },
      ...(body ? { body } : {}),
    }
  );
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error('Unconfirmed oversized response');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Unconfirmed response');
  if (typeof data.request_id === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(data.request_id)) {
    if (step.requestId && step.requestId !== data.request_id)
      throw new Error('Request ID mismatch');
    step.requestId = data.request_id;
    persist();
  }
  if (Number.isFinite(data.credits) && data.credits >= 0) step.credits = data.credits;
  if (
    Number.isFinite(data.usage?.input_tokens) &&
    data.usage.input_tokens >= 0 &&
    Number.isFinite(data.usage?.output_tokens) &&
    data.usage.output_tokens >= 0
  )
    step.usage = { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens };
  if (!response.ok || data.status === 'failed') {
    const detail = data.error && typeof data.error === 'object' ? data.error : data;
    const message =
      typeof detail.message === 'string'
        ? detail.message
        : typeof data.error === 'string'
          ? data.error
          : '服务端识图请求未成功';
    step.error = {
      httpStatus: response.status,
      message: message.split(token).join('[redacted]').slice(0, 2000),
      ...(typeof detail.code === 'string' ? { code: detail.code.slice(0, 128) } : {}),
      ...(typeof detail.retryable === 'boolean' ? { retryable: detail.retryable } : {}),
    };
    if (data.status === 'failed') step.status = 'failed';
    persist();
    return undefined;
  }
  if (!step.requestId || !['succeeded', 'running'].includes(data.status))
    throw new Error('Unconfirmed model status');
  if (
    data.status === 'succeeded' &&
    (data.model !== 'gpt-6.1-sol' ||
      data.reasoning_effort !== 'low' ||
      data.output_format !== 'json_object' ||
      !data.output ||
      typeof data.output !== 'object' ||
      Array.isArray(data.output))
  )
    throw new Error('Unconfirmed model output');
  step.status = data.status;
  delete step.error;
  if (step.status === 'succeeded') step.output = data.output;
  persist();
  return step.output;
}
