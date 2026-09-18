import fs from 'node:fs';
import path from 'node:path';

export function readPreviewConfiguration(
  project: string,
  name: 'project' | 'resources' | 'settings'
): Record<string, any> | undefined {
  const filename = path.join(project, '.project', name + '.json');
  if (!fs.existsSync(filename)) {
    if (
      [
        path.join(project, '.project', name + '.jsonc'),
        path.join(project, name + '.json'),
        path.join(project, name + '.jsonc'),
      ].some((file) => fs.existsSync(file))
    )
      throw new Error(
        `Local preview requires .project/${name}.json for existing configuration; JSONC-only and legacy root layouts are not supported.`
      );
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new Error(`无法读取预览配置 .project/${name}.json，请检查文件权限和 JSON 格式。`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`预览配置 .project/${name}.json 必须是 JSON 对象。`);
  return value as Record<string, any>;
}

export function previewEntryName(
  project: Record<string, any> = {},
  resources: Record<string, any> = {}
): unknown {
  for (const value of [
    project['entry@client'],
    project.entry,
    resources['entry@client'],
    resources.entry,
  ]) {
    if (value !== undefined) return value;
  }
  return 'main.lua';
}
