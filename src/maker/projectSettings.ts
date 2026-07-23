/**
 * Lightweight Maker project health checks and settings validation.
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_SOURCE_TAGS = ['stable'];

export type MakerProjectHealthMode = 'status' | 'build' | 'qrcode';

export type MakerProjectHealthIssue = {
  code:
    | 'invalid_path_type'
    | 'missing_required_file'
    | 'missing_settings_json'
    | 'misplaced_config'
    | 'invalid_project_json'
    | 'invalid_settings_json'
    | 'invalid_project_settings'
    | 'invalid_resources_json'
    | 'invalid_project_field'
    | 'invalid_publish_field';
  severity: 'warning' | 'error';
  path: string;
  message: string;
  expectedPath?: string;
};

export type MakerProjectHealthStatus =
  | 'not_initialized'
  | 'ready'
  | 'warning'
  | 'error'
  | 'misplaced_config';

export type MakerProjectHealth = {
  projectRoot: string;
  mode: MakerProjectHealthMode;
  status: MakerProjectHealthStatus;
  canBuild: boolean;
  canGenerateTestQrcode: boolean;
  paths: {
    projectDir: string;
    projectJson: string;
    resourcesJson: string;
    settingsJson: string;
  };
  issues: MakerProjectHealthIssue[];
};

export type MakerProjectSettingsStatus = {
  status: 'ready' | 'missing_settings_json' | 'invalid_settings_json' | 'invalid_project_settings';
  projectRoot: string;
  settingsJsonPath: string;
  issues?: string[];
  error?: string;
};

/**
 * Performs the shared, fixed-path Maker project health check.
 *
 * The checker intentionally avoids recursive scans, Git, network calls, and
 * full schema validation so it can run before every local status/build/QR
 * operation without affecting the user-visible latency.
 */
export function inspectMakerProjectHealth(
  projectRoot: string,
  mode: MakerProjectHealthMode = 'status'
): MakerProjectHealth {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const paths = {
    projectDir: path.join(resolvedProjectRoot, '.project'),
    projectJson: path.join(resolvedProjectRoot, '.project', 'project.json'),
    resourcesJson: path.join(resolvedProjectRoot, '.project', 'resources.json'),
    settingsJson: path.join(resolvedProjectRoot, '.project', 'settings.json'),
  };
  const issues: MakerProjectHealthIssue[] = [];
  const projectDirState = inspectPath(paths.projectDir, 'directory');

  if (projectDirState === 'wrong_type') {
    issues.push(issue('invalid_path_type', 'error', '.project', '.project 必须是目录'));
  }

  const rootCandidates = [
    ['project.json', paths.projectJson],
    ['resources.json', paths.resourcesJson],
    ['settings.json', paths.settingsJson],
    ['assets/project.json', paths.projectJson],
  ] as const;
  for (const [name, canonicalPath] of rootCandidates) {
    const rootPath = path.join(resolvedProjectRoot, name);
    const rootState = inspectPath(rootPath, 'file');
    if (rootState === 'file' && inspectPath(canonicalPath, 'file') !== 'file') {
      if (
        name === 'assets/project.json' &&
        !hasTapTapPublish(path.join(resolvedProjectRoot, name))
      ) {
        continue;
      }
      if (name !== 'assets/project.json' && !hasMakerRootConfigSignature(rootPath, name)) {
        continue;
      }
      issues.push({
        code: 'misplaced_config',
        severity: 'error',
        path: name,
        expectedPath: path.relative(resolvedProjectRoot, canonicalPath),
        message: `${name} 位于项目根目录，规范位置应为 ${path.relative(resolvedProjectRoot, canonicalPath)}`,
      });
    }
  }

  const projectDirExists = projectDirState === 'directory';
  const projectJsonState = projectDirExists ? inspectPath(paths.projectJson, 'file') : 'missing';
  const resourcesJsonState = projectDirExists
    ? inspectPath(paths.resourcesJson, 'file')
    : 'missing';
  const settingsJsonState = projectDirExists ? inspectPath(paths.settingsJson, 'file') : 'missing';
  const projectJsonExists = projectJsonState === 'file';
  const resourcesJsonExists = resourcesJsonState === 'file';
  const settingsJsonExists = settingsJsonState === 'file';
  const hasMisplacedConfig = issues.some((item) => item.code === 'misplaced_config');
  const hasNoPrimaryConfig = projectJsonState === 'missing' && settingsJsonState === 'missing';

  if (hasNoPrimaryConfig && !hasMisplacedConfig && issues.length === 0) {
    return createHealthResult(
      resolvedProjectRoot,
      mode,
      'not_initialized',
      paths,
      issues,
      true,
      false
    );
  }

  addCanonicalFileIssue(projectJsonState, '.project/project.json', issues, mode === 'qrcode');
  addCanonicalFileIssue(resourcesJsonState, '.project/resources.json', issues, mode === 'qrcode');
  addCanonicalFileIssue(settingsJsonState, '.project/settings.json', issues, false);
  if (projectJsonExists && settingsJsonState === 'missing') {
    issues.push(
      issue(
        'missing_settings_json',
        'warning',
        '.project/settings.json',
        '.project/settings.json 缺失，首次构建可能由 server 创建'
      )
    );
  }
  const project = projectJsonExists
    ? readHealthJson(paths.projectJson, 'project.json', issues)
    : undefined;
  const resources = resourcesJsonExists
    ? readHealthJson(paths.resourcesJson, 'resources.json', issues)
    : undefined;
  const settings = settingsJsonExists
    ? readHealthJson(paths.settingsJson, 'settings.json', issues)
    : undefined;

  if (project !== undefined && !isPlainObject(project)) {
    issues.push(
      issue(
        'invalid_project_json',
        'error',
        '.project/project.json',
        'project.json 必须是 JSON object'
      )
    );
  } else if (project && isPlainObject(project)) {
    validateProjectFields(project, resources, issues, mode);
  }
  if (resources !== undefined && !isPlainObject(resources)) {
    issues.push(
      issue(
        'invalid_resources_json',
        'error',
        '.project/resources.json',
        'resources.json 必须是 JSON object'
      )
    );
  }
  if (settings !== undefined) {
    if (!isPlainObject(settings)) {
      issues.push(
        issue(
          'invalid_settings_json',
          'error',
          '.project/settings.json',
          'settings.json 必须是 JSON object'
        )
      );
    } else {
      const settingsIssues = validateMakerProjectSettings(settings);
      if (settingsIssues.length > 0) {
        issues.push(
          issue(
            'invalid_project_settings',
            'error',
            '.project/settings.json',
            settingsIssues.join('; ')
          )
        );
      }
    }
  }

  const hasFatalIssues = issues.some((item) => item.severity === 'error');
  const hasCompletePrimaryConfig = projectJsonExists && settingsJsonExists;
  const status: MakerProjectHealthStatus = hasMisplacedConfig
    ? 'misplaced_config'
    : hasFatalIssues
      ? 'error'
      : !hasCompletePrimaryConfig
        ? 'not_initialized'
        : issues.length > 0
          ? 'warning'
          : 'ready';
  const canBuild = !issues.some((item) => item.severity === 'error' && isBuildBlockingIssue(item));
  const canGenerateTestQrcode = canGenerateQrcode(project, resources, settingsJsonExists, issues);

  return createHealthResult(
    resolvedProjectRoot,
    mode,
    status,
    paths,
    issues,
    canBuild,
    canGenerateTestQrcode
  );
}

