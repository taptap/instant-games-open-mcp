import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getMakerHome } from './storage.js';
import { writePrivateJson } from './system/privateJson.js';

export type MakerProjectRegistryEntry = { key: string; path: string; binding: string };
export type MakerRegisteredProject = MakerProjectRegistryEntry & { valid: boolean; error?: string };
type RegistryData = {
  schema: 1;
  projects: MakerProjectRegistryEntry[];
  legacyMigrated?: boolean;
};
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PROJECTS = 200;

export class MakerProjectRegistryError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'missing' | 'unavailable' | 'busy' = 'invalid'
  ) {
    super(message);
    this.name = 'MakerProjectRegistryError';
  }
}

/** Durable user-wide catalog; project configuration remains in each original directory. */
export function getMakerProjectRegistryPath(): string {
  return path.join(getMakerHome(), 'projects.json');
}

/** Read-only migration source used by the former console-only catalog. */
export function getLegacyMakerProjectRegistryPath(): string {
  return path.join(getMakerHome(), 'console', 'projects.json');
}

function keyFor(root: string): string {
  return createHash('sha256').update(root).digest('hex');
}

function objectFile(filename: string): Record<string, unknown> {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size > MAX_BYTES)
    throw new MakerProjectRegistryError(
      'Invalid or oversized Maker project registry/configuration.'
    );
  const data: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new MakerProjectRegistryError('Invalid Maker project registry/configuration.');
  return data as Record<string, unknown>;
}

function readRegistry(filename: string): RegistryData {
  let data: Record<string, unknown>;
  try {
    data = objectFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, projects: [] };
    throw error;
  }
  if (
    data.schema !== 1 ||
    !Array.isArray(data.projects) ||
    data.projects.length > MAX_PROJECTS ||
    (data.legacyMigrated !== undefined && typeof data.legacyMigrated !== 'boolean')
  )
    throw new MakerProjectRegistryError(
      'Invalid Maker project registry. Existing file was not changed.'
    );
  const keys = new Set<string>();
  for (const entry of data.projects) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      !path.isAbsolute(entry.path) ||
      path.normalize(entry.path) !== entry.path ||
      entry.key !== keyFor(entry.path) ||
      typeof entry.binding !== 'string' ||
      !entry.binding.trim() ||
      keys.has(entry.key)
    )
      throw new MakerProjectRegistryError('Invalid Maker project registry entry.');
    keys.add(entry.key);
  }
  return data as RegistryData;
}

function binding(root: string): string {
  if (!fs.statSync(root).isDirectory())
    throw new MakerProjectRegistryError('Project path must be a directory.');
  const id = objectFile(path.join(root, '.maker-mcp', 'config.json')).project_id;
  if (typeof id !== 'string' || !id.trim())
    throw new MakerProjectRegistryError('A bound Maker project is required.');
  return id;
}

