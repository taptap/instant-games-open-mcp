import { PassThrough } from 'node:stream';
import { DEFAULT_TOOL_CALL_TIMEOUT_MS } from '../mcp-proxy/config';
import { installStandaloneProxyLifecycleHandlers } from '../mcp-proxy/lifecycle';
import { TapTapMCPProxy } from '../mcp-proxy/proxy';
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
