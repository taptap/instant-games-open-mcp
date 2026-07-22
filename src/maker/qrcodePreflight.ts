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
 * Requires an explicit user choice and verifies it matches the project source config.
 */
export function inspectMakerQrcodePreflight(
  projectRoot: string,
  confirmedOrientation: unknown
): MakerQrcodePreflightResult {
  if (!isScreenOrientation(confirmedOrientation)) {
    return {
      ok: false,
      message: [
        'Maker QR orientation confirmation required.',
        '- next_action: Ask the user in a separate conversation turn to choose landscape or portrait.',
        '- do_not: Do not infer or default the game orientation.',
      ].join('\n'),
    };
  }

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
  if (!configuredOrientation) {
    return {
      ok: false,
      message: [
        'Maker QR project orientation is not configured.',
        '- field: taptap_publish.screen_orientation',
        '- expected: landscape or portrait',
        '- next_action: Update .project/project.json with the user-selected orientation, run maker_build_current_directory to sync it, then retry.',
      ].join('\n'),
    };
  }

  if (configuredOrientation !== confirmedOrientation) {
    return {
      ok: false,
      message: [
        'Maker QR orientation confirmation does not match the project configuration.',
        `- confirmed_screen_orientation: ${confirmedOrientation}`,
        `- configured_screen_orientation: ${configuredOrientation}`,
        '- next_action: Update and sync .project/project.json or ask the user to confirm the configured orientation, then retry.',
      ].join('\n'),
    };
  }

  return { ok: true, orientation: configuredOrientation };
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
