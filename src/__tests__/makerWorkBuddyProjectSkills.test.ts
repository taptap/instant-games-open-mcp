import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncWorkBuddyProjectSkills } from '../maker/cli/workBuddyProjectSkills';

describe('WorkBuddy Maker project skills', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-workbuddy-project-skills-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function addDevKitSkill(name: string, body = `# ${name}\n`, projectDir = tempDir): void {
    const skillDir = path.join(projectDir, '.installer', 'skills', name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} guide\n---\n\n${body}`,
      'utf8'
    );
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'references', 'guide.md'), `${name} reference\n`, 'utf8');
  }

  test('syncs only missing dev-kit skills into the WorkBuddy project directory', () => {
    addDevKitSkill('materials');
    addDevKitSkill('local-preview');
    const existingDir = path.join(tempDir, '.workbuddy', 'skills', 'taptap-maker-materials');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'user managed content\n', 'utf8');

    const result = syncWorkBuddyProjectSkills(tempDir);

    expect(result.installedSkills).toEqual(['taptap-maker-local-preview']);
    expect(result.skippedSkills).toEqual(['taptap-maker-materials']);
    const installedDir = path.join(tempDir, '.workbuddy', 'skills', 'taptap-maker-local-preview');
    expect(fs.lstatSync(installedDir).isDirectory()).toBe(true);
    expect(fs.lstatSync(installedDir).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(existingDir, 'SKILL.md'), 'utf8')).toBe(
      'user managed content\n'
    );
    expect(
      fs.readFileSync(
        path.join(
          tempDir,
          '.workbuddy',
          'skills',
          path.basename(installedDir),
          'references',
          'guide.md'
        ),
        'utf8'
      )
    ).toBe('local-preview reference\n');
  });

  test('does nothing when the dev-kit skill source is unavailable', () => {
    const result = syncWorkBuddyProjectSkills(tempDir);

    expect(result).toEqual({
      status: 'skipped',
      sourceDir: path.join(tempDir, '.installer', 'skills'),
      targetDir: path.join(tempDir, '.workbuddy', 'skills'),
      installedSkills: [],
      skippedSkills: [],
      reason: 'source_not_found',
    });
    expect(fs.existsSync(path.join(tempDir, '.workbuddy'))).toBe(false);
  });

  test('uses Windows-safe copies and directory links for paths with spaces and Chinese text', () => {
    const projectDir = path.join(tempDir, 'Windows 用户', 'Maker 游戏 项目');
    fs.mkdirSync(projectDir, { recursive: true });
    addDevKitSkill('素材 指南', '# Windows skill\n', projectDir);

    const result = syncWorkBuddyProjectSkills(projectDir, { platform: 'win32' });

    expect(result.installedSkills).toEqual(['taptap-maker-素材 指南']);
    const installedDir = path.join(projectDir, '.workbuddy', 'skills', 'taptap-maker-素材 指南');
    expect(fs.lstatSync(path.join(installedDir, 'SKILL.md')).isSymbolicLink()).toBe(false);
    const referencesStat = fs.lstatSync(path.join(installedDir, 'references'));
    expect(referencesStat.isSymbolicLink() || referencesStat.isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(installedDir, 'references', 'guide.md'), 'utf8')).toBe(
      '素材 指南 reference\n'
    );
  });

  test('copies directories when Windows junction creation is unavailable', () => {
    const projectDir = path.join(tempDir, 'Windows 回退', 'Maker 项目');
    fs.mkdirSync(projectDir, { recursive: true });
    addDevKitSkill('local-preview', '# Windows fallback\n', projectDir);
    const symlinkSpy = jest.spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw new Error('simulated Windows junction denial');
    });

    try {
      const result = syncWorkBuddyProjectSkills(projectDir, { platform: 'win32' });

      expect(result.installedSkills).toEqual(['taptap-maker-local-preview']);
      const installedDir = path.join(
        projectDir,
        '.workbuddy',
        'skills',
        'taptap-maker-local-preview'
      );
      expect(fs.lstatSync(path.join(installedDir, 'references')).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(path.join(installedDir, 'references', 'guide.md'), 'utf8')).toBe(
        'local-preview reference\n'
      );
    } finally {
      symlinkSpy.mockRestore();
    }
  });
});
