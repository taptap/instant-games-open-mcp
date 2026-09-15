import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { projectEntry, type PreviewIdentity, type RuntimeInfo } from './protocol.js';
import { PreviewLogs } from './evidence.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { preparePreviewProject, requireManifestPreviewPlatform } from './prepare.js';
import { startPreviewAssetServer, type PreviewAssetServer } from './assets.js';

export const PREVIEW_TIMEOUT_MS = 30000;

export function previewWindow(project: string): {
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  defaulted: boolean;
} {
  const config = JSON.parse(
    fs.readFileSync(path.join(project, '.project', 'project.json'), 'utf8')
  );
  const orientation = config.taptap_publish?.screen_orientation;
  return orientation === 'portrait'
    ? { orientation, width: 450, height: 800, defaulted: false }
    : { orientation: 'landscape', width: 960, height: 540, defaulted: orientation !== 'landscape' };
}

export async function probeRuntime(executable: string, signal?: AbortSignal): Promise<RuntimeInfo> {
  if (signal?.aborted) throw new Error('CANCELLED');
  if (!path.isAbsolute(executable) || !fs.statSync(executable).isFile())
    throw new Error('Runtime must be an absolute executable file.');
  fs.accessSync(executable, process.platform === 'win32' ? fs.constants.R_OK : fs.constants.X_OK);
  return {
    protocol_version: 0,
    runtime_version: 'unknown',
    platform: process.platform,
    arch: 'unverified',
    capabilities: [],
  };
}

export async function preflightPreview(
  _executable: string,
  project: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new Error('CANCELLED');
  return {
    entry: projectEntry(project),
    window: previewWindow(project),
    source_mode: false,
    preparation_required: true,
    dependencies_verified: false,
    warning:
      'Local client preview only. Cloud/server features and resource completeness are not verified.',
  };
}

export class PreviewRuntime {
  private child?: ChildProcessWithoutNullStreams;
  private stopping = false;
  private readonly abort = new AbortController();
  private closed: Promise<void> = Promise.resolve();
  private assets?: PreviewAssetServer;
  private assetCache?: string;
  readonly errors: string[] = [];
  readonly logs: PreviewLogs;
  readonly artifacts: Record<string, unknown>[] = [];
  preparation?: Record<string, unknown>;

  constructor(
    readonly executable: string,
    readonly identity: PreviewIdentity,
    readonly directory: string,
    private readonly changed: (state: 'running' | 'failed' | 'stopped') => void,
    private readonly timeout = PREVIEW_TIMEOUT_MS
  ) {
    this.logs = new PreviewLogs(directory);
  }

  get processAlive(): boolean {
    return Boolean(
      this.child?.pid && this.child.exitCode === null && this.child.signalCode === null
    );
  }
  get pid(): number | undefined {
    return this.processAlive ? this.child?.pid : undefined;
  }
  get isReady(): boolean {
    return false;
  }

  get launchMode(): 'loopback_manifest' | 'local_manifest' {
    return process.platform === 'darwin' ? 'loopback_manifest' : 'local_manifest';
  }

