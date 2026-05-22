/**
 * Maker Git environment guidance tests.
 */

import { createGitInstallGuide, getGitCommand } from '../maker/system/git';

describe('maker git environment guidance', () => {
  const originalGitBin = process.env.TAPTAP_MAKER_GIT_BIN;

  afterEach(() => {
    if (originalGitBin === undefined) {
      delete process.env.TAPTAP_MAKER_GIT_BIN;
    } else {
      process.env.TAPTAP_MAKER_GIT_BIN = originalGitBin;
    }
  });

  test('uses git from PATH by default', () => {
    delete process.env.TAPTAP_MAKER_GIT_BIN;

    expect(getGitCommand()).toBe('git');
  });

  test('allows overriding git executable path', () => {
    process.env.TAPTAP_MAKER_GIT_BIN = '/opt/git/bin/git';

    expect(getGitCommand()).toBe('/opt/git/bin/git');
  });

  test('macOS guide only instructs the user and does not install automatically', () => {
    const guide = createGitInstallGuide('darwin').join('\n');

    expect(guide).toContain('不会代替用户安装 Git');
    expect(guide).toContain('git --version');
    expect(guide).toContain('https://git-scm.com/download/mac');
  });

  test('Windows guide explains PATH requirement and manual install options', () => {
    const guide = createGitInstallGuide('win32').join('\n');

    expect(guide).toContain('不会代替用户安装 Git');
    expect(guide).toContain('https://git-scm.com/download/win');
    expect(guide).toContain('PATH');
    expect(guide).toContain('TAPTAP_MAKER_GIT_BIN');
  });
});
