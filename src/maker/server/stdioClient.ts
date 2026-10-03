import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { AnySchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js';

export async function withStdioRequestCleanup<T>(
  options: RequestOptions | undefined,
  operation: (options: RequestOptions) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(options?.signal?.reason);
  options?.signal?.addEventListener('abort', abort, { once: true });
  if (options?.signal?.aborted) abort();
  try {
    return await operation({ ...options, signal: controller.signal });
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    options?.signal?.removeEventListener('abort', abort);
  }
}

export class MakerStdioClient extends Client {
  override request<T extends AnySchema>(
    request: Parameters<Client['request']>[0],
    resultSchema: T,
    options?: RequestOptions
  ): Promise<SchemaOutput<T>> {
    return withStdioRequestCleanup(options, (scopedOptions) =>
      super.request(request, resultSchema, scopedOptions)
    );
  }
}
