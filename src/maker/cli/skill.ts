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