export function formatMakerProjectHealthStatus(health: MakerProjectHealth): string {
  if (health.status === 'ready' && health.issues.length === 0 && health.canGenerateTestQrcode) {
    return '';
  }

  const lines = [
    'Maker project structure',
    '',
    `- status: ${health.status}`,
    `- can_build: ${health.canBuild ? 'yes' : 'no'}`,
    `- can_generate_test_qrcode: ${health.canGenerateTestQrcode ? 'yes' : 'no'}`,
  ];
  if (health.issues.length > 0) {
    lines.push('- issues:');
    lines.push(
      ...health.issues.map(
        (item) =>
          `  - [${item.severity}] ${item.code}: ${item.path} - ${item.message}${
            item.expectedPath ? ` (expected: ${item.expectedPath})` : ''
          }`
      )
    );
  }
  const settingsSection = formatHealthSettingsStatus(health);
  if (settingsSection) {
    lines.push('', settingsSection);
  }
  const isMissingSettings = health.issues.some((item) => item.code === 'missing_settings_json');
  lines.push(
    health.canBuild && !health.canGenerateTestQrcode
      ? isMissingSettings
        ? '- next_action: 可以继续构建；生成测试二维码前需要 .project/settings.json。'
        : '- next_action: 可以继续构建；生成测试二维码前请完善 .project/project.json 发布配置。'
      : health.canBuild
        ? '- next_action: 可以继续构建；检查器不会自动移动或覆盖文件。'
        : '- next_action: 修复上面的规范路径或配置问题后再构建；检查器不会自动移动或覆盖文件。'
  );
  return lines.join('\n');
}

