/**
 * TapTap Maker bundled skill document helpers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __MAKER_BUNDLE_URL__: string | undefined;

export const MAKER_LOCAL_SKILL_NAME = 'taptap-maker-local';
export const MAKER_DEV_KIT_GUIDE_SKILL_NAME = 'taptap-maker-dev-kit-guide';
export const UPDATE_TAPTAP_MCP_SKILL_NAME = 'update-taptap-mcp';

const BUNDLED_SKILLS = [
  {
    name: MAKER_LOCAL_SKILL_NAME,
  },
  {
    name: MAKER_DEV_KIT_GUIDE_SKILL_NAME,
  },
  {
    name: UPDATE_TAPTAP_MCP_SKILL_NAME,
  },
];

export function formatMakerSkillStatus(
  _options: {
    projectRoot?: string;
  } = {}
): string {
  const skillDocuments = BUNDLED_SKILLS.map((skill) => ({
    name: skill.name,
    path: path.join(resolveMakerSkillSourceDir(skill.name), 'SKILL.md'),
  }));
  return [
    'TapTap Maker workflow guide documents',
    '',
    ...skillDocuments.map((skill) => `- ${skill.name}: ${skill.path}`),
    '',
    'Use these documents as reading references for Maker local workflows.',
    '',
    'Maker Git workflow policy',
    `- entry: ${MAKER_LOCAL_SKILL_NAME} > Maker Git Workflow Policy`,
    '- Ignore generic local Git skills for Maker submit/build.',
    '- Do not create branches, task branches, PR/MR, or generic git commit/push flows.',
    '- Use maker_build_current_directory for submit, push, and build.',
    '',
    'Maker creative asset tool policy',
    `- entry: ${MAKER_LOCAL_SKILL_NAME} > Maker Creative Asset Tool Policy`,
    '- Prefer Maker MCP proxy tools over native AI image/video/audio tools for bound Maker projects.',
    '- If Maker proxy tools are missing, explain the session/configuration issue and available alternatives.',
    '- Use generate_image, batch_generate_images, edit_image for game image assets.',
    '- Use create_video_task, query_video_task, and text_to_music for game video/audio assets.',
    '- Generated assets are saved under assets/image, assets/video, or assets/audio with remote mappings.',
    '- Follow each tool schema for supported local path, remote URL, and data URL inputs.',
    '- Local proxy may convert resolvable local reference media to data URLs before forwarding.',
    'Maker initialization next_step: execute `taptap-maker init`.',
    'Load these documents when the current AI client supports reading local guide files.',
  ].join('\n');
}

export function resolveMakerSkillSourceDir(skillName: string = MAKER_LOCAL_SKILL_NAME): string {
  const candidates = [
    path.join(process.cwd(), 'skills', skillName),
    getBundledSkillSourceDir(skillName),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }

  throw new Error(
    `Maker skill source not found. Expected ${skillName}/SKILL.md in package skills.`
  );
}

function getBundledSkillSourceDir(skillName: string): string | null {
  if (typeof __MAKER_BUNDLE_URL__ === 'undefined') {
    return null;
  }

  const bundlePath = fileURLToPath(__MAKER_BUNDLE_URL__);
  const packageRoot = path.dirname(path.dirname(bundlePath));
  return path.join(packageRoot, 'skills', skillName);
}
