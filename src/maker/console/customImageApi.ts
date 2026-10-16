import fs from 'node:fs';
import path from 'node:path';
import type { MakerCanvasFiles } from '../canvas/files.js';
import type { ApiProfile } from './visionSettings.js';

export async function readImageResponse(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error('图片服务响应为空，请先核实原请求。');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size <= limit) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('图片服务响应超过大小限制，请先核实原请求。');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class ImageApiResponseError extends Error {
  constructor(public readonly status: number) {
    const reason =
      status === 401 || status === 403
        ? 'API Key 无效或没有模型权限'
        : status === 404
          ? 'Base URL、模型名称或图片接口不存在'
          : status === 429
            ? '额度不足或请求受限'
            : status === 400 || status === 422
              ? '模型不支持当前图片协议、参考图片或参数'
              : '服务端异常，原请求是否执行尚不确定';
    super(
      '自定义生图接口返回 HTTP ' +
        status +
        '：' +
        reason +
        '。请检查配置并核实原请求，不会自动重试。'
    );
  }
}
export async function generateCustomImage(
  profile: ApiProfile,
  input: {
    prompt: string;
    references: string[];
    files: MakerCanvasFiles;
    targetSize: string;
    transparent?: boolean;
  },
  fetcher: typeof fetch = fetch
): Promise<{ bytes?: Buffer; url?: string }> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + profile.apiKey };
  const size = ['1024x1024', '1536x1024', '1024x1536'].includes(input.targetSize)
    ? input.targetSize
    : 'auto';
  let body: string | FormData;
  if (input.references.length) {
    const form = new FormData();
    form.set('model', profile.model);
    form.set('prompt', input.prompt);
    form.set('n', '1');
    form.set('size', size);
    if (input.transparent) form.set('background', 'transparent');
    let total = 0;
    for (const relative of input.references) {
      const media = input.files.readMedia(relative);
      const bytes = fs.readFileSync(media.file);
      total += bytes.length;
      if (total > 50 * 1024 * 1024)
        throw new Error('参考图片合计超过 50 MiB，尚未提交，请减少参考图片。');
      form.append(
        'image[]',
        new Blob([new Uint8Array(bytes)], { type: media.type }),
        path.basename(relative)
      );
    }
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model: profile.model,
      prompt: input.prompt,
      n: 1,
      size,
      ...(input.transparent ? { background: 'transparent' } : {}),
    });
  }
  let response: Response;
  try {
    response = await fetcher(
      profile.baseUrl.replace(/\/+$/, '') +
        (input.references.length ? '/images/edits' : '/images/generations'),
      {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(180000),
      }
    );
  } catch {
    throw new Error('自定义生图连接中断或超时，结果未知；请核实服务商的原请求，不会自动重试。');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ImageApiResponseError(response.status);
  }
  let raw: Buffer;
  try {
    raw = await readImageResponse(response, 30 * 1024 * 1024);
  } catch {
    throw new Error('自定义生图响应读取失败或超过 30 MiB，结果未知，请核实原请求。');
  }
  let data;
  try {
    data = JSON.parse(raw.toString('utf8'))?.data?.[0];
  } catch {
    throw new Error('图片接口未返回有效 JSON，请检查 OpenAI 兼容图片协议并核实原请求。');
  }
  if (typeof data?.b64_json === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(data.b64_json)) {
    const bytes = Buffer.from(data.b64_json, 'base64');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new Error('生成图片为空或超过 20 MiB，请在服务商处取得原结果。');
    return { bytes };
  }
  if (typeof data?.url === 'string') {
    try {
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      return { url: url.href };
    } catch {
      throw new Error('图片接口返回了不安全的下载地址，请在服务商处取得原结果。');
    }
  }
  throw new Error('图片接口未返回图片数据或下载地址，请检查模型能力并核实原请求。');
}
