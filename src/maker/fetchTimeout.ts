/**
 * Timeout wrapper for Maker local CLI network requests.
 */

export const DEFAULT_SHORT_FETCH_TIMEOUT_MS = 10 * 1000;
export const DEFAULT_DOWNLOAD_FETCH_TIMEOUT_MS = 10 * 60 * 1000;

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]>,
  timeoutMs: number,
  label: string
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
