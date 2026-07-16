/**
 * TapTap Maker AGENTS.md managed policy helpers.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAKER_AGENTS_FILE = 'AGENTS.md';
const POLICY_VERSION = '1';
const LEGACY_POLICY_BEGIN = '<!-- >>> TapTap Maker asset tool policy >>> -->';
const LEGACY_POLICY_END = '<!-- <<< TapTap Maker asset tool policy <<< -->';
const POLICY_END = '<!-- <<< TapTap Maker managed AGENTS policy <<< -->';
const POLICY_BLOCK_PATTERN =
  /(?:# TapTap Maker Project Asset Tool Policy\s*)?<!-- >>> TapTap Maker (?:managed AGENTS policy version=([^ ]+) hash=sha256:([0-9a-f]+)|asset tool policy) >>> -->[\s\S]*?<!-- <<< TapTap Maker (?:managed AGENTS policy|asset tool policy) <<< -->\n?/;

export type MakerAgentsPolicyStatus = 'missing_file' | 'missing_block' | 'outdated' | 'current';

export interface MakerAgentsPolicyInspection {
  targetDir: string;
  path: string;
  status: MakerAgentsPolicyStatus;
  version?: string;
  hash?: string;
  expectedHash: string;
}

export interface MakerAgentsPolicyUpdateResult {
  path: string;
  previousStatus: MakerAgentsPolicyStatus;
  changed: boolean;
  expectedHash: string;
}

export function inspectMakerAgentsPolicy(targetDir: string): MakerAgentsPolicyInspection {
  const resolvedTargetDir = path.resolve(targetDir);
  const agentsPath = path.join(resolvedTargetDir, MAKER_AGENTS_FILE);
  const expectedHash = hashPolicyBody(createMakerAgentsPolicyBody());
  if (!fs.existsSync(agentsPath)) {
    return {
      targetDir: resolvedTargetDir,
      path: agentsPath,
      status: 'missing_file',
      expectedHash,
    };
  }

  const existing = fs.readFileSync(agentsPath, 'utf8');
  const match = POLICY_BLOCK_PATTERN.exec(existing);
  if (!match) {
    return {
      targetDir: resolvedTargetDir,
      path: agentsPath,
      status: 'missing_block',
      expectedHash,
    };
  }

  const version = match[1];
  const hash = match[2];
  return {
    targetDir: resolvedTargetDir,
    path: agentsPath,
    status: version === POLICY_VERSION && hash === expectedHash ? 'current' : 'outdated',
    version,
    hash,
    expectedHash,
  };
}

export function updateMakerAgentsPolicy(targetDir: string): MakerAgentsPolicyUpdateResult {
  const resolvedTargetDir = path.resolve(targetDir);
  fs.mkdirSync(resolvedTargetDir, { recursive: true });
  const inspection = inspectMakerAgentsPolicy(resolvedTargetDir);
  const agentsPath = inspection.path;
  const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
  const next = prependOrReplaceMakerAgentsPolicyBlock(existing);
  if (existing !== next) {
    fs.writeFileSync(agentsPath, next, 'utf8');
  }

  return {
    path: agentsPath,
    previousStatus: inspection.status,
    changed: existing !== next,
    expectedHash: inspection.expectedHash,
  };
}

export function formatMakerAgentsPolicyStatus(targetDir: string): string {
  const inspection = inspectMakerAgentsPolicy(targetDir);
  const lines = [
    'AGENTS.md',
    `- path: ${inspection.path}`,
    `- status: ${inspection.status}`,
    `- expected_hash: sha256:${inspection.expectedHash}`,
    inspection.version ? `- current_version: ${inspection.version}` : '',
    inspection.hash ? `- current_hash: sha256:${inspection.hash}` : '',
    inspection.status === 'current'
      ? ''
      : '- next_step: taptap-maker agents update --target-dir <Maker project dir>',
  ];
  return lines.filter(Boolean).join('\n');
}

export function prependOrReplaceMakerAgentsPolicyBlock(existing: string): string {
  const withoutOldBlock = existing.replace(POLICY_BLOCK_PATTERN, '').trimStart();
  return [createMakerAgentsPolicyBlock(), withoutOldBlock]
    .filter((part) => part.length > 0)
    .join('\n\n');
}

function createMakerAgentsPolicyBlock(): string {
  const body = createMakerAgentsPolicyBody();
  const hash = hashPolicyBody(body);
  return [
    `<!-- >>> TapTap Maker managed AGENTS policy version=${POLICY_VERSION} hash=sha256:${hash} >>> -->`,
    body,
    POLICY_END,
    '',
  ].join('\n');
}

function createMakerAgentsPolicyBody(): string {
  return [
    '# TapTap Maker Project Asset Tool Policy',
    '',
    'This is a bound TapTap Maker project.',
    '',
    'Maker build workflow:',
    '',
    '- For user requests such as 构建, build, 预览, 跑一下, 查看结果, 看看效果, 验证游戏效果,',
    '  提交, 提交代码, 推送, or push, call `maker_build_current_directory`.',
    '- Do not tell the user to open the Maker web page and click a build button as the default flow.',
    '- Do not use generic Git commit, push, branch, PR, or MR workflows for Maker submit/build',
    '  requests. Follow the result returned by `maker_build_current_directory`.',
    '',
    'Generic code checks such as 验证代码, 跑测试, lint, or 检查实现 should not trigger a Maker',
    'remote build unless the user explicitly asks to build, run, or preview the Maker game.',
    '',
    'Maker ad workflow:',
    '',
    '- For any ad-related request or code touching ads, first call `get_ad_config` before reading',
    '  local SDK docs, editing ad code, or testing ad behavior. Triggers include 广告, 激励视频,',
    '  播放广告, ad ID, ad placement, ad status, ad config, and `ShowRewardVideoAd`.',
    '- Treat `get_ad_config` as the source of truth for current project ad activation status and',
    '  ad config. Do not infer ad readiness from local SDK docs, `.maker-mcp/config.json`, or',
    '  runtime callbacks.',
    '- If `.project/project.json` is missing, build once with `maker_build_current_directory` to',
    '  initialize the project, then call `get_ad_config` again. Implement or test ad code only',
    '  after the config is available.',
    '- If `get_ad_config` reports missing `app_id` or `developer_id`, call',
    '  `generate_test_qrcode` once to generate test QR code metadata, then call `get_ad_config`',
    '  again. Do not use publish-only tools for this recovery path.',
    '',
    'Maker feedback workflow:',
    '',
    '- For user requests about online player feedback, problem reports, issue reports, debug',
    '  feedback, real-device logs, screenshots, 问题反馈, 问题上报, 真机日志, or 玩家反馈, call',
    '  the Maker proxy `get_debug_feedbacks` tool when it is available.',
    '- Use local runtime log files only for the current local build/runtime session. Do not use',
    '  local logs as a substitute for remote player-submitted feedback.',
    '- Follow the remote tool schema and return the feedback records, logs, screenshots, and',
    '  full error payloads as provided by the remote Maker MCP server.',
    '',
    'For game asset generation or editing in this project, the local AI/Agent should prefer',
    'Maker MCP proxy tools when they are available:',
    '',
    '- `generate_image` for one image asset.',
    '- `batch_generate_images` for multiple image assets.',
    '- `edit_image` for modifying existing project images.',
    '- `create_video_task` for game video assets or referenced image/video generation.',
    '- `query_video_task` for refreshing video task status and fetching completed videos.',
    '- `text_to_music` for game music.',
    '- `text_to_sound_effect` for one sound effect.',
    '- `batch_sound_effects` for multiple sound effects.',
    '- `text_to_dialogue` for final character dialogue.',
    '- After `audition_voices_for_character` returns previews, show them to the user and wait',
    '  for the user to choose. Do not select or confirm a voice automatically.',
    '- Call `confirm_character_voice` only after the user explicitly chooses one preview.',
    '- Generated sound effects and dialogue are saved in the project.',
    '- Voice audition previews are not saved to the project.',
    '- Local MCP does not transcode generated audio to OGG.',
    '- `create_3d_model_task` for game 3D model assets.',
    '- `query_3d_model_task` for polling 3D model tasks.',
    '- For 3D characters that need skeletons, animation, or FBX output, ask whether to use',
    '  `rig=true`. Use it only for biped humanoid characters in A-pose or A-pose-compatible',
    '  front-view inputs; otherwise keep static model generation.',
    '',
    'Follow each Maker tool schema for supported local path, remote URL, and data URL inputs.',
    'If the user references attached/local media, inspect the attachment or workspace file path',
    'before calling the tool. Local proxy may convert resolvable local reference media to data URLs',
    'before forwarding to the remote Maker MCP server.',
    '',
    'If the required Maker proxy tool is not exposed in the current AI session, explain that the',
    'Maker proxy tool is unavailable and suggest checking/reconnecting the Maker MCP session.',
    'Other client media tools may still be usable when their output is passed back through a supported',
    'local path, remote URL, or data URL input.',
    '',
    'Generated Maker proxy assets should stay in the Maker project asset workflow under',
    '`assets/image`, `assets/video`, `assets/audio`, or `assets/model`, with remote mappings',
    'preserved for later edits and builds.',
    '3D model results save the original GLB/FBX, the MDL zip, extracted MDL assets, and rendered',
    'preview images when those URLs are returned.',
  ].join('\n');
}

function hashPolicyBody(body: string): string {
  return crypto.createHash('sha256').update(normalizePolicyText(body)).digest('hex');
}

function normalizePolicyText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export function isLegacyMakerAgentsPolicyMarker(value: string): boolean {
  return value === LEGACY_POLICY_BEGIN || value === LEGACY_POLICY_END;
}
