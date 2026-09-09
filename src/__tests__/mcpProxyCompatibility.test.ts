import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types';
import { TapTapMCPProxy } from '../mcp-proxy/proxy';
import { loadConfig } from '../mcp-proxy/config';
import type { ProxyConfig, ProxyRuntimeOptions } from '../mcp-proxy/types';

function config(options: ProxyConfig['options'] = {}): ProxyConfig {
  return {
    server: { url: 'http://127.0.0.1:1/mcp' },
    tenant: { project_path: 'audit/workspace' },
    auth: { kid: 'audit', mac_key: 'fake', token_type: 'mac', mac_algorithm: 'hmac-sha-1' },
    options: { log: { enabled: false }, ...options },
  };
}

function createProxy(runtime: ProxyRuntimeOptions = {}, options: ProxyConfig['options'] = {}): any {
  const proxy = new TapTapMCPProxy(config(options), runtime) as any;
  proxy.log = jest.fn();
  proxy.connected = true;
  proxy.setupHandlers();
  return proxy;
}

function callTool(proxy: any, name = 'write_record'): Promise<any> {
  return proxy.server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: {} } },
    { sendNotification: jest.fn().mockResolvedValue(undefined) }
  );
}

function remoteError(): McpError {
  return new McpError(-32603, 'compiler failed', {
    remote_result: { diagnostics: ['invalid input'] },
    correlation_id: 'audit-correlation',
  });
}

