import fs from 'node:fs';
import path from 'node:path';

const STANDARD_PREVIEW_CONFIGS = ['project', 'resources', 'settings'] as const;

export type PreviewProjectKind = 'single_player' | 'network' | 'server' | 'new_project';

export type PreviewProjectClassification = {
  kind: PreviewProjectKind;
  network_required: boolean;
  preparation_required: boolean;
  preparation_reason?: string;
  server_entry?: string;
};

export function hasStandardPreviewConfiguration(project: string): boolean {
  return STANDARD_PREVIEW_CONFIGS.every((name) =>
    fs.existsSync(path.join(project, '.project', name + '.json'))
  );
}

function configuredServerEntry(
  root: string,
  project: Record<string, any>,
  resources: Record<string, any>
): string | undefined {
  const entry = project['entry@server'] ?? resources['entry@server'];
  if (entry === undefined) return undefined;
  if (
    typeof entry !== 'string' ||
    !entry.trim() ||
    path.isAbsolute(entry) ||
    path.win32.isAbsolute(entry) ||
    /^[A-Za-z]:/.test(entry)
  )
    throw new Error('预览配置中的 entry@server 必须是相对路径。');
  const normalized = path.posix.normalize(entry.replaceAll('\\', '/'));
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../'))
    throw new Error('预览配置中的 entry@server 不能逃逸 scripts 目录。');
  const scripts = fs.realpathSync(path.join(root, 'scripts'));
  const candidate = path.join(scripts, normalized);
  const resolved = fs.realpathSync(candidate);
  const relative = path.relative(scripts, resolved);
  if (!fs.statSync(resolved).isFile() || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`预览配置中的 entry@server 不存在: ${entry}`);
  return normalized;
}

function detectedServerEntry(project: string): string | undefined {
  return ['server_main.lua', 'server.lua'].find((name) =>
    fs.existsSync(path.join(project, 'scripts', name))
  );
}

function networkEnabled(settings: Record<string, any>): boolean {
  const runtime = settings['@runtime'];
  if (!runtime || typeof runtime !== 'object') return false;
  const multiplayer = runtime.multiplayer;
  if (multiplayer && typeof multiplayer === 'object') {
    if (multiplayer.enabled !== undefined) return Boolean(multiplayer.enabled);
    if (multiplayer.max_players !== undefined) return Number(multiplayer.max_players) > 0;
    return Boolean(
      multiplayer.persistent_world &&
        typeof multiplayer.persistent_world === 'object' &&
        multiplayer.persistent_world.enabled
    );
  }
  return Number(runtime.max_players) > 0;
}

function hasResourceMetadata(directory: string): boolean {
  if (!fs.existsSync(directory)) return false;
  if (fs.lstatSync(directory).isSymbolicLink()) return true;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink() || item.name.endsWith('.meta')) return true;
    if (item.isDirectory() && hasResourceMetadata(path.join(directory, item.name))) return true;
  }
  return false;
}

export function classifyPreviewProject(
  project: string,
  platform: NodeJS.Platform = process.platform
): PreviewProjectClassification {
  const standard = hasStandardPreviewConfiguration(project);
  // Read existing files even when another config is missing; never discard its semantics.
  const projectConfig = readPreviewConfiguration(project, 'project') || {};
  const resourcesConfig = readPreviewConfiguration(project, 'resources') || {};
  const settingsConfig = readPreviewConfiguration(project, 'settings') || {};
  const serverEntry = configuredServerEntry(project, projectConfig, resourcesConfig);
  const detectedEntry = detectedServerEntry(project);
  const hasServer = Boolean(serverEntry) || Boolean(detectedEntry);
  const network = networkEnabled(settingsConfig);
  const reason = !standard
    ? 'missing_configuration'
    : network || hasServer
      ? 'network_or_server'
      : platform === 'win32' && fs.existsSync(path.join(project, 'dist/latest.json'))
        ? 'existing_windows_manifest'
        : Object.keys(resourcesConfig).some(
              (key) => !['$schema', 'entry', 'entry@client', 'entry@server'].includes(key)
            ) ||
            Object.keys(settingsConfig).some((key) => !['$schema', '@runtime'].includes(key)) ||
            hasResourceMetadata(path.join(project, 'scripts')) ||
            hasResourceMetadata(path.join(project, 'assets'))
          ? 'resource_manifest'
          : undefined;

  return {
    kind: hasServer ? 'server' : network ? 'network' : !standard ? 'new_project' : 'single_player',
    network_required: network || hasServer,
    preparation_required: Boolean(reason),
    ...(reason ? { preparation_reason: reason } : {}),
    ...(serverEntry || detectedEntry ? { server_entry: serverEntry || detectedEntry } : {}),
  };
}

export function readPreviewConfiguration(
  project: string,
  name: 'project' | 'resources' | 'settings'
): Record<string, any> | undefined {
  const filename = path.join(project, '.project', name + '.json');
  if (!fs.existsSync(filename)) {
    if (
      [
        path.join(project, '.project', name + '.jsonc'),
        path.join(project, name + '.json'),
        path.join(project, name + '.jsonc'),
      ].some((file) => fs.existsSync(file))
    )
      throw new Error(
        `Local preview requires .project/${name}.json for existing configuration; JSONC-only and legacy root layouts are not supported.`
      );
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new Error(`无法读取预览配置 .project/${name}.json，请检查文件权限和 JSON 格式。`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`预览配置 .project/${name}.json 必须是 JSON 对象。`);
  return value as Record<string, any>;
}

export function previewEntryName(
  project: Record<string, any> = {},
  resources: Record<string, any> = {}
): unknown {
  for (const value of [
    project['entry@client'],
    project.entry,
    resources['entry@client'],
    resources.entry,
  ]) {
    if (value !== undefined) return value;
  }
  return 'main.lua';
}
