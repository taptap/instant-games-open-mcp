import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getMakerHome, loadProjectConfig } from '../storage.js';
export { writePrivateJson } from '../system/privateJson.js';

export const PREVIEW_PROTOCOL_VERSION = 1;

export type PreviewState = 'starting' | 'running' | 'reloading' | 'failed' | 'stopped';
export type PreviewVerdict = 'PASS' | 'FAIL' | 'UNDETERMINED' | 'CANCELLED' | 'TIMEOUT';
export type PreviewIdentity = {
  protocol_version: number;
  project_realpath: string;
  session_id: string;
  reload_id: number;
};
export type RuntimeInfo = {
  protocol_version: number;
  runtime_version: string;
  platform: string;
  arch: string;
  capabilities: string[];
};
export type PreviewRecord = PreviewIdentity & {
  token: string;
  supervisor_id: string;
  supervisor_pid: number;
  started_at: string;
  port: number;
  executable: string;
  state: PreviewState;
  runtime: RuntimeInfo;
};

export function previewProject(targetDir: string): string {
  if (!targetDir || !path.isAbsolute(targetDir)) {
    throw new Error('Preview requires --target-dir with the real Maker project absolute path.');
  }
  const project = fs.realpathSync(targetDir);
  if (!fs.statSync(project).isDirectory() || !loadProjectConfig(project)) {
    throw new Error('Preview requires a bound Maker project with .maker-mcp/config.json.');
  }
  return project;
}

export function previewDirectory(project: string): string {
  return path.join(getMakerHome(), 'preview', createHash('sha256').update(project).digest('hex'));
}

export function readPreviewRecord(project: string): PreviewRecord | undefined {
  const filename = path.join(previewDirectory(project), 'session.json');
  if (!fs.existsSync(filename)) return undefined;
  const record = JSON.parse(fs.readFileSync(filename, 'utf8')) as PreviewRecord;
  if (
    record.project_realpath !== project ||
    record.protocol_version !== PREVIEW_PROTOCOL_VERSION ||
    !/^[a-f0-9]{64}$/.test(record.token) ||
    !Number.isInteger(record.port) ||
    record.port < 0 ||
    record.port > 65535 ||
    !Number.isInteger(record.supervisor_pid) ||
    record.supervisor_pid < 0 ||
    !/^[0-9a-f-]{36}$/.test(record.session_id) ||
    !record.supervisor_id ||
    !Number.isSafeInteger(record.reload_id) ||
    record.reload_id < 0 ||
    !record.started_at ||
    !path.isAbsolute(record.executable)
  ) {
    throw new Error('Invalid preview session record; refusing to manage an unverified process.');
  }
  return record;
}

export function previewRoundDirectory(record: PreviewIdentity): string {
  return path.join(
    previewDirectory(record.project_realpath),
    'sessions',
    record.session_id,
    String(record.reload_id)
  );
}

export function samePreviewIdentity(
  value: Partial<PreviewIdentity>,
  expected: PreviewIdentity
): boolean {
  return (
    value.protocol_version === expected.protocol_version &&
    value.project_realpath === expected.project_realpath &&
    value.session_id === expected.session_id &&
    value.reload_id === expected.reload_id
  );
}

export function projectEntry(project: string): string {
  const read = (name: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(project, '.project', name), 'utf8'));
  const settings = read('project.json');
  const resources = read('resources.json');
  const entry =
    settings['entry@client'] || settings.entry || resources['entry@client'] || resources.entry;
  if (typeof entry !== 'string' || !entry.endsWith('.lua') || path.isAbsolute(entry)) {
    throw new Error('Local preview needs a Lua entry in .project/project.json or resources.json.');
  }
  const scripts = fs.realpathSync(path.join(project, 'scripts'));
  const resolved = fs.realpathSync(path.join(scripts, entry));
  const relative = path.relative(scripts, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(resolved).isFile()) {
    throw new Error('Preview entry must be a file inside the project scripts directory.');
  }
  return entry;
}
