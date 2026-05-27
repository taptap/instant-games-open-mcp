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
          this.onclose?.();
          return;
        }
        reject(error);
        this.onerror?.(error);
      });
      this.process.on('spawn', () => resolve());
      this.process.on('close', () => {
        this.process = undefined;
        this.onclose?.();
      });
      this.process.stdin?.on('error', (error) => this.onerror?.(error));
      this.process.stdout?.on('data', (chunk: Buffer) => {
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
    this.abortController.abort();
    this.process = undefined;
    this.readBuffer.clear();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.process?.stdin;
    if (!stdin) {
      throw new Error('Not connected');
    }
    const json = serializeMessage(message);
    if (stdin.write(json)) {
      return;
    }
    await new Promise<void>((resolve) => stdin.once('drain', resolve));
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
