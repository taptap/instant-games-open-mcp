import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { checkMakerPythonEnvironmentAsync } from '../maker/system/python.js';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: jest.fn(),
}));

let root: string;
let oldHome: string | undefined;
let oldPython: string | undefined;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-python-async-'));
  oldHome = process.env.TAPTAP_MAKER_HOME;
  oldPython = process.env.TAPTAP_MAKER_PYTHON_BIN;
  process.env.TAPTAP_MAKER_HOME = root;
  process.env.TAPTAP_MAKER_PYTHON_BIN = path.join(root, 'python.exe');
  jest.mocked(spawn).mockReset();
});
afterEach(() => {
  if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = oldHome;
  if (oldPython === undefined) delete process.env.TAPTAP_MAKER_PYTHON_BIN;
  else process.env.TAPTAP_MAKER_PYTHON_BIN = oldPython;
  fs.rmSync(root, { recursive: true, force: true });
});
function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(),
  });
}
test('Python probes yield to other work and preserve configured interpreter selection', async () => {
  const calls: ReturnType<typeof child>[] = [];
  jest.mocked(spawn).mockImplementation(() => {
    const process = child();
    calls.push(process);
    return process as never;
  });
  const pending = checkMakerPythonEnvironmentAsync();
  let responsive = false;
  await new Promise<void>((resolve) =>
    setImmediate(() => {
      responsive = true;
      resolve();
    })
  );
  expect(responsive).toBe(true);
  expect(calls).toHaveLength(1);
  calls[0].stdout.write(
    JSON.stringify({ executable: path.join(root, 'python.exe'), version: '3.12.0' })
  );
  calls[0].emit('close', 0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(calls).toHaveLength(2);
  calls[1].stdout.write('pip 24');
  calls[1].emit('close', 0);
  expect(await pending).toMatchObject({ ready: true, provider: 'configured' });
});
test('cancellation waits for the owned child to close and does not probe another interpreter', async () => {
  const process = child();
  jest.mocked(spawn).mockReturnValue(process as never);
  const controller = new AbortController();
  let settled = false;
  const pending = checkMakerPythonEnvironmentAsync(controller.signal).catch((error) => {
    settled = true;
    return error;
  });
  controller.abort();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(process.kill).toHaveBeenCalledWith('SIGKILL');
  expect(settled).toBe(false);
  process.emit('close', null);
  expect((await pending).message).toContain('CANCELLED');
  expect(spawn).toHaveBeenCalledTimes(1);
});
test('Windows cancellation waits for process-tree termination as well as the child', async () => {
  if (process.platform !== 'win32') return;
  const owned = Object.assign(child(), { pid: 12345, exitCode: null });
  const killer = child();
  jest
    .mocked(spawn)
    .mockReturnValueOnce(owned as never)
    .mockReturnValueOnce(killer as never);
  const controller = new AbortController();
  let settled = false;
  const pending = checkMakerPythonEnvironmentAsync(controller.signal).catch((error) => {
    settled = true;
    return error;
  });
  controller.abort();
  expect(spawn).toHaveBeenLastCalledWith(
    'taskkill.exe',
    ['/PID', '12345', '/T', '/F'],
    expect.objectContaining({ shell: false })
  );
  owned.emit('close', null);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  killer.emit('close', 0);
  expect((await pending).message).toContain('CANCELLED');
});

test('an already cancelled probe does not create a process', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(checkMakerPythonEnvironmentAsync(controller.signal)).rejects.toThrow('CANCELLED');
  expect(spawn).not.toHaveBeenCalled();
});
