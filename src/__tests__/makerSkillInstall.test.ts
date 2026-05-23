import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatMakerSkillStatus,
  MAKER_DEV_KIT_GUIDE_SKILL_NAME,
  MAKER_LOCAL_SKILL_NAME,
  UPDATE_TAPTAP_MCP_SKILL_NAME,
} from '../maker/cli/skill';

describe('Maker bundled workflow skill documents', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-skill-install-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('formats skill document status without mutating files', () => {
    const status = formatMakerSkillStatus({
      projectRoot: tempDir,
    });

    expect(status).toContain('TapTap bundled workflow skills');
    expect(status).toContain(`skills/${MAKER_LOCAL_SKILL_NAME}/SKILL.md`);
    expect(status).toContain(`skills/${MAKER_DEV_KIT_GUIDE_SKILL_NAME}/SKILL.md`);
    expect(status).toContain(`skills/${UPDATE_TAPTAP_MCP_SKILL_NAME}/SKILL.md`);
    expect(status).toContain('Let the current AI client decide whether and how to load them.');
    expect(status).not.toContain('Validation checklist for the local AI client');
    expect(status).not.toContain(`${MAKER_LOCAL_SKILL_NAME} / codex: missing`);
    expect(status).not.toContain('taptap-maker install-skill --ide codex');
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });

  test('Maker local skill owns initialization workflow guidance', () => {
    const skillPath = path.join(process.cwd(), 'skills', MAKER_LOCAL_SKILL_NAME, 'SKILL.md');
    const skillText = fs.readFileSync(skillPath, 'utf8');

    expect(skillText).toContain('Initialization Workflow');
    expect(skillText).toContain('maker_status');
    expect(skillText).toContain('maker_exchange_pat');
    expect(skillText).toContain('maker_clone_to_current_directory');
    expect(skillText).toContain('tool prepares the AI dev kit automatically');
    expect(skillText).toContain(MAKER_DEV_KIT_GUIDE_SKILL_NAME);
    expect(skillText).toContain('already bound to a Maker project');
    expect(skillText).toContain('Do not ask which app to clone');
    expect(skillText).toContain('app lists');
    expect(skillText).toContain('reference only');
    expect(skillText).toContain('Do not auto-select');
    expect(skillText).toContain('Bundled Skills');
    expect(skillText).toContain('Before every clone attempt, call `maker_status(target_dir)`');
    expect(skillText).toContain('Directory Suitability Decision');
    expect(skillText).toContain('committed-but-unpushed local commits');
    expect(skillText).toContain('push_recovery');
    expect(skillText).toContain('Do not ask for permission to run a generic `git push`');
    expect(skillText).toContain('Attached Workspace Selection');
    expect(skillText).toContain('dialogues');
    expect(skillText).toContain('single attached workspace');
    expect(skillText).not.toContain('taptap-maker dev-kit install --target .');
    expect(skillText).not.toContain('taptap-maker install-skill --ide codex');
  });

  test('Dev kit guide skill points agents to installed local resources', () => {
    const skillPath = path.join(
      process.cwd(),
      'skills',
      MAKER_DEV_KIT_GUIDE_SKILL_NAME,
      'SKILL.md'
    );
    const skillText = fs.readFileSync(skillPath, 'utf8');

    expect(skillText).toContain('CLAUDE.md');
    expect(skillText).toContain('examples/');
    expect(skillText).toContain('templates/');
    expect(skillText).toContain('urhox-libs/');
    expect(skillText).toContain('Do not submit them to Maker Git');
    expect(skillText).toContain('Testing And Result Check');
    expect(skillText).toContain('用户可以直接说“提交”或“构建”');
    expect(skillText).toContain('TapMaker 网页端查看结果');
  });
});
