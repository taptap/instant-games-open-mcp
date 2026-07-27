import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { trackMakerChildTransport } from './childTransports.js';
import type { RemoteProxyContext } from './mcp.js';

export type RemoteProxyToolDefinition = Tool & { [key: string]: unknown };

export interface MakerRemoteProxyClient {
  connect(transport: Transport): Promise<void>;
  listTools(): Promise<{ tools: Tool[] }>;
  callTool(
    request: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: undefined,
    options?: RequestOptions
  ): Promise<CallToolResult>;
  close(): Promise<void>;
  onclose?: () => void;
  transport?: Transport;
}

export interface MakerRemoteProxyClientHandlers {
  onToolsChanged(error: Error | null, tools: Tool[] | null): Promise<void>;
}

export interface MakerRemoteProxyManager {
  listTools(context: RemoteProxyContext): Promise<RemoteProxyToolDefinition[]>;
  callTool(
    context: RemoteProxyContext,
    request: { name: string; arguments?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<CallToolResult>;
  getCachedTools(context: RemoteProxyContext): RemoteProxyToolDefinition[] | undefined;
  closeAll(): Promise<void>;
}

export interface MakerRemoteProxyManagerOptions {
  createClient?: (
    context: RemoteProxyContext,
    handlers: MakerRemoteProxyClientHandlers
  ) => MakerRemoteProxyClient;
  createTransport?: (context: RemoteProxyContext) => Transport;
  onToolsChanged?: (
    context: RemoteProxyContext,
    tools: RemoteProxyToolDefinition[]
  ) => void | Promise<void>;
}

interface ConnectionEntry {
  projectRoot: string;
  client: MakerRemoteProxyClient;
  transport: Transport;
  connectPromise: Promise<MakerRemoteProxyClient>;
  lastUsedAt: number;
  closing: boolean;
}

function createContextKey(context: RemoteProxyContext): string {
  const identity = JSON.stringify({
    projectRoot: context.projectRoot,
    serverUrl: context.serverUrl,
    env: context.env,
    userId: context.userId,
    projectId: context.projectId,
    projectPath: context.projectPath,
    command: context.command,
    args: context.args,
    proxyConfigJson: context.proxyConfigJson,
  });
  return createHash('sha256').update(identity).digest('hex');
}

function mergeStringEnv(
  ...sources: Array<NodeJS.ProcessEnv | Record<string, string> | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
  }
  return result;
}

function isConnectionClosedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === ErrorCode.ConnectionClosed
  );
}

function createDefaultTransport(context: RemoteProxyContext): Transport {
  return trackMakerChildTransport(
    new StdioClientTransport({
      command: context.command,
      args: context.args,
      env: mergeStringEnv(process.env, context.envVars),
      stderr: 'pipe',
    })
  );
}

function createDefaultClient(
  _context: RemoteProxyContext,
  handlers: MakerRemoteProxyClientHandlers
): MakerRemoteProxyClient {
  return new Client(
    { name: 'taptap-maker-persistent-proxy', version: 'dev' },
    {
      capabilities: {},
      listChanged: {
        tools: {
          onChanged: (error, tools) => {
            void handlers.onToolsChanged(error, tools);
          },
        },
      },
    }
  ) as unknown as MakerRemoteProxyClient;
}

/**
 * Creates a project-scoped manager for persistent embedded Maker proxy connections.
 */
export function createMakerRemoteProxyManager(
  options: MakerRemoteProxyManagerOptions = {}
): MakerRemoteProxyManager {
  const connections = new Map<string, ConnectionEntry>();
  const cachedTools = new Map<string, RemoteProxyToolDefinition[]>();
  const createClient = options.createClient || createDefaultClient;
  const createTransport = options.createTransport || createDefaultTransport;
  let closed = false;
  let closePromise: Promise<void> | undefined;

  const closeEntry = async (key: string, entry: ConnectionEntry): Promise<void> => {
    if (connections.get(key) === entry) {
      connections.delete(key);
    }
    if (entry.closing) {
      return;
    }
    entry.closing = true;
    await entry.client.close().catch(() => {});
  };

  const acquire = async (context: RemoteProxyContext): Promise<ConnectionEntry> => {
    if (closed) {
      throw new Error('Maker remote proxy manager is closed.');
    }

    const key = createContextKey(context);
    const existing = connections.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      await existing.connectPromise;
      return existing;
    }

    const staleProjectEntries = [...connections.entries()].filter(
      ([entryKey, entry]) => entryKey !== key && entry.projectRoot === context.projectRoot
    );
    if (staleProjectEntries.length > 0) {
      await Promise.allSettled(
        staleProjectEntries.map(async ([entryKey, entry]) => {
          cachedTools.delete(entryKey);
          await closeEntry(entryKey, entry);
        })
      );
    }

    const transport = createTransport(context);
    const handlers: MakerRemoteProxyClientHandlers = {
      async onToolsChanged(error, tools): Promise<void> {
        if (error || !tools || connections.get(key)?.client !== client) {
          return;
        }
        const definitions = tools as RemoteProxyToolDefinition[];
        cachedTools.set(key, definitions);
        try {
          await options.onToolsChanged?.(context, definitions);
        } catch {
          // Notification delivery must not tear down a healthy remote connection.
        }
      },
    };
    const client = createClient(context, handlers);
    const entry: ConnectionEntry = {
      projectRoot: context.projectRoot,
      client,
      transport,
      connectPromise: Promise.resolve(client),
      lastUsedAt: Date.now(),
      closing: false,
    };
    connections.set(key, entry);
    client.onclose = () => {
      if (!entry.closing && connections.get(key) === entry) {
        connections.delete(key);
      }
    };
    entry.connectPromise = client.connect(transport).then(() => client);

    try {
      await entry.connectPromise;
      return entry;
    } catch (error) {
      await closeEntry(key, entry);
      throw error;
    }
  };

  const run = async <T>(
    context: RemoteProxyContext,
    operation: (client: MakerRemoteProxyClient) => Promise<T>
  ): Promise<T> => {
    const key = createContextKey(context);
    const entry = await acquire(context);
    entry.lastUsedAt = Date.now();
    try {
      return await operation(entry.client);
    } catch (error) {
      if (isConnectionClosedError(error)) {
        await closeEntry(key, entry);
      }
      throw error;
    }
  };

  return {
    async listTools(context): Promise<RemoteProxyToolDefinition[]> {
      const key = createContextKey(context);
      const result = await run(context, async (client) => await client.listTools());
      const tools = result.tools as RemoteProxyToolDefinition[];
      cachedTools.set(key, tools);
      return tools;
    },

    async callTool(context, request, requestOptions): Promise<CallToolResult> {
      return await run(
        context,
        async (client) => await client.callTool(request, undefined, requestOptions)
      );
    },

    getCachedTools(context): RemoteProxyToolDefinition[] | undefined {
      return cachedTools.get(createContextKey(context));
    },

    async closeAll(): Promise<void> {
      if (closePromise) {
        return await closePromise;
      }
      closed = true;
      const entries = [...connections.entries()];
      connections.clear();
      closePromise = Promise.allSettled(
        entries.map(async ([key, entry]) => await closeEntry(key, entry))
      ).then(() => undefined);
      return await closePromise;
    },
  };
}
