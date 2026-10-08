/**
 * Stdio MCP client transport that hides spawned console windows on Windows.
 */

import { spawn, type ChildProcess, type IOType } from 'node:child_process';
import { PassThrough, type Stream } from 'node:stream';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export type HiddenStdioServerParameters = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
};

export class HiddenStdioClientTransport implements Transport {
  private process?: ChildProcess;
  private readonly readBuffer = new ReadBuffer();
  private readonly stderrStream: PassThrough | null;
  private readonly pendingSends = new Set<(error: Error) => void>();
  private started = false;
  private closeNotified = false;
  private closing = false;
  private closePromise?: Promise<void>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly serverParams: HiddenStdioServerParameters) {
    this.stderrStream =
      serverParams.stderr === 'pipe' || serverParams.stderr === 'overlapped'
        ? new PassThrough()
        : null;
    this.stderrStream?.resume();
  }

  async start(): Promise<void> {
    if (this.started || this.closing) {
      throw new Error('HiddenStdioClientTransport already started.');
    }
    this.started = true;

    await new Promise<void>((resolve, reject) => {
      this.process = spawn(this.serverParams.command, this.serverParams.args ?? [], {
        env: this.serverParams.env,
        stdio: ['pipe', 'pipe', this.serverParams.stderr ?? 'inherit'],
        shell: false,
        windowsHide: true,
        cwd: this.serverParams.cwd,
      });

      this.process.on('error', (error) => {
        reject(error);
        this.onerror?.(error);
      });
      this.process.on('spawn', () => resolve());
      this.process.on('exit', () => {
        this.notifyClose();
        void this.close().catch((error: Error) => this.onerror?.(error));
      });
      this.process.on('close', () => {
        this.process = undefined;
        this.notifyClose();
        void this.close().catch((error: Error) => this.onerror?.(error));
      });
      this.process.stdin?.on('error', (error) => this.onerror?.(error));
      this.process.stdout?.on('data', (chunk: Buffer) => {
        if (this.closeNotified) return;
        this.readBuffer.append(chunk);
        this.processReadBuffer();
      });
      this.process.stdout?.on('error', (error) => this.onerror?.(error));
      if (this.stderrStream && this.process.stderr) {
        this.process.stderr.pipe(this.stderrStream);
      }
    });
  }

  get stderr(): Stream | null {
    return this.stderrStream || this.process?.stderr || null;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }

  async close(): Promise<void> {
    this.closing = true;
    this.rejectPendingSends();
    this.closePromise ??= Promise.resolve()
      .then(() => this.closeProcess())
      .catch((error: unknown) => {
        this.closePromise = undefined;
        throw error;
      });
    return this.closePromise;
  }

  private async closeProcess(): Promise<void> {
    const child = this.process;
    this.readBuffer.clear();
    if (!child) {
      this.stderrStream?.destroy();
      this.notifyClose();
      return;
    }
    const alive = () =>
      this.process === child && child.exitCode === null && child.signalCode === null;
    const wait = (event: 'exit' | 'close') =>
      new Promise<void>((resolve) => {
        if (this.process !== child || (event === 'exit' && !alive())) {
          resolve();
          return;
        }
        const done = () => {
          clearTimeout(timer);
          child.removeListener(event, done);
          child.removeListener('close', done);
          resolve();
        };
        const timer = setTimeout(done, 2000);
        child.once(event, done);
        if (event !== 'close') child.once('close', done);
      });
    try {
      child.stdin?.end();
    } catch {
      child.stdin?.destroy();
    }
    try {
      if (alive()) await wait('exit');
      if (alive()) {
        child.kill('SIGTERM');
        await wait('exit');
      }
      if (alive() && process.platform !== 'win32') {
        child.kill('SIGKILL');
        await wait('exit');
      }
      if (alive()) {
        throw new Error('Maker proxy child exit could not be confirmed.');
      }
      if (process.platform !== 'win32') await wait('close');
    } finally {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.unpipe(this.stderrStream ?? undefined);
      child.stderr?.destroy();
      this.stderrStream?.destroy();
      this.notifyClose();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.process?.stdin;
    if (!stdin || this.closing || this.closeNotified || stdin.destroyed) {
      throw new Error('Not connected');
    }
    const json = serializeMessage(message);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        stdin.removeListener('drain', drained);
        stdin.removeListener('close', closed);
        stdin.removeListener('error', failed);
        this.pendingSends.delete(failed);
      };
      const drained = () => {
        cleanup();
        resolve();
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => failed(new Error('Not connected'));
      this.pendingSends.add(failed);
      stdin.once('drain', drained);
      stdin.once('close', closed);
      stdin.once('error', failed);
      try {
        if (stdin.write(json)) drained();
      } catch (error) {
        failed(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private rejectPendingSends(): void {
    for (const reject of this.pendingSends) reject(new Error('Not connected'));
  }

  private notifyClose(): void {
    if (this.closeNotified) return;
    this.closeNotified = true;
    this.rejectPendingSends();
    this.readBuffer.clear();
    this.onclose?.();
  }

  private processReadBuffer(): void {
    for (;;) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
