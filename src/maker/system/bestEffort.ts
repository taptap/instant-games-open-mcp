/** Bound optional I/O even when the underlying operation ignores cancellation. */
export async function bestEffort<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
