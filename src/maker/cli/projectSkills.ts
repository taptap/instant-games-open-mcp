import fs from 'node:fs';
import path from 'node:path';

export interface ProjectSkillsSyncResult {
  status: 'installed' | 'skipped';
  sourceDir: string;
  targetDir: string;
  installedSkills: string[];
  skippedSkills: string[];
  reason?: 'source_not_found';
}

export function syncProjectSkills(
  targetDir: string,
  options: { client: '.agents' | '.workbuddy'; prefix?: string; platform?: NodeJS.Platform }
): ProjectSkillsSyncResult {
  const platform = options.platform ?? process.platform;
  const projectDir = path.resolve(targetDir);
  const sourceDir = path.join(projectDir, '.installer', 'skills');
  const skillsDir = path.join(projectDir, options.client, 'skills');
  const result: ProjectSkillsSyncResult = {
    status: 'skipped',
    sourceDir,
    targetDir: skillsDir,
    installedSkills: [],
    skippedSkills: [],
  };

  if (!isDirectory(sourceDir)) {
    result.reason = 'source_not_found';
    return result;
  }

  const sourceSkills = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && fs.existsSync(path.join(sourceDir, entry.name, 'SKILL.md'))
    )
    .map((entry) => entry.name)
    .sort();

  const installedSkillDirs: string[] = [];
  try {
    for (const sourceSkillName of sourceSkills) {
      const skillName = `${options.prefix || ''}${sourceSkillName}`;
      const skillDir = path.join(skillsDir, skillName);
      if (pathEntryExists(skillDir)) {
        result.skippedSkills.push(skillName);
        continue;
      }

      fs.mkdirSync(skillsDir, { recursive: true });
      installSkillContents(path.join(sourceDir, sourceSkillName), skillDir, platform);
      installedSkillDirs.push(skillDir);
      result.installedSkills.push(skillName);
    }
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const skillDir of installedSkillDirs.reverse()) {
      try {
        fs.rmSync(skillDir, { recursive: true, force: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throwWithCleanupFailures(error, cleanupErrors);
    }
    throw error;
  }

  if (result.installedSkills.length > 0) {
    result.status = 'installed';
  }
  return result;
}

function installSkillContents(
  sourceDir: string,
  targetDir: string,
  platform: NodeJS.Platform
): void {
  fs.mkdirSync(targetDir);
  try {
    for (const entry of fs.readdirSync(sourceDir)) {
      linkOrCopyEntry(path.join(sourceDir, entry), path.join(targetDir, entry), platform);
    }
  } catch (error) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (cleanupError) {
      throwWithCleanupFailures(error, [cleanupError]);
    }
    throw error;
  }
}

function linkOrCopyEntry(source: string, target: string, platform: NodeJS.Platform): void {
  const stat = fs.statSync(source);
  if (platform === 'win32' && stat.isFile()) {
    fs.copyFileSync(source, target);
    return;
  }

  try {
    const linkTarget = platform === 'win32' ? source : path.relative(path.dirname(target), source);
    const linkType = stat.isDirectory() ? (platform === 'win32' ? 'junction' : 'dir') : 'file';
    fs.symlinkSync(linkTarget, target, linkType);
  } catch (error) {
    try {
      fs.cpSync(source, target, { recursive: stat.isDirectory() });
    } catch (copyError) {
      throw new Error(
        `Failed to install project skill entry ${source}: ${formatError(error)}; copy fallback: ${formatError(copyError)}`
      );
    }
  }
}

function isDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function pathEntryExists(value: string): boolean {
  try {
    fs.lstatSync(value);
    return true;
  } catch {
    return false;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwWithCleanupFailures(primaryError: unknown, cleanupErrors: unknown[]): never {
  const details = cleanupErrors.map(formatError).join('; ');
  if (primaryError instanceof Error) {
    primaryError.message = `${primaryError.message}; cleanup failures: ${details}`;
    throw primaryError;
  }
  throw new Error(`Primary failure: ${formatError(primaryError)}; cleanup failures: ${details}`);
}
