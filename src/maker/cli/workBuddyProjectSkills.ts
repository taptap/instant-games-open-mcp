import fs from 'node:fs';
import path from 'node:path';

export interface WorkBuddyProjectSkillsSyncResult {
  status: 'installed' | 'skipped';
  sourceDir: string;
  targetDir: string;
  installedSkills: string[];
  skippedSkills: string[];
  reason?: 'source_not_found';
}

export function syncWorkBuddyProjectSkills(
  targetDir: string,
  options: { platform?: NodeJS.Platform } = {}
): WorkBuddyProjectSkillsSyncResult {
  const platform = options.platform ?? process.platform;
  const projectDir = path.resolve(targetDir);
  const sourceDir = path.join(projectDir, '.installer', 'skills');
  const workBuddySkillsDir = path.join(projectDir, '.workbuddy', 'skills');
  const result: WorkBuddyProjectSkillsSyncResult = {
    status: 'skipped',
    sourceDir,
    targetDir: workBuddySkillsDir,
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

  for (const sourceSkillName of sourceSkills) {
    const workBuddySkillName = `taptap-maker-${sourceSkillName}`;
    const workBuddySkillDir = path.join(workBuddySkillsDir, workBuddySkillName);
    if (pathEntryExists(workBuddySkillDir)) {
      result.skippedSkills.push(workBuddySkillName);
      continue;
    }

    fs.mkdirSync(workBuddySkillsDir, { recursive: true });
    installSkillContents(path.join(sourceDir, sourceSkillName), workBuddySkillDir, platform);
    result.installedSkills.push(workBuddySkillName);
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
    fs.rmSync(targetDir, { recursive: true, force: true });
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
        `Failed to install WorkBuddy project skill entry ${source}: ${formatError(error)}; copy fallback: ${formatError(copyError)}`
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
