import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { CanvasStoreError } from '../model.js';
import { GitCommandError, runGit } from '../../git/exec.js';

jest.mock('../../git/exec.js', () => {
  const actual = jest.requireActual('../../git/exec.js');
  return { ...actual, runGit: jest.fn() };
});

const mockedRunGit = runGit as unknown as jest.Mock;

function project(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  const nested = path.join(root, 'canvas project 画布');
  fs.mkdirSync(nested);
  return fs.realpathSync(nested);
}

function mockGit(checkIgnoreCode?: number): void {
  mockedRunGit.mockImplementation(async (args: string[]) => {
    if (args[0] === 'rev-parse') return { stdout: 'true\n', stderr: '' };
    if (checkIgnoreCode === undefined) return { stdout: '', stderr: '' };
    throw new GitCommandError(
      'git check-ignore failed',
      'git check-ignore',
      checkIgnoreCode,
      '',
      ''
    );
  });
}

describe('canvas Git checks', () => {
  afterEach(() => {
    mockedRunGit.mockReset();
  });

  test('runs Git in the project directory without changing ignore rules', async () => {
    const root = project('maker-canvas-win-');
    mockGit();
    try {
      await new MakerCanvasFiles(root).assertWritableForGeneration();
      expect(mockedRunGit).toHaveBeenCalledTimes(2);
      for (const call of mockedRunGit.mock.calls) {
        expect(call[1]).toEqual({ cwd: root });
      }
      expect(mockedRunGit.mock.calls[0][0]).toEqual(['rev-parse', '--is-inside-work-tree']);
      expect(mockedRunGit.mock.calls[1][0]).toEqual([
        'check-ignore',
        '-q',
        '--',
        '.maker/canvases/check.json',
      ]);
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });

  test('still rejects a repository that does not ignore .maker', async () => {
    const root = project('maker-canvas-ignore-');
    mockGit(1);
    try {
      await expect(new MakerCanvasFiles(root).assertWritableForGeneration()).rejects.toMatchObject({
        code: 'GITIGNORE_REQUIRED',
        status: 409,
      });
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });

  test('does not treat an unknown Git failure as ignored', async () => {
    const root = project('maker-canvas-git-unknown-');
    mockGit(2);
    try {
      await expect(new MakerCanvasFiles(root).assertWritableForGeneration()).rejects.toBeInstanceOf(
        CanvasStoreError
      );
      await expect(new MakerCanvasFiles(root).assertWritableForGeneration()).rejects.toMatchObject({
        code: 'GITIGNORE_UNKNOWN',
      });
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });
});
