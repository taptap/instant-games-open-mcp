import { PassThrough } from 'node:stream';
import { DEFAULT_TOOL_CALL_TIMEOUT_MS } from '../mcp-proxy/config';
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

describe('standalone MCP proxy lifecycle guards', () => {
  test('defaults tool call timeout to one hour for long-running proxy tools', () => {
    expect(DEFAULT_TOOL_CALL_TIMEOUT_MS).toBe(60 * 60 * 1000);
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

  test('classifies HTTP 5xx as network errors without retrying HTTP 4xx', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());

    expect(
      (proxy as any).isNetworkError(Object.assign(new Error('HTTP request failed'), { code: 503 }))
    ).toBe(true);
    expect((proxy as any).isNetworkError(new Error('HTTP 502: Bad Gateway'))).toBe(true);
    expect(
      (proxy as any).isNetworkError(Object.assign(new Error('HTTP request failed'), { code: 400 }))
    ).toBe(false);
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
