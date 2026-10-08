import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { HiddenStdioClientTransport } from '../maker/server/hiddenStdioTransport';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

function createChild() {
  return Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null as number | null,
    signalCode: null as string | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(),
  });
}

describe.each(['win32', 'linux'])('hidden stdio lifecycle policy on %s', (platform) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('bounds inherited pipe cleanup without signaling an exited process', async () => {
    const child = createChild();
    jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const transport = new HiddenStdioClientTransport({ command: 'owned-child', stderr: 'pipe' });
    const onclose = jest.fn();
    transport.onclose = onclose;
    const starting = transport.start();
    child.emit('spawn');
    await starting;
    child.exitCode = 0;
    child.emit('exit', 0, null);
    let cleaned = false;
    const closing = transport.close().then(() => {
      cleaned = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(cleaned).toBe(platform === 'win32');
    if (platform === 'linux') {
      expect(child.stdout.destroyed).toBe(false);
      await jest.advanceTimersByTimeAsync(2000);
    }
    await closing;
    expect(child.kill).not.toHaveBeenCalled();
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(child.listenerCount('close')).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    child.emit('close', 0, null);
    await transport.close();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  test('waits for exit evidence after kill and shares concurrent close completion', async () => {
    const child = createChild();
    jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const transport = new HiddenStdioClientTransport({ command: 'owned-child', stderr: 'pipe' });
    const starting = transport.start();
    child.emit('spawn');
    await starting;
    let cleaned = false;
    const closing = Promise.all([transport.close(), transport.close()]).then(() => {
      cleaned = true;
    });
    await jest.advanceTimersByTimeAsync(2000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(cleaned).toBe(false);
    child.signalCode = 'SIGTERM';
    child.emit('exit', null, 'SIGTERM');
    child.emit('close', null, 'SIGTERM');
    await closing;
    expect(jest.getTimerCount()).toBe(0);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  test('escalates only on POSIX and reports missing exit evidence', async () => {
    const child = createChild();
    jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const transport = new HiddenStdioClientTransport({ command: 'owned-child', stderr: 'pipe' });
    const starting = transport.start();
    child.emit('spawn');
    await starting;
    const closing = expect(transport.close()).rejects.toThrow('exit could not be confirmed');
    await jest.advanceTimersByTimeAsync(platform === 'win32' ? 4000 : 6000);
    await closing;
    expect(child.kill.mock.calls).toEqual(
      platform === 'win32' ? [['SIGTERM']] : [['SIGTERM'], ['SIGKILL']]
    );
    expect(jest.getTimerCount()).toBe(0);
    child.exitCode = 0;
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    await transport.close();
  });
});
