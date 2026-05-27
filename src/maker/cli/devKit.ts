/**
 * Maker AI dev kit installation helpers used by the Maker MCP clone flow.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EnvConfig } from '../../core/utils/env.js';

export const AI_DEV_KIT_URLS: Record<'production' | 'rnd', string> = {
  production: 'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/stable/ai-dev-kit.zip',
  rnd: 'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/latest/ai-dev-kit.zip',
};

export const DEFAULT_AI_DEV_KIT_URL = AI_DEV_KIT_URLS.production;

/**
 * Pick the AI dev kit download URL based on TAPTAP_MCP_ENV.
 *
 * - production (default) → pd/stable
 * - rnd → rnd/latest
 */
export function resolveDefaultAiDevKitUrl(
  environment: 'production' | 'rnd' = EnvConfig.environment
): string {
  return AI_DEV_KIT_URLS[environment] || AI_DEV_KIT_URLS.production;
}

const DEV_KIT_IGNORE_BEGIN = '# >>> TapTap Maker AI dev kit (local only) >>>';
const DEV_KIT_IGNORE_END = '# <<< TapTap Maker AI dev kit (local only) <<<';
export const DEV_KIT_GITIGNORE_STAGING_FILE = '.gitignore.dev-kit-before-clone';
export const DEV_KIT_REQUIRED_ENTRIES = ['CLAUDE.md', 'examples', 'templates', 'urhox-libs'];
const ALWAYS_IGNORED_LOCAL_ENTRIES = ['.DS_Store', '.maker'];
export const DEV_KIT_MANAGED_ENTRY_CANDIDATES = [
  '.emmylua',
  'CLAUDE.md',
  'engine-docs',
  'examples',
  'templates',
  'urhox-libs',
];
const SKIPPED_TOP_LEVEL_ENTRIES = new Set(['scripts', '.DS_Store', 'ai-dev-kit.zip']);

export interface InstallAiDevKitOptions {
  targetDir?: string;
  sourceDir?: string;
  url?: string;
  preserveExisting?: boolean;
}

export interface InstallAiDevKitResult {
  targetDir: string;
  sourceDir: string;
  installedEntries: string[];
  skippedEntries: string[];
  gitignorePath: string;
  stagedGitignorePath: string;
}

export interface AiDevKitStatus {
  targetDir: string;
  requiredEntries: string[];
  presentEntries: string[];
  missingEntries: string[];
  ready: boolean;
}

export function inspectAiDevKit(targetDir: string): AiDevKitStatus {
  const resolvedTargetDir = path.resolve(targetDir);
  const presentEntries = DEV_KIT_REQUIRED_ENTRIES.filter((entry) =>
    fs.existsSync(path.join(resolvedTargetDir, entry))
  );
  const missingEntries = DEV_KIT_REQUIRED_ENTRIES.filter(
    (entry) => !presentEntries.includes(entry)
  );

  return {
    targetDir: resolvedTargetDir,
    requiredEntries: [...DEV_KIT_REQUIRED_ENTRIES],
    presentEntries,
    missingEntries,
    ready: missingEntries.length === 0,
  };
}

export function listPresentDevKitManagedEntries(targetDir: string): string[] {
  const resolvedTargetDir = path.resolve(targetDir);
  return DEV_KIT_MANAGED_ENTRY_CANDIDATES.filter((entry) =>
    fs.existsSync(path.join(resolvedTargetDir, entry))
  );
}

export async function installAiDevKit(
  options: InstallAiDevKitOptions = {}
): Promise<InstallAiDevKitResult> {
  const targetDir = path.resolve(options.targetDir || '.');
  fs.mkdirSync(targetDir, { recursive: true });

  const preparedSource = options.sourceDir
    ? path.resolve(options.sourceDir)
    : await downloadAndExtractDevKit(options.url || resolveDefaultAiDevKitUrl());
  const sourceDir = resolveDevKitRoot(preparedSource);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const installedEntries: string[] = [];
  const skippedEntries: string[] = [];

  for (const entry of entries) {
    if (SKIPPED_TOP_LEVEL_ENTRIES.has(entry.name)) {
      skippedEntries.push(entry.name);
      continue;
    }

    copyEntry(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
      preserveExisting: options.preserveExisting,
    });
    installedEntries.push(entry.name);
  }

  const stagedGitignorePath = path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE);
  writeDevKitStagedGitignore(stagedGitignorePath, installedEntries);

  return {
    targetDir,
    sourceDir,
    installedEntries: installedEntries.sort(),
    skippedEntries: skippedEntries.sort(),
    gitignorePath: path.join(targetDir, '.gitignore'),
    stagedGitignorePath,
  };
}

export function createDevKitGitignoreBlock(entries: string[]): string {
  const ignoreEntries = Array.from(
    new Set([...ALWAYS_IGNORED_LOCAL_ENTRIES, ...entries].map(formatIgnoreEntry))
  )
    .filter(Boolean)
    .sort();

  return [DEV_KIT_IGNORE_BEGIN, ...ignoreEntries, DEV_KIT_IGNORE_END].join('\n');
}

export function mergeDevKitGitignore(gitignorePath: string, entries: string[]): void {
  mergeDevKitGitignoreBlock(gitignorePath, createDevKitGitignoreBlock(entries));
}

