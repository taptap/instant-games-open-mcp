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
  '.claude',
  '.cli',
  '.codex',
  '.cursor',
  '.emmylua',
  '.gemini',
  '.installer',
  'AGENTS.md',
  'CLAUDE.md',
  'engine-docs',
  'examples',
  'schemas',
  'skills',
  'templates',
  'tools',
  'urhox-libs',
];
const SKIPPED_TOP_LEVEL_ENTRIES = new Set(['scripts', '.DS_Store', 'ai-dev-kit.zip']);
const SKILL_INSTALLER_OUTPUT_ENTRIES = ['.claude', '.codex', '.cursor', '.gemini'];

export interface InstallAiDevKitOptions {
  targetDir?: string;
  sourceDir?: string;
  url?: string;
  preserveExisting?: boolean;
  onSkillInstallerStart?: (event: AiDevKitSkillInstallerStart) => void;
}

export interface InstallAiDevKitResult {
  targetDir: string;
  sourceDir: string;
  installedEntries: string[];
  skippedEntries: string[];
  gitignorePath: string;
  stagedGitignorePath: string;
  skillInstaller?: AiDevKitSkillInstallerResult;
}

export interface AiDevKitSkillInstallerResult {
  ok: boolean;
  status: 'installed' | 'skipped' | 'failed';
  script?: string;
  stdout: string;
  stderr: string;
  summary: string;
  reason?: string;
  error?: string;
}

export interface AiDevKitSkillInstallerStart {
  platform: NodeJS.Platform;
  script: string;
  cwd: string;
  command: string[];
}

export interface AiDevKitSkillInstallStatus {
  status: 'installed' | 'partial' | 'missing';
  summary: string;
  targets: Array<{
    name: string;
    path: string;
    present: boolean;
    skillCount: number;
  }>;
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

  const skillInstaller = runDevKitSkillInstallerForInstall(targetDir, {
    onStart: options.onSkillInstallerStart,
  });

  const stagedGitignorePath = path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE);
  writeDevKitStagedGitignore(stagedGitignorePath, [
    ...installedEntries,
    ...listPresentSkillInstallerOutputEntries(targetDir),
  ]);

  return {
    targetDir,
    sourceDir,
    installedEntries: installedEntries.sort(),
    skippedEntries: skippedEntries.sort(),
    gitignorePath: path.join(targetDir, '.gitignore'),
    stagedGitignorePath,
    skillInstaller,
  };
}

