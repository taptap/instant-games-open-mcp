import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// The installer only launches curl/xattr. Track their process handles so EOF from the
// owning CLI (including a crashed CLI) cancels them on Windows as well as POSIX.
const INSTALLER_GUARD = String.raw`
import os, runpy, subprocess, sys, threading
_lock = threading.Lock()
_children = set()
_cancelled = False
_Popen = subprocess.Popen
class OwnedPopen(_Popen):
    def __init__(self, *args, **kwargs):
        with _lock:
            if _cancelled:
                raise KeyboardInterrupt()
            super().__init__(*args, **kwargs)
            _children.add(self)
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            with _lock:
                _children.discard(self)
subprocess.Popen = OwnedPopen
def finish_children():
    global _cancelled
    with _lock:
        _cancelled = True
        children = list(_children)
    for child in children:
        if child.poll() is None:
            child.kill()
    for child in children:
        child.wait(timeout=3)
    os.write(2, b"\0maker-installer-cleaned:__CLEANUP_TOKEN__\0")
def cancel_on_eof():
    try:
        os.read(0, 1)
        finish_children()
    except BaseException:
        os._exit(131)
    os._exit(130)
threading.Thread(target=cancel_on_eof, daemon=True).start()
sys.argv = sys.argv[1:]
try:
    runpy.run_path(sys.argv[0], run_name="__main__")
finally:
    try:
        finish_children()
    except BaseException:
        os._exit(131)
`;

export async function runPreviewInstaller(
  python: string,
  args: string[],
  options: {
    cwd: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBuffer?: number;
  }
): Promise<{ stdout: string; stderr: string }> {
  if (options.signal?.aborted) throw new Error('CANCELLED: Runtime installation.');
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    const token = randomBytes(16).toString('hex');
    const marker = '\0maker-installer-cleaned:' + token + '\0';
    const child = spawn(
      python,
      ['-c', INSTALLER_GUARD.replace('__CLEANUP_TOKEN__', token), ...args],
      {
        cwd: options.cwd,
        detached: grouped,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1' },
      }
    );
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let failure: string | undefined;
    let finished = false;
    let cleanupVerified = true;
    let cleanupAcknowledged = false;
    let stderrTail = '';
    let force: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;
    const finish = (code: number | null, error?: Error): void => {
      if (finished) return;
      append(stderrTail, false);
      stderrTail = '';
      finished = true;
      clearTimeout(timer);
      clearTimeout(force);
      clearTimeout(deadline);
      options.signal?.removeEventListener('abort', abort);
      child.stdin.destroy();
      if (code === 0 && !failure && !error && cleanupAcknowledged) resolve({ stdout, stderr });
      else
        reject(
          Object.assign(
            new Error(
              failure ||
                error?.message ||
                `Installer exited with code ${code} without successful completion.`
            ),
            {
              stdout,
              stderr,
              cleanupVerified:
                cleanupVerified && code !== 131 && (grouped || cleanupAcknowledged || !child.pid),
            }
          )
        );
    };
    const cancel = (message: string): void => {
      if (failure || finished) return;
      failure = message;
      // Do not SIGTERM Python before its guard can reap the download process.
      child.stdin.end();
      force = setTimeout(() => {
        if (grouped && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupVerified = false;
          }
        } else {
          // A hung Windows interpreter cannot prove helper cleanup. Preserve staging.
          cleanupVerified = false;
          child.kill();
        }
      }, 5000);
      deadline = setTimeout(() => {
        cleanupVerified = false;
        child.stdout.destroy();
        child.stderr.destroy();
        finish(null, new Error('Installer process cleanup could not be verified.'));
      }, 10000);
    };
    const abort = (): void => cancel('CANCELLED: Runtime installation.');
    const timer = setTimeout(
      () => cancel('TIMEOUT: Runtime installation.'),
      options.timeoutMs ?? 300000
    );
    child.stdin.on('error', () => {
      /* Python may already be exiting when cancellation closes stdin. */
    });
    const append = (value: string, output: boolean): void => {
      if (finished || failure) return;
      bytes += Buffer.byteLength(value);
      if (bytes > (options.maxBuffer ?? 1024 * 1024)) {
        cancel('Installer output limit exceeded.');
        return;
      }
      if (output) stdout += value;
      else stderr += value;
    };
    for (const [stream, output] of [
      [child.stdout, true],
      [child.stderr, false],
    ] as const) {
      stream.setEncoding('utf8');
      stream.on('data', (value: string) => {
        if (output) append(value, true);
        else {
          stderrTail += value;
          if (stderrTail.includes(marker)) {
            cleanupAcknowledged = true;
            stderrTail = stderrTail.split(marker).join('');
          }
          // Keep enough trailing text to recognize an acknowledgement split across chunks.
          const safeLength = Math.max(0, stderrTail.length - marker.length + 1);
          append(stderrTail.slice(0, safeLength), false);
          stderrTail = stderrTail.slice(safeLength);
        }
      });
    }
    child.once('error', (error) => finish(null, error));
    child.once('exit', (_code, signal) => {
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupVerified = false;
        }
      } else if (signal) cleanupVerified = false;
    });
    child.once('close', (code) => finish(code));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}
