/**
 * Local preflight for the remote Maker test QR code tool.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inspectMakerProjectHealth, isConfiguredTitle } from './projectSettings.js';
import { isDeveloperId } from './qrcodeInteraction.js';

export type MakerScreenOrientation = 'landscape' | 'portrait';
export const MAKER_QR_CATEGORIES = [
  'rpg',
  'casual',
  'action',
  'strategy',
  'simulation',
  'trivia',
  'arcade',
  'adventure',
  'card',
  'sports',
  'racing',
  'puzzle',
  'educational',
  'music',
  'word',
  'board',
] as const;
export type MakerQrcodePublication = { title?: string; category?: string; developer_id?: number };

export type MakerQrcodePreparation =
  | { status: 'ready' }
  | { status: 'needs_initialization'; message: string; action: 'build' }
  | { status: 'blocked'; message: string };

export function inspectMakerQrcodePreparation(projectRoot: string): MakerQrcodePreparation {
  const health = inspectMakerProjectHealth(projectRoot, 'qrcode');
  const fillable = new Set([
    'taptap_publish.title',
    'taptap_publish.category',
    'taptap_publish.screen_orientation',
  ]);
  const blocking = health.issues.filter(
    (item) =>
      item.severity === 'error' && item.code !== 'missing_required_file' && !fillable.has(item.path)
  );
  if (blocking.length)
    return {
      status: 'blocked',
      message: '请先修复项目配置：' + blocking.map((item) => item.message).join('；'),
    };
  if (
    health.status === 'not_initialized' ||
    health.issues.some(
      (item) => item.code === 'missing_required_file' || item.code === 'missing_settings_json'
    )
  )
    return {
      status: 'needs_initialization',
      action: 'build',
      message:
        '项目配置尚未初始化。请先明确确认并执行一次构建，再重新打开测试二维码；若构建后仍缺配置，请修复配置，不要重复构建。',
    };
  return { status: 'ready' };
}

export function validQrcodePublication(value: unknown): value is MakerQrcodePublication {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ['title', 'category', 'developer_id'].includes(key)) &&
    (value.developer_id === undefined || isDeveloperId(value.developer_id)) &&
    (value.title === undefined || (isConfiguredTitle(value.title) && value.title.length <= 200)) &&
    (value.category === undefined || MAKER_QR_CATEGORIES.includes(value.category as never))
  );
}

export type MakerQrcodePreflightResult =
  | { ok: true; orientation: MakerScreenOrientation }
  | { ok: false; message: string };

/**
 * Reuses the immutable project orientation, or records the user's first explicit choice.
 */
export function inspectMakerQrcodePreflight(
  projectRoot: string,
  confirmedOrientation: unknown,
  publication?: MakerQrcodePublication
): MakerQrcodePreflightResult {
  if (publication !== undefined && !validQrcodePublication(publication))
    return { ok: false, message: 'Invalid confirmed QR title or game category.' };
  const projectJsonPath = path.join(path.resolve(projectRoot), '.project', 'project.json');
  let projectJsonText: string;
  let project: unknown;
  try {
    projectJsonText = fs.readFileSync(projectJsonPath, 'utf8');
    project = JSON.parse(projectJsonText);
  } catch (error) {
    return {
      ok: false,
      message: [
        'Maker QR project configuration is not ready.',
        `- config: ${projectJsonPath}`,
        `- error: ${error instanceof Error ? error.message : String(error)}`,
        '- next_action: Restore or initialize .project/project.json, then retry.',
      ].join('\n'),
    };
  }

  const configuredOrientation = readConfiguredOrientation(project);
  if (configuredOrientation && publication === undefined) {
    return { ok: true, orientation: configuredOrientation };
  }

  if (!configuredOrientation && !isScreenOrientation(confirmedOrientation)) {
    return {
      ok: false,
      message: [
        'Maker QR orientation is not configured yet.',
        '- field: taptap_publish.screen_orientation',
        '- next_action: Ask the user in a separate conversation turn to choose landscape or portrait, then retry with confirmed_screen_orientation.',
        '- do_not: Do not infer or default the game orientation.',
      ].join('\n'),
    };
  }

  if (!isRecord(project) || !isRecord(project.taptap_publish)) {
    return {
      ok: false,
      message: [
        'Maker QR project publishing configuration is not ready.',
        '- missing: taptap_publish',
        '- next_action: Restore or initialize the taptap_publish configuration, then retry.',
      ].join('\n'),
    };
  }

  const orientation = configuredOrientation || (confirmedOrientation as MakerScreenOrientation);
  if (publication?.developer_id !== undefined) {
    const existing = project.taptap_publish.developer_id;
    if (existing !== undefined && existing !== null && existing !== publication.developer_id)
      return {
        ok: false,
        message:
          'Developer configuration has changed; check the existing developer_id before continuing.',
      };
    project.taptap_publish.developer_id = publication.developer_id;
  }
  if (publication?.title !== undefined && !isConfiguredTitle(project.taptap_publish.title))
    project.taptap_publish.title = publication.title.trim();
  if (
    publication?.category !== undefined &&
    !MAKER_QR_CATEGORIES.includes(project.taptap_publish.category as never)
  )
    project.taptap_publish.category = publication.category;
  project.taptap_publish.screen_orientation = orientation;
  if (JSON.stringify(project) === JSON.stringify(JSON.parse(projectJsonText)))
    return { ok: true, orientation };
  const tempPath = `${projectJsonPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(project, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    if (fs.readFileSync(projectJsonPath, 'utf8') !== projectJsonText) {
      throw new Error('Maker QR project configuration changed while saving; retry the operation.');
    }
    fs.renameSync(tempPath, projectJsonPath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original persistence error in the tool result.
    }
    return {
      ok: false,
      message: [
        'Maker QR project publishing configuration could not be saved.',
        `- config: ${projectJsonPath}`,
        `- error: ${error instanceof Error ? error.message : String(error)}`,
        '- next_action: Fix the project configuration write error, then retry.',
      ].join('\n'),
    };
  }

  return { ok: true, orientation };
}

function readConfiguredOrientation(project: unknown): MakerScreenOrientation | undefined {
  if (!isRecord(project) || !isRecord(project.taptap_publish)) {
    return undefined;
  }
  const orientation = project.taptap_publish.screen_orientation;
  return isScreenOrientation(orientation) ? orientation : undefined;
}

function isScreenOrientation(value: unknown): value is MakerScreenOrientation {
  return value === 'landscape' || value === 'portrait';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
