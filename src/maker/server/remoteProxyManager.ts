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
  key: string;
  projectRoot: string;
  client: MakerRemoteProxyClient;
  transport: Transport;
  connectPromise: Promise<MakerRemoteProxyClient>;
  lastUsedAt: number;
  activeOperations: number;
  retiring: boolean;
  closing: boolean;
  closePromise?: Promise<void>;
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
  const retiredEntries = new Set<ConnectionEntry>();
  const cachedTools = new Map<string, RemoteProxyToolDefinition[]>();
  const createClient = options.createClient || createDefaultClient;
  const createTransport = options.createTransport || createDefaultTransport;
  let closed = false;
  let closePromise: Promise<void> | undefined;

  const closeEntry = (entry: ConnectionEntry): Promise<void> => {
    if (connections.get(entry.key) === entry) {
      connections.delete(entry.key);
    }
    entry.retiring = true;
    if (entry.closePromise) {
      return entry.closePromise;
    }
    retiredEntries.add(entry);
    entry.closing = true;
    entry.closePromise = Promise.resolve()
      .then(async () => await entry.client.close())
      .catch(() => {})
      .finally(() => {
        retiredEntries.delete(entry);
      });
    return entry.closePromise;
  };

  const retireEntry = (entry: ConnectionEntry): void => {
    if (connections.get(entry.key) === entry) {
      connections.delete(entry.key);
    }
    entry.retiring = true;
    retiredEntries.add(entry);
    if (entry.activeOperations > 0) {
      return;
    }
    void closeEntry(entry);
  };

  const releaseEntry = async (entry: ConnectionEntry): Promise<void> => {
    entry.activeOperations = Math.max(0, entry.activeOperations - 1);
    if (entry.retiring && entry.activeOperations === 0) {
      await closeEntry(entry);
    }
  };

  const acquire = async (context: RemoteProxyContext): Promise<ConnectionEntry> => {
    if (closed) {
      throw new Error('Maker remote proxy manager is closed.');
    }

    const key = createContextKey(context);
    const existing = connections.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      existing.activeOperations += 1;
      try {
        await existing.connectPromise;
        return existing;
      } catch (error) {
        await releaseEntry(existing);
        throw error;
      }
    }

    const staleProjectEntries = [...connections.entries()].filter(
      ([entryKey, entry]) => entryKey !== key && entry.projectRoot === context.projectRoot
    );
    for (const [entryKey, entry] of staleProjectEntries) {
      cachedTools.delete(entryKey);
      retireEntry(entry);
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
      key,
      projectRoot: context.projectRoot,
      client,
      transport,
      connectPromise: Promise.resolve(client),
      lastUsedAt: Date.now(),
      activeOperations: 1,
      retiring: false,
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
      entry.activeOperations -= 1;
      await closeEntry(entry);
      throw error;
    }
  };

  const run = async <T>(
    context: RemoteProxyContext,
    operation: (client: MakerRemoteProxyClient) => Promise<T>
  ): Promise<T> => {
    const entry = await acquire(context);
    entry.lastUsedAt = Date.now();
    try {
      return await operation(entry.client);
    } catch (error) {
      if (isConnectionClosedError(error)) {
        await closeEntry(entry);
      }
      throw error;
    } finally {
      await releaseEntry(entry);
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
      const entries = new Set([...connections.values(), ...retiredEntries]);
      connections.clear();
      retiredEntries.clear();
      closePromise = Promise.allSettled(
        [...entries].map(async (entry) => await closeEntry(entry))
      ).then(() => undefined);
      return await closePromise;
    },
  };
}
