/** End local waiting without interpreting an uncertain remote operation as failed. */
export async function withCanvasTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  milliseconds = 60_000,
  cancelSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error('请求等待超时，已结束本地等待；请核查原结果。'), {
          code: 'CANVAS_REQUEST_TIMEOUT',
        })
      );
      controller.abort();
    }, milliseconds);
  });
  const canceled = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(
        Object.assign(new Error('已停止本地等待；原任务可能仍在运行，请核查原结果。'), {
          code: 'CANVAS_REQUEST_CANCELED',
        })
      );
    };
    if (cancelSignal?.aborted) cancel();
    else cancelSignal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([request(controller.signal), timeout, canceled]);
  } finally {
    clearTimeout(timer);
    if (cancelSignal && cancel) cancelSignal.removeEventListener('abort', cancel);
  }
}
