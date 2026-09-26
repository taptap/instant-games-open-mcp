import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { projectEntry, type PreviewIdentity, type RuntimeInfo } from './protocol.js';
import { PreviewLogs } from './evidence.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { preparePreviewProject, requireManifestPreviewPlatform } from './prepare.js';
import { classifyPreviewProject } from './configuration.js';
import { startPreviewAssetServer, type PreviewAssetServer } from './assets.js';
import { previewWindow, type PreviewWindow } from './windowSettings.js';
import { preparePreviewServer, previewNetworkArgs } from './network.js';
export { previewWindow } from './windowSettings.js';
export { requireManifestPreviewPlatform } from './prepare.js';

export const PREVIEW_TIMEOUT_MS = 30000;
const RUNTIME_STARTUP_SETTLE_MS = 3000;

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
    ...classifyPreviewProject(project),
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
  private temporaryCache?: string;
  private mode: 'local_manifest' | 'loopback_manifest' = 'local_manifest';
  readonly errors: string[] = [];
  readonly logs: PreviewLogs;
  readonly artifacts: Record<string, unknown>[] = [];
  preparation?: Record<string, unknown>;

  constructor(
    readonly executable: string,
    readonly identity: PreviewIdentity,
    readonly directory: string,
    private readonly changed: (state: 'running' | 'failed' | 'stopped') => void,
    private readonly timeout = PREVIEW_TIMEOUT_MS,
    private readonly launching: (pid?: number) => void = () => {}
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

  get launchMode(): 'local_manifest' | 'loopback_manifest' {
    return this.mode;
  }

  async start(
    entry: string,
    _storage: string,
    window: PreviewWindow = previewWindow(this.identity.project_realpath)
  ): Promise<void> {
    requireManifestPreviewPlatform();
    const project = this.identity.project_realpath;
    const classification = classifyPreviewProject(project);
    const requiresPreparation = classification.preparation_required;
    if (requiresPreparation)
      this.preparation = await preparePreviewProject(project, this.directory, this.abort.signal);
    if (this.stopping) throw new Error('CANCELLED');
    const source = requiresPreparation ? String(this.preparation!.source_directory) : project;
    if (requiresPreparation) entry = String(this.preparation!.entry);
    const server = await preparePreviewServer(
      source,
      project,
      this.abort.signal,
      classification.network_required
    );
    if (server) {
      this.logs.append('已获取线上测试服连接信息，本地客户端将通过 WebSocket 直连。');
    }
    if (this.stopping) throw new Error('CANCELLED');
    let cacheRoot: string | undefined;
    if (requiresPreparation) {
      this.assets = await startPreviewAssetServer(source, this.abort.signal);
      this.mode = 'loopback_manifest';
      try {
        cacheRoot =
          process.platform === 'win32'
            ? (this.temporaryCache = fs.realpathSync(
                fs.mkdtempSync(path.join(os.tmpdir(), 'maker-cache-'))
              ))
            : path.join(_storage, 'runtime-cache');
        fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
        this.assetCache = path.join(
          fs.realpathSync(cacheRoot),
          this.assets.url.slice('http://'.length).replace(':', '_')
        );
      } catch (error) {
        await this.assets.close();
        this.assets = undefined;
        this.clearAssetCache();
        throw error;
      }
    }
    if (this.stopping) {
      await this.assets?.close();
      this.clearAssetCache();
      throw new Error('CANCELLED');
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      this.launching();
      const runtimeArgs = this.assets
        ? ['-game_url=' + this.assets.url, '-game_path=' + cacheRoot!]
        : [entry, '-tapcode_dir=' + source];
      child = spawn(
        this.executable,
        [
          ...runtimeArgs,
          '-skip_login',
          ...(server ? previewNetworkArgs(server) : []),
          '-w',
          '-width=' + window.width,
          '-height=' + window.height,
        ],
        { cwd: source, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false }
      );
    } catch (error) {
      await this.assets?.close();
      this.clearAssetCache();
      throw error;
    }
    this.child = child;
    this.closed = new Promise((resolve) =>
      child.once('close', () => {
        void (async () => {
          try {
            await this.assets?.close();
            this.clearAssetCache();
          } catch (error) {
            this.recordError(String(error));
          }
          try {
            this.changed(this.stopping || child.exitCode === 0 ? 'stopped' : 'failed');
          } catch (error) {
            this.recordError(String(error));
          } finally {
            resolve();
          }
        })();
      })
    );
    child.on('error', (error) => {
      this.recordError(error.message);
      try {
        this.changed('failed');
      } catch (persistenceError) {
        this.recordError(String(persistenceError));
      }
    });
    this.consume(child.stdout);
    this.consume(child.stderr);
    try {
      if (child.pid) this.launching(child.pid);
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
            if (this.stopping || !this.processAlive)
              reject(new Error('CANCELLED: preview stopped.'));
            else {
              try {
                this.changed('running');
                resolve();
              } catch (error) {
                failed(error as Error);
              }
            }
          }, RUNTIME_STARTUP_SETTLE_MS);
        });
      });
    } catch (error) {
      try {
        await this.stop();
      } catch (cleanupError) {
        throw new Error(String(error) + '; Runtime cleanup is unverified: ' + String(cleanupError));
      }
      throw error;
    }
  }

  private recordError(message: string): void {
    this.errors.push(String(sanitizeDiagnosticValue(message)).slice(0, 16384));
    if (this.errors.length > 100) this.errors.shift();
  }

  private clearAssetCache(): void {
    if (this.temporaryCache) {
      try {
        if (fs.existsSync(this.temporaryCache)) {
          if (
            fs.lstatSync(this.temporaryCache).isSymbolicLink() ||
            fs.realpathSync(this.temporaryCache) !== this.temporaryCache
          )
            throw new Error('Preview cache ownership changed.');
          fs.rmSync(this.temporaryCache, { recursive: true, force: true });
        }
        this.temporaryCache = undefined;
        this.assetCache = undefined;
      } catch {
        this.recordError('Could not remove this round of local preview download cache.');
      }
      return;
    }
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
      this.clearAssetCache();
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
    }
  }
}