describe('standalone proxy compatibility', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test.each([undefined, 12345])(
    'loads the historical default or explicit timeout %j',
    async (value) => {
      const previous = process.argv[2];
      process.argv[2] = JSON.stringify(config({ tool_call_timeout: value }));
      try {
        expect((await loadConfig()).options?.tool_call_timeout).toBe(value ?? 300000);
      } finally {
        if (previous === undefined) delete process.argv[2];
        else process.argv[2] = previous;
      }
    }
  );

  test.each([undefined, 12345])(
    'uses the default or explicit timeout %j in normal calls',
    async (value) => {
      const proxy = createProxy({}, { tool_call_timeout: value });
      proxy.client = { callTool: jest.fn().mockResolvedValue({ content: [] }) };
      await callTool(proxy);
      expect(proxy.client.callTool.mock.calls[0][2].timeout).toBe(value ?? 300000);
    }
  );

  test('preserves upstream error code and all data in normal calls', async () => {
    const error = remoteError();
    const proxy = createProxy();
    proxy.client = { callTool: jest.fn().mockRejectedValue(error) };
    await expect(callTool(proxy)).rejects.toBe(error);
    expect(proxy.pendingRequests).toHaveLength(0);
  });

  test('preserves upstream error code and all data in pending calls', async () => {
    const error = remoteError();
    const proxy = createProxy();
    proxy.client = { callTool: jest.fn().mockRejectedValue(error) };
    const req = { name: 'build', timestamp: Date.now(), resolve: jest.fn(), reject: jest.fn() };
    proxy.pendingRequests = [req];
    await proxy.processPendingRequests();
    expect(req.reject).toHaveBeenCalledWith(error);
    expect(req.resolve).not.toHaveBeenCalled();
  });

  test('converts errors only when the embedding entry opts in', async () => {
    const proxy = createProxy({ remoteErrorMode: 'tool-result' });
    proxy.client = { callTool: jest.fn().mockRejectedValue(remoteError()) };
    await expect(callTool(proxy)).resolves.toMatchObject({ isError: true });
  });

  test.each([400, 404])('recovers HTTP %s with explicit session-loss evidence', (code) => {
    const proxy = createProxy();
    expect(proxy.isNetworkError(Object.assign(new Error('session not found'), { code }))).toBe(
      true
    );
  });

  test.each([400, 401, 403, 404, 408, 429])('does not retry ordinary HTTP %s', (code) => {
    const proxy = createProxy();
    expect(
      proxy.isNetworkError(Object.assign(new Error(`HTTP ${code}: request failed`), { code }))
    ).toBe(false);
  });

  test.each([401, 403, 408, 429])('does not bypass HTTP %s using session text', (code) => {
    const proxy = createProxy();
    expect(proxy.isNetworkError(Object.assign(new Error('session expired'), { code }))).toBe(false);
  });

  test('does not retry a protocol business error just because it mentions a gateway', () => {
    const proxy = createProxy();
    expect(
      proxy.isNetworkError(new McpError(-32603, 'HTTP 503: service unavailable in input'))
    ).toBe(false);
  });

  test.each([
    Object.assign(new Error('HTTP 503: Service Unavailable'), { code: 503 }),
    new McpError(ErrorCode.ConnectionClosed, 'Connection closed'),
    new McpError(ErrorCode.RequestTimeout, 'Request timed out'),
  ])('recovers the connection without replaying new error categories: %s', async (error) => {
    const proxy = createProxy();
    proxy.client = { callTool: jest.fn().mockRejectedValue(error) };
    proxy.reconnectToServer = jest.fn();
    const result = callTool(proxy).catch((caught) => caught);
    await Promise.resolve();
    await Promise.resolve();
    expect(proxy.pendingRequests).toHaveLength(0);
    expect(await result).toBe(error);
    expect(proxy.reconnectToServer).toHaveBeenCalledTimes(1);
    expect(proxy.client.callTool).toHaveBeenCalledTimes(1);
  });

  test('retains the historical first replay for a connection reset', async () => {
    const proxy = createProxy();
    proxy.client = {
      callTool: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' })),
    };
    proxy.reconnectToServer = jest.fn();
    const result = callTool(proxy);
    await Promise.resolve();
    await Promise.resolve();
    expect(proxy.pendingRequests).toHaveLength(1);
    proxy.pendingRequests[0].resolve({ content: [] });
    await expect(result).resolves.toEqual({ content: [] });
  });

  test('ends a failed replay without losing requests that have not been dispatched', async () => {
    const proxy = createProxy();
    const error = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    proxy.client = { callTool: jest.fn().mockRejectedValue(error) };
    const first = {
      name: 'write_record',
      timestamp: Date.now(),
      resolve: jest.fn(),
      reject: jest.fn(),
    };
    const second = {
      name: 'read_record',
      timestamp: Date.now(),
      resolve: jest.fn(),
      reject: jest.fn(),
    };
    proxy.pendingRequests = [first, second];
    await expect(proxy.processPendingRequests()).rejects.toBe(error);
    expect(first.reject).toHaveBeenCalledWith(error);
    expect(proxy.pendingRequests).toEqual([second]);
    expect(proxy.client.callTool).toHaveBeenCalledTimes(1);
  });

  test('does not dispatch a queued request that expired while the previous call was running', async () => {
    jest.useFakeTimers();
    const proxy = createProxy({}, { request_timeout: 30000 });
    proxy.client = {
      callTool: jest.fn(async () => {
        jest.setSystemTime(Date.now() + 31000);
        return { content: [] };
      }),
    };
    const first = { name: 'first', timestamp: Date.now(), resolve: jest.fn(), reject: jest.fn() };
    const second = { name: 'second', timestamp: Date.now(), resolve: jest.fn(), reject: jest.fn() };
    proxy.pendingRequests = [first, second];
    await proxy.processPendingRequests();
    expect(proxy.client.callTool).toHaveBeenCalledTimes(1);
    expect(first.resolve).toHaveBeenCalled();
    expect(second.reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('timeout') })
    );
  });

  test.each([5000, 30000, 90000])('always honors a fixed reconnect interval of %s', (interval) => {
    jest.useFakeTimers();
    const schedule = jest.spyOn(global, 'setTimeout');
    const proxy = createProxy({}, { reconnect_interval: interval });
    for (let i = 0; i < 3; i++) proxy.scheduleReconnect();
    expect(schedule.mock.calls.map((call) => call[1])).toEqual([interval, interval, interval]);
    schedule.mockRestore();
  });

  test.each([
    [30000, [30000, 60000, 60000]],
    [90000, [90000, 90000, 90000]],
  ])('only uses bounded backoff when explicitly enabled (%s)', (interval, expected) => {
    jest.useFakeTimers();
    const schedule = jest.spyOn(global, 'setTimeout');
    const proxy = createProxy(
      { recoveryMode: 'resilient' },
      { reconnect_interval: interval as number }
    );
    for (let i = 0; i < 3; i++) proxy.scheduleReconnect();
    expect(schedule.mock.calls.map((call) => call[1])).toEqual(expected);
    schedule.mockRestore();
  });

  test.each(['compatible', 'resilient'] as const)(
    'preserves the notification order for %s',
    async (recoveryMode) => {
      const proxy = createProxy({ recoveryMode });
      const order: string[] = [];
      proxy.client = {
        connect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
      };
      proxy.startHealthCheck = jest.fn();
      proxy.reconnecting = true;
      proxy.processPendingRequests = jest.fn(async () => {
        order.push('pending');
      });
      proxy.notifyReconnected = jest.fn(async () => {
        order.push('notification');
      });
      await proxy.connectToServer();
      expect(order).toEqual(
        recoveryMode === 'compatible' ? ['notification', 'pending'] : ['pending', 'notification']
      );
    }
  );
});
