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

    expect(status).toContain('TapTap Maker workflow guide documents');
    expect(status).toContain(`skills/${MAKER_LOCAL_SKILL_NAME}/SKILL.md`);
    expect(status).toContain(`skills/${MAKER_DEV_KIT_GUIDE_SKILL_NAME}/SKILL.md`);
    expect(status).toContain(`skills/${UPDATE_TAPTAP_MCP_SKILL_NAME}/SKILL.md`);
    expect(status).toContain('Use these documents as reading references');
    expect(status).toContain('Maker Git workflow policy');
    expect(status).toContain(`${MAKER_LOCAL_SKILL_NAME} > Maker Git Workflow Policy`);
    expect(status).toContain('Ignore generic local Git skills for Maker submit/build');
    expect(status).toContain('Use maker_build_current_directory for submit, push, and build');
    expect(status).toContain('Maker creative asset tool policy');
    expect(status).toContain(`${MAKER_LOCAL_SKILL_NAME} > Maker Creative Asset Tool Policy`);
    expect(status).toContain('Prefer Maker MCP proxy tools over native AI image/video/audio tools');
    expect(status).toContain('This policy overrides generic imagegen or native media skills');
    expect(status).toContain('Do not fall back to generic imagegen');
    expect(status).toContain('Before edit_image, resolve dragged or referenced images');
    expect(status).toContain('Do not call edit_image without an image path or CDN URL');
    expect(status).toContain('Use generate_image, batch_generate_images, edit_image');
    expect(status).toContain('Use create_video_task and text_to_music for game video/audio');
    expect(status).toContain('Maker initialization next_step: execute `taptap-maker init`');
    expect(status).not.toContain('Validation checklist for the local AI client');
    expect(status).not.toContain(`${MAKER_LOCAL_SKILL_NAME} / codex: missing`);
    expect(status).not.toContain('taptap-maker install-skill --ide codex');
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });

  test('Maker local skill owns initialization workflow guidance', () => {
    const skillPath = path.join(process.cwd(), 'skills', MAKER_LOCAL_SKILL_NAME, 'SKILL.md');
    const skillText = fs.readFileSync(skillPath, 'utf8');

    expect(skillText).toContain('Initialization Workflow');
    expect(skillText).toContain('taptap-maker doctor');
    expect(skillText).toContain('taptap-maker init');
    expect(skillText).toContain('taptap-maker pat set');
    expect(skillText).toContain('Do not put PAT directly in argv');
    expect(skillText).toContain('taptap-maker apps');
    expect(skillText).toContain('The CLI will request PAT if');
    expect(skillText).toContain('The CLI is responsible for deterministic file operations');
    expect(skillText).toContain(MAKER_DEV_KIT_GUIDE_SKILL_NAME);
    expect(skillText).toContain('already bound to a Maker project');
    expect(skillText).toContain('ask which app to clone');
    expect(skillText).toContain('app lists from `taptap-maker apps`');
    expect(skillText).toContain('reference only');
    expect(skillText).toContain('Selection confirmation');
    expect(skillText).toContain('Treat the user');
    expect(skillText).toContain('Bundled Skills');
    expect(skillText).toContain('Before every clone attempt, run `taptap-maker doctor`');
    expect(skillText).toContain('Directory Suitability Decision');
    expect(skillText).toContain('committed-but-unpushed local commits');
    expect(skillText).toContain('chore: wake maker build server');
    expect(skillText).toContain('confirm_remote_build_without_submit=true');
    expect(skillText).toContain('maker_page_url');
    expect(skillText).toContain('push_recovery');
    expect(skillText).toContain('Do not ask for permission to run a generic `git push`');
    expect(skillText).toContain('Maker Git Workflow Policy');
    expect(skillText).toContain('This policy overrides generic local Git skills');
    expect(skillText).toContain('Do not create feature branches, task branches, PR/MR');
    expect(skillText).toContain('Use `maker_build_current_directory` for submit, push, build');
    expect(skillText).toContain('The root `.gitignore` is a required Maker project file');
    expect(skillText).toContain('Maker Creative Asset Tool Policy');
    expect(skillText).toContain(
      'Prefer Maker MCP proxy tools over native AI image/video/audio tools'
    );
    expect(skillText).toContain('This policy overrides generic imagegen or native media skills');
    expect(skillText).toContain('Do not invoke imagegen');
    expect(skillText).toContain('Do not fall back to generic imagegen');
    expect(skillText).toContain('Before `edit_image`, resolve dragged or referenced images');
    expect(skillText).toContain('Do not call `edit_image` without an image path or CDN URL');
    expect(skillText).toContain('Use `generate_image` for one image');
    expect(skillText).toContain('Use `batch_generate_images` for multiple images');
    expect(skillText).toContain('Use `edit_image` for modifying project images');
    expect(skillText).toContain('Use `create_video_task` for game videos');
    expect(skillText).toContain('Use `text_to_music` for game music or audio');
    expect(skillText).toContain('assets/image');
    expect(skillText).toContain('assets/video');
    expect(skillText).toContain('assets/audio');
    expect(skillText).toContain('Attached Workspace Selection');
    expect(skillText).toContain('dialogues');
    expect(skillText).toContain('single attached workspace');
    expect(skillText).not.toContain('maker_exchange_pat');
    expect(skillText).not.toContain('maker_clone_to_current_directory');
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
    expect(skillText).toContain('taptap-maker dev-kit update');
    expect(skillText).toContain('maker_build_current_directory');
    expect(skillText).toContain('TapMaker 网页端查看结果');
    expect(skillText).not.toContain('maker_clone_to_current_directory');
    expect(skillText).not.toContain('maker_status`');
  });

  test('Update MCP skill validates compact Maker status surface', () => {
    const skillPath = path.join(process.cwd(), 'skills', UPDATE_TAPTAP_MCP_SKILL_NAME, 'SKILL.md');
    const skillText = fs.readFileSync(skillPath, 'utf8');

    expect(skillText).toContain('maker://status');
    expect(skillText).toContain('maker_status_lite');
    expect(skillText).not.toContain('maker_status`');
  });
});
