import { PassThrough } from 'node:stream';
import { installStandaloneProxyLifecycleHandlers } from '../mcp-proxy/lifecycle';

describe('standalone MCP proxy lifecycle guards', () => {
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
});
