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
  private readonly abortController = new AbortController();
  private readonly readBuffer = new ReadBuffer();
  private readonly stderrStream: PassThrough | null;
  private closeNotified = false;
  private closing = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly serverParams: HiddenStdioServerParameters) {
    this.stderrStream =
      serverParams.stderr === 'pipe' || serverParams.stderr === 'overlapped'
        ? new PassThrough()
        : null;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('HiddenStdioClientTransport already started.');
    }
    this.closeNotified = false;
    this.closing = false;

    await new Promise<void>((resolve, reject) => {
      this.process = spawn(this.serverParams.command, this.serverParams.args ?? [], {
        env: this.serverParams.env,
        stdio: ['pipe', 'pipe', this.serverParams.stderr ?? 'inherit'],
        shell: false,
        signal: this.abortController.signal,
        windowsHide: true,
        cwd: this.serverParams.cwd,
      });

      this.process.on('error', (error) => {
        if (error.name === 'AbortError') {
          this.notifyClose();
          return;
        }
        reject(error);
        this.onerror?.(error);
      });
      this.process.on('spawn', () => resolve());
      this.process.on('exit', () => this.notifyClose());
      this.process.on('close', () => {
        this.process = undefined;
        this.notifyClose();
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
    const child = this.process;
    this.readBuffer.clear();
    if (!child) {
      this.abortController.abort();
      return;
    }
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });
    const wait = (ms: number) =>
      Promise.race([
        exited,
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          timer.unref?.();
        }),
      ]);
    try {
      child.stdin?.end();
    } catch {
      // 关闭 stdin 后继续进入终止流程。
    }
    await wait(2000);
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // 进程可能已经退出。
      }
      await wait(2000);
    }
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        // 进程可能已经退出。
      }
      await wait(2000);
    }
    this.abortController.abort();
  }
  async send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.process?.stdin;
    if (!stdin || this.closing || this.closeNotified) {
      throw new Error('Not connected');
    }
    const json = serializeMessage(message);
    if (stdin.write(json)) {
      return;
    }
    await new Promise<void>((resolve) => stdin.once('drain', resolve));
  }

  private notifyClose(): void {
    if (this.closeNotified) return;
    this.closeNotified = true;
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
