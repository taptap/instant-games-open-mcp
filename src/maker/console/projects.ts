import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MakerProjectRegistry,
  MakerProjectRegistryError,
  type MakerRegisteredProject,
} from '../projectRegistry.js';
import { inspectMakerProjectHealth } from '../projectSettings.js';
import { getGitCommand } from '../system/git.js';
import { ConsoleError, type ConsoleProject } from './types.js';

const exec = promisify(execFile);
function objectFile(filename: string): Record<string, any> {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
    throw new ConsoleError('Project configuration exceeds the supported size.');
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ConsoleError('Invalid project configuration.');
  return data;
}
function optionalConfig(root: string, file: string): Record<string, any> {
  try {
    return objectFile(path.join(root, '.project', file));
  } catch {
    return {};
  }
}
function text(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}
async function git(root: string, args: string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const result = await exec(
    getGitCommand(),
    ['-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', '--no-pager', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      signal,
      killSignal: 'SIGKILL',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    }
  );
  return result.stdout;
}

export class ConsoleProjects {
  private readonly registry: MakerProjectRegistry;

  constructor(
    readonly filename: string,
    options: { legacyFilename?: string } = {}
  ) {
    this.registry = new MakerProjectRegistry(filename, options);
  }

  private registryOperation<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      const status =
        error instanceof MakerProjectRegistryError
          ? { invalid: 400, missing: 404, unavailable: 409, busy: 409 }[error.code]
          : 400;
      throw new ConsoleError(error instanceof Error ? error.message : String(error), status);
    }
  }

  private describe(entry: MakerRegisteredProject): ConsoleProject {
    const error = entry.error;
    const config = error ? {} : optionalConfig(entry.path, 'project.json');
    return {
      key: entry.key,
      path: entry.path,
      name: text(config.taptap_publish?.title) || path.basename(entry.path),
      valid: !error,
      ...(error ? { error } : {}),
    };
  }

  add(directory: string): ConsoleProject {
    return this.describe(this.registryOperation(() => this.registry.add(directory)));
  }

  list(): ConsoleProject[] {
    return this.registryOperation(() => this.registry.list()).map((entry) => this.describe(entry));
  }
  resolve(key: string): ConsoleProject {
    return this.describe(this.registryOperation(() => this.registry.resolve(key)));
  }
  remove(key: string): void {
    this.registryOperation(() => this.registry.remove(key));
  }

  async detail(key: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const project = this.resolve(key);
    const config = optionalConfig(project.path, 'project.json');
    const settings = optionalConfig(project.path, 'settings.json');
    let gitState: { branch: string | null; head: string | null; changeCount: number | null } = {
      branch: null,
      head: null,
      changeCount: null,
    };
    try {
      const [branch, head, changes] = await Promise.all([
        git(project.path, ['branch', '--show-current'], signal),
        git(project.path, ['rev-parse', '--short', 'HEAD'], signal).catch(() => ''),
        this.changes(project.path, signal),
      ]);
      gitState = {
        branch: branch.trim() || '(detached)',
        head: head.trim() || null,
        changeCount: changes.length,
      };
    } catch {
      /* An initialized Maker directory may not yet have a Git checkout. */
    }
    signal?.throwIfAborted();
    this.resolve(key);
    return {
      project,
      config: {
        version: text(config.version),
        orientation: text(config.taptap_publish?.screen_orientation),
        entry: text(config['entry@client'] || config.entry),
        engineTag: text(settings.sources?.engine?.tag),
        multiplayer:
          typeof settings['@runtime']?.multiplayer?.enabled === 'boolean'
            ? settings['@runtime'].multiplayer.enabled
            : null,
        appId: text(config.taptap_publish?.app_id),
      },
      git: gitState,
      health: inspectMakerProjectHealth(project.path),
    };
  }

  private async changes(root: string, signal?: AbortSignal) {
    const raw = (
      await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], signal)
    ).split('\0');
    const result: { status: string; path: string }[] = [];
    for (let i = 0; i < raw.length && raw[i]; i++) {
      result.push({ status: raw[i].slice(0, 2), path: raw[i].slice(3) });
      if (/[RC]/.test(raw[i].slice(0, 2))) i++;
    }
    return result;
  }

  async git(key: string, skip: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100000)
      throw new ConsoleError('Invalid history offset.');
    const project = this.resolve(key);
    const [branch, changes, shallow] = await Promise.all([
      git(project.path, ['branch', '--show-current'], signal),
      this.changes(project.path, signal),
      git(project.path, ['rev-parse', '--is-shallow-repository'], signal),
    ]);
    const exists = await git(project.path, ['rev-parse', '--verify', 'HEAD'], signal).then(
      () => true,
      () => false
    );
    signal?.throwIfAborted();
    const raw = exists
      ? await git(
          project.path,
          [
            'log',
            '--all',
            '--topo-order',
            '-z',
            '--format=format:%H%x00%P%x00%an%x00%aI%x00%s',
            '--max-count=51',
            `--skip=${skip}`,
          ],
          signal
        )
      : '';
    const fields = raw.split('\0');
    const commits = [];
    for (let i = 0; i + 4 < fields.length; i += 5) {
      commits.push({
        hash: fields[i],
        parents: fields[i + 1].split(' ').filter(Boolean),
        author: fields[i + 2],
        date: fields[i + 3],
        subject: fields[i + 4],
      });
    }
    this.resolve(key);
    return {
      commits: commits.slice(0, 50),
      branch: branch.trim(),
      changes,
      hasMore: commits.length > 50,
      shallow: shallow.trim() === 'true',
    };
  }

  commit(key: string, hash: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new ConsoleError('Invalid commit hash.');
    const project = this.resolve(key);
    return this.readCommit(project, hash, signal);
  }

  private async readCommit(project: ConsoleProject, hash: string, signal?: AbortSignal) {
    const [metadata, files, patch] = await Promise.all([
      git(
        project.path,
        ['show', '-s', '--format=%H%x00%s%x00%b%x00%an%x00%aI', hash, '--'],
        signal
      ),
      git(project.path, ['show', '--format=', '--name-status', '--no-renames', hash, '--'], signal),
      git(
        project.path,
        [
          'show',
          '--format=',
          '--no-ext-diff',
          '--no-textconv',
          '--no-renames',
          '--unified=3',
          hash,
          '--',
        ],
        signal
      ).catch(() => 'Diff exceeds the console limit or cannot be displayed.'),
    ]);
    const [id, subject, body, author, date] = metadata.trimEnd().split('\0');
    this.resolve(project.key);
    return { hash: id, subject, body, author, date, files, patch };
  }
}
