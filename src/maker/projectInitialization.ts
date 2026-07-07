/**
 * Maker project initialization status helpers.
 */

import fs from 'node:fs';
import path from 'node:path';

export type MakerProjectInitializationStatus = {
  status: 'ready' | 'missing_project_json' | 'missing_taptap_identity' | 'invalid_project_json';
  projectRoot: string;
  projectJsonPath: string;
  missingFields?: string[];
  error?: string;
};

export function inspectMakerProjectInitialization(
  projectRoot: string
): MakerProjectInitializationStatus {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const projectJsonPath = path.join(resolvedProjectRoot, '.project', 'project.json');

  const baseStatus = {
    projectRoot: resolvedProjectRoot,
    projectJsonPath,
  };

  if (!fs.existsSync(projectJsonPath)) {
    return {
      ...baseStatus,
      status: 'missing_project_json',
    };
  }

  let projectJson: unknown;
  try {
    projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
  } catch (error) {
    return {
      ...baseStatus,
      status: 'invalid_project_json',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const missingFields = ['app_id', 'developer_id'].filter(
    (field) => !hasNonEmptyIdentityField(projectJson, field)
  );
  if (missingFields.length > 0) {
    return {
      ...baseStatus,
      status: 'missing_taptap_identity',
      missingFields,
    };
  }

  return {
    ...baseStatus,
    status: 'ready',
  };
}

export function formatMakerProjectInitializationStatus(
  status: MakerProjectInitializationStatus
): string {
  if (status.status === 'ready') {
    return '';
  }

  if (status.status === 'missing_taptap_identity') {
    return [
      'Maker project initialization',
      '',
      '- status: missing_taptap_identity',
      `- config: ${status.projectJsonPath}`,
      `- missing_fields: ${status.missingFields?.join(', ') || 'app_id, developer_id'}`,
      '- impact: get_ad_config cannot fetch ad activation status until TapTap app identity metadata exists.',
      '- next_action: 先调用 generate_test_qrcode 一次生成测试二维码元数据，再重试 get_ad_config；不要为这个恢复流程调用发布类工具。',
    ].join('\n');
  }

  if (status.status === 'invalid_project_json') {
    return [
      'Maker project initialization',
      '',
      '- status: invalid_project_json',
      `- config: ${status.projectJsonPath}`,
      status.error ? `- error: ${status.error}` : '',
      '- impact: get_ad_config and other remote project-config tools cannot parse project metadata yet.',
      '- next_action: 检查 .project/project.json 内容；必要时先调用 maker_build_current_directory 重新生成项目配置。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (status.status === 'missing_project_json') {
    return [
      'Maker project initialization',
      '',
      '- status: missing_project_json',
      `- config: ${status.projectJsonPath}`,
      '- impact: get_ad_config and other remote project-config tools cannot read project metadata yet.',
      '- next_action: 先调用 maker_build_current_directory 构建一次，生成 .project/project.json 后再重试。',
    ].join('\n');
  }

  return '';
}

function hasNonEmptyIdentityField(value: unknown, fieldName: string): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (isNonEmptyStringLike(record[fieldName])) {
    return true;
  }

  const taptapPublish = record.taptap_publish;
  if (!taptapPublish || typeof taptapPublish !== 'object' || Array.isArray(taptapPublish)) {
    return false;
  }

  return isNonEmptyStringLike((taptapPublish as Record<string, unknown>)[fieldName]);
}

function isNonEmptyStringLike(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}
