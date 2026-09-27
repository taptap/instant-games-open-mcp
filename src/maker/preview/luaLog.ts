import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export class PreviewLuaLog {
  private filename?: string;
  private offset = 0;
  private pending = '';
  private decoder = new StringDecoder('utf8');
  private timer?: ReturnType<typeof setInterval>;
  private identity?: { dev: number; ino: number; birthtimeMs: number };
  private readonly startedAt = Date.now();
  private readonly announced = new Set<string>();

  constructor(
    private readonly executable: string,
    private readonly append: (line: string) => void
  ) {}

  observe(line: string): void {
    if (this.announced.size >= 4) return;
    const match = /^(?:\[[0-9 _:-]+\]\[\d+\] )?INFO: Lua official log file initialized: (.+)$/.exec(
      line.trim()
    );
    if (!match) return;
    const candidate = path.resolve(match[1]);
    if (this.announced.has(candidate)) return;
    const root = path.join(path.dirname(this.executable), 'logs', 'lua');
    if (path.dirname(candidate) !== root || !/^lua-[0-9 _-]+\.log$/.test(path.basename(candidate)))
      return;
    try {
      this.close();
      this.offset = 0;
      this.pending = '';
      this.decoder = new StringDecoder('utf8');
      this.filename = candidate;
      this.announced.add(candidate);
      this.identity = undefined;
      this.timer = setInterval(() => this.poll(), 250);
      this.timer.unref();
      this.poll();
    } catch {
      return;
    }
  }

  poll(): void {
    if (!this.filename) return;
    let descriptor: number | undefined;
    try {
      if (
        fs.realpathSync(this.filename) !== this.filename ||
        fs.lstatSync(this.filename).isSymbolicLink()
      )
        return;
      descriptor = fs.openSync(this.filename, 'r');
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.birthtimeMs < this.startedAt - 2000) return;
      this.identity ??= { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs };
      if (
        !stat.isFile() ||
        stat.dev !== this.identity.dev ||
        stat.ino !== this.identity.ino ||
        stat.birthtimeMs !== this.identity.birthtimeMs
      )
        return;
      if (stat.size < this.offset || stat.size > 64 * 1024 * 1024) return;
      const buffer = Buffer.alloc(Math.min(65536, stat.size - this.offset));
      const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, this.offset);
      this.offset += bytes;
      this.pending += this.decoder.write(buffer.subarray(0, bytes));
      let newline: number;
      while ((newline = this.pending.indexOf('\n')) >= 0) {
        const row = this.pending.slice(0, newline);
        this.pending = this.pending.slice(newline + 1);
        if (row.length > 65536) continue;
        try {
          const entry = JSON.parse(row) as { m?: unknown; l?: unknown };
          if (typeof entry.m === 'string')
            this.append('[lua] ' + (entry.l === 'ERROR' ? 'ERROR: ' : '') + entry.m);
        } catch {
          continue;
        }
      }
      if (this.pending.length > 65536) this.pending = '';
    } catch {
      return;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  close(): void {
    clearInterval(this.timer);
    this.poll();
  }
}
