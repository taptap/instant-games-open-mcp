import fs from 'node:fs';
import path from 'node:path';

const FALLBACK_FONT = 'MiSans-Regular.ttf';

export type RuntimeResourcePreparation = {
  fallbackFont: 'existing' | 'copied' | 'missing';
  fallbackFontSource?: string;
  warnings: string[];
};

function defaultFontCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return [
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
      '/Library/Fonts/Arial Unicode.ttf',
    ];
  }
  if (platform === 'win32') {
    const windows = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    return [
      path.join(windows, 'Fonts', 'Deng.ttf'),
      path.join(windows, 'Fonts', 'Dengb.ttf'),
      path.join(windows, 'Fonts', 'msyh.ttc'),
    ];
  }
  return [];
}

function existingFile(filename: string): boolean {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}

export function ensurePreviewRuntimeResources(
  executable: string,
  options: {
    platform?: NodeJS.Platform;
    fontCandidates?: string[];
  } = {}
): RuntimeResourcePreparation {
  const runtimeRoot = path.dirname(fs.realpathSync(executable));
  // local_preview mounts loose Res only; Data/CoreData come from Autoload packages.
  const fonts = path.join(runtimeRoot, 'Res', 'Fonts');
  const legacyFonts = path.join(runtimeRoot, 'Data', 'Fonts');
  for (const directory of [
    path.join(runtimeRoot, 'Data', 'LuaScripts'),
    legacyFonts,
    fonts,
    path.join(runtimeRoot, 'CoreData'),
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const target = path.join(fonts, FALLBACK_FONT);
  if (fs.existsSync(target)) return { fallbackFont: 'existing', warnings: [] };

  const platform = options.platform || process.platform;
  const candidates = [
    path.join(legacyFonts, FALLBACK_FONT),
    ...(options.fontCandidates || defaultFontCandidates(platform)),
  ];
  const copyErrors: string[] = [];
  for (const candidate of candidates) {
    if (!existingFile(candidate)) continue;
    try {
      fs.copyFileSync(candidate, target, fs.constants.COPYFILE_EXCL);
      return { fallbackFont: 'copied', fallbackFontSource: candidate, warnings: [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return { fallbackFont: 'existing', warnings: [] };
      }
      copyErrors.push(String(error));
    }
  }

  return {
    fallbackFont: 'missing',
    warnings: [
      `Chinese fallback font was not found for ${platform}; ${target} was not created.` +
        (copyErrors.length ? ` Copy failed: ${copyErrors.join('; ')}` : ''),
    ],
  };
}
