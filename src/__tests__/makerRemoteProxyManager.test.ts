import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { HiddenStdioClientTransport } from '../maker/server/hiddenStdioTransport.js';
import {
  createMakerRemoteProxyManager,
  type MakerRemoteProxyClient,
  type MakerRemoteProxyClientHandlers,
} from '../maker/server/remoteProxyManager.js';
import type { RemoteProxyContext } from '../maker/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ChildProcess } from 'node:child_process';
import { getEventListeners, once } from 'node:events';

type FakeClient = MakerRemoteProxyClient & {
  connect: jest.Mock<Promise<void>, [Transport]>;
  listTools: jest.Mock;
  callTool: jest.Mock;
  close: jest.Mock<Promise<void>, []>;
};

function createContext(overrides: Partial<RemoteProxyContext> = {}): RemoteProxyContext {
  const projectId = overrides.projectId || 'project-a';
  const projectRoot = overrides.projectRoot || `/workspace/${projectId}`;
  const proxyConfigJson =
    overrides.proxyConfigJson ||
    JSON.stringify({
      server: { url: 'https://maker.example.test/mcp', env: 'production' },
      tenant: { project_id: projectId, user_id: 'user-a' },
      auth: { kid: 'kid-secret', mac_key: 'mac-secret' },
    });

  return {
    projectRoot,
    serverUrl: 'https://maker.example.test/mcp',
    env: 'production',
    projectId,
    projectPath: `${projectId}/workspace`,
    userId: 'user-a',
    proxyConfigJson,
    command: '/usr/bin/node',
    args: ['/opt/taptap-maker/index.js', '__maker-proxy'],
    envVars: { PROXY_CONFIG: proxyConfigJson },
    ...overrides,
  };
}

function createHarness(options: { connect?: () => Promise<void> } = {}) {
  const clients: FakeClient[] = [];
  const transports: Transport[] = [];
  const clientHandlers: MakerRemoteProxyClientHandlers[] = [];
  const onToolsChanged = jest.fn();
  const createTransport = jest.fn(() => {
    const transport = {
      start: jest.fn(async () => undefined),
      send: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    } as unknown as Transport;
    transports.push(transport);
    return transport;
  });
  const createClient = jest.fn((_context, handlers: MakerRemoteProxyClientHandlers) => {
    clientHandlers.push(handlers);
    const client: FakeClient = {
      connect: jest.fn(async (transport: Transport) => {
        await options.connect?.();
        client.transport = transport;
      }),
      listTools: jest.fn(async () => ({
        tools: [{ name: 'generate_image', description: 'Generate an image', inputSchema: {} }],
      })),
      callTool: jest.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      close: jest.fn(async () => undefined),
      transport: undefined,
    };
    clients.push(client);
    return client;
  });
  const manager = createMakerRemoteProxyManager({
    createClient,
    createTransport,
    onToolsChanged,
  });

  return {
    manager,
    createClient,
    createTransport,
    clients,
    transports,
    clientHandlers,
    onToolsChanged,
  };
}

