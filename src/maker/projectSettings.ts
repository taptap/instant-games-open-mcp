/**
 * Lightweight Maker project settings health checks.
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_SOURCE_TAGS = ['stable'];

export type MakerProjectSettingsStatus = {
  status: 'ready' | 'missing_settings_json' | 'invalid_settings_json' | 'invalid_project_settings';
  projectRoot: string;
  settingsJsonPath: string;
  issues?: string[];
  error?: string;
};

export function inspectMakerProjectSettings(projectRoot: string): MakerProjectSettingsStatus {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const settingsJsonPath = path.join(resolvedProjectRoot, '.project', 'settings.json');
  const baseStatus = {
    projectRoot: resolvedProjectRoot,
    settingsJsonPath,
  };

  if (!fs.existsSync(settingsJsonPath)) {
    return {
      ...baseStatus,
      status: 'missing_settings_json',
    };
  }

  let settings: unknown;
  try {
    settings = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8'));
  } catch (error) {
    return {
      ...baseStatus,
      status: 'invalid_settings_json',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const issues = validateMakerProjectSettings(settings);
  if (issues.length > 0) {
    return {
      ...baseStatus,
      status: 'invalid_project_settings',
      issues,
    };
  }

  return {
    ...baseStatus,
    status: 'ready',
  };
}

export function formatMakerProjectSettingsStatus(status: MakerProjectSettingsStatus): string {
  if (status.status === 'ready' || status.status === 'missing_settings_json') {
    return '';
  }

  const lines = [
    'Maker project settings',
    '',
    `- status: ${status.status}`,
    `- config: ${status.settingsJsonPath}`,
    '- impact: 构建可能失败或游戏黑屏；坏配置不应提交到 Maker 远端。',
  ];
  if (status.error) {
    lines.push(`- error: ${status.error}`);
  }
  if (status.issues?.length) {
    lines.push('- issues:');
    lines.push(...status.issues.map((issue) => `  - ${issue}`));
  }
  lines.push(
    '- next_action: 恢复 .project/settings.json 的构建关键字段后再构建；保留合法的 @runtime 配置。'
  );
  return lines.join('\n');
}

export function isMakerProjectSettingsBlocking(status: MakerProjectSettingsStatus): boolean {
  return status.status === 'invalid_settings_json' || status.status === 'invalid_project_settings';
}

function validateMakerProjectSettings(settings: unknown): string[] {
  const issues: string[] = [];
  if (!isPlainObject(settings)) {
    return ['settings.json must be a JSON object'];
  }

  expectValue(settings, '$schema', '../schemas/settings.schema.json', issues);

  const sources = readPath(settings, 'sources');
  if (!isPlainObject(sources)) {
    issues.push('sources must be an object');
  } else {
    expectOneOf(settings, 'sources.engine.tag', REQUIRED_SOURCE_TAGS, issues);
    expectOneOf(settings, 'sources.engine-res.tag', REQUIRED_SOURCE_TAGS, issues);
    expectOneOf(settings, 'sources.official-res.tag', REQUIRED_SOURCE_TAGS, issues);
  }

  const build = readPath(settings, 'build');
  if (!isPlainObject(build)) {
    issues.push('build must be an object');
    return issues;
  }

  expectValue(settings, 'build.generate_fs_path', true, issues);
  expectValue(settings, 'build.output_dir', '../dist', issues);

  const assetDirs = readPath(build, 'asset_dirs');
  if (!isStringArray(assetDirs) || !sameStringSet(assetDirs, ['../assets', '../scripts'])) {
    issues.push('build.asset_dirs must contain only "../assets" and "../scripts"');
  }

  if (readPath(build, 'asset_ignores') === undefined) {
    issues.push('build.asset_ignores must exist');
  }

  return issues;
}

function expectValue(
  settings: Record<string, unknown>,
  fieldPath: string,
  expected: string | boolean,
  issues: string[]
): void {
  if (readPath(settings, fieldPath) !== expected) {
    issues.push(`${fieldPath} must be ${JSON.stringify(expected)}`);
  }
}

function expectOneOf(
  settings: Record<string, unknown>,
  fieldPath: string,
  expectedValues: string[],
  issues: string[]
): void {
  if (!expectedValues.includes(String(readPath(settings, fieldPath)))) {
    issues.push(
      `${fieldPath} must be ${expectedValues.map((value) => JSON.stringify(value)).join(' or ')}`
    );
  }
}

function readPath(value: Record<string, unknown>, fieldPath: string): unknown {
  let current: unknown = value;
  for (const segment of fieldPath.split('.')) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && right.every((item) => left.includes(item));
}
