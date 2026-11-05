import type { ServerRecognitionStep } from './serverRecognition.js';

/** One operation. GET cannot submit; explicit recovery uses the original idempotency key. */
export async function requestCanvasRecognitionStep(
  step: ServerRecognitionStep,
  allowPost: boolean,
  recover: boolean,
  host: {
    prepare(post: boolean): void | Promise<void>;
    send(post: boolean): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
    persist(): void | Promise<void>;
    sanitize(message: string): string;
  }
): Promise<Record<string, unknown> | undefined> {
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
      throw new Error('识图原请求已超过 24 小时，不能安全重放；请先核对远端结果。');
  }
  await host.prepare(post);
  if (post) {
    step.submittedAt = step.submittedAt || new Date().toISOString();
    await host.persist();
  }
  const response = await host.send(post);
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error('Unconfirmed oversized response');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Unconfirmed response');
  if (typeof data.request_id === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(data.request_id)) {
    if (step.requestId && step.requestId !== data.request_id)
      throw new Error('Request ID mismatch');
    step.requestId = data.request_id;
    await host.persist();
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
      message: host.sanitize(message).slice(0, 2000),
      ...(typeof detail.code === 'string' ? { code: detail.code.slice(0, 128) } : {}),
      ...(typeof detail.retryable === 'boolean' ? { retryable: detail.retryable } : {}),
    };
    if (data.status === 'failed') step.status = 'failed';
    await host.persist();
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
  await host.persist();
  return step.output;
}
