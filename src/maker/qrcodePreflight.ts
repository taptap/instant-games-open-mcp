/**
 * Local preflight for the remote Maker test QR code tool.
 */

import fs from 'node:fs';
import path from 'node:path';

export type MakerScreenOrientation = 'landscape' | 'portrait';

export type MakerQrcodePreflightResult =
  | { ok: true; orientation: MakerScreenOrientation }
  | { ok: false; message: string };

/**
 * Reuses the immutable project orientation, or records the user's first explicit choice.
 */
export function inspectMakerQrcodePreflight(
  projectRoot: string,
  confirmedOrientation: unknown
): MakerQrcodePreflightResult {
  const projectJsonPath = path.join(path.resolve(projectRoot), '.project', 'project.json');
  let project: unknown;
  try {
    project = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
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
  if (configuredOrientation) {
    return { ok: true, orientation: configuredOrientation };
  }

  if (!isScreenOrientation(confirmedOrientation)) {
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

  project.taptap_publish.screen_orientation = confirmedOrientation;
  try {
    fs.writeFileSync(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  } catch (error) {
    return {
      ok: false,
      message: [
        'Maker QR project orientation could not be saved.',
        `- config: ${projectJsonPath}`,
        `- error: ${error instanceof Error ? error.message : String(error)}`,
        '- next_action: Fix the project configuration write error, then retry.',
      ].join('\n'),
    };
  }

  return { ok: true, orientation: confirmedOrientation };
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