function describe(entry: MakerProjectRegistryEntry): MakerRegisteredProject {
  try {
    if (fs.realpathSync(entry.path) !== entry.path || binding(entry.path) !== entry.binding)
      throw new Error('Project binding or directory identity changed; remove and add it again.');
    return { ...entry, valid: true };
  } catch (error) {
    return {
      ...entry,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requireValid(entry: MakerProjectRegistryEntry): MakerRegisteredProject {
  const result = describe(entry);
  if (!result.valid)
    throw new MakerProjectRegistryError(result.error || 'Project unavailable.', 'unavailable');
  return result;
}

/** Synchronous catalog with serialized cross-process mutations and one-time legacy import. */
export class MakerProjectRegistry {
  readonly legacyFilename?: string;

  constructor(
    readonly filename = getMakerProjectRegistryPath(),
    options: { legacyFilename?: string } = {}
  ) {
    this.legacyFilename =
      options.legacyFilename ??
      (filename === getMakerProjectRegistryPath()
        ? getLegacyMakerProjectRegistryPath()
        : undefined);
    if (
      !path.isAbsolute(filename) ||
      (this.legacyFilename && !path.isAbsolute(this.legacyFilename))
    )
      throw new MakerProjectRegistryError('Registry paths must be absolute.');
    if (this.legacyFilename && path.resolve(this.legacyFilename) === path.resolve(filename))
      throw new MakerProjectRegistryError('Legacy and shared registry paths must differ.');
  }

  private transaction<T>(operation: (data: RegistryData) => { result: T; changed?: boolean }): T {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    const lock = this.filename + '.lock';
    const deadline = performance.now() + 2000;
    const sleeper = new Int32Array(new SharedArrayBuffer(4));
    for (;;) {
      try {
        fs.mkdirSync(lock, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (performance.now() >= deadline)
          throw new MakerProjectRegistryError(
            'Maker project registry is busy. Retry after other registry operations finish. ' +
              'An abandoned .lock directory must only be removed after all writers have stopped.',
            'busy'
          );
        Atomics.wait(sleeper, 0, 0, 10);
      }
    }
    try {
      const data = readRegistry(this.filename);
      let migrated = false;
      if (this.legacyFilename && !data.legacyMigrated) {
        const legacy = readRegistry(this.legacyFilename);
        const known = new Set(data.projects.map((entry) => entry.key));
        data.projects.push(...legacy.projects.filter((entry) => !known.has(entry.key)));
        // Commit the marker with the entries so removals can never reimport legacy data.
        data.legacyMigrated = true;
        migrated = true;
      }
      if (data.projects.length > MAX_PROJECTS)
        throw new MakerProjectRegistryError('The local project list is limited to 200 entries.');
      const { result, changed } = operation(data);
      if (changed || migrated) {
        if (Buffer.byteLength(JSON.stringify(data, null, 2)) > MAX_BYTES)
          throw new MakerProjectRegistryError('Maker project registry exceeds the supported size.');
        writePrivateJson(this.filename, data);
      }
      return result;
    } finally {
      // Never steal an existing lock: a slow or crashed writer must fail closed.
      fs.rmdirSync(lock);
    }
  }

  add(directory: string): MakerRegisteredProject {
    if (!directory || !path.isAbsolute(directory))
      throw new MakerProjectRegistryError(
        'Please provide the absolute path to a local Maker project.'
      );
    return this.transaction((data) => {
      const root = fs.realpathSync(directory);
      const id = binding(root);
      const key = keyFor(root);
      const existing = data.projects.find((entry) => entry.key === key);
      if (existing) return { result: requireValid(existing) };
      if (data.projects.length >= MAX_PROJECTS)
        throw new MakerProjectRegistryError('The local project list is limited to 200 entries.');
      const entry = { key, path: root, binding: id };
      const result = requireValid(entry);
      data.projects.unshift(entry);
      return { result, changed: true };
    });
  }

  private snapshot(): RegistryData {
    const data = readRegistry(this.filename);
    if (!this.legacyFilename || data.legacyMigrated) return data;
    // Atomic replacement permits passive readers; only the first legacy import needs a lock.
    return this.transaction((migrated) => ({ result: migrated }));
  }

  list(): MakerRegisteredProject[] {
    return this.snapshot().projects.map(describe);
  }

  resolve(key: string): MakerRegisteredProject {
    const entry = this.snapshot().projects.find((item) => item.key === key);
    if (!entry)
      throw new MakerProjectRegistryError(
        'Unknown local project. Select or add a project first.',
        'missing'
      );
    return requireValid(entry);
  }

  remove(key: string): void {
    this.transaction((data) => {
      const projects = data.projects.filter((entry) => entry.key !== key);
      const changed = projects.length !== data.projects.length;
      data.projects = projects;
      return { result: undefined, changed };
    });
  }
}

/** Best-effort registration for completed CLI work: return a warning instead of failing it. */
export function registerMakerProject(directory: string): string | undefined {
  try {
    new MakerProjectRegistry().add(directory);
    return undefined;
  } catch (error) {
    return `Local project registry registration failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
