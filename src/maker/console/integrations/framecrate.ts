import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { ConsoleError } from '../types.js';

interface StudioReady {
  url: string;
  projectPath: string;
}

interface StudioSession {
  ready: Promise<StudioReady>;
  stop: () => Promise<void>;
  hostOrigin?: string;
}

/** Owns only Studio children started by this console; never installs or discovers services. */
export class FramecrateLauncher {
  readonly metadata = {
    id: 'framecrate',
    title: 'FrameCrate',
    icon: 'film',
    order: 100,
    requiresProject: true,
    protocolVersion: 1,
  };
  private readonly sessions = new Map<string, StudioSession>();
  private readonly owned = new Set<StudioSession>();
  private closing?: Promise<void>;

  constructor(
    private readonly options: {
      env?: NodeJS.ProcessEnv;
      startTimeoutMs?: number;
      /** Force cap only for failed/cancelled startup before valid readiness. */
      stopTimeoutMs?: number;
    } = {}
  ) {}

  /** At most eight owned children; Studio enforces its own activity/idle lifetime. */
  hasActiveSessions(): boolean {
    return this.owned.size > 0;
  }

  /** Generic console-plugin lifecycle activity. */
  get active(): boolean {
    return this.hasActiveSessions();
  }

  /** The caller must resolve and validate the explicit registered project on every request. */
  async open(projectPath: string, hostOrigin?: string): Promise<StudioReady> {
    if (this.closing) throw new ConsoleError('FrameCrate launcher is closed.', 409);
    if (hostOrigin !== undefined) {
      try {
        const host = new URL(hostOrigin);
        if (
          host.origin !== hostOrigin ||
          host.protocol !== 'http:' ||
          host.hostname !== '127.0.0.1' ||
          !host.port
        )
          throw new Error();
      } catch {
        throw new ConsoleError('FrameCrate requires the exact console host origin.');
      }
    }
    if (!path.isAbsolute(projectPath) || fs.realpathSync(projectPath) !== projectPath)
      throw new ConsoleError('FrameCrate requires a validated project realpath.');
    const existing = this.sessions.get(projectPath);
    if (existing) {
      if (existing.hostOrigin !== hostOrigin)
        throw new ConsoleError(
          'FrameCrate session belongs to a different console host origin.',
          409
        );
      return existing.ready;
    }
    if (this.owned.size >= 8)
      throw new ConsoleError(
        'FrameCrate session limit reached. Stop the console to close studios.',
        429
      );
    const env = this.options.env ?? process.env;
    const configured = env.FRAMECRATE_STUDIO_DIR?.trim();
    if (!configured || !path.isAbsolute(configured))
      throw new ConsoleError(
        'FrameCrate unavailable: set FRAMECRATE_STUDIO_DIR to the absolute path of an installed studio, then reopen the console.',
        409
      );
    let root: string;
    let entry: string;
    let loader: string;
    try {
      root = fs.realpathSync(configured);
      entry = path.join(root, 'server/main.ts');
      loader = path.join(root, 'node_modules/tsx/dist/loader.mjs');
      if (!fs.statSync(entry).isFile() || !fs.statSync(loader).isFile()) throw new Error();
    } catch {
      throw new ConsoleError(
        'FrameCrate unavailable: FRAMECRATE_STUDIO_DIR must contain server/main.ts and node_modules/tsx/dist/loader.mjs. No installer is provided.',
        409
      );
    }
    const child = spawn(
      process.execPath,
      [
        '--import',
        pathToFileURL(loader).href,
        entry,
        '--project',
        projectPath,
        ...(hostOrigin === undefined ? [] : ['--host-origin', hostOrigin]),
      ],
      {
        cwd: root,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );
    let resolveReady!: (value: StudioReady) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<StudioReady>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let stopped = false;
    let received = false;
    let stopping: Promise<void> | undefined;
    let output = '';
    let bytes = 0;
    let finishExit!: () => void;
    const exited = new Promise<void>((resolve) => {
      finishExit = resolve;
    });
    const stop = (): Promise<void> => {
      if (stopping) return stopping;
      clearTimeout(timer);
      if (this.sessions.get(projectPath) === session) this.sessions.delete(projectPath);
      stopping = (async () => {
        if (!stopped) {
          child.kill('SIGTERM');
          // A ready Studio owns bounded provider/socket draining and transaction completion.
          // Never turn normal shutdown into a destructive timeout outside that lifecycle.
          const force = !received
            ? setTimeout(() => {
                if (!stopped) child.kill('SIGKILL');
              }, this.options.stopTimeoutMs ?? 1000)
            : undefined;
          try {
            await exited;
          } finally {
            if (force) clearTimeout(force);
          }
        }
      })();
      return stopping;
    };
    const fail = (message: string): void => {
      void stop().then(() => rejectReady(new ConsoleError(message, 409)));
    };
    const session: StudioSession = {
      ready,
      hostOrigin,
      stop: async () => {
        await stop();
        rejectReady(new ConsoleError('FrameCrate launcher is closed.', 409));
      },
    };
    this.sessions.set(projectPath, session);
    this.owned.add(session);
    const timer = setTimeout(
      () => fail('FrameCrate startup timed out. Check the standalone Studio installation.'),
      this.options.startTimeoutMs ?? 75000
    );
    child.once('error', () =>
      fail('FrameCrate could not start. Check the standalone Studio installation.')
    );
    child.once('close', () => {
      stopped = true;
      clearTimeout(timer);
      if (this.sessions.get(projectPath) === session) this.sessions.delete(projectPath);
      this.owned.delete(session);
      finishExit();
      if (!received && !stopping)
        rejectReady(
          new ConsoleError(
            'FrameCrate exited before readiness. Check the standalone Studio installation.',
            409
          )
        );
    });
    // Drain diagnostics without retaining secrets or forwarding them into console history.
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stopping) return;
      if (received) {
        if (chunk.trim()) fail('FrameCrate sent extra readiness output.');
        return;
      }
      bytes += Buffer.byteLength(chunk);
      if (bytes > 16384) {
        fail('FrameCrate readiness output exceeded the limit.');
        return;
      }
      output += chunk;
      const newline = output.indexOf('\n');
      if (newline < 0) return;
      try {
        const value = JSON.parse(output.slice(0, newline));
        if (
          output.slice(newline + 1).trim() ||
          value.projectPath !== projectPath ||
          typeof value.url !== 'string'
        )
          throw new Error();
        const url = new URL(value.url);
        if (
          url.protocol !== 'http:' ||
          url.hostname !== '127.0.0.1' ||
          !url.port ||
          url.username ||
          url.password ||
          !new URLSearchParams(url.hash.slice(1)).get('studio_token')
        )
          throw new Error();
        received = true;
        output = '';
        clearTimeout(timer);
        resolveReady({ url: url.href, projectPath });
      } catch {
        fail('FrameCrate returned invalid readiness data for the selected project.');
      }
    });
    return ready;
  }

  /** Drain ready children gracefully; only incomplete startup may be forcibly terminated. */
  close(): Promise<void> {
    if (!this.closing)
      this.closing = Promise.all([...this.owned].map((session) => session.stop())).then(() => {});
    return this.closing;
  }
}
