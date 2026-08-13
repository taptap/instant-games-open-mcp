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
    'Maker proxy tool policy',
    `- entry: ${MAKER_LOCAL_SKILL_NAME} > Maker Creative Asset Tool Policy`,
    '- Maker MCP provides image, video, music, sound-effect, dialogue/voice, and 3D asset tools for Maker projects.',
    '- Follow the selected tool schema when one of these tools is used.',
    '- Use generate_image, batch_generate_images, edit_image for game image assets.',
    '- Use create_video_task and query_video_task for game video assets.',
    '- Use text_to_music for game music.',
    '- Use text_to_sound_effect for one sound effect.',
    '- Use batch_sound_effects for multiple sound effects.',
    '- Use text_to_dialogue for final character dialogue.',
    '- text_to_dialogue reuses confirmed local ElevenLabs voice mappings; after confirmation pass only character_name and text.',
    '- For ElevenLabs auditions, pass character_description and an audition_line of at least 100 characters; candidate_count is optional (1-3).',
    '- After audition_voices_for_character returns previews, wait for the user to choose.',
    '- Call confirm_character_voice only after the user explicitly chooses a preview.',
    '- Generated sound effects and dialogue are saved in the project.',
    '- Voice audition previews are not saved to the project.',
    '- Local MCP does not transcode generated audio to OGG.',
    '- Use create_3d_asset with start/query/continue/post_process for game 3D model assets.',
    '- For any ad-related request, first read `maker://ads-integration-guide`, then follow it to inspect Maker project status, call get_ad_config, and read the project engine document.',
    '- Do not infer ad readiness from local SDK docs, .maker-mcp/config.json, or runtime callbacks.',
    '- If primary local project configs are missing, keep ad config unavailable. Build only for an explicit user build/submit/preview request, and do not automatically rebuild when local configs remain missing after success.',
    '- If get_ad_config reports missing app_id or developer_id, call generate_test_qrcode once, then call get_ad_config again.',
    "- For the current Maker game's online player feedback, including player-submitted game bug reports, real-device game logs, or screenshots, or server/Lua logs for a specified game session, call get_debug_feedbacks only when it is exposed by the current Maker tool list.",
    '- Use local runtime logs only for the current local build/runtime session.',
    '- Generated assets are saved under assets/image, assets/video, assets/audio, or assets/model with remote mappings.',
    '- Follow each tool schema for supported local path, remote URL, and data URL inputs.',
    '- Local proxy may convert resolvable local reference media to data URLs before forwarding.',
    '- create_3d_asset local runtime model_files copy/extract instructions are materialized under assets/model.',
    '- Use local_delivery for the usable local model path and preview_assets for local review images.',
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
