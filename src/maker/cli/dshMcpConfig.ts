import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMap, isSeq, parseDocument, type Document } from 'yaml';

export const DSH_MCP_PLUGIN_NAME = '@deepseek-ai/dsh-mcp-client';
export const DSH_MAKER_PLUGIN_ID = 'mcp-taptap-maker';
export const DSH_MAKER_TOOL_CALL_TIMEOUT_MS = 60 * 60 * 1000;

export type DshMakerPluginConfig = {
  id: string;
  name: string;
  config: {
    serverName: string;
    transport: 'stdio';
    command: string;
    args: string[];
    env?: Record<string, string>;
    toolCallTimeoutMs: number;
    failOnStartupError: true;
  };
};

export type DshConfigWriteResult = {
  changed: boolean;
  backupPath?: string;
};

type DshMakerPluginCandidate = {
  patchIndex: number;
  insertIndex?: number;
  value: unknown;
};

export function getDshHome(
  options: {
    homeDir?: string;
    environment?: NodeJS.ProcessEnv;
  } = {}
): string {
  const configured = (options.environment || process.env).DSH_HOME?.trim();
  if (configured) {
    const expanded =
      configured === '~'
        ? options.homeDir || os.homedir()
        : configured.startsWith('~/') || configured.startsWith('~\\')
          ? path.join(options.homeDir || os.homedir(), configured.slice(2))
          : configured;
    return path.resolve(expanded);
  }
  return path.join(options.homeDir || os.homedir(), '.dsh');
}

export function createDshMakerPluginConfig(options: {
  mcpName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}): DshMakerPluginConfig {
  return {
    id: DSH_MAKER_PLUGIN_ID,
    name: DSH_MCP_PLUGIN_NAME,
    config: {
      serverName: options.mcpName,
      transport: 'stdio',
      command: options.command,
      args: [...options.args],
      ...(options.env && Object.keys(options.env).length > 0 ? { env: { ...options.env } } : {}),
      toolCallTimeoutMs: DSH_MAKER_TOOL_CALL_TIMEOUT_MS,
      failOnStartupError: true,
    },
  };
}

export function mergeDshMakerMcpConfig(
  configPath: string,
  desired: DshMakerPluginConfig
): DshConfigWriteResult {
  const existed = fs.existsSync(configPath);
  const previousContent = existed ? fs.readFileSync(configPath, 'utf8') : '[]\n';
  const document = parseDshDocument(previousContent, configPath);
  const sequence = ensurePluginSequence(document, configPath);
  const candidates = findDshMakerPluginCandidates(
    sequence.items.map((item) => item?.toJSON()),
    desired.config.serverName
  );

  if (candidates.length > 1) {
    throw new Error(
      `Multiple DSH Maker MCP plugin entries found in ${configPath}. ` +
        `Keep only one ${DSH_MCP_PLUGIN_NAME} entry with serverName ${desired.config.serverName}.`
    );
  }
  if (
    candidates.length === 1 &&
    candidates[0].insertIndex !== undefined &&
    deepEqual(candidates[0].value, desired)
  ) {
    return { changed: false };
  }

  const desiredNode = document.createNode(desired) as (typeof sequence.items)[number];
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate.insertIndex === undefined) {
      // Cordis applies patch files over a composed tree: a direct id row only overrides an
      // existing entry. Wrap legacy direct rows in insert so Maker is actually registered.
      sequence.items[candidate.patchIndex] = document.createNode({
        insert: [desired],
      }) as (typeof sequence.items)[number];
    } else {
      const patchNode = sequence.items[candidate.patchIndex];
      const insertNode = isMap(patchNode) ? patchNode.get('insert', true) : undefined;
      if (!isSeq(insertNode)) {
        throw new Error(`Invalid DSH insert patch in ${configPath}.`);
      }
      insertNode.items[candidate.insertIndex] = desiredNode;
    }
  } else {
    sequence.items.push(
      document.createNode({ insert: [desired] }) as (typeof sequence.items)[number]
    );
  }

  sequence.flow = false;
  const nextContent = document.toString({ lineWidth: 0 });
  return writeDshConfigWithBackup(configPath, previousContent, existed, nextContent, desired);
}

export function parseDshPluginEntries(content: string, source = 'DSH config'): unknown[] {
  const document = parseDshDocument(content, source);
  if (document.contents === null) {
    return [];
  }
  if (!isSeq(document.contents)) {
    throw new Error(`${source} top-level value must be a plugin array.`);
  }
  return document.contents.items.map((item) => item?.toJSON());
}

export function findDshMakerPluginEntry(
  content: string,
  mcpName: string,
  source = 'DSH config'
): Record<string, unknown> | undefined {
  const matches = findDshMakerPluginCandidates(parseDshPluginEntries(content, source), mcpName);
  if (matches.length > 1) {
    throw new Error(`${source} contains multiple Maker MCP plugin entries.`);
  }
  return isRecord(matches[0]?.value) ? matches[0].value : undefined;
}

