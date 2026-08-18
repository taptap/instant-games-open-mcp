/**
 * Safe migration helpers for client-level Maker MCP registrations superseded by a plugin.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getMakerHome } from '../storage.js';
import { findCodexMcpTables, findTomlBooleanAssignment } from './codexMcpConfig.js';
import { writeConfigWithTapTapBackupIfChanged } from './configWrite.js';

export type CodexLegacyMakerMcpInspection = {
  client: 'codex';
  status: 'not_found' | 'active' | 'disabled' | 'ambiguous';
  config_path: string;
  registration_count: number;
  enabled?: boolean;
};

type CodexPluginMigrationOptions = {
  configPath?: string;
  makerHome?: string;
  confirm?: boolean;
};

export type CodexLegacyMakerMcpMigrationResult = CodexLegacyMakerMcpInspection & {
  action:
    | 'not_found'
    | 'not_owned'
    | 'already_disabled'
    | 'already_migrated'
    | 'already_restored'
    | 'disabled'
    | 'restored';
  changed: boolean;
  backup_path?: string;
  state_path?: string;
};

type CodexPluginMigrationState = {
  schema_version: 2;
  client: 'codex';
  config_path: string;
  previous_enabled: 'implicit' | 'true';
  original_registration_sha256: string;
  migrated_registration_sha256: string;
  migrated_at: string;
};

export function inspectCodexLegacyMakerMcp(
  options: CodexPluginMigrationOptions = {}
): CodexLegacyMakerMcpInspection {
  const configPath = options.configPath ?? path.join(os.homedir(), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return createInspection(configPath, 'not_found', 0);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const registrations = findCodexMakerMainTables(content);
  if (registrations.length === 0) {
    return createInspection(configPath, 'not_found', 0);
  }
  if (registrations.length > 1) {
    return createInspection(configPath, 'ambiguous', registrations.length);
  }

  const enabled = registrations[0].enabled;
  return {
    ...createInspection(configPath, enabled ? 'active' : 'disabled', 1),
    enabled,
  };
}

export function migrateCodexLegacyMakerMcp(
  options: CodexPluginMigrationOptions = {}
): CodexLegacyMakerMcpMigrationResult {
  const configPath = options.configPath ?? path.join(os.homedir(), '.codex', 'config.toml');
  const makerHome = options.makerHome ?? getMakerHome();
  const statePath = getCodexPluginMigrationStatePath(makerHome);
  const inspection = inspectCodexLegacyMakerMcp({ configPath });

  if (inspection.status === 'not_found') {
    return { ...inspection, action: 'not_found', changed: false };
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `Codex Maker MCP migration found ${inspection.registration_count} equivalent registrations; resolve the duplicate tables before migrating.`
    );
  }
  if (inspection.status === 'disabled') {
    const state = readMigrationState(statePath);
    const content = fs.readFileSync(configPath, 'utf8');
    const registration = findCodexMakerMainTables(content)[0];
    const owned =
      state?.config_path === configPath &&
      sha256(readCodexMakerRegistration(content, registration)) ===
        state.migrated_registration_sha256;
    return {
      ...inspection,
      action: owned ? 'already_migrated' : 'already_disabled',
      changed: false,
      ...(owned ? { state_path: statePath } : {}),
    };
  }
  if (!options.confirm) {
    throw new Error('Disabling the legacy Codex Maker MCP requires explicit confirmation.');
  }

  const previousContent = fs.readFileSync(configPath, 'utf8');
  const registration = findCodexMakerMainTables(previousContent)[0];
  const nextContent = disableCodexMakerRegistration(previousContent, registration);
  const state: CodexPluginMigrationState = {
    schema_version: 2,
    client: 'codex',
    config_path: configPath,
    previous_enabled: registration.enabledExplicitly ? 'true' : 'implicit',
    original_registration_sha256: sha256(readCodexMakerRegistration(previousContent, registration)),
    migrated_registration_sha256: sha256(
      readCodexMakerRegistration(nextContent, findCodexMakerMainTables(nextContent)[0])
    ),
    migrated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const write = writeConfigWithTapTapBackupIfChanged(configPath, nextContent, () => {
    const migratedInspection = inspectCodexLegacyMakerMcp({ configPath });
    if (migratedInspection.status !== 'disabled') {
      throw new Error('Codex Maker MCP migration validation did not find a disabled registration.');
    }
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  });
  return {
    ...inspectCodexLegacyMakerMcp({ configPath }),
    action: 'disabled',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

export function restoreCodexLegacyMakerMcp(
  options: CodexPluginMigrationOptions = {}
): CodexLegacyMakerMcpMigrationResult {
  const configPath = options.configPath ?? path.join(os.homedir(), '.codex', 'config.toml');
  const makerHome = options.makerHome ?? getMakerHome();
  const statePath = getCodexPluginMigrationStatePath(makerHome);
  const inspection = inspectCodexLegacyMakerMcp({ configPath });
  const state = readMigrationState(statePath);

  if (!state || state.config_path !== configPath) {
    return { ...inspection, action: 'not_owned', changed: false };
  }
  if (!options.confirm) {
    throw new Error('Restoring the legacy Codex Maker MCP requires explicit confirmation.');
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `Codex Maker MCP restoration found ${inspection.registration_count} equivalent registrations; resolve the duplicate tables before restoring.`
    );
  }
  if (inspection.status === 'not_found') {
    throw new Error(
      'The migrated Codex Maker MCP registration no longer exists and cannot be restored.'
    );
  }
  const previousContent = fs.readFileSync(configPath, 'utf8');
  const registration = findCodexMakerMainTables(previousContent)[0];
  const registrationSha256 = sha256(readCodexMakerRegistration(previousContent, registration));
  if (inspection.status === 'active') {
    if (registrationSha256 !== state.original_registration_sha256) {
      return { ...inspection, action: 'not_owned', changed: false };
    }
    fs.unlinkSync(statePath);
    return { ...inspection, action: 'already_restored', changed: false };
  }
  if (registrationSha256 !== state.migrated_registration_sha256) {
    return { ...inspection, action: 'not_owned', changed: false };
  }

  const nextContent = restoreCodexMakerRegistration(previousContent, registration, state);
  const write = writeConfigWithTapTapBackupIfChanged(configPath, nextContent, () => {
    const restoredInspection = inspectCodexLegacyMakerMcp({ configPath });
    if (restoredInspection.status !== 'active') {
      throw new Error(
        'Codex Maker MCP restoration validation did not find an active registration.'
      );
    }
    const restoredContent = fs.readFileSync(configPath, 'utf8');
    const restoredRegistration = findCodexMakerMainTables(restoredContent)[0];
    if (
      sha256(readCodexMakerRegistration(restoredContent, restoredRegistration)) !==
      state.original_registration_sha256
    ) {
      throw new Error('Codex Maker MCP restoration changed the migrated registration identity.');
    }
    fs.unlinkSync(statePath);
  });
  return {
    ...inspectCodexLegacyMakerMcp({ configPath }),
    action: 'restored',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

type CodexMakerMainTable = {
  headerStart: number;
  bodyStart: number;
  bodyEnd: number;
  enabled: boolean;
  enabledExplicitly: boolean;
  enabledValueStart?: number;
  enabledValueEnd?: number;
};

function findCodexMakerMainTables(content: string): CodexMakerMainTable[] {
  return findCodexMcpTables(content, 'taptap-maker')
    .filter((table) => table.isMain)
    .map((table) => {
      const enabledAssignment = findTomlBooleanAssignment(
        content,
        table.bodyStart,
        table.bodyEnd,
        'enabled'
      );
      return {
        headerStart: table.headerStart,
        bodyStart: table.bodyStart,
        bodyEnd: table.bodyEnd,
        enabled: enabledAssignment?.value !== false,
        enabledExplicitly: Boolean(enabledAssignment),
        ...(enabledAssignment
          ? {
              enabledValueStart: enabledAssignment.valueStart,
              enabledValueEnd: enabledAssignment.valueEnd,
            }
          : {}),
      };
    });
}

function disableCodexMakerRegistration(content: string, registration: CodexMakerMainTable): string {
  if (registration.enabledValueStart !== undefined && registration.enabledValueEnd !== undefined) {
    return `${content.slice(0, registration.enabledValueStart)}false${content.slice(
      registration.enabledValueEnd
    )}`;
  }
  return `${content.slice(0, registration.bodyStart)}\nenabled = false${content.slice(
    registration.bodyStart
  )}`;
}

function restoreCodexMakerRegistration(
  content: string,
  registration: CodexMakerMainTable,
  state: CodexPluginMigrationState
): string {
  if (state.previous_enabled === 'true') {
    if (
      registration.enabledValueStart === undefined ||
      registration.enabledValueEnd === undefined
    ) {
      throw new Error('The migrated Codex Maker MCP enabled value is missing.');
    }
    return `${content.slice(0, registration.enabledValueStart)}true${content.slice(
      registration.enabledValueEnd
    )}`;
  }

  const insertedLine = '\nenabled = false';
  if (!content.startsWith(insertedLine, registration.bodyStart)) {
    throw new Error('The plugin-owned Codex Maker MCP disabled marker was modified.');
  }
  return `${content.slice(0, registration.bodyStart)}${content.slice(
    registration.bodyStart + insertedLine.length
  )}`;
}

function readCodexMakerRegistration(content: string, registration: CodexMakerMainTable): string {
  return content.slice(registration.headerStart, registration.bodyEnd).trimEnd();
}

function getCodexPluginMigrationStatePath(makerHome: string): string {
  return path.join(makerHome, 'plugin-migrations', 'codex.json');
}

function readMigrationState(statePath: string): CodexPluginMigrationState | undefined {
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as CodexPluginMigrationState;
    return state?.schema_version === 2 && state.client === 'codex' ? state : undefined;
  } catch {
    return undefined;
  }
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createInspection(
  configPath: string,
  status: CodexLegacyMakerMcpInspection['status'],
  registrationCount: number
): CodexLegacyMakerMcpInspection {
  return {
    client: 'codex',
    status,
    config_path: configPath,
    registration_count: registrationCount,
  };
}

export type WorkBuddyLegacyMakerMcpInspection = {
  client: 'workbuddy';
  status: 'not_found' | 'active' | 'disabled' | 'ambiguous';
  config_path: string;
  config_paths: string[];
  registration_count: number;
  enabled?: boolean;
};

type WorkBuddyPluginMigrationOptions = {
  configPaths?: string[];
  makerHome?: string;
  confirm?: boolean;
};

export type WorkBuddyLegacyMakerMcpMigrationResult = WorkBuddyLegacyMakerMcpInspection & {
  action:
    | 'not_found'
    | 'not_owned'
    | 'already_disabled'
    | 'already_migrated'
    | 'already_restored'
    | 'disabled'
    | 'restored';
  changed: boolean;
  backup_path?: string;
  state_path?: string;
};

type WorkBuddyPluginMigrationState = {
  schema_version: 1;
  client: 'workbuddy';
  config_path: string;
  previous_disabled: 'missing' | false;
  original_registration_sha256: string;
  migrated_registration_sha256: string;
  migrated_at: string;
};

type WorkBuddyMakerRegistration = {
  configPath: string;
  config: Record<string, unknown>;
  registration: Record<string, unknown>;
};

export function inspectWorkBuddyLegacyMakerMcp(
  options: WorkBuddyPluginMigrationOptions = {}
): WorkBuddyLegacyMakerMcpInspection {
  const configPaths = getWorkBuddyConfigPaths(options.configPaths);
  const registrations = findWorkBuddyMakerRegistrations(configPaths);
  const registrationPaths = registrations.map((entry) => entry.configPath);

  if (registrations.length === 0) {
    return createWorkBuddyInspection(configPaths[0], 'not_found', []);
  }
  if (registrations.length > 1) {
    return createWorkBuddyInspection(configPaths[0], 'ambiguous', registrationPaths);
  }

  const enabled = registrations[0].registration.disabled !== true;
  return {
    ...createWorkBuddyInspection(
      registrations[0].configPath,
      enabled ? 'active' : 'disabled',
      registrationPaths
    ),
    enabled,
  };
}

export function migrateWorkBuddyLegacyMakerMcp(
  options: WorkBuddyPluginMigrationOptions = {}
): WorkBuddyLegacyMakerMcpMigrationResult {
  const configPaths = getWorkBuddyConfigPaths(options.configPaths);
  const makerHome = options.makerHome ?? getMakerHome();
  const statePath = getWorkBuddyPluginMigrationStatePath(makerHome);
  const inspection = inspectWorkBuddyLegacyMakerMcp({ configPaths });

  if (inspection.status === 'not_found') {
    return { ...inspection, action: 'not_found', changed: false };
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `WorkBuddy Maker MCP migration found registrations in multiple config files: ${inspection.config_paths.join(', ')}`
    );
  }

  const current = findWorkBuddyMakerRegistrations(configPaths)[0];
  if (inspection.status === 'disabled') {
    const state = readWorkBuddyMigrationState(statePath);
    const owned =
      state?.config_path === current.configPath &&
      hashWorkBuddyRegistration(current.registration) === state.migrated_registration_sha256;
    return {
      ...inspection,
      action: owned ? 'already_migrated' : 'already_disabled',
      changed: false,
      ...(owned ? { state_path: statePath } : {}),
    };
  }
  if (!options.confirm) {
    throw new Error('Disabling the legacy WorkBuddy Maker MCP requires explicit confirmation.');
  }

  const originalRegistration = { ...current.registration };
  const previousDisabled = Object.prototype.hasOwnProperty.call(originalRegistration, 'disabled')
    ? false
    : 'missing';
  const migratedRegistration = { ...originalRegistration, disabled: true };
  setWorkBuddyMakerRegistration(current.config, migratedRegistration);
  const nextContent = `${JSON.stringify(current.config, null, 2)}\n`;
  const state: WorkBuddyPluginMigrationState = {
    schema_version: 1,
    client: 'workbuddy',
    config_path: current.configPath,
    previous_disabled: previousDisabled,
    original_registration_sha256: hashWorkBuddyRegistration(originalRegistration),
    migrated_registration_sha256: hashWorkBuddyRegistration(migratedRegistration),
    migrated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const write = writeConfigWithTapTapBackupIfChanged(current.configPath, nextContent, () => {
    const migratedInspection = inspectWorkBuddyLegacyMakerMcp({ configPaths });
    if (
      migratedInspection.status !== 'disabled' ||
      migratedInspection.config_path !== current.configPath
    ) {
      throw new Error(
        'WorkBuddy Maker MCP migration validation did not find the disabled registration.'
      );
    }
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  });
  return {
    ...inspectWorkBuddyLegacyMakerMcp({ configPaths }),
    action: 'disabled',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

export function restoreWorkBuddyLegacyMakerMcp(
  options: WorkBuddyPluginMigrationOptions = {}
): WorkBuddyLegacyMakerMcpMigrationResult {
  const configPaths = getWorkBuddyConfigPaths(options.configPaths);
  const makerHome = options.makerHome ?? getMakerHome();
  const statePath = getWorkBuddyPluginMigrationStatePath(makerHome);
  const inspection = inspectWorkBuddyLegacyMakerMcp({ configPaths });
  const state = readWorkBuddyMigrationState(statePath);

  if (!state) {
    return { ...inspection, action: 'not_owned', changed: false };
  }
  if (!options.confirm) {
    throw new Error('Restoring the legacy WorkBuddy Maker MCP requires explicit confirmation.');
  }
  if (inspection.status === 'ambiguous') {
    throw new Error(
      `WorkBuddy Maker MCP restoration found registrations in multiple config files: ${inspection.config_paths.join(', ')}`
    );
  }
  if (inspection.status === 'not_found') {
    throw new Error(
      'The migrated WorkBuddy Maker MCP registration no longer exists and cannot be restored.'
    );
  }
  if (inspection.config_path !== state.config_path) {
    return { ...inspection, action: 'not_owned', changed: false };
  }

  const current = findWorkBuddyMakerRegistrations(configPaths)[0];
  const registrationSha256 = hashWorkBuddyRegistration(current.registration);
  if (inspection.status === 'active') {
    if (registrationSha256 !== state.original_registration_sha256) {
      return { ...inspection, action: 'not_owned', changed: false };
    }
    fs.unlinkSync(statePath);
    return { ...inspection, action: 'already_restored', changed: false };
  }
  if (registrationSha256 !== state.migrated_registration_sha256) {
    return { ...inspection, action: 'not_owned', changed: false };
  }

  const restoredRegistration = { ...current.registration };
  if (state.previous_disabled === 'missing') {
    delete restoredRegistration.disabled;
  } else {
    restoredRegistration.disabled = false;
  }
  setWorkBuddyMakerRegistration(current.config, restoredRegistration);
  const nextContent = `${JSON.stringify(current.config, null, 2)}\n`;
  const write = writeConfigWithTapTapBackupIfChanged(current.configPath, nextContent, () => {
    const restoredInspection = inspectWorkBuddyLegacyMakerMcp({ configPaths });
    if (restoredInspection.status !== 'active') {
      throw new Error(
        'WorkBuddy Maker MCP restoration validation did not find an active registration.'
      );
    }
    const restored = findWorkBuddyMakerRegistrations(configPaths)[0];
    if (hashWorkBuddyRegistration(restored.registration) !== state.original_registration_sha256) {
      throw new Error('WorkBuddy Maker MCP restoration changed the registration identity.');
    }
    fs.unlinkSync(statePath);
  });
  return {
    ...inspectWorkBuddyLegacyMakerMcp({ configPaths }),
    action: 'restored',
    changed: write.changed,
    ...(write.backupPath ? { backup_path: write.backupPath } : {}),
    state_path: statePath,
  };
}

function getWorkBuddyConfigPaths(configPaths?: string[]): string[] {
  return (
    configPaths ?? [
      path.join(os.homedir(), '.workbuddy', 'mcp.json'),
      path.join(os.homedir(), '.workbuddy', '.mcp.json'),
    ]
  );
}

function findWorkBuddyMakerRegistrations(configPaths: string[]): WorkBuddyMakerRegistration[] {
  const registrations: WorkBuddyMakerRegistration[] = [];
  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) {
      continue;
    }
    let config: unknown;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Cannot parse WorkBuddy MCP config ${configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!isRecord(config)) {
      throw new Error(`WorkBuddy MCP config must contain a JSON object: ${configPath}`);
    }
    const servers = config.mcpServers;
    if (servers === undefined) {
      continue;
    }
    if (!isRecord(servers)) {
      throw new Error(`WorkBuddy MCP config mcpServers must be an object: ${configPath}`);
    }
    const registration = servers['taptap-maker'];
    if (registration === undefined) {
      continue;
    }
    if (!isRecord(registration)) {
      throw new Error(`WorkBuddy taptap-maker MCP registration must be an object: ${configPath}`);
    }
    registrations.push({ configPath, config, registration });
  }
  return registrations;
}

function setWorkBuddyMakerRegistration(
  config: Record<string, unknown>,
  registration: Record<string, unknown>
): void {
  const servers = config.mcpServers;
  if (!isRecord(servers)) {
    throw new Error('WorkBuddy MCP config mcpServers must be an object.');
  }
  servers['taptap-maker'] = registration;
}

function getWorkBuddyPluginMigrationStatePath(makerHome: string): string {
  return path.join(makerHome, 'plugin-migrations', 'workbuddy.json');
}

function readWorkBuddyMigrationState(statePath: string): WorkBuddyPluginMigrationState | undefined {
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as WorkBuddyPluginMigrationState;
    return state?.schema_version === 1 && state.client === 'workbuddy' ? state : undefined;
  } catch {
    return undefined;
  }
}

function hashWorkBuddyRegistration(registration: Record<string, unknown>): string {
  return sha256(JSON.stringify(registration));
}

function createWorkBuddyInspection(
  configPath: string,
  status: WorkBuddyLegacyMakerMcpInspection['status'],
  configPaths: string[]
): WorkBuddyLegacyMakerMcpInspection {
  return {
    client: 'workbuddy',
    status,
    config_path: configPath,
    config_paths: configPaths,
    registration_count: configPaths.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
