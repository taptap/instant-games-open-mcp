import fs from 'node:fs';
import path from 'node:path';
import { previewDirectory, writePrivateJson } from './protocol.js';

export const PREVIEW_WINDOW_PRESETS = {
  '16:9': { longEdge: 960, shortEdge: 540 },
  '21:9': { longEdge: 1260, shortEdge: 540 },
  '4:3': { longEdge: 1024, shortEdge: 768 },
} as const;

export type PreviewWindowSettings = {
  orientation: 'project' | 'landscape' | 'portrait';
  preset: keyof typeof PREVIEW_WINDOW_PRESETS | 'custom';
  custom: { longEdge: number; shortEdge: number };
};
export type PreviewWindow = {
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  defaulted: boolean;
};

function defaults(): PreviewWindowSettings {
  return { orientation: 'project', preset: 'custom', custom: { longEdge: 1920, shortEdge: 1080 } };
}

function validate(value: unknown): PreviewWindowSettings {
  const settings = value as PreviewWindowSettings | undefined;
  if (
    !settings ||
    !['project', 'landscape', 'portrait'].includes(settings.orientation) ||
    !['16:9', '21:9', '4:3', 'custom'].includes(settings.preset) ||
    ![settings.custom?.longEdge, settings.custom?.shortEdge].every(
      (edge) => Number.isInteger(edge) && edge >= 100 && edge <= 4096
    ) ||
    settings.custom.longEdge < settings.custom.shortEdge
  ) {
    throw new Error('预览尺寸无效：宽高须为 100–4096 的整数，且方向、比例必须有效。');
  }
  return {
    orientation: settings.orientation,
    preset: settings.preset,
    custom: { longEdge: settings.custom.longEdge, shortEdge: settings.custom.shortEdge },
  };
}

function filename(project: string): string {
  return path.join(previewDirectory(project), 'window.json');
}

export function readPreviewWindowSettings(project: string) {
  let settings = defaults();
  try {
    const file = filename(project);
    if (fs.statSync(file).size <= 4096)
      settings = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    /* Missing or invalid local preferences fall back to project defaults. */
  }
  let projectOrientation: 'landscape' | 'portrait' | null = null;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(project, '.project/project.json'), 'utf8'));
    const value = config.taptap_publish?.screen_orientation;
    if (value === 'portrait' || value === 'landscape') projectOrientation = value;
  } catch {
    /* A new project may not have its publishing configuration yet. */
  }
  const orientation =
    settings.orientation === 'project' ? projectOrientation || 'landscape' : settings.orientation;
  const size =
    settings.preset === 'custom' ? settings.custom : PREVIEW_WINDOW_PRESETS[settings.preset];
  const effective: PreviewWindow = {
    orientation,
    width: orientation === 'portrait' ? size.shortEdge : size.longEdge,
    height: orientation === 'portrait' ? size.longEdge : size.shortEdge,
    defaulted: settings.orientation === 'project' && !projectOrientation,
  };
  return { settings, effective, projectOrientation, presets: PREVIEW_WINDOW_PRESETS };
}

export function savePreviewWindowSettings(project: string, value: unknown) {
  writePrivateJson(filename(project), validate(value));
  return readPreviewWindowSettings(project);
}

export function previewWindow(project: string): PreviewWindow {
  return readPreviewWindowSettings(project).effective;
}
