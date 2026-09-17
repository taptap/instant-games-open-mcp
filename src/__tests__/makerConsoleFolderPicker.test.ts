import { execFile } from 'node:child_process';
import { chooseProjectDirectory } from '../maker/console/folderPicker';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

describe('console native folder picker', () => {
  const run = execFile as unknown as jest.Mock;
  beforeEach(() => run.mockReset());
  function result(error: Error | null, stdout = '') {
    run.mockImplementation((_file, _args, _options, callback) => callback(error, stdout, ''));
  }
  it('opens a macOS directory dialog and preserves spaces in the selected path', async () => {
    result(null, '/Users/test/My Game/\n');
    expect(await chooseProjectDirectory('darwin')).toBe('/Users/test/My Game/');
    expect(run.mock.calls[0][0]).toBe('/usr/bin/osascript');
    expect(run.mock.calls[0][1].join(' ')).toContain('choose folder');
  });
  it('treats cancellation as no selection', async () => {
    result(null, '\n');
    expect(await chooseProjectDirectory('darwin')).toBeNull();
  });
  it('uses an STA Windows dialog with UTF-8 output', async () => {
    result(null, 'C:\\游戏\\My Game\r\n');
    expect(await chooseProjectDirectory('win32')).toBe('C:\\游戏\\My Game');
    const args = run.mock.calls[0][1] as string[];
    expect(args).toContain('-STA');
    const script = Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString(
      'utf16le'
    );
    expect(script).toContain('FolderBrowserDialog');
    expect(script).toContain('UTF8Encoding');
  });
  it('reports dialog failures rather than pretending the user cancelled', async () => {
    result(new Error('failed'));
    await expect(chooseProjectDirectory('darwin')).rejects.toThrow('文件夹选择窗口');
  });
  it('does not launch a process on unsupported platforms', async () => {
    await expect(chooseProjectDirectory('linux')).rejects.toThrow('macOS');
    expect(run).not.toHaveBeenCalled();
  });
});
