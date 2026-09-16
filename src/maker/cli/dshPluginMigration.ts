/**
 * Safe migration helpers for the DSH L1 Maker MCP registration superseded by the DSH plugin.
 *
 * The L1 config (`taptap-maker install --ide dsh`) writes an `insert` patch that
 * carries a `mcp-taptap-maker` row into `$DSH_HOME/cordis.patch.yml` (home) or a
 * profile's `cordis.patch.yml`. The DSH bundle plugin registers the same
 * `serverName`, so an active L1 registration must be removed — not just have its
 * `id` field deleted, since Cordis regenerates a random id for an id-less row and
 * the old MCP would still start.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { isMap, isSeq, parseDocument, type Node } from 'yaml';
import { getMakerHome } from '../storage.js';
import {
  DSH_MAKER_PLUGIN_ID,
  DSH_MCP_PLUGIN_NAME,
  getDshHome,
  listDshMcpConfigPaths,
} from './dshMcpConfig.js';
import { writeConfigWithTapTapBackupIfChanged } from './configWrite.js';

export const DSH_MAKER_MCP_NAME = 'taptap-maker';

export type DshLegacyMakerMcpInspection = {
  client: 'dsh';
  status: 'not_found' | 'active' | 'ambiguous';
  config_path: string;
  config_paths: string[];
  registration_count: number;
};

export type DshLegacyMakerMcpMigrationResult = DshLegacyMakerMcpInspection & {
  action:
    | 'not_found'
    | 'not_owned'
    | 'already_migrated'
    | 'already_restored'
    | 'removed'
    | 'restored';
  changed: boolean;
  backup_path?: string;
  state_path?: string;
};

type DshPluginMigrationState = {
  schema_version: 1;
  client: 'dsh';
  config_path: string;
  removed_registration: Record<string, unknown>;
  removed_registration_sha256: string;
  migrated_at: string;
};

type DshMakerRegistration = {
  configPath: string;
  patchIndex: number;
  insertIndex?: number;
  registration: Record<string, unknown>;
};

export function inspectDshLegacyMakerMcp(
  options: { dshHome?: string } = {}
): DshLegacyMakerMcpInspection {
  const registrations = findDshMakerRegistrations(options.dshHome);
  const configPaths = unique(registrations.map((entry) => entry.configPath));
  if (registrations.length === 0) {
    return createDshInspection('not_found', [], configPaths);
  }
  if (registrations.length > 1) {
    return createDshInspection('ambiguous', configPaths, configPaths);
  }
  return createDshInspection('active', [registrations[0].configPath], configPaths);
}

export function migrateDshLegacyMakerMcp(
  options: { dshHome?: string; confirm?: boolean } = {}
): DshLegacyMakerMcpMigrationResult {
  const makerHome = getMakerHome();
  const statePath = getDshPluginMigrationStatePath(makerHome);
  const registrations = findDshMakerRegistrations(options.dshHome);
  const inspection = inspectDshLegacyMakerMcp(options);

  if (inspection.status === 'not_found') {
    return { ...inspection, action: 'not_found', changed: false };
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `DSH Maker MCP migration found ${inspection.registration_count} registrations in ${inspection.config_paths.join(', ')}; resolve the duplicates before migrating.`
    );
  }
  if (!options.confirm) {
    throw new Error(
      'Removing the legacy DSH Maker MCP registration requires explicit confirmation.'
    );
  }

  const registration = registrations[0];
  const previousContent = fs.readFileSync(registration.configPath, 'utf8');
  const document = parseDocument(previousContent, { prettyErrors: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML in ${registration.configPath}: ${document.errors[0].message}`);
  }
  removeDshMakerRegistration(document, registration);
  const nextContent = document.toString({ lineWidth: 0 });

  const state: DshPluginMigrationState = {
    schema_version: 1,
    client: 'dsh',
    config_path: registration.configPath,
    removed_registration: registration.registration,
    removed_registration_sha256: sha256(JSON.stringify(registration.registration)),
    migrated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const write = writeConfigWithTapTapBackupIfChanged(registration.configPath, nextContent, () => {
    const after = findDshMakerRegistrations(options.dshHome);
    if (after.some((entry) => entry.configPath === registration.configPath)) {
      throw new Error('DSH Maker MCP migration validation still found a registration.');
    }
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  });

  return {
    ...inspectDshLegacyMakerMcp(options),
    action: 'removed',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

export function restoreDshLegacyMakerMcp(
  options: { dshHome?: string; confirm?: boolean } = {}
): DshLegacyMakerMcpMigrationResult {
  const makerHome = getMakerHome();
  const statePath = getDshPluginMigrationStatePath(makerHome);
  const inspection = inspectDshLegacyMakerMcp(options);
  const state = readDshMigrationState(statePath);

  if (!state) {
    return { ...inspection, action: 'not_owned', changed: false };
  }
  if (!options.confirm) {
    throw new Error(
      'Restoring the legacy DSH Maker MCP registration requires explicit confirmation.'
    );
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `DSH Maker MCP restoration found ${inspection.registration_count} registrations; resolve the duplicates before restoring.`
    );
  }

  if (inspection.status === 'active') {
    const current = findDshMakerRegistrations(options.dshHome)[0];
    const currentSha = sha256(JSON.stringify(current.registration));
    if (currentSha === state.removed_registration_sha256) {
      fs.rmSync(statePath, { force: true });
      return { ...inspection, action: 'already_restored', changed: false, state_path: statePath };
    }
    return { ...inspection, action: 'not_owned', changed: false };
  }

  const configPath = state.config_path;
  const previousContent = fs.readFileSync(configPath, 'utf8');
  const document = parseDocument(previousContent, { prettyErrors: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML in ${configPath}: ${document.errors[0].message}`);
  }
  reinsertDshMakerRegistration(document, state.removed_registration);
  const nextContent = document.toString({ lineWidth: 0 });

  const write = writeConfigWithTapTapBackupIfChanged(configPath, nextContent, () => {
    const restored = findDshMakerRegistrations(options.dshHome);
    const match = restored.find((entry) => entry.configPath === configPath);
    if (
      !match ||
      sha256(JSON.stringify(match.registration)) !== state.removed_registration_sha256
    ) {
      throw new Error('DSH Maker MCP restoration changed the registration identity.');
    }
    fs.rmSync(statePath, { force: true });
  });

  return {
    ...inspectDshLegacyMakerMcp(options),
    action: 'restored',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

function findDshMakerRegistrations(dshHome?: string): DshMakerRegistration[] {
  const resolvedDshHome = dshHome || getDshHome();
  const configPaths = listDshMcpConfigPaths({ homeDir: os.homedir(), dshHome: resolvedDshHome });
  const registrations: DshMakerRegistration[] = [];
  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) {
      continue;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    const document = parseDocument(content, { prettyErrors: true });
    if (document.errors.length > 0) {
      throw new Error(`Invalid YAML in ${configPath}: ${document.errors[0].message}`);
    }
    const candidates = findDshMakerCandidates(document);
    for (const candidate of candidates) {
      registrations.push({ configPath, ...candidate });
    }
  }
  return registrations;
}

function findDshMakerCandidates(
  document: ReturnType<typeof parseDocument>
): Array<{ patchIndex: number; insertIndex?: number; registration: Record<string, unknown> }> {
  const candidates: Array<{
    patchIndex: number;
    insertIndex?: number;
    registration: Record<string, unknown>;
  }> = [];
  const top = document.contents;
  if (!isSeq(top)) {
    return candidates;
  }
  top.items.forEach((rawPatch, patchIndex) => {
    const patchNode = rawPatch as Node;
    const patch = patchNode.toJSON();
    if (Array.isArray(patch?.insert)) {
      const insertNode = isMap(patchNode) ? patchNode.get('insert', true) : undefined;
      if (!isSeq(insertNode)) {
        return;
      }
      insertNode.items.forEach((rawRow, insertIndex) => {
        const rowNode = rawRow as Node;
        const row = rowNode.toJSON();
        if (isDshMakerPluginCandidate(row)) {
          candidates.push({
            patchIndex,
            insertIndex,
            registration: row as Record<string, unknown>,
          });
        }
      });
      return;
    }
    if (isDshMakerPluginCandidate(patch)) {
      candidates.push({
        patchIndex,
        registration: patch as Record<string, unknown>,
      });
    }
  });
  return candidates;
}

function removeDshMakerRegistration(
  document: ReturnType<typeof parseDocument>,
  registration: DshMakerRegistration
): void {
  const top = document.contents;
  if (!isSeq(top)) {
    throw new Error('DSH config top-level value must be a plugin array.');
  }
  if (registration.insertIndex !== undefined) {
    const patchNode = top.items[registration.patchIndex];
    const insertNode = isMap(patchNode) ? patchNode.get('insert', true) : undefined;
    if (!isSeq(insertNode)) {
      throw new Error('Invalid DSH insert patch.');
    }
    insertNode.items.splice(registration.insertIndex, 1);
    if (insertNode.items.length === 0) {
      top.items.splice(registration.patchIndex, 1);
    }
    return;
  }
  top.items.splice(registration.patchIndex, 1);
}

function reinsertDshMakerRegistration(
  document: ReturnType<typeof parseDocument>,
  registration: Record<string, unknown>
): void {
  const top = document.contents;
  if (!isSeq(top)) {
    throw new Error('DSH config top-level value must be a plugin array.');
  }
  top.items.push(document.createNode({ insert: [registration] }));
}

function isDshMakerPluginCandidate(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.id === DSH_MAKER_PLUGIN_ID) {
    return true;
  }
  const config = isRecord(value.config) ? value.config : undefined;
  return value.name === DSH_MCP_PLUGIN_NAME && config?.serverName === DSH_MAKER_MCP_NAME;
}

function getDshPluginMigrationStatePath(makerHome: string): string {
  return path.join(makerHome, 'plugin-migrations', 'dsh.json');
}

function readDshMigrationState(statePath: string): DshPluginMigrationState | undefined {
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as DshPluginMigrationState;
    return state?.schema_version === 1 && state.client === 'dsh' ? state : undefined;
  } catch {
    return undefined;
  }
}

function createDshInspection(
  status: DshLegacyMakerMcpInspection['status'],
  primaryPaths: string[],
  allPaths: string[]
): DshLegacyMakerMcpInspection {
  return {
    client: 'dsh',
    status,
    config_path: primaryPaths[0] ?? '',
    config_paths: allPaths,
    registration_count: primaryPaths.length,
  };
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
