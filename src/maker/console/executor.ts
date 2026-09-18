import { spawn } from 'node:child_process';
import { CONSOLE_ACTIONS, type ConsoleExecutor } from './types.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { checkMakerLuaLspProject } from '../system/luaLsp.js';

export function createConsoleExecutor(options: {
  entry: string;
  execArgv?: string[];
  killGraceMs?: number;
}): ConsoleExecutor {
  return async ({
    project,
    action,
    onOutput,
    onProgress,
    signal,
    confirmedOrientation,
    publication,
    confirmedBuild,
  }) => {
    if (![...CONSOLE_ACTIONS, 'preview.status', 'preview.logs'].includes(action))
      throw new Error('Unsupported console CLI action.');
    if (signal?.aborted) return { ok: false, error: 'Console query cancelled before launch.' };
    if (action === 'lua-lsp.check') {
      const result = await checkMakerLuaLspProject(project);
      onOutput(result.summary);
      if (result.issues.length) onOutput('\n' + result.issues.join('\n'));
      return sanitizeDiagnosticValue({
        ...result,
        ...(!result.ok ? { error: result.error || result.summary } : {}),
      }) as Awaited<ReturnType<ConsoleExecutor>>;
    }
    const command =
      action === 'build' || action === 'qrcode'
        ? [action]
        : ['preview', action.slice('preview.'.length)];
    if (action === 'qrcode' && confirmedOrientation)
      command.push('--confirmed-screen-orientation', confirmedOrientation);
    if (action === 'qrcode') {
      if (publication?.developer_id !== undefined)
        command.push('--confirmed-developer-id', String(publication.developer_id));
      if (publication?.title !== undefined) command.push('--confirmed-title=' + publication.title);
      if (publication?.category !== undefined)
        command.push('--confirmed-category', publication.category);
      if (confirmedBuild) command.push('--confirmed-build');
    }
    const ownsProcessGroup = process.platform !== 'win32';
    const execArgv = [...(options.execArgv ?? process.execArgv)];
    // Restore execArgv before entry import so detached preview reentry cannot inherit this guard.
    const bootstrap = `
      const parentGone = () => {
        if (${ownsProcessGroup}) {
          try { process.kill(-process.pid, 'SIGKILL'); } catch {}
        }
        process.exit(1);
      };
      process.once('disconnect', parentGone);
      process.channel?.unref();
      if (!process.connected) parentGone();
      process.execArgv = ${JSON.stringify(execArgv)};
      const { pathToFileURL } = await import('node:url');
      await import(pathToFileURL(process.argv[1]).href);
    `;
    const args = [
      ...execArgv,
      '--input-type=module',
      '-e',
      bootstrap,
      options.entry,
      ...command,
      '--target-dir',
      project,
      '--json',
    ];
    return new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: project,
        detached: ownsProcessGroup,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      const childStdout = child.stdout!;
      const childStderr = child.stderr!;
      let stdout = '';
      let stderr = '';
      let exceeded = false;
      let timedOut = false;
      let terminating = false;
      let finished = false;
      let killTimer: NodeJS.Timeout | undefined;
      let terminationWarning = ownsProcessGroup
        ? ''
        : 'On Windows only the direct CLI child is targeted; helper cleanup is unverified. ' +
          'Independent preview processes are not targeted.';
      const killOwnedProcesses = (signal: NodeJS.Signals): void => {
        if (!ownsProcessGroup || !child.pid) {
          child.kill(signal);
          return;
        }
        try {
          // Detached preview supervisors start their own group and are deliberately excluded.
          process.kill(-child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
          terminationWarning = 'CLI process-group cleanup could not be verified.';
          child.kill(signal);
        }
      };
      const terminate = (): void => {
        if (terminating || finished) return;
        terminating = true;
        killOwnedProcesses('SIGTERM');
        killTimer = setTimeout(() => {
          killOwnedProcesses('SIGKILL');
          childStdout.destroy();
          childStderr.destroy();
        }, options.killGraceMs ?? 5000);
        killTimer.unref();
      };
      const timer = setTimeout(
        () => {
          timedOut = true;
          terminate();
        },
        action === 'build' || action === 'qrcode'
          ? 65 * 60 * 1000
          : action === 'preview.status' || action === 'preview.logs'
            ? 30000
            : 7 * 60 * 1000
      );
      const cleanup = (): void => {
        finished = true;
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', terminate);
      };
      signal?.addEventListener('abort', terminate, { once: true });
      if (signal?.aborted) terminate();
      childStdout.setEncoding('utf8');
      childStderr.setEncoding('utf8');
      childStdout.on('data', (text: string) => {
        if (terminating || finished) return;
        stdout += text;
        if (stdout.length > 4 * 1024 * 1024) {
          exceeded = true;
          terminate();
        }
      });
      childStderr.on('data', (text: string) => {
        if (terminating || finished) return;
        stderr += text;
        // Never retain or emit a partial oversized line.
        if (stderr.length > 65536) {
          stderr = '';
          exceeded = true;
          terminate();
          return;
        }
        const end = stderr.lastIndexOf('\n');
        if (end >= 0) {
          if ((action === 'build' || action === 'qrcode') && onProgress) {
            for (const line of stderr.slice(0, end).split('\n')) {
              try {
                const value = JSON.parse(line);
                if (typeof value.phase === 'string' && typeof value.message === 'string') {
                  onProgress({
                    phase: String(sanitizeDiagnosticValue(value.phase)).slice(0, 64),
                    message: String(sanitizeDiagnosticValue(value.message)).slice(0, 512),
                    ...(Number.isFinite(value.progress) && value.progress >= 0
                      ? { progress: value.progress }
                      : {}),
                    ...(Number.isFinite(value.total) && value.total > 0
                      ? { total: value.total }
                      : {}),
                  });
                }
              } catch {
                // Ordinary stderr remains visible as log output, not a progress event.
              }
            }
          }
          onOutput(String(sanitizeDiagnosticValue(stderr.slice(0, end + 1))).slice(-65536));
          stderr = stderr.slice(end + 1);
        }
      });
      child.on('error', (error) => {
        cleanup();
        resolve({ ok: false, error: String(sanitizeDiagnosticValue(error.message)) });
      });
      child.on('exit', () => {
        // Helpers may hold inherited output pipes open, preventing close until they exit.
        if (!finished && ownsProcessGroup) killOwnedProcesses('SIGKILL');
      });
      child.on('close', (code, signal) => {
        if (finished) return;
        cleanup();
        if (stderr) onOutput(String(sanitizeDiagnosticValue(stderr)));
        if (
          timedOut ||
          exceeded ||
          signal ||
          terminating ||
          (ownsProcessGroup && terminationWarning)
        ) {
          resolve({
            ok: false,
            unknown: true,
            error: [
              timedOut
                ? 'CLI timed out; check the operation result before retrying.'
                : 'CLI stopped without a verified result. Check the project before retrying.',
              terminationWarning,
            ]
              .filter(Boolean)
              .join(' '),
          });
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean')
            throw new Error('Missing CLI result status.');
          resolve(
            sanitizeDiagnosticValue({
              ...result,
              ok: code === 0 && result.ok,
              ...(!result.ok && !result.error
                ? { error: result.summary || `CLI exited with code ${code}.` }
                : {}),
            }) as Awaited<ReturnType<ConsoleExecutor>>
          );
        } catch {
          resolve({
            ok: false,
            unknown: true,
            error:
              'CLI did not return a verifiable JSON result. Check the project before retrying.',
          });
        }
      });
    });
  };
}