describe('MakerRemoteProxyManager', () => {
  test('real stdio calls drain noisy logs, reject child exit, and reconnect only on the next call', async () => {
    const transports: HiddenStdioClientTransport[] = [];
    const clients: Client[] = [];
    const manager = createMakerRemoteProxyManager({
      createClient: () => {
        const client = new Client(
          { name: 'process-hygiene-test', version: '0' },
          { capabilities: {} }
        );
        clients.push(client);
        const connect = client.connect.bind(client);
        client.connect = async (transport, options) => {
          transports.push(transport as HiddenStdioClientTransport);
          await connect(transport, options);
        };
        return client as unknown as MakerRemoteProxyClient;
      },
    });
    const server = [
      'const readline = require("node:readline");',
      'const rl = readline.createInterface({input:process.stdin});',
      'const reply = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result}) + "\\n");',
      'rl.on("line", line => {',
      '  const msg = JSON.parse(line);',
      '  if (msg.method === "initialize") reply(msg.id, {protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"test",version:"0"}});',
      '  if (msg.method === "tools/call") {',
      '    if (msg.params.name === "exit") process.exit(0);',
      '    else process.stderr.write(Buffer.alloc(4 * 1024 * 1024), () => reply(msg.id, {content:[{type:"text",text:"done"}]}));',
      '  }',
      '});',
      'process.stdin.on("end", () => process.exit(0));',
    ].join('\n');
    const context = createContext({ command: process.execPath, args: ['-e', server] });
    try {
      await expect(manager.callTool(context, { name: 'noisy' })).resolves.toMatchObject({
        content: [{ text: 'done' }],
      });
      const child = (transports[0] as unknown as { process: ChildProcess }).process;
      await expect(manager.callTool(context, { name: 'exit' })).rejects.toMatchObject({
        code: ErrorCode.ConnectionClosed,
      });
      expect(transports).toHaveLength(1);
      expect(
        (clients[0] as unknown as { _timeoutInfo: Map<number, unknown> })._timeoutInfo.size
      ).toBe(0);
      expect(child.stdout?.destroyed).toBe(true);
      expect(child.stderr?.destroyed).toBe(true);
      await expect(manager.callTool(context, { name: 'noisy' })).resolves.toMatchObject({
        content: [{ text: 'done' }],
      });
      expect(transports).toHaveLength(2);
      const idleChild = (transports[1] as unknown as { process: ChildProcess }).process;
      const exited = once(idleChild, 'exit');
      idleChild.kill();
      await exited;
      await manager.closeAll();
      expect(idleChild.stdout?.destroyed).toBe(true);
      expect(idleChild.stderr?.destroyed).toBe(true);
    } finally {
      await manager.closeAll();
      await Promise.all(transports.map((transport) => transport.close()));
    }
  }, 15000);

  test('uses the hidden stdio transport for the persistent console proxy', async () => {
    const transports: Transport[] = [];
    const manager = createMakerRemoteProxyManager({
      createClient: () =>
        ({
          connect: async (transport: Transport) => {
            transports.push(transport);
            throw new Error('stop-before-start');
          },
          listTools: async () => ({ tools: [] }),
          callTool: async () => ({ content: [] }),
          close: async () => undefined,
        }) as MakerRemoteProxyClient,
    });

    await expect(manager.listTools(createContext())).rejects.toThrow('stop-before-start');

    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf(HiddenStdioClientTransport);
    expect(transports[0].constructor.name).not.toBe('StdioClientTransport');
  });
  test('reuses one connection for repeated calls in one project and isolates another project', async () => {
    const harness = createHarness();
    const contextA = createContext();
    const contextB = createContext({ projectId: 'project-b', projectRoot: '/workspace/project-b' });

    await harness.manager.callTool(contextA, { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(contextA, { name: 'get_debug_feedbacks', arguments: {} });

    expect(harness.createClient).toHaveBeenCalledTimes(1);
    expect(harness.createTransport).toHaveBeenCalledTimes(1);

    await harness.manager.callTool(contextB, { name: 'generate_image', arguments: {} });

    expect(harness.createClient).toHaveBeenCalledTimes(2);
    expect(harness.createTransport).toHaveBeenCalledTimes(2);
  });

  test('shares the in-flight connection promise for concurrent first calls', async () => {
    let resolveConnect: (() => void) | undefined;
    const connectGate = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });
    const harness = createHarness({ connect: async () => await connectGate });
    const context = createContext();

    const calls = Promise.all([
      harness.manager.callTool(context, { name: 'generate_image', arguments: {} }),
      harness.manager.callTool(context, { name: 'get_debug_feedbacks', arguments: {} }),
    ]);
    await Promise.resolve();

    expect(harness.createClient).toHaveBeenCalledTimes(1);
    expect(harness.createTransport).toHaveBeenCalledTimes(1);

    resolveConnect?.();
    await calls;
  });

  test('marks dispatch only after the persistent proxy connection is ready', async () => {
    let resolveConnect: (() => void) | undefined;
    const connectGate = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });
    const harness = createHarness({ connect: async () => await connectGate });
    const onDispatch = jest.fn();

    const call = harness.manager.callTool(
      createContext(),
      { name: 'generate_image', arguments: {} },
      undefined,
      onDispatch
    );
    await Promise.resolve();

    expect(onDispatch).not.toHaveBeenCalled();
    resolveConnect?.();
    await call;

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(harness.clients[0].callTool).toHaveBeenCalledTimes(1);
  });

  test('caches the latest successful tool list and preserves it after refresh failure', async () => {
    const harness = createHarness();
    const context = createContext();

    const tools = await harness.manager.listTools(context);

    expect(harness.manager.getCachedTools(context)).toEqual(tools);
    harness.clients[0].listTools.mockRejectedValueOnce(new Error('temporary refresh failure'));

    await expect(harness.manager.listTools(context)).rejects.toThrow('temporary refresh failure');
    expect(harness.manager.getCachedTools(context)).toEqual(tools);
  });

  test('updates the cache and callback when the connected proxy reports changed tools', async () => {
    const harness = createHarness();
    const context = createContext();
    await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });
    const changedTools = [
      { name: 'edit_image', description: 'Edit an image', inputSchema: { type: 'object' } },
    ];

    await harness.clientHandlers[0].onToolsChanged(null, changedTools);

    expect(harness.manager.getCachedTools(context)).toEqual(changedTools);
    expect(harness.onToolsChanged).toHaveBeenCalledWith(context, changedTools);

    await harness.clientHandlers[0].onToolsChanged(new Error('refresh failed'), null);
    expect(harness.manager.getCachedTools(context)).toEqual(changedTools);
    expect(harness.onToolsChanged).toHaveBeenCalledTimes(1);
  });

  test('suppresses notification hook failures without invalidating the connection', async () => {
    const harness = createHarness();
    const context = createContext();
    await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });
    harness.onToolsChanged.mockRejectedValueOnce(new Error('server notification failed'));

    await expect(
      harness.clientHandlers[0].onToolsChanged(null, [
        { name: 'edit_image', description: 'Edit an image', inputSchema: {} },
      ])
    ).resolves.toBeUndefined();
    await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });
    expect(harness.createClient).toHaveBeenCalledTimes(1);
  });

  test('invalidates only the affected project after a connection-closed failure', async () => {
    const harness = createHarness();
    const contextA = createContext();
    const contextB = createContext({ projectId: 'project-b', projectRoot: '/workspace/project-b' });

    await harness.manager.callTool(contextA, { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(contextB, { name: 'generate_image', arguments: {} });
    harness.clients[0].callTool.mockRejectedValueOnce(
      new McpError(ErrorCode.ConnectionClosed, 'Connection closed')
    );

    await expect(
      harness.manager.callTool(contextA, { name: 'get_debug_feedbacks', arguments: {} })
    ).rejects.toMatchObject({ code: ErrorCode.ConnectionClosed });

    await harness.manager.callTool(contextB, { name: 'get_debug_feedbacks', arguments: {} });
    expect(harness.createClient).toHaveBeenCalledTimes(2);

    await harness.manager.callTool(contextA, { name: 'generate_image', arguments: {} });
    expect(harness.createClient).toHaveBeenCalledTimes(3);
    expect(harness.clients[0].close).toHaveBeenCalledTimes(1);
  });

  test('replaces only project A when its authority context changes', async () => {
    const harness = createHarness();
    const contextA = createContext();
    const contextB = createContext({ projectId: 'project-b', projectRoot: '/workspace/project-b' });

    await harness.manager.callTool(contextA, { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(contextB, { name: 'generate_image', arguments: {} });

    const changedA = createContext({ env: 'rnd', proxyConfigJson: '{"authority":"rotated"}' });
    await harness.manager.callTool(changedA, { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(contextB, { name: 'get_debug_feedbacks', arguments: {} });

    expect(harness.createClient).toHaveBeenCalledTimes(3);
    expect(harness.clients[0].close).toHaveBeenCalledTimes(1);
    expect(harness.clients[1].callTool).toHaveBeenCalledTimes(2);
    expect(harness.clients[0].callTool).toHaveBeenCalledTimes(1);
  });

  test('defers closing the replaced connection until its active request finishes', async () => {
    const harness = createHarness();
    const oldContext = createContext();
    await harness.manager.callTool(oldContext, { name: 'generate_image', arguments: {} });

    let resolveOldRequest: (() => void) | undefined;
    let markOldRequestStarted: (() => void) | undefined;
    const oldRequestStarted = new Promise<void>((resolve) => {
      markOldRequestStarted = resolve;
    });
    const oldRequestGate = new Promise<void>((resolve) => {
      resolveOldRequest = resolve;
    });
    harness.clients[0].callTool.mockImplementationOnce(async () => {
      markOldRequestStarted?.();
      await oldRequestGate;
      return { content: [{ type: 'text', text: 'old request complete' }] };
    });

    const oldRequest = harness.manager.callTool(oldContext, {
      name: 'get_debug_feedbacks',
      arguments: {},
    });
    await oldRequestStarted;

    const refreshedContext = createContext({ proxyConfigJson: '{"authority":"rotated"}' });
    await harness.manager.callTool(refreshedContext, { name: 'generate_image', arguments: {} });

    expect(harness.createClient).toHaveBeenCalledTimes(2);
    expect(harness.clients[0].close).not.toHaveBeenCalled();

    resolveOldRequest?.();
    await oldRequest;

    expect(harness.clients[0].close).toHaveBeenCalledTimes(1);
  });

  test('shares one replacement connection while the stale connection closes slowly', async () => {
    const harness = createHarness();
    const oldContext = createContext();
    await harness.manager.callTool(oldContext, { name: 'generate_image', arguments: {} });

    let resolveOldClose: (() => void) | undefined;
    let markOldCloseStarted: (() => void) | undefined;
    const oldCloseStarted = new Promise<void>((resolve) => {
      markOldCloseStarted = resolve;
    });
    const oldCloseGate = new Promise<void>((resolve) => {
      resolveOldClose = resolve;
    });
    harness.clients[0].close.mockImplementationOnce(async () => {
      markOldCloseStarted?.();
      await oldCloseGate;
    });

    const refreshedContext = createContext({ proxyConfigJson: '{"authority":"rotated"}' });
    const firstRequest = harness.manager.callTool(refreshedContext, {
      name: 'generate_image',
      arguments: {},
    });
    await oldCloseStarted;

    const secondRequest = harness.manager.callTool(refreshedContext, {
      name: 'get_debug_feedbacks',
      arguments: {},
    });
    await secondRequest;
    resolveOldClose?.();
    await firstRequest;

    expect(harness.createClient).toHaveBeenCalledTimes(2);
    expect(harness.clients[1].callTool).toHaveBeenCalledTimes(2);
  });

  test('closeAll tracks every connection created during a context switch', async () => {
    const harness = createHarness();
    const oldContext = createContext();
    await harness.manager.callTool(oldContext, { name: 'generate_image', arguments: {} });

    let resolveOldClose: (() => void) | undefined;
    let markOldCloseStarted: (() => void) | undefined;
    const oldCloseStarted = new Promise<void>((resolve) => {
      markOldCloseStarted = resolve;
    });
    const oldCloseGate = new Promise<void>((resolve) => {
      resolveOldClose = resolve;
    });
    harness.clients[0].close.mockImplementationOnce(async () => {
      markOldCloseStarted?.();
      await oldCloseGate;
    });

    const refreshedContext = createContext({ proxyConfigJson: '{"authority":"rotated"}' });
    const switchedRequest = harness.manager.callTool(refreshedContext, {
      name: 'generate_image',
      arguments: {},
    });
    await oldCloseStarted;

    const shutdown = harness.manager.closeAll();
    resolveOldClose?.();
    await shutdown;
    await Promise.allSettled([switchedRequest]);

    expect(harness.createClient).toHaveBeenCalledTimes(2);
    expect(harness.clients[1].close).toHaveBeenCalledTimes(1);
    await expect(
      harness.manager.callTool(refreshedContext, { name: 'generate_image', arguments: {} })
    ).rejects.toThrow('closed');
  });

  test('keeps the current project connection when an old request retries with refreshed context', async () => {
    const harness = createHarness();
    const oldContext = createContext();
    await harness.manager.callTool(oldContext, { name: 'generate_image', arguments: {} });
    harness.clients[0].callTool.mockRejectedValueOnce(
      new McpError(ErrorCode.ConnectionClosed, 'Connection closed')
    );

    await expect(
      harness.manager.callTool(oldContext, { name: 'get_debug_feedbacks', arguments: {} })
    ).rejects.toMatchObject({ code: ErrorCode.ConnectionClosed });

    const refreshedContext = createContext({ proxyConfigJson: '{"authority":"rotated"}' });
    await harness.manager.callTool(refreshedContext, { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(refreshedContext, {
      name: 'get_debug_feedbacks',
      arguments: {},
    });

    expect(harness.createClient).toHaveBeenCalledTimes(2);
    expect(harness.clients[1].close).not.toHaveBeenCalled();
    expect(harness.clients[1].callTool).toHaveBeenCalledTimes(2);
  });

  test('does not replace a connection after a remote business error', async () => {
    const harness = createHarness();
    const context = createContext();
    await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });
    harness.clients[0].callTool.mockRejectedValueOnce(
      new McpError(ErrorCode.InternalError, 'remote build compilation failed')
    );

    await expect(
      harness.manager.callTool(context, { name: 'build', arguments: {} })
    ).rejects.toThrow('remote build compilation failed');
    await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });

    expect(harness.createClient).toHaveBeenCalledTimes(1);
  });

  test('passes request options through to the managed client', async () => {
    const harness = createHarness();
    const context = createContext();
    const requestOptions: RequestOptions = { timeout: 1234, resetTimeoutOnProgress: true };

    const result = await harness.manager.callTool(
      context,
      { name: 'generate_image', arguments: { prompt: 'forest' } },
      requestOptions
    );

    expect(result).toEqual<CallToolResult>({ content: [{ type: 'text', text: 'ok' }] });
    expect(harness.clients[0].callTool).toHaveBeenCalledWith(
      { name: 'generate_image', arguments: { prompt: 'forest' } },
      undefined,
      expect.objectContaining({ ...requestOptions, signal: expect.any(AbortSignal) })
    );
  });

  test('preserves caller cancellation and removes its signal listener', async () => {
    const harness = createHarness();
    const context = createContext();
    await harness.manager.callTool(context, { name: 'ready' });
    const controller = new AbortController();
    let started: (() => void) | undefined;
    const dispatched = new Promise<void>((resolve) => {
      started = resolve;
    });
    harness.clients[0].callTool.mockImplementationOnce(
      (_request, _schema, options: RequestOptions) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
            once: true,
          });
          started?.();
        })
    );
    const failure = new Error('user canceled');
    const pending = harness.manager.callTool(
      context,
      { name: 'wait' },
      { signal: controller.signal }
    );
    const rejected = expect(pending).rejects.toBe(failure);
    await dispatched;
    controller.abort(failure);
    await rejected;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(harness.clients[0].callTool).toHaveBeenCalledTimes(2);
    await harness.manager.closeAll();
  });

  test('failed requests abort SDK cleanup signals while successful ones do not', async () => {
    const harness = createHarness();
    const context = createContext();
    const controller = new AbortController();
    await harness.manager.callTool(context, { name: 'ready' }, { signal: controller.signal });
    expect(harness.clients[0].callTool.mock.calls[0][2].signal.aborted).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    harness.clients[0].callTool.mockRejectedValueOnce(new Error('connection interrupted'));
    await expect(harness.manager.callTool(context, { name: 'wait' })).rejects.toThrow(
      'connection interrupted'
    );
    expect(harness.clients[0].callTool.mock.calls[1][2].signal.aborted).toBe(true);
    await harness.manager.closeAll();
  });

  test('closeAll reports failed transport cleanup and retries it on the next shutdown', async () => {
    const harness = createHarness();
    await harness.manager.callTool(createContext(), { name: 'ready' });
    jest.mocked(harness.transports[0].close).mockRejectedValueOnce(new Error('exit unknown'));
    await expect(harness.manager.closeAll()).rejects.toThrow('exit unknown');
    await harness.manager.closeAll();
    expect(harness.transports[0].close).toHaveBeenCalledTimes(2);
  });

  test('closeAll closes every client once, is idempotent, and rejects new acquisitions', async () => {
    const harness = createHarness();
    await harness.manager.callTool(createContext(), { name: 'generate_image', arguments: {} });
    await harness.manager.callTool(
      createContext({ projectId: 'project-b', projectRoot: '/workspace/project-b' }),
      { name: 'generate_image', arguments: {} }
    );

    await harness.manager.closeAll();
    await harness.manager.closeAll();

    expect(harness.clients[0].close).toHaveBeenCalledTimes(1);
    expect(harness.clients[1].close).toHaveBeenCalledTimes(1);
    await expect(
      harness.manager.callTool(createContext(), { name: 'generate_image', arguments: {} })
    ).rejects.toThrow('closed');
  });

  test('does not expose credentials or serialized proxy configuration in errors', async () => {
    const harness = createHarness({
      connect: async () => {
        throw new Error('connect failed');
      },
    });
    const context = createContext();

    let message = '';
    try {
      await harness.manager.callTool(context, { name: 'generate_image', arguments: {} });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('connect failed');
    expect(message).not.toContain('kid-secret');
    expect(message).not.toContain('mac-secret');
    expect(message).not.toContain(context.proxyConfigJson);
  });
});
