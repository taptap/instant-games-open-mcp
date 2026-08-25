import { PassThrough } from 'node:stream';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types';
import { DEFAULT_TOOL_CALL_TIMEOUT_MS, loadConfig } from '../mcp-proxy/config';
import { installStandaloneProxyLifecycleHandlers } from '../mcp-proxy/lifecycle';
import { convertMcpApplicationErrorToToolResult, TapTapMCPProxy } from '../mcp-proxy/proxy';
import type { ProxyConfig } from '../mcp-proxy/types';

function createProxyConfig(): ProxyConfig {
  return {
    server: {
      url: 'http://127.0.0.1:1/mcp',
    },
    tenant: {
      project_path: '/tmp/project',
    },
    auth: {
      kid: 'kid-1',
      mac_key: 'mac-key-1',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1',
    },
    options: {
      log: {
        enabled: false,
      },
    },
  };
}

function setReplayableTools(config: ProxyConfig, toolNames: string[]): void {
  (config.options as ProxyConfig['options'] & { replayable_tools: string[] }).replayable_tools =
    toolNames;
}

async function callProxyTool(
  proxy: TapTapMCPProxy,
  name: string
): Promise<Record<string, unknown>> {
  const proxyInternals = proxy as any;
  if (!proxyInternals.server._requestHandlers.has('tools/call')) {
    proxyInternals.setupHandlers();
  }
  const handler = proxyInternals.server._requestHandlers.get('tools/call');
  return await handler(
    {
      method: 'tools/call',
      params: { name, arguments: {} },
    },
    {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    }
  );
}

