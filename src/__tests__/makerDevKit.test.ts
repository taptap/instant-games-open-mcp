import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AI_DEV_KIT_URLS,
  AI_DEV_KIT_VERSION_METADATA_FILE,
  checkAiDevKitUpdate,
  createDevKitGitignoreBlock,
  DEV_KIT_GITIGNORE_STAGING_FILE,
  finalizeStagedDevKitGitignore,
  inspectAiDevKit,
  inspectAiDevKitSkillInstallStatus,
  installAiDevKit,
  installAiDevKitSkills,
  listPresentDevKitManagedEntries,
  mergeDevKitGitignore,
  readAiDevKitVersionMetadata,
  resolveAiDevKitDownload,
  resolveDefaultAiDevKitUrl,
  writeAiDevKitVersionMetadata,
} from '../maker/cli/devKit';
import { MAKER_CAPABILITY_ROUTING_INDEX } from '../maker/capabilityRouting';

describe('Maker AI dev kit install', () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-dev-kit-'));
    sourceDir = path.join(tempDir, 'ai-dev-kit');
    targetDir = path.join(tempDir, 'target');
    fs.mkdirSync(path.join(sourceDir, '.cli'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'engine-docs'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, '.emmylua'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'examples'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'urhox-libs'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'engine-docs', 'README.md'), 'docs\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'scripts', 'main.lua'), '-- should skip\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'ai-dev-kit.zip'), 'temporary zip\n', 'utf8');
    fs.writeFileSync(
      path.join(sourceDir, '.emmylua', 'Engine.d.lua'),
      '---@class Engine\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(sourceDir, '.cli', 'install-urhox-runtime.sh'),
      '#!/bin/sh\n',
      'utf8'
    );
    fs.writeFileSync(path.join(sourceDir, 'examples', 'README.md'), 'examples\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'templates', 'README.md'), 'templates\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'urhox-libs', 'README.md'), 'libs\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'CLAUDE.md'), 'local agent docs\n', 'utf8');
    fs.writeFileSync(
      path.join(sourceDir, 'tools', 'install-skills.sh'),
      [
        '#!/bin/sh',
        'set -eu',
        'printf "%s\\n" "$1" > ../skill-install-agent.txt',
        'mkdir -p ../.claude/skills/demo-skill ../.codex/skills/demo-skill ../.cursor/skills/demo-skill ../.gemini/skills/demo-skill',
        'echo "[install-skills] claude: installed=13 target=../.claude/skills"',
        'echo "[install-skills] codex: installed=13 target=../.codex/skills"',
        'echo "[install-skills] cursor: installed=13 target=../.cursor/skills"',
        'echo "[install-skills] gemini: installed=13 target=../.gemini/skills"',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.chmodSync(path.join(sourceDir, 'tools', 'install-skills.sh'), 0o755);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('installs dev kit but skips top-level scripts', async () => {
    const result = await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(result.installedEntries).toEqual([
      '.cli',
      '.emmylua',
      'AGENTS.md',
      'CLAUDE.md',
      'engine-docs',
      'examples',
      'templates',
      'tools',
      'urhox-libs',
    ]);
    expect(result.skippedEntries).toEqual(['ai-dev-kit.zip', 'scripts']);
    expect(fs.existsSync(path.join(targetDir, 'engine-docs', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.cli', 'install-urhox-runtime.sh'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.emmylua', 'Engine.d.lua'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'examples', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'templates', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'tools', 'install-skills.sh'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'scripts'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'ai-dev-kit.zip'))).toBe(false);
  });

  test('injects Maker asset policy at the top of AGENTS without changing Claude guide', async () => {
    await installAiDevKit({
      sourceDir,
      targetDir,
    });

    const claudeGuide = fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    const agentsGuide = fs.readFileSync(path.join(targetDir, 'AGENTS.md'), 'utf8');

    expect(claudeGuide).toContain('local agent docs');
    expect(claudeGuide).toBe('local agent docs\n');
    expect(claudeGuide).not.toContain('TapTap Maker Project Asset Tool Policy');
    expect(agentsGuide).toMatch(
      /^<!-- >>> TapTap Maker managed AGENTS policy version=3 hash=sha256:[0-9a-f]+ >>> -->/
    );
    expect(agentsGuide).toContain('# TapTap Maker Project Asset Tool Policy');
    expect(agentsGuide).toContain(MAKER_CAPABILITY_ROUTING_INDEX);
    expect(agentsGuide.indexOf(MAKER_CAPABILITY_ROUTING_INDEX)).toBeLessThan(
      agentsGuide.indexOf('Maker build workflow')
    );
    expect(agentsGuide).toContain('Maker build workflow');
    expect(agentsGuide).toContain('call `maker_build_current_directory`');
    expect(agentsGuide).toContain('Do not tell the user to open the Maker web page');
    expect(agentsGuide).toContain('Do not use generic Git commit, push, branch, PR, or MR');
    expect(agentsGuide).toContain('Maker ad workflow');
    expect(agentsGuide).toContain(
      '`get_ad_config` only after primary local project configs are initialized'
    );
    expect(agentsGuide).toContain('source of truth for current project ad activation status');
    expect(agentsGuide).toContain('Maker feedback workflow');
    expect(agentsGuide).toContain('the Maker proxy `get_debug_feedbacks` tool');
    expect(agentsGuide).toContain('local logs as a substitute');
    expect(agentsGuide).toContain('Maker MCP proxy tools when they are available');
    expect(agentsGuide).toContain('Maker proxy tool is unavailable');
    expect(agentsGuide).toContain('Other client media tools may still be usable');
    expect(agentsGuide).toContain(
      'Follow each Maker tool schema for supported local path, remote URL, and data URL inputs'
    );
    expect(agentsGuide).toContain(
      'Local proxy may convert resolvable local reference media to data URLs'
    );
    expect(agentsGuide).toContain('`query_video_task` for refreshing video task status');
    expect(agentsGuide).toContain('batch_generate_images');
    expect(agentsGuide).toContain('`text_to_music` for game music');
    expect(agentsGuide).toContain('`text_to_sound_effect` for one sound effect');
    expect(agentsGuide).toContain('`batch_sound_effects` for multiple sound effects');
    expect(agentsGuide).toContain('`text_to_dialogue` for final character dialogue');
    expect(agentsGuide).toContain(
      '`text_to_dialogue` automatically converts local project audio to data URLs and reuses confirmed local voice mappings'
    );
    expect(agentsGuide).toContain(
      'After `audition_voices_for_character` returns previews, show them to the user and wait'
    );
    expect(agentsGuide).toContain(
      'Call `confirm_character_voice` only after the user explicitly chooses one preview'
    );
    expect(agentsGuide).toContain('Generated sound effects and dialogue are saved in the project');
    expect(agentsGuide).toContain('Voice audition previews are not saved to the project');
    expect(agentsGuide).toContain('Local MCP does not transcode generated audio to OGG');
    expect(agentsGuide).toContain('create_3d_asset');
    expect(agentsGuide).toContain('action="continue"');
    expect(agentsGuide).toContain('Do not infer ad readiness from local SDK docs');
    expect(agentsGuide).toContain('Build only for an explicit user build/submit/preview request');
    expect(agentsGuide).toContain('do not rebuild');
    expect(agentsGuide).toContain('`generate_test_qrcode` once');
    expect(agentsGuide).toContain('`ShowRewardVideoAd`');
    expect(agentsGuide).toContain('assets/model');
  });

  test('does not change existing Claude guide content', async () => {
    fs.mkdirSync(targetDir, { recursive: true });
    const existingClaude = [
      '# TapTap Maker Project Asset Tool Policy',
      '',
      '<!-- >>> TapTap Maker asset tool policy >>> -->',
      '',
      'old policy body',
      '',
      '<!-- <<< TapTap Maker asset tool policy <<< -->',
      '',
      'user claude notes',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), existingClaude, 'utf8');

    await installAiDevKit({
      sourceDir,
      targetDir,
      preserveExisting: true,
    });

    const claudeGuide = fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(claudeGuide).toBe(existingClaude);
  });

  test('runs POSIX skill installer after copying dev kit tools', async () => {
    const result = await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(fs.readFileSync(path.join(targetDir, 'skill-install-agent.txt'), 'utf8')).toBe('all\n');
    expect(result.skillInstaller).toEqual(
      expect.objectContaining({
        ok: true,
        script: expect.stringContaining('install-skills.sh'),
        summary: 'claude=13, codex=13, cursor=13, gemini=13',
      })
    );
  });

  test('inspects installed AI skill targets for post-clone status', async () => {
    await installAiDevKit({
      sourceDir,
      targetDir,
    });

    const status = inspectAiDevKitSkillInstallStatus(targetDir);

    expect(status.status).toBe('installed');
    expect(status.summary).toBe('claude=1, codex=1, cursor=1, gemini=1');
    expect(status.targets.map((target) => target.name)).toEqual([
      'claude',
      'codex',
      'cursor',
      'gemini',
    ]);
  });

  test('returns copied dev kit and staged gitignore when skill installer fails', async () => {
    fs.writeFileSync(
      path.join(sourceDir, 'tools', 'install-skills.sh'),
      [
        '#!/bin/sh',
        'echo "installer stdout detail"',
        'echo "installer stderr detail" >&2',
        'exit 42',
        '',
      ].join('\n'),
      'utf8'
    );

    const result = await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(result.installedEntries).toContain('CLAUDE.md');
    expect(fs.existsSync(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE))).toBe(true);
    expect(result.skillInstaller).toEqual(
      expect.objectContaining({
        ok: false,
        status: 'failed',
        summary: 'failed: exit_status=42',
        stdout: expect.stringContaining('installer stdout detail'),
        stderr: expect.stringContaining('installer stderr detail'),
        error: expect.stringContaining('Failed to install AI dev kit skills'),
      })
    );
  });

  test('throws visible script details when running skill installer directly fails', () => {
    fs.mkdirSync(path.join(targetDir, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'tools', 'install-skills.sh'),
      [
        '#!/bin/sh',
        'echo "installer stdout detail"',
        'echo "installer stderr detail" >&2',
        'exit 42',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.chmodSync(path.join(targetDir, 'tools', 'install-skills.sh'), 0o755);

    expect(() => installAiDevKitSkills(targetDir)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Failed to install AI dev kit skills'),
      })
    );
  });

  test('stages skill installer output directories as local-only entries', async () => {
    await installAiDevKit({
      sourceDir,
      targetDir,
    });

    const stagedGitignore = fs.readFileSync(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      'utf8'
    );
    expect(stagedGitignore).toContain('.claude/');
    expect(stagedGitignore).toContain('.cli/');
    expect(stagedGitignore).toContain('.codex/');
    expect(stagedGitignore).toContain('.cursor/');
    expect(stagedGitignore).toContain('.gemini/');
  });

  test('detects required dev kit entries', async () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'local guide\n', 'utf8');
    fs.mkdirSync(path.join(targetDir, 'urhox-libs'), { recursive: true });

    const status = inspectAiDevKit(targetDir);

    expect(status.ready).toBe(false);
    expect(status.presentEntries).toEqual(['CLAUDE.md', 'urhox-libs']);
    expect(status.missingEntries).toEqual(['examples', 'templates']);
  });

  test('lists present managed dev kit entries beyond required readiness markers', () => {
    fs.mkdirSync(path.join(targetDir, '.cli'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, '.emmylua'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'engine-docs'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'examples'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'local guide\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'user-file.txt'), 'keep me\n', 'utf8');

    expect(listPresentDevKitManagedEntries(targetDir)).toEqual([
      '.cli',
      '.emmylua',
      'CLAUDE.md',
      'engine-docs',
      'examples',
    ]);
  });

  test('keeps .DS_Store ignored as a file pattern while .maker remains a directory', () => {
    const block = createDevKitGitignoreBlock(['examples']);

    expect(block).toContain('\n.DS_Store\n');
    expect(block).toContain('\n.maker/\n');
    expect(block).toContain('\n.installer/\n');
    expect(block).not.toContain('.DS_Store/');
  });

  test('supports preserveExisting when restoring missing helper files', async () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'user edits\n', 'utf8');

    await installAiDevKit({
      sourceDir,
      targetDir,
      preserveExisting: true,
    });

    const agentsGuide = fs.readFileSync(path.join(targetDir, 'AGENTS.md'), 'utf8');
    const claudeGuide = fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(agentsGuide).toMatch(
      /^<!-- >>> TapTap Maker managed AGENTS policy version=3 hash=sha256:[0-9a-f]+ >>> -->/
    );
    expect(agentsGuide).toContain('# TapTap Maker Project Asset Tool Policy');
    expect(agentsGuide).toContain(MAKER_CAPABILITY_ROUTING_INDEX);
    expect(agentsGuide).toContain('call `maker_build_current_directory`');
    expect(agentsGuide).toContain('Do not tell the user to open the Maker web page');
    expect(agentsGuide).toContain('Maker ad workflow');
    expect(agentsGuide).toContain(
      '`get_ad_config` only after primary local project configs are initialized'
    );
    expect(agentsGuide).toContain('Maker feedback workflow');
    expect(agentsGuide).toContain('the Maker proxy `get_debug_feedbacks` tool');
    expect(agentsGuide).toContain('Maker MCP proxy tools when they are available');
    expect(agentsGuide).toContain(
      'Follow each Maker tool schema for supported local path, remote URL, and data URL inputs'
    );
    expect(agentsGuide).toContain('`query_video_task` for refreshing video task status');
    expect(agentsGuide).toContain('`text_to_sound_effect` for one sound effect');
    expect(agentsGuide).toContain('`batch_sound_effects` for multiple sound effects');
    expect(agentsGuide).toContain('`text_to_dialogue` for final character dialogue');
    expect(agentsGuide).toContain('`audition_voices_for_character` returns previews');
    expect(agentsGuide).toContain(
      '`confirm_character_voice` only after the user explicitly chooses'
    );
    expect(agentsGuide).toContain('Local MCP does not transcode generated audio to OGG');
    expect(agentsGuide).toContain('`generate_test_qrcode` once');
    expect(agentsGuide).toContain('Build only for an explicit user build/submit/preview request');
    expect(agentsGuide).toContain('do not rebuild');
    expect(claudeGuide).toBe('user edits\n');
    expect(fs.existsSync(path.join(targetDir, 'examples', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'templates', 'README.md'))).toBe(true);
    expect(inspectAiDevKit(targetDir).ready).toBe(true);
  });

  test('replaces managed dev kit files and removes stale managed entries', async () => {
    fs.mkdirSync(path.join(targetDir, 'examples'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'schemas'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'old guide\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'examples', 'README.md'), 'old examples\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'examples', 'removed.md'), 'stale\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'schemas', 'old.schema.json'), '{}\n', 'utf8');
    mergeDevKitGitignore(path.join(targetDir, '.gitignore'), ['CLAUDE.md', 'examples', 'schemas']);

    await installAiDevKit({
      sourceDir,
      targetDir,
      replaceManagedEntries: true,
    });

    expect(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe('local agent docs\n');
    expect(fs.readFileSync(path.join(targetDir, 'examples', 'README.md'), 'utf8')).toBe(
      'examples\n'
    );
    expect(fs.existsSync(path.join(targetDir, 'examples', 'removed.md'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'schemas'))).toBe(false);
  });

  test('stages a managed gitignore block for installed entries before clone', async () => {
    await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(fs.existsSync(path.join(targetDir, '.gitignore'))).toBe(false);
    const stagedGitignore = fs.readFileSync(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      'utf8'
    );
    expect(stagedGitignore).toContain('# >>> TapTap Maker AI dev kit (local only) >>>');
    expect(stagedGitignore).toContain('.emmylua/');
    expect(stagedGitignore).toContain('engine-docs/');
    expect(stagedGitignore).toContain('examples/');
    expect(stagedGitignore).toContain('templates/');
    expect(stagedGitignore).toContain('tools/');
    expect(stagedGitignore).toContain('urhox-libs/');
    expect(stagedGitignore).toContain('CLAUDE.md');
    expect(stagedGitignore).not.toContain('scripts/');
    expect(stagedGitignore).not.toContain('ai-dev-kit.zip');
  });

  test('replaces existing managed gitignore block while preserving user rules', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(
      gitignorePath,
      [
        'user-rule.txt',
        createDevKitGitignoreBlock(['old-entry']),
        'another-user-rule.txt',
        '',
      ].join('\n'),
      'utf8'
    );

    mergeDevKitGitignore(gitignorePath, ['engine-docs']);

    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    expect(gitignore).toContain('user-rule.txt');
    expect(gitignore).toContain('another-user-rule.txt');
    expect(gitignore).toContain('engine-docs/');
    expect(gitignore).not.toContain('old-entry');
  });

  test('always ignores Maker local runtime state in managed gitignore block', () => {
    const block = createDevKitGitignoreBlock(['engine-docs']);

    expect(block).toContain('.maker/');
  });

  describe('resolveDefaultAiDevKitUrl', () => {
    const originalEnv = process.env.TAPTAP_MCP_ENV;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.TAPTAP_MCP_ENV;
      } else {
        process.env.TAPTAP_MCP_ENV = originalEnv;
      }
    });

    test('returns the production URL by default', () => {
      delete process.env.TAPTAP_MCP_ENV;
      expect(resolveDefaultAiDevKitUrl()).toBe(AI_DEV_KIT_URLS.production);
      expect(AI_DEV_KIT_URLS.production).toContain('/pd/stable/');
    });

    test('returns the rnd URL when TAPTAP_MCP_ENV=rnd', () => {
      process.env.TAPTAP_MCP_ENV = 'rnd';
      expect(resolveDefaultAiDevKitUrl()).toBe(AI_DEV_KIT_URLS.rnd);
      expect(AI_DEV_KIT_URLS.rnd).toContain('/rnd/latest/');
    });

    test('explicit environment argument overrides process env', () => {
      process.env.TAPTAP_MCP_ENV = 'production';
      expect(resolveDefaultAiDevKitUrl('rnd')).toBe(AI_DEV_KIT_URLS.rnd);
    });
  });

  describe('ai dev kit version checks', () => {
    const currentVersionPayload = {
      env: 'rnd',
      current: {
        version: '20260605-053736',
        md5: '6ced394e09fed25c2b946889e0171b36',
        size: 27048639,
        uploaded_at: '2026-06-05T05:37:52.000Z',
      },
      history: [],
      history_count: 10,
      from_cache: false,
      queried_at: '2026-06-05T10:03:59.207Z',
    };

    test('resolves rnd download URL from the version endpoint', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse(currentVersionPayload));

      const result = await resolveAiDevKitDownload({
        environment: 'rnd',
        fetchImpl,
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        'https://fuping.agnt.xd.com/mcp/v1/ai-dev-kit/versions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
          signal: expect.any(Object),
        })
      );
      expect(result.url).toBe(
        'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/20260605-053736/ai-dev-kit.zip'
      );
      expect(result.version?.current.version).toBe('20260605-053736');
      expect(result.version?.current.md5).toBe('6ced394e09fed25c2b946889e0171b36');
    });

    test('resolves production version endpoint from the production MCP base URL', async () => {
      const fetchImpl = jest.fn(async () =>
        jsonResponse({
          ...currentVersionPayload,
          env: 'production',
        })
      );

      const result = await resolveAiDevKitDownload({
        environment: 'production',
        fetchImpl,
      });

      expect(fetchImpl).toHaveBeenCalledWith(
        'https://maker.taptap.cn/mcp/v1/ai-dev-kit/versions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
          signal: expect.any(Object),
        })
      );
      expect(result.url).toBe(
        'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/20260605-053736/ai-dev-kit.zip'
      );
    });

    test('falls back to the default env URL when the version endpoint fails', async () => {
      const fetchImpl = jest.fn(async () => {
        throw new Error('network unavailable');
      });

      const result = await resolveAiDevKitDownload({
        environment: 'rnd',
        fetchImpl,
      });

      expect(result.url).toBe(AI_DEV_KIT_URLS.rnd);
      expect(result.version).toBeUndefined();
      expect(result.versionCheckError).toContain('network unavailable');
    });

    test('records installed version metadata and detects updates', async () => {
      fs.mkdirSync(targetDir, { recursive: true });
      writeAiDevKitVersionMetadata(targetDir, {
        env: 'rnd',
        version: '20260604-150856',
        md5: 'b50d18ea11dab3be793a59b2d5feebc7',
        size: 27048608,
        uploaded_at: '2026-06-04T15:09:13.000Z',
        source_url:
          'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/20260604-150856/ai-dev-kit.zip',
        installed_at: '2026-06-04T16:00:00.000Z',
      });

      const metadata = readAiDevKitVersionMetadata(targetDir);
      const update = await checkAiDevKitUpdate(targetDir, {
        environment: 'rnd',
        fetchImpl: jest.fn(async () => jsonResponse(currentVersionPayload)),
      });

      expect(fs.existsSync(path.join(targetDir, AI_DEV_KIT_VERSION_METADATA_FILE))).toBe(true);
      expect(metadata?.version).toBe('20260604-150856');
      expect(update.installed?.version).toBe('20260604-150856');
      expect(update.latest?.version).toBe('20260605-053736');
      expect(update.updateAvailable).toBe(true);
    });
  });

  test('finalizes staged gitignore after clone and removes staging file', () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.gitignore'), 'remote-rule.txt\n', 'utf8');
    fs.writeFileSync(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      `${createDevKitGitignoreBlock(['engine-docs'])}\n`,
      'utf8'
    );

    const finalized = finalizeStagedDevKitGitignore(targetDir);

    const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    expect(finalized).toBe(true);
    expect(gitignore).toContain('remote-rule.txt');
    expect(gitignore).toContain('engine-docs/');
    expect(fs.existsSync(path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE))).toBe(false);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