export function inspectAiDevKitSkillInstallStatus(targetDir: string): AiDevKitSkillInstallStatus {
  const resolvedTargetDir = path.resolve(targetDir);
  const targets = SKILL_INSTALLER_OUTPUT_ENTRIES.map((entry) => {
    const skillsDir = path.join(resolvedTargetDir, entry, 'skills');
    const present = fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory();
    const skillCount = present
      ? fs
          .readdirSync(skillsDir, { withFileTypes: true })
          .filter((item) => item.isDirectory() || item.isSymbolicLink()).length
      : 0;
    return {
      name: entry.replace(/^\./, ''),
      path: skillsDir,
      present,
      skillCount,
    };
  });
  const installedCount = targets.filter((target) => target.present && target.skillCount > 0).length;
  const status =
    installedCount === targets.length ? 'installed' : installedCount > 0 ? 'partial' : 'missing';
  return {
    status,
    summary: targets.map((target) => `${target.name}=${target.skillCount}`).join(', '),
    targets,
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

/**
 * Runs the dev-kit skill installer synchronously for short-lived CLI flows only.
 * Do not call this from long-lived MCP request handlers; use lightweight status
 * inspection there to avoid blocking the server event loop.
 */
export function installAiDevKitSkills(
  targetDir: string,
  options: { onStart?: (event: AiDevKitSkillInstallerStart) => void } = {}
): AiDevKitSkillInstallerResult {
  const toolsDir = path.join(targetDir, 'tools');
  if (!fs.existsSync(toolsDir) || !fs.statSync(toolsDir).isDirectory()) {
    return {
      ok: false,
      status: 'skipped',
      stdout: '',
      stderr: '',
      summary: 'skipped: tools directory not found',
      reason: 'tools_not_found',
    };
  }

  const isWindows = process.platform === 'win32';
  const scriptName = isWindows ? 'install-skills.ps1' : 'install-skills.sh';
  const scriptPath = path.join(toolsDir, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      status: 'skipped',
      script: scriptPath,
      stdout: '',
      stderr: '',
      summary: `skipped: ${scriptName} not found`,
      reason: 'script_not_found',
    };
  }
  const command = isWindows
    ? ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, 'all']
    : ['bash', scriptPath, 'all'];

  options.onStart?.({
    platform: process.platform,
    script: scriptPath,
    cwd: toolsDir,
    command,
  });

  const result = spawnSync(command[0], command.slice(1), { cwd: toolsDir, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new AiDevKitSkillInstallerError(
      formatFailedSkillInstallerResult({
        platform: process.platform,
        scriptPath,
        toolsDir,
        command,
        result,
      })
    );
  }

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  return {
    ok: true,
    status: 'installed',
    script: scriptPath,
    stdout,
    stderr,
    summary: summarizeSkillInstallerOutput(stdout),
  };
}

function runDevKitSkillInstallerForInstall(
  targetDir: string,
  options: { onStart?: (event: AiDevKitSkillInstallerStart) => void } = {}
): AiDevKitSkillInstallerResult {
  try {
    return installAiDevKitSkills(targetDir, options);
  } catch (error) {
    if (error instanceof AiDevKitSkillInstallerError) {
      return error.result;
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 'failed',
      stdout: '',
      stderr: '',
      summary: 'failed',
      reason: 'installer_failed',
      error: message,
    };
  }
}

function listPresentSkillInstallerOutputEntries(targetDir: string): string[] {
  return SKILL_INSTALLER_OUTPUT_ENTRIES.filter((entry) =>
    fs.existsSync(path.join(targetDir, entry))
  );
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

function formatDevKitSkillInstallerFailure(options: {
  platform: NodeJS.Platform;
  scriptPath: string;
  toolsDir: string;
  command: string[];
  result: ReturnType<typeof spawnSync>;
}): string {
  return [
    'Failed to install AI dev kit skills',
    `platform: ${options.platform}`,
    `script: ${options.scriptPath}`,
    `cwd: ${options.toolsDir}`,
    `command: ${options.command.map(shellQuote).join(' ')}`,
    `exit_status: ${options.result.status ?? 'unknown'}`,
    options.result.signal ? `signal: ${options.result.signal}` : '',
    options.result.error ? `spawn_error: ${options.result.error.message}` : '',
    'stdout:',
    formatSpawnOutput(options.result.stdout),
    'stderr:',
    formatSpawnOutput(options.result.stderr),
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function formatFailedSkillInstallerResult(options: {
  platform: NodeJS.Platform;
  scriptPath: string;
  toolsDir: string;
  command: string[];
  result: ReturnType<typeof spawnSync>;
}): AiDevKitSkillInstallerResult {
  return {
    ok: false,
    status: 'failed',
    script: options.scriptPath,
    stdout: String(options.result.stdout || ''),
    stderr: String(options.result.stderr || ''),
    summary: summarizeSkillInstallerFailure(options.result),
    reason: 'installer_failed',
    error: formatDevKitSkillInstallerFailure(options),
  };
}

function summarizeSkillInstallerFailure(result: ReturnType<typeof spawnSync>): string {
  if (typeof result.status === 'number') {
    return `failed: exit_status=${result.status}`;
  }
  if (result.signal) {
    return `failed: signal=${result.signal}`;
  }
  if (result.error) {
    return `failed: ${result.error.message}`;
  }
  return 'failed';
}

class AiDevKitSkillInstallerError extends Error {
  constructor(readonly result: AiDevKitSkillInstallerResult) {
    super(result.error || result.summary);
    this.name = 'AiDevKitSkillInstallerError';
  }
}

function formatSpawnOutput(value: unknown): string {
  const text = String(value || '').trim();
  return text.length > 0 ? text : '(empty)';
}

function summarizeSkillInstallerOutput(stdout: string): string {
  const entries = stdout
    .split(/\r?\n/)
    .map((line) => line.match(/\[install-skills\]\s+([^:]+):\s+installed=(\d+)/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => `${match[1]}=${match[2]}`);

  return entries.length > 0 ? entries.join(', ') : 'completed';
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
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
