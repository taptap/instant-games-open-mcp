import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { CanvasStoreError } from '../model.js';
import { getGitCommand } from '../../system/git.js';

jest.mock('node:child_process', () => {
  const { promisify } = require('node:util');
  const execFile = jest.fn();
  execFile[promisify.custom] = (file, args, options) =>
    new Promise((resolve, reject) => {
      execFile(file, args, options, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    });
  return { execFile };
});

const mockedExecFile = execFile as unknown as jest.Mock;

type ExecCallback = (error: NodeJS.ErrnoException | null, stdout?: string, stderr?: string) => void;

function project(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  const nested = path.join(root, 'canvas project 画布');
  fs.mkdirSync(nested);
  return fs.realpathSync(nested);
}

function mockGit(checkIgnoreCode?: number): void {
  mockedExecFile.mockImplementation(
    (_command: string, args: string[], _options: unknown, callback: ExecCallback) => {
      if (args[0] === 'rev-parse') {
        callback(null, 'true' + String.fromCharCode(10), '');
        return;
      }
      if (checkIgnoreCode === undefined) {
        callback(null, '', '');
        return;
      }
      const error = new Error('git check-ignore failed') as NodeJS.ErrnoException;
      error.code = checkIgnoreCode;
      callback(error, '', '');
    }
  );
}

describe('canvas Git checks on Windows', () => {
  afterEach(() => {
    mockedExecFile.mockReset();
  });

  test('hides Git console windows without changing ignore rules', async () => {
    const root = project('maker-canvas-win-');
    mockGit();
    try {
      await new MakerCanvasFiles(root).assertWritableForGeneration();
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
      for (const call of mockedExecFile.mock.calls) {
        expect(call[0]).toBe(getGitCommand());
        expect(call[2]).toEqual(expect.objectContaining({ cwd: root, windowsHide: true }));
        expect(call[2].shell).not.toBe(true);
      }
      expect(mockedExecFile.mock.calls[0][1]).toEqual(['rev-parse', '--is-inside-work-tree']);
      expect(mockedExecFile.mock.calls[1][1]).toEqual([
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
      expect(mockedExecFile.mock.calls[1][2]).toEqual(
        expect.objectContaining({ windowsHide: true })
      );
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
