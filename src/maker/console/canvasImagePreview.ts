import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MakerCanvasFiles } from '../canvas/files.js';
import { isLocalCanvasImagePath, isLocalImageAssetPath } from '../canvas/localMediaValidation.js';
import { readCanvasMedia } from './canvasMedia.js';

const SAMPLE_BYTES = 4096;
const SCAN_TTL = 30_000;
const MAX_ENTRIES = 20_000;
const SKIP =
  /^(?:node_modules|dist|build|target|urhox-libs|engine-docs|examples|local_temp|archives?|backups?|归档|备份)$/i;
const DIGEST = /^[a-f0-9]{64}$/;
type Fingerprint = { size: number; sample: string; sha256: string; location: string };
type Candidate = { file: string; size: number; stamp: string; sample?: string };
type Inventory = { bySize: Map<number, Candidate[]>; complete: boolean };

function tracked(reference: string): boolean {
  return (
    !reference.startsWith('maker-demo/') &&
    (isLocalCanvasImagePath(reference) || isLocalImageAssetPath(reference))
  );
}

function sampleHash(bytes: Buffer): string {
  return createHash('sha256')
    .update(bytes.subarray(0, SAMPLE_BYTES))
    .update(bytes.subarray(Math.max(SAMPLE_BYTES, bytes.length - SAMPLE_BYTES)))
    .digest('hex');
}

/** Display-only relocation. Documents, historical source identities and exports stay untouched. */
export class CanvasImagePreview {
  private records: Record<string, Fingerprint> = Object.create(null);
  private scan?: { expires: number; promise: Promise<Inventory> };
  private searches = new Map<string, Promise<string | undefined>>();
  private flush?: ReturnType<typeof setTimeout>;

  constructor(private files: MakerCanvasFiles) {
    const saved = files.readPreviewImageIndex();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    for (const [reference, value] of Object.entries(saved).slice(0, MAX_ENTRIES)) {
      const entry = value as Fingerprint | null;
      if (
        tracked(reference) &&
        entry &&
        Number.isSafeInteger(entry.size) &&
        entry.size > 0 &&
        DIGEST.test(entry.sample) &&
        DIGEST.test(entry.sha256) &&
        typeof entry.location === 'string'
      )
        this.records[reference] = entry;
    }
  }

  private remember(reference: string, entry: Fingerprint): void {
    if (JSON.stringify(this.records[reference]) === JSON.stringify(entry)) return;
    if (!this.records[reference] && Object.keys(this.records).length >= MAX_ENTRIES) return;
    this.records[reference] = entry;
    if (this.flush) return;
    // Coalesce the first display of many cards into one optional metadata write.
    this.flush = setTimeout(() => {
      this.flush = undefined;
      void this.files.writePreviewImageIndex(this.records).catch(() => undefined);
    }, 100);
    this.flush.unref();
  }

