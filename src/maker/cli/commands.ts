/**
 * User-facing TapTap Maker CLI commands.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getMakerEnvironment, getMakerPatTokensUrl, type MakerEnvironment } from '../config.js';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import { saveManualMakerPat } from '../git/pat.js';
import { getMakerHome, getPatPath, getTapAuthPath, loadPat, loadTapAuth } from '../storage.js';
import { identifyMakerProject } from '../server/identify.js';
import { cloneMakerProject, listMakerProjects, type MakerProjectProgress } from './projects.js';
import type { MakerProjectSummary } from '../types.js';
import {
  DEV_KIT_GITIGNORE_STAGING_FILE,
  finalizeStagedDevKitGitignore,
  inspectAiDevKit,
  installAiDevKit,
  listPresentDevKitManagedEntries,
  writeDevKitStagedGitignore,
} from './devKit.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  ensureGitAvailable,
  formatGitEnvironmentStatus,
} from '../system/git.js';
import { formatMakerSkillStatus } from './skill.js';

const DEFAULT_MCP_NAME = 'taptap-maker';
const DEFAULT_PACKAGE = '@taptap/instant-games-open-mcp';
const TWO_PART_COMMANDS = new Set(['pat', 'mcp', 'dev-kit']);
const BOOLEAN_OPTIONS = new Set([
  'json',
  'skip_confirm',
  'skip_mcp_install',
  'pat_stdin',
  'pat_from_stdin',
  'h',
  'help',
]);
const PAT_ARG_WARNING =
  'Warning: passing Maker PAT via command-line arguments exposes it via ps/shell history; prefer the interactive prompt or --pat-stdin.\n';

type ParsedArgs = {
  command: string[];
  options: Record<string, string | boolean>;
  positionals: string[];
};

type CliContext = {
  json: boolean;
};

export async function runMakerCli(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const ctx = { json: Boolean(parsed.options.json) };
  const [command, subcommand] = parsed.command;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    await runInit(parsed, ctx);
    return;
  }

  if (command === 'doctor') {
    await runDoctor(parsed, ctx);
    return;
  }

  if (command === 'apps') {
    await runApps(parsed, ctx);
    return;
  }

  if (command === 'pat' && subcommand === 'set') {
    await runPatSet(parsed, ctx);
    return;
  }

  if (command === 'mcp' && subcommand === 'install') {
    await runMcpInstall(parsed, ctx);
    return;
  }

  if (command === 'mcp' && subcommand === 'verify') {
    await runMcpVerify(parsed, ctx);
    return;
  }

  if (command === 'dev-kit' && subcommand === 'update') {
    await runDevKitUpdate(parsed, ctx);
    return;
  }

  throw new Error(`Unknown taptap-maker command: ${formatUnknownCommand(parsed.command)}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      if (equalIndex > 0) {
        options[toOptionKey(arg.slice(2, equalIndex))] = arg.slice(equalIndex + 1);
        continue;
      }

      const key = toOptionKey(arg.slice(2));
      if (BOOLEAN_OPTIONS.has(key)) {
        options[key] = true;
        continue;
      }
      const next = argv[index + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      options[arg.slice(1)] = true;
      continue;
    }

    if (command.length === 0) {
      command.push(arg);
      continue;
    }

    if (command.length === 1 && TWO_PART_COMMANDS.has(command[0])) {
      command.push(arg);
    } else {
      positionals.push(arg);
    }
  }

  return { command, options, positionals };
}

function toOptionKey(value: string): string {
  return value.replace(/-/g, '_');
}

async function runInit(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const env = makerEnvOption(parsed);
  const skipConfirm = booleanOption(parsed, 'skip_confirm');
  const skipMcpInstall = booleanOption(parsed, 'skip_mcp_install');
  const pkg = stringOption(parsed, 'package') || DEFAULT_PACKAGE;

  emit(ctx, 'init_start', 'TapTap Maker local initialization started', {
    target_dir: targetDir,
    env,
  });
  saveInitState(targetDir, {
    status: 'started',
    target_dir: targetDir,
    env,
  });

  const git = ensureGitAvailable();
  emit(ctx, 'doctor', 'Git is available', { version: git.version });

  const pat = await resolvePat(parsed, ctx);
  emit(ctx, 'pat', 'Maker PAT ready', { saved: getPatPath() });

  const tapAuth = await requestTapAuthWithPat(pat);
  emit(ctx, 'tap_auth', 'TapTap token exchanged and saved', {
    kid: mask(tapAuth.kid),
    saved: getTapAuthPath(),
  });

  const projects = await listMakerProjects({ pat });
  const selected = await resolveProjectSelection(parsed, projects, {
    skipConfirm,
  });
  emit(ctx, 'app', 'Maker app selected', {
    app_id: selected.id,
    name: selected.name,
    user_id: selected.user_id,
  });
  saveInitState(targetDir, {
    status: 'app_selected',
    target_dir: targetDir,
    env,
    selected_app_id: selected.id,
  });

  await prepareDevKit(targetDir, ctx);
  const cloneResult = await cloneMakerProject({
    appId: selected.id,
    targetDir,
    pat,
    userId: selected.user_id,
    sceEndpoint: selected.sce_endpoint || process.env.SCE_MCP_URL,
    onProgress: (progress) => emitProgress(ctx, 'clone', progress),
  });
  emit(ctx, 'clone', 'Maker project cloned or fetched', cloneResult);

  if (!skipMcpInstall) {
    const ides = parseIdeList(stringOption(parsed, 'register_mcp') || 'codex,cursor,claude');
    const installResults = installMcpConfigs({
      ides,
      env,
      pkg,
      mcpName: DEFAULT_MCP_NAME,
    });
    for (const result of installResults) {
      emit(ctx, 'mcp_install', result.message, result);
    }
  }

  saveInitState(targetDir, {
    status: 'completed',
    target_dir: targetDir,
    env,
    selected_app_id: selected.id,
  });
  emit(ctx, 'done', 'TapTap Maker initialization completed', {
    target_dir: targetDir,
    app_id: selected.id,
    next_step:
      'Restart or reload the AI client MCP session when you want MCP tools/resources to appear.',
  });
}

async function runDoctor(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const git = checkGitEnvironment();
  const pat = loadPat();
  const tapAuth = loadTapAuth();
  const identify = identifyMakerProject({ cwd: targetDir });
  const devKit = inspectAiDevKit(identify.projectRoot || targetDir);

  if (ctx.json) {
    writeJson({
      git,
      auth: {
        pat: Boolean(pat),
        tap_auth: Boolean(tapAuth),
      },
      project: identify,
      dev_kit: devKit,
    });
    return;
  }

  process.stdout.write(
    [
      'TapTap Maker doctor',
      '',
      'Git',
      formatGitEnvironmentStatus(git),
      '',
      'Auth',
      `- pat: ${pat ? 'found' : 'missing'} (${getPatPath()})`,
      `- tap_auth: ${tapAuth ? 'found' : 'missing'} (${getTapAuthPath()})`,
      pat ? '' : `- pat_page: ${getMakerPatTokensUrl(makerEnvOption(parsed))}`,
      '',
      'Project',
      `- target_dir: ${targetDir}`,
      `- project_id: ${identify.projectId || '(none)'}`,
      identify.configPath ? `- config: ${identify.configPath}` : '',
      '',
      'AI dev kit',
      `- ready: ${devKit.ready ? 'yes' : 'no'}`,
      `- missing_entries: ${devKit.missingEntries.join(', ') || '(none)'}`,
      '',
      formatMakerSkillStatus({ projectRoot: identify.projectRoot || targetDir }),
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

async function runApps(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const pat = stringOption(parsed, 'pat');
  const projects = await listMakerProjects({ pat });
  if (ctx.json) {
    writeJson(projects);
    return;
  }

  process.stdout.write(`${formatProjectList(projects)}\n`);
}

async function runPatSet(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const pat = await resolvePatSet(parsed);
  saveManualMakerPat(pat);
  const tapAuth = await requestTapAuthWithPat(pat);
  emit(ctx, 'pat', 'Maker PAT and TapTap token saved', {
    pat_path: getPatPath(),
    tap_auth_path: getTapAuthPath(),
    kid: mask(tapAuth.kid),
  });
}

async function resolvePatSet(parsed: ParsedArgs): Promise<string> {
  if (booleanOption(parsed, 'pat_stdin') || booleanOption(parsed, 'pat_from_stdin')) {
    const pat = fs.readFileSync(0, 'utf8').trim();
    if (!pat) {
      throw new Error('No PAT found on stdin.');
    }
    return pat;
  }

  const fromPositional = parsed.positionals[0];
  const fromOption = stringOption(parsed, 'pat');
  if (fromPositional || fromOption) {
    warnPatArgExposure();
    return fromPositional || fromOption!;
  }

  return promptRequired('PAT');
}

async function runMcpInstall(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const ides = parseIdeList(stringOption(parsed, 'ide') || stringOption(parsed, 'ides') || '');
  const results = installMcpConfigs({
    ides: ides.length > 0 ? ides : ['codex', 'cursor', 'claude'],
    env: makerEnvOption(parsed),
    pkg: stringOption(parsed, 'package') || DEFAULT_PACKAGE,
    mcpName: stringOption(parsed, 'name') || DEFAULT_MCP_NAME,
  });

  if (ctx.json) {
    writeJson(results);
    return;
  }

  process.stdout.write(`${results.map((result) => result.message).join('\n')}\n`);
}

async function runMcpVerify(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const command = getCurrentCliCommand();
  const result = spawnSync(command.command, [...command.args, 'help'], {
    encoding: 'utf8',
  });
  const payload = {
    command: [command.command, ...command.args, 'help'].join(' '),
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (ctx.json) {
    writeJson(payload);
    return;
  }
  process.stdout.write(
    [
      payload.ok ? '✓ taptap-maker can be spawned' : '✗ taptap-maker spawn failed',
      `- command: ${payload.command}`,
      `- status: ${payload.status}`,
      payload.stderr ? `- stderr:\n${indent(payload.stderr)}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

async function runDevKitUpdate(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const result = await installAiDevKit({
    targetDir,
    preserveExisting: true,
  });
  finalizeStagedDevKitGitignore(targetDir);
  emit(ctx, 'dev_kit', 'AI dev kit updated', result);
}

async function resolvePat(parsed: ParsedArgs, ctx: CliContext): Promise<string> {
  const fromArgs = stringOption(parsed, 'pat');
  if (fromArgs) {
    warnPatArgExposure();
    saveManualMakerPat(fromArgs);
    return fromArgs;
  }

  const cached = loadPat();
  if (cached?.token) {
    return cached.token;
  }

  if (booleanOption(parsed, 'skip_confirm')) {
    throw new Error(
      `Maker PAT missing. Create one at ${getMakerPatTokensUrl(makerEnvOption(parsed))}`
    );
  }

  emit(ctx, 'pat_required', 'Maker PAT is required', {
    pat_page: getMakerPatTokensUrl(makerEnvOption(parsed)),
  });
  const pat = await promptRequired('Paste Maker PAT');
  saveManualMakerPat(pat);
  return pat;
}

async function resolveProjectSelection(
  parsed: ParsedArgs,
  projects: MakerProjectSummary[],
  options: { skipConfirm: boolean }
): Promise<MakerProjectSummary> {
  const appId = stringOption(parsed, 'app_id') || parsed.positionals[0];
  if (appId) {
    return projects.find((project) => project.id === appId) || { id: appId };
  }

  if (projects.length === 0) {
    throw new Error('No Maker apps found for this PAT.');
  }

  if (options.skipConfirm) {
    throw new Error('Missing --app-id in non-interactive init mode.');
  }

  process.stdout.write(`${formatProjectList(projects)}\n`);
  const answer = await promptRequired('Choose app by index or app_id');
  const byIndex = Number(answer);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= projects.length) {
    return projects[byIndex - 1];
  }
  const selected = projects.find((project) => project.id === answer.trim());
  if (!selected) {
    throw new Error(`Unknown Maker app selection: ${answer}`);
  }
  return selected;
}

async function prepareDevKit(targetDir: string, ctx: CliContext): Promise<void> {
  const before = inspectAiDevKit(targetDir);
  if (before.ready) {
    writeDevKitStagedGitignore(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      listPresentDevKitManagedEntries(targetDir)
    );
    emit(ctx, 'dev_kit', 'AI dev kit already present', before);
    return;
  }

  try {
    const result = await installAiDevKit({ targetDir });
    emit(ctx, 'dev_kit', 'AI dev kit prepared', result);
  } catch (error) {
    emit(ctx, 'dev_kit_warning', 'AI dev kit preparation failed; clone will continue', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function installMcpConfigs(options: {
  ides: string[];
  env: MakerEnvironment;
  pkg: string;
  mcpName: string;
}): Array<{ ide: string; ok: boolean; message: string; path?: string }> {
  return options.ides.map((ide) => installMcpConfig(ide, options));
}

function installMcpConfig(
  ide: string,
  options: { env: MakerEnvironment; pkg: string; mcpName: string }
): { ide: string; ok: boolean; message: string; path?: string } {
  try {
    return installMcpConfigUnsafe(ide, options);
  } catch (error) {
    return {
      ide,
      ok: false,
      message: `✗ ${ide} MCP config update failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function installMcpConfigUnsafe(
  ide: string,
  options: { env: MakerEnvironment; pkg: string; mcpName: string }
): { ide: string; ok: boolean; message: string; path?: string } {
  if (ide === 'codex') {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    mergeCodexMcpConfig(configPath, options);
    return {
      ide,
      ok: true,
      path: configPath,
      message: `✓ Codex MCP config updated: ${configPath}`,
    };
  }

  if (ide === 'cursor') {
    const configPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    mergeJsonMcpConfig(configPath, options);
    return {
      ide,
      ok: true,
      path: configPath,
      message: `✓ Cursor MCP config updated: ${configPath}`,
    };
  }

  if (ide === 'claude') {
    const claudeResult = tryClaudeMcpAdd(options);
    if (claudeResult.ok) {
      return { ide, ok: true, message: '✓ Claude Code MCP config updated with claude mcp add' };
    }
    const configPath = path.join(os.homedir(), '.claude.json');
    mergeJsonMcpConfig(configPath, options);
    return {
      ide,
      ok: true,
      path: configPath,
      message: `✓ Claude fallback MCP config updated: ${configPath}`,
    };
  }

  return { ide, ok: false, message: `Skipped unknown IDE: ${ide}` };
}

function mergeJsonMcpConfig(
  configPath: string,
  options: { env: MakerEnvironment; pkg: string; mcpName: string }
): void {
  backupIfExists(configPath);
  const existing = readJsonObject(configPath);
  const mcpServers = asObject(existing.mcpServers);
  mcpServers[options.mcpName] = createJsonMcpServerConfig(options);
  existing.mcpServers = mcpServers;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
}

function mergeCodexMcpConfig(
  configPath: string,
  options: { env: MakerEnvironment; pkg: string; mcpName: string }
): void {
  backupIfExists(configPath);
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const sectionPattern = new RegExp(
    `\\n?\\[mcp_servers\\."${escapeRegExp(options.mcpName)}"(?:\\.[^\\]]+)?\\][\\s\\S]*?(?=\\n\\[(?!mcp_servers\\."${escapeRegExp(options.mcpName)}"(?:\\.|\\]))|$)`,
    'g'
  );
  const withoutOld = existing.replace(sectionPattern, '').trimEnd();
  const command = getNpxCommand();
  const section = [
    `[mcp_servers."${options.mcpName}"]`,
    `command = "${escapeToml(command)}"`,
    `args = ["-y", "-p", "${escapeToml(options.pkg)}", "taptap-maker"]`,
    '',
    `[mcp_servers."${options.mcpName}".env]`,
    `TAPTAP_MCP_ENV = "${options.env}"`,
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, [withoutOld, section].filter(Boolean).join('\n\n'), 'utf8');
}

function tryClaudeMcpAdd(options: { env: MakerEnvironment; pkg: string; mcpName: string }): {
  ok: boolean;
} {
  const command = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  const result = spawnSync(
    command,
    [
      'mcp',
      'add',
      '--scope',
      'user',
      '--transport',
      'stdio',
      '--env',
      `TAPTAP_MCP_ENV=${options.env}`,
      options.mcpName,
      '--',
      getNpxCommand(),
      '-y',
      '-p',
      options.pkg,
      'taptap-maker',
    ],
    { encoding: 'utf8' }
  );
  return { ok: result.status === 0 };
}

function createJsonMcpServerConfig(options: { env: MakerEnvironment; pkg: string }): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  return {
    command: getNpxCommand(),
    args: ['-y', '-p', options.pkg, 'taptap-maker'],
    env: {
      TAPTAP_MCP_ENV: options.env,
    },
  };
}

function getCurrentCliCommand(): { command: string; args: string[] } {
  if (process.argv[1]) {
    return { command: process.execPath, args: [process.argv[1]] };
  }
  return { command: process.platform === 'win32' ? 'taptap-maker.cmd' : 'taptap-maker', args: [] };
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function backupIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  fs.copyFileSync(filePath, `${filePath}.bak.${stamp}`);
}

function saveInitState(targetDir: string, state: Record<string, unknown>): void {
  fs.mkdirSync(getMakerHome(), { recursive: true });
  const key = crypto
    .createHash('sha256')
    .update(path.resolve(targetDir))
    .digest('hex')
    .slice(0, 16);
  fs.writeFileSync(
    path.join(getMakerHome(), `init-state-${key}.json`),
    `${JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
}

function formatProjectList(projects: MakerProjectSummary[]): string {
  if (projects.length === 0) {
    return 'No Maker apps found.';
  }
  return [
    `Maker apps (${projects.length})`,
    '',
    ...projects.map(
      (project, index) =>
        `${index + 1}. ${project.id}${project.name ? `  ${project.name}` : ''}${
          project.user_id ? `  user_id=${project.user_id}` : ''
        }${project.gameType ? `  gameType=${project.gameType}` : ''}${
          project.stage ? `  stage=${project.stage}` : ''
        }${project.lastConversationAt ? `  lastConversationAt=${project.lastConversationAt}` : ''}`
    ),
  ].join('\n');
}

function emit(ctx: CliContext, step: string, message: string, data?: unknown): void {
  if (ctx.json) {
    writeJson({ step, status: 'ok', message, data });
    return;
  }
  process.stdout.write(`${message}\n`);
}

function emitProgress(ctx: CliContext, step: string, progress: MakerProjectProgress): void {
  if (ctx.json) {
    writeJson({ step, status: 'progress', progress });
    return;
  }
  process.stdout.write(`- ${progress.phase || step}: ${progress.message}\n`);
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function promptRequired(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`${label} is required in non-interactive mode.`);
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${label}: `);
    if (!answer.trim()) {
      throw new Error(`${label} cannot be empty.`);
    }
    return answer.trim();
  } finally {
    rl.close();
  }
}

function warnPatArgExposure(): void {
  process.stderr.write(PAT_ARG_WARNING);
}

function formatUnknownCommand(command: string[]): string {
  if (command.length === 0) {
    return '(empty)';
  }

  const [primary, secondary] = command;
  if (!secondary) {
    return primary;
  }

  return `${primary} ${isKnownSubcommand(primary, secondary) ? secondary : '<redacted>'}`;
}

function isKnownSubcommand(command: string, subcommand: string): boolean {
  return (
    (command === 'pat' && subcommand === 'set') ||
    (command === 'mcp' && (subcommand === 'install' || subcommand === 'verify')) ||
    (command === 'dev-kit' && subcommand === 'update')
  );
}

function stringOption(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.options[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanOption(parsed: ParsedArgs, key: string): boolean {
  return parsed.options[key] === true || parsed.options[key] === 'true';
}

function makerEnvOption(parsed: ParsedArgs): MakerEnvironment {
  const env = stringOption(parsed, 'env');
  if (env === 'rnd' || env === 'production') {
    return env;
  }
  return getMakerEnvironment();
}

function parseIdeList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function mask(value: string): string {
  if (value.length <= 12) {
    return '***';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeToml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [--env rnd|production] [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--skip-confirm] [--skip-mcp-install] [--register-mcp codex,cursor,claude]',
      '                     [--package @taptap/instant-games-open-mcp] [--json]',
      '  taptap-maker doctor [--target-dir DIR] [--env rnd|production] [--json]',
      '  taptap-maker apps [--pat PAT] [--json]',
      '  taptap-maker pat set [--pat-stdin] [--json]',
      '  taptap-maker pat set [PAT|--pat PAT] [--json]  # warns: PAT appears in ps/history',
      '  taptap-maker mcp install [--ide codex,cursor,claude] [--env rnd|production]',
      '                             [--package @taptap/instant-games-open-mcp] [--json]',
      '  taptap-maker mcp verify',
      '  taptap-maker dev-kit update [--target-dir DIR] [--json]',
      '',
      'Windows note:',
      '  Generated MCP configs use npx.cmd automatically on Windows.',
      '',
    ].join('\n')
  );
}

export function formatCliError(error: unknown): string {
  if (error instanceof MakerGitNotFoundError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