  async start(entry: string, storage: string): Promise<void> {
    requireManifestPreviewPlatform();
    this.preparation = await preparePreviewProject(
      this.identity.project_realpath,
      this.directory,
      this.abort.signal
    );
    if (this.stopping) throw new Error('CANCELLED');
    const source = String(this.preparation.source_directory);
    entry = String(this.preparation.entry);
    const window = previewWindow(source);
    let cacheRoot: string | undefined;
    if (this.launchMode === 'loopback_manifest') {
      this.assets = await startPreviewAssetServer(source, this.abort.signal);
      cacheRoot = path.join(storage, 'runtime-cache');
      try {
        fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
        // Match the existing Runtime's RemoveUrlScheme cache mapping, inside our project storage only.
        this.assetCache = path.join(
          fs.realpathSync(cacheRoot),
          this.assets.url.slice('http://'.length).replace(':', '_')
        );
      } catch (error) {
        await this.assets.close();
        throw error;
      }
    }
    if (this.stopping) {
      await this.assets?.close();
      throw new Error('CANCELLED');
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(
        this.executable,
        [
          ...(this.assets ? ['-game_url=' + this.assets.url] : [entry, '-tapcode_dir=' + source]),
          ...(cacheRoot ? ['-game_path=' + cacheRoot] : []),
          '-skip_login',
          '-p=Res',
          '-w',
          '-width=' + window.width,
          '-height=' + window.height,
        ],
        { cwd: source, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false }
      );
    } catch (error) {
      await this.assets?.close();
      throw error;
    }
    this.child = child;
    this.closed = new Promise((resolve) =>
      child.once('close', () => {
        void (async () => {
          await this.assets?.close();
          this.clearAssetCache();
          this.changed(this.stopping || child.exitCode === 0 ? 'stopped' : 'failed');
          resolve();
        })();
      })
    );
    child.on('error', (error) => {
      this.recordError(error.message);
      this.changed('failed');
    });
    this.consume(child.stdout);
    this.consume(child.stderr);
    await new Promise<void>((resolve, reject) => {
      let settle: NodeJS.Timeout | undefined;
      const cleanup = (): void => {
        clearTimeout(deadline);
        clearTimeout(settle);
        child.removeListener('error', failed);
        child.removeListener('close', exited);
      };
      const failed = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const exited = (): void =>
        failed(new Error('Runtime exited during startup. Read preview logs.'));
      const deadline = setTimeout(
        () => failed(new Error('TIMEOUT: Runtime process did not start.')),
        this.timeout
      );
      child.once('error', failed);
      child.once('close', exited);
      child.once('spawn', () => {
        settle = setTimeout(() => {
          cleanup();
          if (this.stopping || !this.processAlive) reject(new Error('CANCELLED: preview stopped.'));
          else {
            this.changed('running');
            resolve();
          }
        }, 300);
      });
    }).catch(async (error) => {
      await this.stop();
      throw error;
    });
  }

  private recordError(message: string): void {
    this.errors.push(String(sanitizeDiagnosticValue(message)).slice(0, 16384));
    if (this.errors.length > 100) this.errors.shift();
  }

  private clearAssetCache(): void {
    if (!this.assetCache) return;
    try {
      const parent = path.dirname(this.assetCache);
      if (fs.existsSync(parent) && fs.realpathSync(parent) === parent) {
        fs.rmSync(this.assetCache, { recursive: true, force: true });
        if (!fs.readdirSync(parent).length) fs.rmdirSync(parent);
      }
    } catch {
      this.recordError('Could not remove this round of local preview download cache.');
    }
  }

  private consume(stream: NodeJS.ReadableStream): void {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const append = (line: string): void => {
      if (this.assets) line = line.split(this.assets.url).join('[local-preview]/');
      this.logs.append(line);
      if (/\bERROR:|stack traceback:/.test(line)) this.recordError(line);
    };
    stream.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        append(buffer.slice(0, newline).slice(0, 65536));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 65536) {
        append(buffer.slice(0, 65536));
        buffer = '';
      }
    });
    stream.on('end', () => {
      if (buffer) append(buffer);
    });
  }

  async screenshot(_signal?: AbortSignal): Promise<Record<string, unknown>> {
    return {
      ...this.identity,
      ok: false,
      result: 'UNSUPPORTED',
      artifacts: [],
      error: 'Screenshots are not supported in basic local preview. The game remains running.',
    };
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.abort.abort();
    if (!this.processAlive) {
      await this.assets?.close();
      return;
    }
    const child = this.child!;
    child.kill('SIGTERM');
    const force = setTimeout(() => {
      if (this.processAlive) child.kill('SIGKILL');
    }, 3000);
    let deadline: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.closed,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error('TIMEOUT: owned Runtime did not exit.')),
            7000
          );
        }),
      ]);
    } finally {
      clearTimeout(force);
      clearTimeout(deadline);
      await this.assets?.close();
    }
  }
}
