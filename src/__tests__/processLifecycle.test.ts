import { PassThrough } from 'node:stream';
import {
  installParentDeathWatchdog,
  installStdinExitHandler,
  installStdioErrorHandlers,
  isDisconnectedStdioError,
  shouldExitForParentDeath,
} from '../core/utils/processLifecycle';

describe('shared process lifecycle guards', () => {
  test('treats disconnected stdio stream errors as client shutdown', () => {
    expect(
      isDisconnectedStdioError(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    ).toBe(true);
    expect(
      isDisconnectedStdioError(
        Object.assign(new Error('stream destroyed'), { code: 'ERR_STREAM_DESTROYED' })
      )
    ).toBe(true);
    expect(
      isDisconnectedStdioError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
    ).toBe(true);
    expect(isDisconnectedStdioError(Object.assign(new Error('read EIO'), { code: 'EIO' }))).toBe(
      true
    );
    expect(
      isDisconnectedStdioError(Object.assign(new Error('read ENXIO'), { code: 'ENXIO' }))
    ).toBe(true);
    expect(isDisconnectedStdioError(Object.assign(new Error('other'), { code: 'ENOENT' }))).toBe(
      false
    );
  });

  test('runs cleanup once before exiting on stdin end and close', () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const log = jest.fn();

    installStdinExitHandler({
      stdin,
      cleanup,
      exit,
      log,
      source: 'test-stdin-closed',
      message: 'stdin closed',
    });

    stdin.emit('end');
    stdin.emit('close');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalledWith('test-stdin-closed', 'stdin closed');
  });

  test('stdin exit handler can delegate closed exits to caller-owned logic', () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const onClosed = jest.fn();

    installStdinExitHandler({
      stdin,
      cleanup,
      exit,
      source: 'test-stdin-closed',
      message: 'stdin closed',
      onClosed,
    });

    stdin.emit('end');

    expect(onClosed).toHaveBeenCalledWith('test-stdin-closed', 'stdin closed');
    expect(cleanup).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  test('detects parent death from orphan ppid or ESRCH probe', () => {
    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 1,
        platform: 'darwin',
        probeParent: () => true,
      })
    ).toBe(true);

    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 456,
        platform: 'win32',
        probeParent: () => {
          throw Object.assign(new Error('missing'), { code: 'ESRCH' });
        },
      })
    ).toBe(true);

    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 456,
        platform: 'linux',
        probeParent: () => true,
      })
    ).toBe(false);
  });

  test('parent death watchdog cleans up and exits when parent disappears', () => {
    jest.useFakeTimers();
    try {
      const cleanup = jest.fn();
      const exit = jest.fn();
      const log = jest.fn();

      const timer = installParentDeathWatchdog({
        cleanup,
        exit,
        log,
        source: 'test-parent-dead',
        message: 'parent dead',
        intervalMs: 1000,
        initialPpid: 123,
        getCurrentPpid: () => 1,
        platform: 'darwin',
        probeParent: () => true,
      });

      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
      expect(log).toHaveBeenCalledWith('test-parent-dead', 'parent dead');
      clearInterval(timer);
    } finally {
      jest.useRealTimers();
    }
  });

  test('stdio error handler accepts a caller-owned ignored error message', () => {
    const stream = new PassThrough();
    const log = jest.fn();

    installStdioErrorHandlers({
      streams: [stream],
      cleanup: jest.fn(),
      exit: jest.fn(),
      log,
      disconnectedSource: 'test-disconnected',
      disconnectedMessage: 'stdio disconnected',
      ignoredSource: 'test-stdio-error',
      ignoredMessage: (error) =>
        `test stdio error ignored: ${error instanceof Error ? error.message : String(error)}`,
    });

    stream.emit('error', Object.assign(new Error('ordinary failure'), { code: 'EINVAL' }));

    expect(log).toHaveBeenCalledWith(
      'test-stdio-error',
      'test stdio error ignored: ordinary failure'
    );
  });

  test('stdio error handler can delegate disconnected exits to caller-owned logic', () => {
    const stream = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const onDisconnected = jest.fn();

    installStdioErrorHandlers({
      streams: [stream],
      cleanup,
      exit,
      disconnectedSource: 'test-disconnected',
      disconnectedMessage: 'stdio disconnected',
      onDisconnected,
    });

    stream.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));

    expect(onDisconnected).toHaveBeenCalledWith('test-disconnected', 'stdio disconnected');
    expect(cleanup).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
