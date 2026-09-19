import { execFile } from 'node:child_process';
import path from 'node:path';
import { ConsoleError } from './types.js';

export async function chooseProjectDirectory(
  platform: NodeJS.Platform = process.platform,
  signal?: AbortSignal
): Promise<string | null> {
  let command: string;
  let args: string[];
  if (platform === 'darwin') {
    command = '/usr/bin/osascript';
    args = [
      '-e',
      [
        'try',
        'activate',
        'return POSIX path of (choose folder with prompt "选择 Maker 项目或包含项目的文件夹")',
        'on error number -128',
        'return ""',
        'end try',
      ].join('\n'),
    ];
  } else if (platform === 'win32') {
    command = path.win32.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const script = [
      '$ErrorActionPreference = "Stop"',
      'if (-not [Environment]::UserInteractive) { throw "MAKER_NO_INTERACTIVE_DESKTOP" }',
      '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
      'Add-Type -AssemblyName System.Windows.Forms',
      '[System.Windows.Forms.Application]::EnableVisualStyles()',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$dialog.Description = "选择 Maker 项目或包含项目的文件夹"',
      '$dialog.ShowNewFolderButton = $false',
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.TopMost = $true',
      '$owner.Text = "Maker - 选择项目文件夹"',
      '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
      '$owner.Size = New-Object System.Drawing.Size(360, 100)',
      'try {',
      '  $owner.Show()',
      '  $owner.Activate()',
      '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
      '    [Console]::WriteLine($dialog.SelectedPath)',
      '  }',
      '} finally { $dialog.Dispose(); $owner.Dispose() }',
    ].join('\n');
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ];
  } else {
    throw new ConsoleError('选择本地文件夹目前支持 macOS 和 Windows。');
  }
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 64 * 1024,
        signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.includes('MAKER_NO_INTERACTIVE_DESKTOP')
            ? '控制台进程无法访问 Windows 桌面，请从本机交互式终端启动控制台后重试。'
            : signal?.aborted
              ? '文件夹选择已取消。'
              : '无法打开文件夹选择窗口，或选择已超时，请重试。';
          reject(new ConsoleError(message, 422));
          return;
        }
        resolve(stdout.replace(/[\r\n]+$/, '') || null);
      }
    );
    // PowerShell must not wait for input from the background console server.
    child?.stdin?.end();
  });
}
