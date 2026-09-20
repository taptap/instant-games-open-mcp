import { FramecrateLauncher } from './integrations/framecrate.js';
import { ConsoleProjects } from './projects.js';
import { ConsoleError } from './types.js';

export interface ConsolePluginMetadata {
  id: string;
  title: string;
  icon: string;
  order: number;
  requiresProject: boolean;
  protocolVersion: number;
}

export interface ConsolePluginSession {
  url: string;
  projectPath: string;
}

/** Implementations are registered by trusted server code, never by browser configuration. */
export interface ConsolePlugin {
  readonly metadata: ConsolePluginMetadata;
  readonly active: boolean;
  open(projectPath: string, hostOrigin: string): Promise<ConsolePluginSession>;
  close(): Promise<void>;
}

export function configuredConsolePlugins(env: NodeJS.ProcessEnv = process.env): ConsolePlugin[] {
  return env.FRAMECRATE_STUDIO_DIR?.trim() ? [new FramecrateLauncher({ env })] : [];
}

/** Resolves trusted plugin ids and registered projects independently of the selected UI tab. */
export class ConsolePlugins {
  private readonly entries = new Map<
    string,
    { plugin: ConsolePlugin; metadata: ConsolePluginMetadata }
  >();
  private closing?: Promise<void>;

  constructor(
    private readonly projects: ConsoleProjects,
    plugins: readonly ConsolePlugin[] = configuredConsolePlugins()
  ) {
    for (const plugin of plugins) {
      const { id, title, icon, order, requiresProject, protocolVersion } = plugin.metadata;
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id) || this.entries.has(id))
        throw new ConsoleError('Invalid or duplicate trusted console plugin id.');
      if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.length > 80 ||
        protocolVersion !== 1 ||
        requiresProject !== true ||
        !Number.isFinite(order)
      )
        throw new ConsoleError('Invalid trusted console plugin metadata.');
      this.entries.set(id, {
        plugin,
        metadata: { id, title, icon, order, requiresProject, protocolVersion },
      });
    }
  }

  /** Return metadata only: no session URLs, credentials or executable configuration. */
  list(): ConsolePluginMetadata[] {
    return [...this.entries.values()]
      .map(({ metadata }) => ({ ...metadata }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  /** Starting and live plugin sessions keep the console alive. */
  get active(): boolean {
    return [...this.entries.values()].some(({ plugin }) => plugin.active);
  }

  /** Only exact loopback iframe URLs for the still-valid requested project reach the client. */
  async open(id: string, projectKey: string, hostOrigin: string): Promise<ConsolePluginSession> {
    if (this.closing) throw new ConsoleError('Console plugins are shutting down.', 503);
    const entry = this.entries.get(id);
    if (!entry) throw new ConsoleError('Unknown console plugin.', 404);
    const project = this.projects.resolve(projectKey);
    const ready = await entry.plugin.open(project.path, hostOrigin);
    if (this.closing) throw new ConsoleError('Console plugins are shutting down.', 503);
    this.projects.resolve(projectKey);
    try {
      const url = new URL(ready.url);
      if (
        ready.projectPath !== project.path ||
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        !url.port ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        !url.hash
      ) {
        throw new Error();
      }
      return { url: url.href, projectPath: project.path };
    } catch {
      throw new ConsoleError('Console plugin returned an invalid project iframe URL.', 409);
    }
  }

  /** Close all owned integrations, including sessions still starting, once per server lifetime. */
  close(): Promise<void> {
    if (!this.closing)
      this.closing = Promise.all(
        [...this.entries.values()].map(async ({ plugin }) => plugin.close())
      ).then(() => {});
    return this.closing;
  }
}