function formatHealthSettingsStatus(health: MakerProjectHealth): string {
  const settingsIssue = health.issues.find(
    (item) => item.code === 'invalid_settings_json' || item.code === 'invalid_project_settings'
  );
  if (!settingsIssue) {
    return '';
  }

  return [
    'Maker project settings',
    '',
    `- status: ${settingsIssue.code}`,
    `- config: ${health.paths.settingsJson}`,
    '- impact: 构建可能失败或游戏黑屏；坏配置不应提交到 Maker 远端。',
    '- issues:',
    `  - ${settingsIssue.message}`,
    '- next_action: 恢复 .project/settings.json 的构建关键字段后再构建；保留合法的 @runtime 配置。',
  ].join('\n');
}

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

function createHealthResult(
  projectRoot: string,
  mode: MakerProjectHealthMode,
  status: MakerProjectHealthStatus,
  paths: MakerProjectHealth['paths'],
  issues: MakerProjectHealthIssue[],
  canBuild: boolean,
  canGenerateTestQrcode: boolean
): MakerProjectHealth {
  return {
    projectRoot,
    mode,
    status,
    canBuild,
    canGenerateTestQrcode,
    paths,
    issues,
  };
}

function inspectPath(
  filePath: string,
  expectedType: 'directory' | 'file'
): 'missing' | 'directory' | 'file' | 'wrong_type' {
  try {
    // Canonical project files must live inside the workspace. Do not follow a
    // symlink here: otherwise the health check could read an unrelated file
    // outside the project and a later clone/build would not contain it.
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      return 'wrong_type';
    }
    if (expectedType === 'directory') {
      return stats.isDirectory() ? 'directory' : 'wrong_type';
    }
    return stats.isFile() ? 'file' : 'directory';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }
    return 'wrong_type';
  }
}

function addCanonicalFileIssue(
  state: ReturnType<typeof inspectPath>,
  issuePath: string,
  issues: MakerProjectHealthIssue[],
  required: boolean
): void {
  if (state === 'directory' || state === 'wrong_type') {
    issues.push(issue('invalid_path_type', 'error', issuePath, `${issuePath} 必须是普通文件`));
  } else if (state === 'missing' && required) {
    issues.push(issue('missing_required_file', 'error', issuePath, `${issuePath} 缺失`));
  }
}

