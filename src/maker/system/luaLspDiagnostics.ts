import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function queryMakerLuaDiagnostics(options: {
  command: string;
  project: string;
  scripts: string;
  outputDir: string;
  signal?: AbortSignal;
}): Promise<{ errorCount: number; issues: string[] }> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: [
      '--mode',
      'watch',
      '--path',
      options.scripts,
      '--output-dir',
      options.outputDir,
      '--quiet',
    ],
    cwd: options.project,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'maker-console-lua-check', version: '1.0.0' });
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Lua check cancelled'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error('Lua check timed out')), 120_000);
  const request = { signal: controller.signal, timeout: 120_000 };
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-4096);
  });
  try {
    controller.signal.throwIfAborted();
    await client.connect(transport, request);
    const tools = await client.listTools({}, request);
    if (!tools.tools.some((tool) => tool.name === 'lua_lsp')) {
      throw new Error('LSP did not expose lua_lsp for this Maker project');
    }
    const response = await client.callTool(
      {
        name: 'lua_lsp',
        arguments: {
          method: 'textDocument/diagnostic',
          params: { severity: 1 },
          page: 1,
          page_size: 50,
          page_max_bytes: 64 * 1024,
        },
      },
      undefined,
      request
    );
    controller.signal.throwIfAborted();
    if (response.isError || !Array.isArray(response.content)) {
      throw new Error('LSP diagnostic tool failed');
    }
    const content = response.content.filter((item) => item.type === 'text');
    if (content.length !== 1 || typeof content[0].text !== 'string') {
      throw new Error('Invalid LSP diagnostic response');
    }
    const payload = JSON.parse(content[0].text);
    if (payload?.ok !== true) {
      throw new Error('LSP diagnostics unavailable: ' + JSON.stringify(payload?.error));
    }
    const result = payload.result;
    const errorCount = result?.summary?.errors;
    if (
      result?.kind !== 'full' ||
      !Number.isSafeInteger(errorCount) ||
      errorCount < 0 ||
      !Array.isArray(result.items) ||
      result.items.length > errorCount ||
      (errorCount > 0 && result.items.length === 0) ||
      (result.items.length < errorCount && payload.pagination?.total !== errorCount)
    ) {
      throw new Error('Incomplete LSP diagnostic response');
    }
    const issues: string[] = result.items
      .slice(0, 50)
      .map(
        (item: {
          file?: string;
          severity?: number;
          message?: string;
          code?: string | number;
          range?: { start?: { line?: number; character?: number } };
        }) => {
          const line = item?.range?.start?.line;
          const character = item?.range?.start?.character;
          if (
            item?.severity !== 1 ||
            typeof item.file !== 'string' ||
            typeof item.message !== 'string' ||
            typeof line !== 'number' ||
            !Number.isSafeInteger(line) ||
            line < 0 ||
            typeof character !== 'number' ||
            !Number.isSafeInteger(character) ||
            character < 0
          ) {
            throw new Error('Invalid LSP diagnostic item');
          }
          return (
            'ERROR | ' +
            item.file +
            ':' +
            (line + 1) +
            ':' +
            (character + 1) +
            ' | ' +
            item.message +
            (item.code ? ' [' + item.code + ']' : '')
          ).slice(0, 2048);
        }
      );
    return { errorCount, issues };
  } catch (error) {
    const detail = controller.signal.aborted
      ? String(controller.signal.reason)
      : error instanceof Error
        ? error.message
        : String(error);
    throw new Error(
      [detail, stderr.trim()].filter(Boolean).join(String.fromCharCode(10)).slice(0, 4096)
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    await client.close();
    await transport.close();
  }
}
