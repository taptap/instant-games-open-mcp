import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runPreviewInstaller } from '../maker/preview/installerProcess.js';

const python = ['python3', 'python'].find(
  (command) => spawnSync(command, ['--version'], { timeout: 5000 }).status === 0
);
const pythonTest = python ? test : test.skip;
let root: string;
let helperPid: number | undefined;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-installer-process-'));
});
afterEach(() => {
  if (helperPid) {
    try {
      process.kill(helperPid, 'SIGKILL');
    } catch {
      /* Already reaped. */
    }
  }
  helperPid = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

async function helperStarted(): Promise<void> {
  const filename = path.join(root, 'helper.pid');
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(filename)) {
      helperPid = Number(fs.readFileSync(filename, 'utf8'));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Helper did not start');
}

function expectProcessGone(pid: number): void {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw error;
  }
  throw new Error(`Helper process ${pid} is still alive`);
}

function script(source: string): string {
  const filename = path.join(root, 'installer.py');
  fs.writeFileSync(filename, source);
  return filename;
}

function slowInstaller(): string {
  return script(`import subprocess, sys
subprocess.run([sys.executable, "-c", "import os,time; open('helper.pid','w').write(str(os.getpid())); time.sleep(60)"])
`);
}

pythonTest('cancellation reaps an installer child before returning', async () => {
  const abort = new AbortController();
  const task = runPreviewInstaller(python!, [slowInstaller()], { cwd: root, signal: abort.signal });
  const rejected = expect(task).rejects.toThrow('CANCELLED');
  await helperStarted();
  abort.abort();
  await rejected;
  expectProcessGone(helperPid!);
  helperPid = undefined;
});

pythonTest('timeout reaps descendants and reports TIMEOUT', async () => {
  const task = runPreviewInstaller(python!, [slowInstaller()], { cwd: root, timeoutMs: 2000 });
  const rejected = expect(task).rejects.toThrow('TIMEOUT');
  await helperStarted();
  await rejected;
  expectProcessGone(helperPid!);
  helperPid = undefined;
});

pythonTest('returns complete output on ordinary completion', async () => {
  const filename = script('import sys\nprint("installed")\nprint("diagnostic", file=sys.stderr)\n');
  expect(await runPreviewInstaller(python!, [filename], { cwd: root })).toEqual({
    stdout: 'installed\n',
    stderr: 'diagnostic\n',
  });
});

pythonTest('rejects already cancelled operations without launching a script', async () => {
  const abort = new AbortController();
  abort.abort();
  const filename = script('open("should-not-exist", "w").write("bad")\n');
  await expect(
    runPreviewInstaller(python!, [filename], { cwd: root, signal: abort.signal })
  ).rejects.toThrow('CANCELLED');
  expect(fs.existsSync(path.join(root, 'should-not-exist'))).toBe(false);
});

pythonTest('bounds installer output and cancels the process', async () => {
  const filename = script('import time\nprint("x" * 8192, flush=True)\ntime.sleep(60)\n');
  await expect(
    runPreviewInstaller(python!, [filename], { cwd: root, maxBuffer: 1024 })
  ).rejects.toThrow('output limit');
});

pythonTest('does not claim Windows helper cleanup after an abrupt interpreter exit', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const filename = script(`import os, subprocess, sys, time
subprocess.Popen([sys.executable, "-c", "import os,time; open('helper.pid','w').write(str(os.getpid())); time.sleep(60)"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
while not os.path.exists("helper.pid"):
    time.sleep(0.01)
os._exit(1)
`);
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    await expect(runPreviewInstaller(python!, [filename], { cwd: root })).rejects.toMatchObject({
      cleanupVerified: false,
    });
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
    // This branch intentionally cannot confirm cleanup; only terminate our fixture PID.
    if (fs.existsSync(path.join(root, 'helper.pid')))
      helperPid = Number(fs.readFileSync(path.join(root, 'helper.pid'), 'utf8'));
  }
});

pythonTest('Windows branch accepts cleanup only after the guard reaps children', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const abort = new AbortController();
  try {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const task = runPreviewInstaller(python!, [slowInstaller()], {
      cwd: root,
      signal: abort.signal,
    });
    const rejected = expect(task).rejects.toMatchObject({ cleanupVerified: true });
    await helperStarted();
    abort.abort();
    await rejected;
    expectProcessGone(helperPid!);
    helperPid = undefined;
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
  }
});