describe('standalone MCP proxy lifecycle guards', () => {
  test('defaults tool call timeout to one hour for long-running proxy tools', () => {
    expect(DEFAULT_TOOL_CALL_TIMEOUT_MS).toBe(60 * 60 * 1000);
  });

  test('loads a valid replayable tool allowlist from JSON configuration', async () => {
    const previousArg = process.argv[2];
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.argv[2] = JSON.stringify({
      ...createProxyConfig(),
      options: { replayable_tools: ['build'] },
    });

    try {
      await expect(loadConfig()).resolves.toMatchObject({
        options: { replayable_tools: ['build'] },
      });
    } finally {
      if (previousArg === undefined) {
        delete process.argv[2];
      } else {
        process.argv[2] = previousArg;
      }
      consoleError.mockRestore();
    }
  });

  test('rejects invalid replayable tool configuration', async () => {
    const previousArg = process.argv[2];
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.argv[2] = JSON.stringify({
      ...createProxyConfig(),
      options: { replayable_tools: ['build', ''] },
    });

    try {
      await expect(loadConfig()).rejects.toThrow(
        'options.replayable_tools values must be non-empty strings'
      );
    } finally {
      if (previousArg === undefined) {
        delete process.argv[2];
      } else {
        process.argv[2] = previousArg;
      }
      consoleError.mockRestore();
    }
  });

  test('does not classify MCP server build errors as reconnectable network errors', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const serverBuildError = Object.assign(
      new Error('MCP error -32603: build failed before timeout window'),
      {
        code: -32603,
        data: {
          remote_result: {
            error: 'BUILD FAILED: lua syntax error',
          },
        },
      }
    );

    expect((proxy as any).isNetworkError(serverBuildError)).toBe(false);
  });

  test('does not classify remote diagnostics as network errors even with timeout codes', () => {
    const serverBuildError = Object.assign(new Error('MCP error -32603: compiler timeout'), {
      code: 'ETIMEDOUT',
      data: {
        remote_result: {
          error: 'BUILD FAILED: lua syntax error',
        },
      },
    });

    const proxy = new TapTapMCPProxy(createProxyConfig());

    expect((proxy as any).isNetworkError(serverBuildError)).toBe(false);
  });

  test('converts remote build MCP errors into tool-level results with diagnostics', () => {
    const serverBuildError = Object.assign(
      new Error('MCP error -32603: build failed before timeout window'),
      {
        code: -32603,
        data: {
          remote_result: {
            error: 'BUILD FAILED: lua syntax error',
            diagnostics: [{ line: 12, message: "unexpected 'end'" }],
          },
        },
      }
    );

    const result = convertMcpApplicationErrorToToolResult(serverBuildError);

    expect(result?.isError).toBe(true);
    expect(result?.content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('BUILD FAILED: lua syntax error'),
      },
    ]);
    expect(result?.content[0]?.text).toContain("unexpected 'end'");
  });

  test('converts remote diagnostics when replaying a pending request after reconnect', async () => {
    const serverBuildError = Object.assign(
      new Error('MCP error -32603: build failed after reconnect'),
      {
        code: -32603,
        data: {
          remote_result: {
            error: 'BUILD FAILED: lua syntax error after reconnect',
          },
        },
      }
    );
    const resolve = jest.fn();
    const reject = jest.fn();
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const proxyInternals = proxy as any;
    proxyInternals.client = {
      callTool: jest.fn().mockRejectedValue(serverBuildError),
    };
    proxyInternals.pendingRequests = [
      {
        name: 'build',
        arguments: {},
        resolve,
        reject,
        timestamp: Date.now(),
      },
    ];

    await proxyInternals.processPendingRequests();

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('BUILD FAILED: lua syntax error after reconnect'),
          },
        ],
      })
    );
    expect(reject).not.toHaveBeenCalled();
  });

  test('keeps MCP protocol errors without remote diagnostics as exceptions', () => {
    const internalError = Object.assign(new Error('MCP error -32603: internal failure'), {
      code: -32603,
    });

    expect(convertMcpApplicationErrorToToolResult(internalError)).toBeUndefined();
  });

  test('classifies MCP disconnect errors as reconnectable network errors', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const notConnectedError = Object.assign(new Error('MCP error -32000: not connected'), {
      code: -32000,
    });
    const sessionExpiredError = Object.assign(new Error('MCP error -32000: session expired'), {
      code: -32000,
    });

    expect((proxy as any).isNetworkError(notConnectedError)).toBe(true);
    expect((proxy as any).isNetworkError(sessionExpiredError)).toBe(true);
  });

  test('classifies the MCP SDK connection-closed code as reconnectable', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const connectionClosedError = new McpError(ErrorCode.ConnectionClosed, 'Connection closed');

    expect((proxy as any).isNetworkError(connectionClosedError)).toBe(true);
  });

  test('classifies the MCP SDK request-timeout code as reconnectable', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const requestTimeoutError = new McpError(ErrorCode.RequestTimeout, 'Request timed out');

    expect((proxy as any).isNetworkError(requestTimeoutError)).toBe(true);
  });

  test('classifies HTTP 5xx as network errors without retrying HTTP 4xx', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());

    expect(
      (proxy as any).isNetworkError(Object.assign(new Error('HTTP request failed'), { code: 503 }))
    ).toBe(true);
    expect((proxy as any).isNetworkError(new Error('HTTP 502: Bad Gateway'))).toBe(true);
    expect(
      (proxy as any).isNetworkError(Object.assign(new Error('HTTP request failed'), { code: 400 }))
    ).toBe(false);
    expect(
      (proxy as any).isNetworkError(
        Object.assign(new Error('HTTP 408: Request Timeout'), { code: 408 })
      )
    ).toBe(false);
    expect((proxy as any).isNetworkError(new Error('HTTP 429: Too Many Requests'))).toBe(false);
  });

  test('requeues pending requests when replay loses the network again', async () => {
    const networkError = Object.assign(new Error('connect ECONNRESET during replay'), {
      code: 'ECONNRESET',
    });
    const firstResolve = jest.fn();
    const firstReject = jest.fn();
    const secondResolve = jest.fn();
    const secondReject = jest.fn();
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const proxyInternals = proxy as any;
    proxyInternals.connected = true;
    proxyInternals.client = {
      callTool: jest.fn().mockRejectedValue(networkError),
    };
    const firstRequest = {
      name: 'build',
      arguments: {},
      resolve: firstResolve,
      reject: firstReject,
      timestamp: Date.now(),
    };
    const secondRequest = {
      name: 'get_status',
      arguments: {},
      resolve: secondResolve,
      reject: secondReject,
      timestamp: Date.now(),
    };
    proxyInternals.pendingRequests = [firstRequest, secondRequest];

    await expect(proxyInternals.processPendingRequests()).rejects.toBe(networkError);

    expect(proxyInternals.connected).toBe(false);
    expect(proxyInternals.pendingRequests).toEqual([firstRequest, secondRequest]);
    expect(proxyInternals.client.callTool).toHaveBeenCalledTimes(1);
    expect(firstResolve).not.toHaveBeenCalled();
    expect(firstReject).not.toHaveBeenCalled();
    expect(secondResolve).not.toHaveBeenCalled();
    expect(secondReject).not.toHaveBeenCalled();
  });

  test('does not dispatch a non-replayable tool found in the pending queue', async () => {
    const config = createProxyConfig();
    setReplayableTools(config, ['build']);
    const resolve = jest.fn();
    const reject = jest.fn();
    const proxy = new TapTapMCPProxy(config);
    const proxyInternals = proxy as any;
    proxyInternals.client = {
      callTool: jest.fn(),
    };
    proxyInternals.pendingRequests = [
      {
        name: 'generate_image',
        arguments: {},
        resolve,
        reject,
        timestamp: Date.now(),
        executionState: 'unknown',
      },
    ];

    await proxyInternals.processPendingRequests();

    expect(proxyInternals.client.callTool).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        structuredContent: {
          execution_state: 'unknown',
          automatic_retry: false,
        },
      })
    );
    expect(reject).not.toHaveBeenCalled();
  });

  test('returns not_executed instead of queueing a non-replayable tool while reconnecting', async () => {
    const config = createProxyConfig();
    setReplayableTools(config, ['build']);
    const proxy = new TapTapMCPProxy(config);
    const proxyInternals = proxy as any;
    proxyInternals.connected = false;
    proxyInternals.reconnecting = true;

    const resultPromise = callProxyTool(proxy, 'generate_image');
    await new Promise((resolve) => setImmediate(resolve));

    expect(proxyInternals.pendingRequests).toHaveLength(0);
    const result = await resultPromise;
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        execution_state: 'not_executed',
        automatic_retry: false,
      },
    });
    expect((result.content as Array<{ text: string }>)[0].text).toContain('upstream MCP');
  });

  test('returns unknown without replaying a non-replayable tool after dispatch', async () => {
    const config = createProxyConfig();
    setReplayableTools(config, ['build']);
    const proxy = new TapTapMCPProxy(config);
    const proxyInternals = proxy as any;
    const networkError = Object.assign(new Error('connect ECONNRESET after dispatch'), {
      code: 'ECONNRESET',
    });
    proxyInternals.connected = true;
    proxyInternals.reconnecting = false;
    proxyInternals.reconnectToServer = jest.fn();
    proxyInternals.client = {
      callTool: jest.fn().mockRejectedValue(networkError),
    };

    const resultPromise = callProxyTool(proxy, 'generate_image');
    await new Promise((resolve) => setImmediate(resolve));

    expect(proxyInternals.pendingRequests).toHaveLength(0);
    const result = await resultPromise;
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        execution_state: 'unknown',
        automatic_retry: false,
      },
    });
    expect((result.content as Array<{ text: string }>)[0].text).toContain('upstream MCP');
    expect(proxyInternals.client.callTool).toHaveBeenCalledTimes(1);
    expect(proxyInternals.reconnectToServer).toHaveBeenCalledTimes(1);
  });

  test('keeps historical queueing when replayable_tools is not configured', async () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const proxyInternals = proxy as any;
    proxyInternals.connected = false;
    proxyInternals.reconnecting = true;

    const resultPromise = callProxyTool(proxy, 'generate_image');

    expect(proxyInternals.pendingRequests).toHaveLength(1);
    proxyInternals.pendingRequests[0].resolve({ content: [] });
    await expect(resultPromise).resolves.toEqual({ content: [] });
  });

  test('keeps build queueing when it is the only replayable Maker tool', async () => {
    const config = createProxyConfig();
    setReplayableTools(config, ['build']);
    const proxy = new TapTapMCPProxy(config);
    const proxyInternals = proxy as any;
    proxyInternals.connected = false;
    proxyInternals.reconnecting = true;

    const resultPromise = callProxyTool(proxy, 'build');

    expect(proxyInternals.pendingRequests).toHaveLength(1);
    proxyInternals.pendingRequests[0].resolve({ content: [] });
    await expect(resultPromise).resolves.toEqual({ content: [] });
  });

  test('cleans up and exits when stdin closes', () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const log = jest.fn();

    installStandaloneProxyLifecycleHandlers({
      proxy: { cleanup },
      stdin,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exit,
      log,
      installSignals: false,
      installParentWatchdog: false,
    });

    stdin.emit('end');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith(
      'standalone-proxy-stdin-closed',
      'Standalone proxy stdin closed; exiting.'
    );
  });

  test('cleans up and exits on disconnected stdio errors', () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const log = jest.fn();

    installStandaloneProxyLifecycleHandlers({
      proxy: { cleanup },
      stdin,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exit,
      log,
      installSignals: false,
      installParentWatchdog: false,
    });

    stdin.emit('error', Object.assign(new Error('read ENXIO'), { code: 'ENXIO' }));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith(
      'standalone-proxy-stdio-disconnected',
      'Standalone proxy stdio disconnected; exiting.'
    );
  });

  test('runs cleanup once when multiple lifecycle exits fire', () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();

    installStandaloneProxyLifecycleHandlers({
      proxy: { cleanup },
      stdin,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exit,
      log: jest.fn(),
      installSignals: false,
      installParentWatchdog: false,
    });

    stdin.emit('end');
    stdin.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  test('swallows non-disconnected stdio errors without exiting', () => {
    const cleanup = jest.fn();
    const exit = jest.fn();
    const log = jest.fn();
    const stderr = new PassThrough();

    installStandaloneProxyLifecycleHandlers({
      proxy: { cleanup },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr,
      exit,
      log,
      installSignals: false,
      installParentWatchdog: false,
    });

    stderr.emit('error', Object.assign(new Error('ordinary stream failure'), { code: 'EINVAL' }));

    expect(cleanup).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'standalone-proxy-stdio-error',
      'Standalone proxy stdio error ignored: ordinary stream failure'
    );
  });

  test('lifecycle logging does not throw when stderr is already disconnected', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const writeSync = jest.fn(() => {
      throw Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
    });
    const proxyInternals = proxy as unknown as {
      logWriter: {
        writeSync: (level: string, message: string) => void;
      };
    };
    proxyInternals.logWriter = { writeSync };

    expect(() => {
      proxy.logLifecycleEvent('standalone-proxy-stdio-disconnected', 'exiting');
    }).not.toThrow();
    expect(writeSync).toHaveBeenCalledTimes(1);
  });
});
