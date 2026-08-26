import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry } from 'yauzl';

import { getMakerApiBaseUrl, getMakerEnvironment, type MakerEnvironment } from '../config.js';
import { DEFAULT_DOWNLOAD_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../fetchTimeout.js';
import { identifyMakerProject } from '../server/identify.js';
import { loadJwt, loadPat } from '../storage.js';

const USER_SKILL_CLIENT_DIRS = ['.codex', '.cursor', '.workbuddy'] as const;

export interface PullMakerUserSkillsOptions {
  targetDir?: string;
  environment?: MakerEnvironment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface PullMakerUserSkillsResult {
  targetDir: string;
  sourceDir: string;
  environment: MakerEnvironment;
  installedSkills: string[];
  preservedSkills: string[];
}

export async function pullMakerUserSkills(
  options: PullMakerUserSkillsOptions = {}
): Promise<PullMakerUserSkillsResult> {
  const requestedDir = path.resolve(options.targetDir || process.cwd());
  const project = identifyMakerProject({ cwd: requestedDir });
  if (!project.projectRoot) {
    throw new Error(
      'Maker project not found. Run this command inside a bound Maker project or pass --target-dir.'
    );
  }

  const environment = getMakerEnvironment(options.environment, project.projectRoot);
  const token = loadPat()?.token || loadJwt()?.token;
  if (!token) {
    throw new Error('Maker authentication not found. Run `taptap-maker login` and try again.');
  }

  const sourceDir = path.join(project.projectRoot, '.installer', 'skills');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taptap-maker-user-skills-'));
  const archivePath = path.join(tempDir, 'user-skills.zip');
  const stagingDir = path.join(tempDir, 'skills');

  try {
    const response = await fetchWithTimeout(
      options.fetchImpl || fetch,
      `${getMakerApiBaseUrl(environment)}/user/skills/archive`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/zip',
          Authorization: `Bearer ${token}`,
        },
      },
      options.timeoutMs ?? DEFAULT_DOWNLOAD_FETCH_TIMEOUT_MS,
      'Maker user Skill download'
    );
    if (!response.ok) {
      throw createDownloadError(response.status);
    }

    fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
    const installedSkills = await extractUserSkillsArchive(archivePath, stagingDir);
    const preservedSkills = listLocalSkills(sourceDir).filter(
      (name) => !installedSkills.includes(name)
    );
    installUserSkills(project.projectRoot, stagingDir, installedSkills);
    installUserSkillsForClients(project.projectRoot, installedSkills);

    return {
      targetDir: project.projectRoot,
      sourceDir,
      environment,
      installedSkills,
      preservedSkills,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function validateUserSkillArchivePath(entryPath: string): string[] {
  if (
    !entryPath ||
    entryPath.includes('\\') ||
    entryPath.startsWith('/') ||
    /^[A-Za-z]:/u.test(entryPath) ||
    hasControlCharacter(entryPath)
  ) {
    throw new Error(`Maker user Skill archive contains an unsafe path: ${entryPath}`);
  }

  const trimmed = entryPath.endsWith('/') ? entryPath.slice(0, -1) : entryPath;
  const segments = trimmed.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Maker user Skill archive contains an unsafe path: ${entryPath}`);
  }
  return segments;
}

async function extractUserSkillsArchive(
  archivePath: string,
  stagingDir: string
): Promise<string[]> {
  fs.mkdirSync(stagingDir, { recursive: true });
  const zipFile = await yauzl.openPromise(archivePath, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  const skillNames = new Set<string>();
  const seenPaths = new Set<string>();

  try {
    for await (const entry of zipFile.eachEntry()) {
      const segments = validateUserSkillArchivePath(entry.fileName);
      if (segments.some((segment) => path.basename(segment).startsWith('.nfs'))) {
        continue;
      }

      const isDirectory = isZipDirectory(entry);
      validateZipEntryType(entry, isDirectory);
      if (!isDirectory && segments.length < 2) {
        throw new Error(
          `Maker user Skill archive contains a file outside a Skill: ${entry.fileName}`
        );
      }

      const collisionKey = segments.join('/').normalize('NFC').toLocaleLowerCase('en-US');
      if (seenPaths.has(collisionKey)) {
        throw new Error(`Maker user Skill archive contains a duplicate path: ${entry.fileName}`);
      }
      seenPaths.add(collisionKey);
      skillNames.add(segments[0]);

      const destination = path.join(stagingDir, ...segments);
      if (isDirectory) {
        fs.mkdirSync(destination, { recursive: true });
        continue;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const input = await zipFile.openReadStreamPromise(entry);
      await pipeline(input, fs.createWriteStream(destination, { flags: 'wx' }));
    }
  } finally {
    zipFile.close();
  }

  const installedSkills = [...skillNames].sort();
  for (const skillName of installedSkills) {
    const definitionPath = path.join(stagingDir, skillName, 'SKILL.md');
    let definition: fs.Stats;
    try {
      definition = fs.lstatSync(definitionPath);
    } catch {
      throw new Error(`Maker user Skill "${skillName}" is missing SKILL.md.`);
    }
    if (!definition.isFile() || definition.isSymbolicLink()) {
      throw new Error(`Maker user Skill "${skillName}" must contain a regular SKILL.md file.`);
    }
  }
  return installedSkills;
}

function validateZipEntryType(entry: Entry, isDirectory: boolean): void {
  if (entry.isEncrypted() || !entry.canDecodeFileData()) {
    throw new Error(`Maker user Skill archive contains an unsupported entry: ${entry.fileName}`);
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`Maker user Skill archive contains an unsupported entry: ${entry.fileName}`);
  }

  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const fileType = unixMode & 0o170000;
  if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
    throw new Error(`Maker user Skill archive contains a non-file entry: ${entry.fileName}`);
  }
  if (fileType === 0o040000 && !isDirectory) {
    throw new Error(`Maker user Skill archive contains an invalid directory: ${entry.fileName}`);
  }
}

function isZipDirectory(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return entry.fileName.endsWith('/') || (unixMode & 0o170000) === 0o040000;
}

function installUserSkills(projectRoot: string, stagingDir: string, skillNames: string[]): void {
  if (skillNames.length === 0) {
    return;
  }

  const installerDir = path.join(projectRoot, '.installer');
  const sourceDir = path.join(installerDir, 'skills');
  const transactionDir = path.join(installerDir, `.user-skills-${randomUUID()}`);
  const preparedDir = path.join(transactionDir, 'prepared');
  const backupDir = path.join(transactionDir, 'backup');
  const completed: Array<{ target: string; backup: string; hadExisting: boolean }> = [];
  fs.mkdirSync(preparedDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });

  try {
    for (const skillName of skillNames) {
      fs.cpSync(path.join(stagingDir, skillName), path.join(preparedDir, skillName), {
        recursive: true,
      });
    }

    for (const skillName of skillNames) {
      const target = path.join(sourceDir, skillName);
      const backup = path.join(backupDir, skillName);
      const hadExisting = pathExists(target);
      if (hadExisting) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(target, backup);
      }
      try {
        fs.renameSync(path.join(preparedDir, skillName), target);
        completed.push({ target, backup, hadExisting });
      } catch (error) {
        if (hadExisting && pathExists(backup) && !pathExists(target)) {
          fs.renameSync(backup, target);
        }
        throw error;
      }
    }
  } catch (error) {
    for (const item of completed.reverse()) {
      fs.rmSync(item.target, { recursive: true, force: true });
      if (item.hadExisting && pathExists(item.backup)) {
        fs.renameSync(item.backup, item.target);
      }
    }
    throw new Error(`Failed to install Maker user Skills: ${formatError(error)}`);
  } finally {
    fs.rmSync(transactionDir, { recursive: true, force: true });
  }
}

function installUserSkillsForClients(projectRoot: string, skillNames: string[]): void {
  if (skillNames.length === 0) {
    return;
  }

  const sourceRoot = path.join(projectRoot, '.installer', 'skills');
  try {
    for (const clientDir of USER_SKILL_CLIENT_DIRS) {
      const targetRoot = path.join(projectRoot, clientDir, 'skills');
      fs.mkdirSync(targetRoot, { recursive: true });

      for (const skillName of skillNames) {
        const source = path.join(sourceRoot, skillName);
        const target = path.join(targetRoot, skillName);
        removePathEntry(target);
        linkOrCopySkill(source, target);
      }
    }
  } catch (error) {
    throw new Error(`Failed to install Maker user Skills for AI clients: ${formatError(error)}`);
  }
}

function linkOrCopySkill(source: string, target: string): void {
  try {
    const linkTarget =
      process.platform === 'win32' ? source : path.relative(path.dirname(target), source);
    fs.symlinkSync(linkTarget, target, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (linkError) {
    removePathEntry(target);
    try {
      fs.cpSync(source, target, { recursive: true });
    } catch (copyError) {
      throw new Error(
        `Failed to link ${source}: ${formatError(linkError)}; copy fallback: ${formatError(copyError)}`
      );
    }
  }
}

function removePathEntry(value: string): void {
  try {
    const stat = fs.lstatSync(value);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(value);
      return;
    }
    fs.rmSync(value, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function listLocalSkills(sourceDir: string): string[] {
  try {
    return fs
      .readdirSync(sourceDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function createDownloadError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error('Maker authentication was rejected. Run `taptap-maker login` and try again.');
  }
  if (status === 413) {
    return new Error('Maker user Skill archive is too large to download.');
  }
  return new Error(`Maker user Skill download failed with HTTP ${status}.`);
}

function pathExists(value: string): boolean {
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

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