function readHealthJson(
  filePath: string,
  label: 'project.json' | 'resources.json' | 'settings.json',
  issues: MakerProjectHealthIssue[]
): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    const code =
      label === 'project.json'
        ? 'invalid_project_json'
        : label === 'settings.json'
          ? 'invalid_settings_json'
          : 'invalid_resources_json';
    issues.push(
      issue(
        code,
        'error',
        label === 'project.json'
          ? '.project/project.json'
          : label === 'settings.json'
            ? '.project/settings.json'
            : '.project/resources.json',
        `${label} 无法解析为 JSON: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return undefined;
  }
}

function hasTapTapPublish(filePath: string): boolean {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isPlainObject(value) && isPlainObject(value.taptap_publish);
  } catch {
    return false;
  }
}

function hasMakerRootConfigSignature(
  filePath: string,
  name: 'project.json' | 'resources.json' | 'settings.json'
): boolean {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!isPlainObject(value)) {
      return false;
    }
    const schema = value.$schema;
    if (isNonEmptyString(schema) && schema.endsWith(name.replace('.json', '.schema.json'))) {
      return true;
    }
    if (name === 'project.json') {
      return (
        isPlainObject(value.taptap_publish) &&
        isNonEmptyString(value.project_id) &&
        isNonEmptyString(value.version) &&
        (isNonEmptyString(value.entry) ||
          (isNonEmptyString(value['entry@client']) && isNonEmptyString(value['entry@server'])))
      );
    }
    return false;
  } catch {
    return false;
  }
}

function isBuildBlockingIssue(item: MakerProjectHealthIssue): boolean {
  return item.code !== 'invalid_project_field' && item.code !== 'invalid_publish_field';
}

function validateProjectFields(
  project: Record<string, unknown>,
  resources: unknown,
  issues: MakerProjectHealthIssue[],
  mode: MakerProjectHealthMode
): void {
  const projectFieldSeverity = mode === 'qrcode' ? 'error' : 'warning';
  const projectId = project.project_id;
  if (!isConfiguredString(projectId)) {
    issues.push(
      issue(
        'invalid_project_field',
        projectFieldSeverity,
        '.project/project.json:project_id',
        mode === 'qrcode' ? 'project_id 不能为空或使用模板占位符' : 'project_id 必须存在且不能为空'
      )
    );
  }

  const version = project.version;
  if (!isConfiguredString(version)) {
    issues.push(
      issue(
        'invalid_project_field',
        projectFieldSeverity,
        '.project/project.json:version',
        mode === 'qrcode' ? 'version 不能为空或使用模板占位符' : 'version 必须存在且不能为空'
      )
    );
  }

  if (!hasProjectEntry(project, resources, 'qrcode')) {
    issues.push(
      issue(
        'invalid_project_field',
        projectFieldSeverity,
        '.project/project.json:entry',
        '必须在 project.json 或 resources.json 提供 entry，或完整的客户端/服务端入口'
      )
    );
  }

  const publish = project.taptap_publish;
  if (publish === undefined) {
    issues.push(
      issue(
        'invalid_publish_field',
        projectFieldSeverity,
        'taptap_publish',
        '生成测试二维码前必须存在 taptap_publish 配置'
      )
    );
    return;
  }
  if (!isPlainObject(publish)) {
    issues.push(
      issue(
        'invalid_publish_field',
        mode === 'qrcode' ? 'error' : 'warning',
        'taptap_publish',
        'taptap_publish 必须是 JSON object'
      )
    );
    return;
  }

  const publishFieldSeverity = mode === 'qrcode' ? 'error' : 'warning';
  const title = publish.title;
  if (!isConfiguredTitle(title)) {
    issues.push(
      issue(
        'invalid_publish_field',
        publishFieldSeverity,
        'taptap_publish.title',
        'title 不能为空或使用模板占位符'
      )
    );
  }
  const category = publish.category;
  if (!isConfiguredString(category)) {
    issues.push(
      issue(
        'invalid_publish_field',
        publishFieldSeverity,
        'taptap_publish.category',
        'category 不能为空或使用模板占位符'
      )
    );
  }
  const orientation = publish.screen_orientation;
  if (orientation !== 'landscape' && orientation !== 'portrait') {
    issues.push(
      issue(
        'invalid_publish_field',
        publishFieldSeverity,
        'taptap_publish.screen_orientation',
        'screen_orientation 必须是 landscape 或 portrait'
      )
    );
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isConfiguredString(value: unknown): value is string {
  return isNonEmptyString(value) && !value.trim().startsWith('<') && !/[{}]/u.test(value);
}

function isConfiguredTitle(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const title = value.trim();
  return !(
    (title.startsWith('<') && title.endsWith('>')) ||
    (title.startsWith('{') && title.endsWith('}'))
  );
}

function canGenerateQrcode(
  project: unknown,
  resources: unknown,
  settingsExists: boolean,
  issues: MakerProjectHealthIssue[]
): boolean {
  if (
    !isPlainObject(project) ||
    !isPlainObject(resources) ||
    !settingsExists ||
    !isConfiguredString(project.project_id) ||
    !isConfiguredString(project.version) ||
    !hasProjectEntry(project, resources, 'qrcode') ||
    !isPlainObject(project.taptap_publish)
  ) {
    return false;
  }
  const publish = project.taptap_publish;
  if (!isConfiguredTitle(publish.title) || !isConfiguredString(publish.category)) {
    return false;
  }

  // The QR handler owns the first-time orientation confirmation. Allow an
  // absent field through so it can ask the user and persist the choice; an
  // explicitly invalid value remains a hard project error.
  const orientation = publish.screen_orientation;
  if (orientation !== undefined && orientation !== 'landscape' && orientation !== 'portrait') {
    return false;
  }

  return !issues.some((item) => {
    if (item.severity !== 'error') {
      return false;
    }
    if (
      orientation === undefined &&
      item.code === 'invalid_publish_field' &&
      item.path === 'taptap_publish.screen_orientation'
    ) {
      return false;
    }
    if (item.path === 'taptap_publish' || item.path.startsWith('taptap_publish.')) {
      return true;
    }
    return (
      item.path === '.project' ||
      item.path === '.project/project.json' ||
      item.path.startsWith('.project/project.json:') ||
      item.path === '.project/resources.json' ||
      (item.code === 'misplaced_config' && item.path === 'project.json')
    );
  });
}

function hasProjectEntry(
  project: Record<string, unknown>,
  resources: unknown,
  mode: MakerProjectHealthMode = 'status'
): boolean {
  const resourceConfig = isPlainObject(resources) ? resources : undefined;
  const entry = project.entry || resourceConfig?.entry;
  const isValidEntry = mode === 'qrcode' ? isConfiguredString : isNonEmptyString;
  if (isValidEntry(entry)) {
    return true;
  }
  return (
    isValidEntry(project['entry@client'] || resourceConfig?.['entry@client']) &&
    isValidEntry(project['entry@server'] || resourceConfig?.['entry@server'])
  );
}

function issue(
  code: MakerProjectHealthIssue['code'],
  severity: MakerProjectHealthIssue['severity'],
  issuePath: string,
  message: string
): MakerProjectHealthIssue {
  return { code, severity, path: issuePath, message };
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
