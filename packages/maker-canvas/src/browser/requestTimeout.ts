/** End local waiting without interpreting an uncertain remote operation as failed. */
export async function withCanvasTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  milliseconds = 60_000
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