export function writeDevKitStagedGitignore(stagedGitignorePath: string, entries: string[]): void {
  fs.writeFileSync(stagedGitignorePath, `${createDevKitGitignoreBlock(entries)}\n`, 'utf8');
}

export function mergeDevKitGitignoreBlock(gitignorePath: string, block: string): void {
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const withoutOldBlock = existing
    .replace(
      new RegExp(
        `${escapeRegExp(DEV_KIT_IGNORE_BEGIN)}[\\s\\S]*?${escapeRegExp(DEV_KIT_IGNORE_END)}\\n?`,
        'g'
      ),
      ''
    )
    .trimEnd();
  const next = [withoutOldBlock, block, ''].filter((part) => part.length > 0).join('\n\n');

  fs.writeFileSync(gitignorePath, next, 'utf8');
}

export function finalizeStagedDevKitGitignore(targetDir: string): boolean {
  const stagedGitignorePath = path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE);
  if (!fs.existsSync(stagedGitignorePath)) {
    return false;
  }

  const block = fs.readFileSync(stagedGitignorePath, 'utf8').trim();
  if (block.length > 0) {
    mergeDevKitGitignoreBlock(path.join(targetDir, '.gitignore'), block);
  }
  fs.rmSync(stagedGitignorePath, { force: true });
  return true;
}

function copyEntry(
  source: string,
  target: string,
  options: {
    preserveExisting?: boolean;
  } = {}
): void {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      if (child === '.DS_Store') {
        continue;
      }
      copyEntry(path.join(source, child), path.join(target, child), options);
    }
    return;
  }

  if (stat.isFile()) {
    if (options.preserveExisting && fs.existsSync(target)) {
      return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

async function downloadAndExtractDevKit(url: string): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taptap-maker-ai-dev-kit-'));
  const zipPath = path.join(tempDir, 'ai-dev-kit.zip');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AI dev kit download failed: HTTP ${response.status} ${response.statusText}`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(zipPath, payload);
  extractZip(zipPath, tempDir);
  fs.rmSync(zipPath, { force: true });
  return tempDir;
}

export function extractZip(zipPath: string, targetDir: string): void {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Expand-Archive',
        '-Force',
        '-LiteralPath',
        zipPath,
        '-DestinationPath',
        targetDir,
      ],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      throw new Error(`Failed to extract AI dev kit zip: ${formatSpawnFailure(result)}`);
    }
    return;
  }

  const unzipResult = spawnSync('unzip', ['-q', zipPath, '-d', targetDir], { encoding: 'utf8' });
  if (unzipResult.status === 0) {
    return;
  }

  const pythonFailures: string[] = [];
  for (const pythonCommand of ['python3', 'python']) {
    const pythonResult = spawnSync(
      pythonCommand,
      ['-c', PYTHON_ZIP_EXTRACT_SCRIPT, zipPath, targetDir],
      { encoding: 'utf8' }
    );
    if (pythonResult.status === 0) {
      return;
    }
    pythonFailures.push(`${pythonCommand}: ${formatSpawnFailure(pythonResult)}`);
  }

  throw new Error(
    [
      `Failed to extract AI dev kit zip: unzip: ${formatSpawnFailure(unzipResult)}`,
      ...pythonFailures,
    ].join('; ')
  );
}

const PYTHON_ZIP_EXTRACT_SCRIPT = String.raw`
import os
import sys
import zipfile

zip_path = sys.argv[1]
target_dir = os.path.abspath(sys.argv[2])

with zipfile.ZipFile(zip_path) as archive:
    for member in archive.infolist():
        destination = os.path.abspath(os.path.join(target_dir, member.filename))
        if os.path.commonpath([target_dir, destination]) != target_dir:
            raise RuntimeError("Blocked unsafe zip entry: " + member.filename)
    archive.extractall(target_dir)
`;

function formatSpawnFailure(result: ReturnType<typeof spawnSync>): string {
  return (
    result.error?.message ||
    String(result.stderr || '').trim() ||
    String(result.stdout || '').trim() ||
    `exit status ${result.status ?? 'unknown'}`
  );
}

function resolveDevKitRoot(sourceDir: string): string {
  const directEntries = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir) : [];
  if (looksLikeDevKitRoot(sourceDir)) {
    return sourceDir;
  }

  const childDirs = directEntries
    .map((entry) => path.join(sourceDir, entry))
    .filter((entryPath) => fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory());
  for (const childDir of childDirs) {
    if (looksLikeDevKitRoot(childDir)) {
      return childDir;
    }
  }

  throw new Error(`AI dev kit root not found under ${sourceDir}`);
}

function looksLikeDevKitRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'engine-docs')) ||
    fs.existsSync(path.join(dir, '.emmylua')) ||
    fs.existsSync(path.join(dir, 'urhox-libs'))
  );
}

function formatIgnoreEntry(entry: string): string {
  if (entry === '.DS_Store') {
    return entry;
  }
  return entry.endsWith('/') ? entry : fsSafeDirectoryPattern(entry);
}

function fsSafeDirectoryPattern(entry: string): string {
  return entry.includes('.') && !entry.startsWith('.') ? entry : `${entry}/`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