export function getDshMcpInstallPaths(options: {
  homeDir?: string;
  environment?: NodeJS.ProcessEnv;
  mcpName: string;
}): string[] {
  const dshHome = getDshHome(options);
  const homePatchPath = path.join(dshHome, 'cordis.patch.yml');
  const homeHasMaker = dshConfigFileHasMaker(homePatchPath, options.mcpName);
  const profilePatchPaths = listDshProfilePatchPathsForInstall(dshHome).filter((configPath) =>
    dshConfigFileHasMaker(configPath, options.mcpName)
  );

  if (homeHasMaker && profilePatchPaths.length > 0) {
    throw new Error(
      `Maker MCP is registered in both ${homePatchPath} and DSH profile patch files: ` +
        `${profilePatchPaths.join(', ')}. Remove the duplicate profile-scoped entry before reinstalling.`
    );
  }
  if (homeHasMaker) {
    return [homePatchPath];
  }
  return profilePatchPaths.length > 0 ? profilePatchPaths : [homePatchPath];
}

function listDshProfilePatchPathsForInstall(dshHome: string): string[] {
  const profilesDir = path.join(dshHome, 'profiles');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((profileName) => path.join(profilesDir, profileName, 'cordis.patch.yml'));
}

function dshConfigFileHasMaker(configPath: string, mcpName: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
  return Boolean(findDshMakerPluginEntry(content, mcpName, configPath));
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function listDshMcpConfigPaths(options: { homeDir: string; dshHome?: string }): string[] {
  const dshHome = options.dshHome || path.join(options.homeDir, '.dsh');
  const paths = [path.join(dshHome, 'cordis.patch.yml')];
  const profilesDir = path.join(dshHome, 'profiles');
  if (!fs.existsSync(profilesDir)) {
    return paths;
  }

  let profileNames: string[] = [];
  try {
    profileNames = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .slice(0, 50);
  } catch {
    return paths;
  }
  for (const profileName of profileNames) {
    const profileDir = path.join(profilesDir, profileName);
    paths.push(path.join(profileDir, 'cordis.patch.yml'), path.join(profileDir, 'cordis.yml'));
  }
  return paths;
}

function parseDshDocument(content: string, source: string): Document {
  const document = parseDocument(content, { prettyErrors: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML in ${source}: ${document.errors[0].message}`);
  }
  return document;
}

function ensurePluginSequence(document: Document, source: string) {
  if (document.contents === null) {
    document.contents = document.createNode([]);
  }
  if (!isSeq(document.contents)) {
    throw new Error(`${source} top-level value must be a plugin array.`);
  }
  return document.contents;
}

function isMakerPluginCandidate(value: unknown, mcpName: string): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.id === DSH_MAKER_PLUGIN_ID) {
    return true;
  }
  const config = isRecord(value.config) ? value.config : undefined;
  return value.name === DSH_MCP_PLUGIN_NAME && config?.serverName === mcpName;
}

function findDshMakerPluginCandidates(
  patches: unknown[],
  mcpName: string
): DshMakerPluginCandidate[] {
  const candidates: DshMakerPluginCandidate[] = [];
  patches.forEach((patch, patchIndex) => {
    if (!isRecord(patch)) {
      return;
    }
    if (Array.isArray(patch.insert)) {
      patch.insert.forEach((entry, insertIndex) => {
        if (isMakerPluginCandidate(entry, mcpName)) {
          candidates.push({ patchIndex, insertIndex, value: entry });
        }
      });
      return;
    }
    if (isMakerPluginCandidate(patch, mcpName)) {
      candidates.push({ patchIndex, value: patch });
    }
  });
  return candidates;
}

function writeDshConfigWithBackup(
  configPath: string,
  previousContent: string,
  existed: boolean,
  nextContent: string,
  desired: DshMakerPluginConfig
): DshConfigWriteResult {
  const backupPath = existed ? `${configPath}.taptap-maker.bak.latest` : undefined;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (backupPath) {
    fs.writeFileSync(backupPath, previousContent, 'utf8');
  }

  try {
    fs.writeFileSync(configPath, nextContent, 'utf8');
    const written = findDshMakerPluginEntry(
      fs.readFileSync(configPath, 'utf8'),
      desired.config.serverName,
      configPath
    );
    if (!deepEqual(written, desired)) {
      throw new Error(
        `Generated DSH MCP config for ${desired.config.serverName} failed validation.`
      );
    }
    return { changed: true, backupPath };
  } catch (error) {
    if (existed) {
      fs.writeFileSync(configPath, previousContent, 'utf8');
    } else {
      fs.rmSync(configPath, { force: true });
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !isMap(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