  private async candidate(relative: string, checkProject = false): Promise<Candidate | undefined> {
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.includes('\\') ||
      !/\.(?:png|jpe?g|webp)$/i.test(relative)
    )
      return;
    const parts = relative.split('/');
    if (parts.some((part) => !part || part === '..' || part === '.')) return;
    if (relative.startsWith('.maker/')) {
      if (!/^\.maker\/canvases\/(?:images|[a-f0-9-]{36}\/resources)\//i.test(relative)) return;
    } else if (parts.some((part) => part.startsWith('.') || SKIP.test(part))) return;
    const file = path.join(this.files.root, relative);
    try {
      if (checkProject) {
        for (let i = 1; i < parts.length; i++) {
          const nested = path.join(this.files.root, ...parts.slice(0, i), '.project');
          if (
            await fs.access(nested).then(
              () => true,
              () => false
            )
          )
            return;
        }
      }
      // Comparing realpaths rejects links in any component, including linked directories.
      if ((await fs.realpath(file)) !== file) return;
      const stat = await fs.stat(file, { bigint: true });
      if (!stat.isFile()) return;
      return {
        file,
        size: Number(stat.size),
        stamp: [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'),
      };
    } catch {
      return;
    }
  }

  private inventory(): Promise<Inventory> {
    if (this.scan && this.scan.expires > Date.now()) return this.scan.promise;
    this.searches.clear();
    const promise = (async () => {
      const result: Inventory = { bySize: new Map(), complete: true };
      let count = 0;
      const walk = async (relative: string, depth = 0): Promise<void> => {
        if (depth > 32 || count >= MAX_ENTRIES) {
          result.complete = false;
          return;
        }
        const folder = path.join(this.files.root, relative);
        try {
          if ((await fs.realpath(folder)) !== folder) return;
          const entries = await fs.readdir(folder, { withFileTypes: true });
          for (const entry of entries) {
            if (++count > MAX_ENTRIES) {
              result.complete = false;
              return;
            }
            const name = entry.name;
            if (entry.isSymbolicLink() || name.startsWith('.') || SKIP.test(name)) continue;
            const child = relative ? relative + '/' + name : name;
            if (entry.isDirectory()) {
              // Do not search nested game projects.
              if (
                await fs.access(path.join(folder, name, '.project')).then(
                  () => true,
                  () => false
                )
              )
                continue;
              await walk(child, depth + 1);
            } else if (entry.isFile() && /\.(?:png|jpe?g|webp)$/i.test(name)) {
              const file = await this.candidate(child);
              if (!file) {
                result.complete = false;
                continue;
              }
              const group = result.bySize.get(file.size) || [];
              group.push(file);
              result.bySize.set(file.size, group);
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.complete = false;
        }
      };
      await walk('');
      await walk('.maker/canvases/images');
      const canvases = await fs
        .readdir(path.join(this.files.root, '.maker/canvases'))
        .catch(() => []);
      for (const id of canvases)
        if (/^[a-f0-9-]{36}$/i.test(id)) await walk('.maker/canvases/' + id + '/resources');
      return result;
    })();
    this.scan = { expires: Date.now() + SCAN_TTL, promise };
    return promise;
  }

  private async find(entry: Fingerprint): Promise<string | undefined> {
    const inventory = this.inventory();
    const key = entry.size + ':' + entry.sha256;
    const pending = this.searches.get(key);
    if (pending) return pending;
    const search = (async () => {
      const { bySize, complete } = await inventory;
      if (!complete) return;
      let match: string | undefined;
      for (const item of bySize.get(entry.size) || []) {
        const relative = path.relative(this.files.root, item.file).split(path.sep).join('/');
        const current = await this.candidate(relative);
        if (!current || current.size !== entry.size) continue;
        if (!item.sample || current.stamp !== item.stamp) {
          const handle = await fs.open(current.file, 'r').catch(() => undefined);
          if (!handle) continue;
          try {
            const first = Buffer.alloc(Math.min(SAMPLE_BYTES, entry.size));
            const last = Buffer.alloc(
              Math.min(SAMPLE_BYTES, Math.max(0, entry.size - SAMPLE_BYTES))
            );
            await handle.read(first, 0, first.length, 0);
            await handle.read(last, 0, last.length, entry.size - last.length);
            item.sample = createHash('sha256').update(first).update(last).digest('hex');
            item.stamp = current.stamp;
          } finally {
            await handle.close();
          }
        }
        if (item.sample !== entry.sample) continue;
        try {
          const content = await readCanvasMedia(current.file);
          if (content.version !== entry.sha256) continue;
          if (match) return; // Identical copies are ambiguous; do not guess which one was moved.
          match = relative;
        } catch {
          /* A file moving during the search is not a match. */
        }
      }
      return match;
    })();
    this.searches.set(key, search);
    return search;
  }

  async read(reference: string): Promise<{ file: string; type: string; bytes?: Buffer }> {
    if (!tracked(reference)) return this.files.loadMedia(reference);
    let original;
    try {
      original = await this.files.loadMedia(reference);
    } catch (error) {
      // Only missing files are eligible; never recover around an authorization/path failure.
      if (
        await fs.lstat(path.join(this.files.root, reference)).then(
          () => true,
          () => false
        )
      )
        throw error;
    }
    if (original) {
      const content = await readCanvasMedia(original.file);
      this.remember(reference, {
        size: content.bytes.length,
        sample: sampleHash(content.bytes),
        sha256: content.version,
        location: reference,
      });
      return { ...original, bytes: content.bytes };
    }
    const entry = this.records[reference];
    if (entry) {
      const location = entry.location !== reference && (await this.candidate(entry.location, true));
      const locationMatches =
        location &&
        location.size === entry.size &&
        (await readCanvasMedia(location.file).then(
          (content) => content.version === entry.sha256,
          () => false
        ));
      const found = locationMatches ? entry.location : await this.find(entry);
      if (found) {
        const current = await this.candidate(found, true);
        if (current) {
          const content = await readCanvasMedia(current.file);
          if (content.version === entry.sha256) {
            this.remember(reference, { ...entry, location: found });
            return {
              file: current.file,
              type: reference.toLowerCase().endsWith('.png')
                ? 'image/png'
                : reference.toLowerCase().endsWith('.webp')
                  ? 'image/webp'
                  : 'image/jpeg',
              bytes: content.bytes,
            };
          }
        }
      }
    }
    return this.files.loadMedia(reference);
  }
}

const previews = new Map<string, CanvasImagePreview>();
export function canvasImagePreview(files: MakerCanvasFiles): CanvasImagePreview {
  let preview = previews.get(files.root);
  if (!preview) {
    preview = new CanvasImagePreview(files);
    previews.set(files.root, preview);
  }
  return preview;
}
