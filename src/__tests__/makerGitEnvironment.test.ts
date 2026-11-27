/**
 * Maker Git environment guidance tests.
 */

import { spawnSync } from 'node:child_process';
import {
  createGitInstallGuide,
  ensureGitAvailable,
  getGitCommand,
  MakerGitNotFoundError,
} from '../maker/system/git';

jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));

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

  test.each(['EPERM', 'EACCES', 'ENOENT'])(
    'guides users based on the Git spawn code %s',
    (code) => {
      jest.mocked(spawnSync).mockReturnValueOnce({
        error: Object.assign(new Error(`spawn git ${code}`), { code }),
        status: null,
        pid: 0,
        output: [null, null, null],
        stdout: '',
        stderr: '',
        signal: null,
      });

      try {
        ensureGitAvailable();
        throw new Error('Git availability unexpectedly passed');
      } catch (error) {
        expect(error).toBeInstanceOf(MakerGitNotFoundError);
        const failure = error as MakerGitNotFoundError;
        expect(failure.environment.spawnErrorCode).toBe(code);
        expect(failure.message).toContain(`spawn git ${code}`);
        if (code === 'ENOENT') {
          expect(failure.message).toContain('Git 安装引导');
        } else {
          expect(failure.message).toContain('无权限启动 Git');
          expect(failure.message).not.toContain('Git 安装引导');
        }
      }
    }
  );

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
