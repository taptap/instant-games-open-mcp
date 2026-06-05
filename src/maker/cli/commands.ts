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
import {
  getMakerEnvironment,
  setMakerEnvironmentOverride,
  type MakerEnvironment,
} from '../config.js';
import { loginWithCliAuthCode } from '../auth/cliLogin.js';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import { saveManualMakerPat } from '../git/pat.js';
import {
  getMakerHome,
  getPatPath,
  getTapAuthPath,
  loadPat,
  loadProjectConfig,
  loadTapAuth,
  saveProjectConfig,
} from '../storage.js';
import { identifyMakerProject } from '../server/identify.js';
import {
  createRemoteRuntimeLogClient,
  createRemoteProxyContext,
  stopExistingRuntimeLogWatcher,
} from '../server/mcp.js';
import { DEFAULT_RUNTIME_LOG_TOPICS, watchRuntimeLogs } from '../server/runtimeLogs.js';
import { cloneMakerProject, listMakerProjects, type MakerProjectProgress } from './projects.js';
import type { MakerProjectSummary } from '../types.js';
import {
  checkAiDevKitUpdate,
  DEV_KIT_GITIGNORE_STAGING_FILE,
  finalizeStagedDevKitGitignore,
  inspectAiDevKit,
  installAiDevKit,
  installAiDevKitSkills,
  listPresentDevKitManagedEntries,
  writeDevKitStagedGitignore,
  type AiDevKitSkillInstallerStart,
} from './devKit.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  ensureGitAvailable,
  formatGitEnvironmentStatus,
} from '../system/git.js';
import { formatMakerSkillStatus } from './skill.js';

const DEFAULT_MCP_NAME = 'taptap-maker';
const MAKER_NPM_PACKAGE = '@taptap/maker';
const TWO_PART_COMMANDS = new Set(['pat', 'mcp', 'dev-kit', 'logs']);
const BOOLEAN_OPTIONS = new Set([
  'json',
  'skip_confirm',
  'skip_mcp_install',
  'pat_stdin',
  'pat_from_stdin',
  'reset',
  'all',
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
  setMakerEnvironmentOverride(makerEnvOption(parsed));
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

  if (command === 'login') {
    await runLogin(parsed, ctx);
    return;
  }

  if (command === 'pat' && subcommand === 'set') {
    await runPatSet(parsed, ctx);
    return;
  }

  if (command === 'install') {
    await runMcpInstall(parsed, ctx);
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

  if (command === 'logs' && subcommand === 'watch') {
    await runLogsWatch(parsed, ctx);
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
  rejectPackageOption(parsed);
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const env = makerEnvOption(parsed);
  const skipConfirm = booleanOption(parsed, 'skip_confirm');
  const skipMcpInstall = booleanOption(parsed, 'skip_mcp_install');

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

  const tapAuth = await requestTapAuthWithPat(pat, env).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  emit(ctx, 'tap_auth', 'TapTap token exchanged and saved', {
    kid: mask(tapAuth.kid),
    saved: getTapAuthPath(),
  });

  const existingProjectConfig = loadProjectConfig(targetDir);
  const projects = await listMakerProjects({ pat }).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  const selected = await resolveProjectSelection(parsed, projects, {
    existingProjectConfig,
    skipConfirm,
  });
  emit(ctx, 'app', 'Maker app selected', {
    app_id: selected.id,
    name: selected.name,
    user_id: selected.user_id,
  });
  ensureInitTargetCanRecordProject(targetDir, existingProjectConfig?.project_id, selected.id);
  saveProjectConfig(targetDir, {
    project_id: selected.id,
    user_id: selected.user_id || existingProjectConfig?.user_id,
    sce_endpoint: selected.sce_endpoint || existingProjectConfig?.sce_endpoint,
  });
  saveInitState(targetDir, {
    status: 'app_selected',
    target_dir: targetDir,
    env,
    selected_app_id: selected.id,
  });

  const cloneResult = await cloneMakerProject({
    appId: selected.id,
    targetDir,
    pat,
    userId: selected.user_id,
    sceEndpoint: selected.sce_endpoint || process.env.SCE_MCP_URL,
    onProgress: (progress) => emitProgress(ctx, 'clone', progress),
  }).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  emit(ctx, 'clone', 'Maker project cloned or fetched', cloneResult);
  await prepareDevKit(targetDir, ctx, {
    finalizeGitignore: true,
    forceInstall: true,
    environment: env,
  });

  if (!skipMcpInstall) {
    const ides = parseIdeList(stringOption(parsed, 'register_mcp') || 'codex,cursor,claude');
    const installResults = installMcpConfigs({
      ides,
      env,
      pkg: MAKER_NPM_PACKAGE,
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
  const env = makerEnvOption(parsed);
  const git = checkGitEnvironment();
  const pat = loadPat();
  const tapAuth = loadTapAuth();
  const identify = identifyMakerProject({ cwd: targetDir });
  const isProjectBound = Boolean(identify.projectRoot);
  const projectRoot = identify.projectRoot || targetDir;
  const devKit = inspectAiDevKit(projectRoot);
  const devKitUpdate = await checkAiDevKitUpdate(projectRoot, { environment: env });

  if (ctx.json) {
    writeJson({
      env,
      git,
      auth: {
        pat: Boolean(pat),
        tap_auth: Boolean(tapAuth),
      },
      project: identify,
      dev_kit: devKit,
      dev_kit_update: devKitUpdate,
    });
    return;
  }

  process.stdout.write(
    [
      'TapTap Maker doctor',
      `env: ${env}`,
      '',
      'Git',
      formatGitEnvironmentStatus(git),
      '',
      'Auth',
      `- pat: ${pat ? 'found' : 'missing'} (${getPatPath()})`,
      `- tap_auth: ${tapAuth ? 'found' : 'missing'} (${getTapAuthPath()})`,
      pat
        ? ''
        : isProjectBound
          ? '- next_auth_step: taptap-maker login'
          : '- next_step: taptap-maker init',
      '',
      'Project',
      `- target_dir: ${targetDir}`,
      `- project_id: ${identify.projectId || '(none)'}`,
      identify.configPath ? `- config: ${identify.configPath}` : '',
      '',
      'AI dev kit',
      `- ready: ${devKit.ready ? 'yes' : 'no'}`,
      `- missing_entries: ${devKit.missingEntries.join(', ') || '(none)'}`,
      `- installed_version: ${devKitUpdate.installed?.version || '(unknown)'}`,
      `- latest_version: ${devKitUpdate.latest?.version || '(unknown)'}`,
      `- update_available: ${devKitUpdate.updateAvailable ? 'yes' : 'no'}`,
      devKitUpdate.versionCheckError ? `- version_check: ${devKitUpdate.versionCheckError}` : '',
      '',
      formatMakerSkillStatus({ projectRoot }),
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

async function runApps(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectRemovedAppsPaginationOptions(parsed);
  const pat = stringOption(parsed, 'pat');
  if (pat) {
    warnPatArgExposure();
  }
  const showAll = booleanOption(parsed, 'all');
  const projects = await listMakerProjects({ pat }).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  if (ctx.json) {
    writeJson(projects);
    return;
  }

  process.stdout.write(`${formatMakerProjectList(projects, { showAll })}\n`);
}

async function runLogin(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const env = makerEnvOption(parsed);
  const pat = await loginWithCliAuthCode({
    env,
    onStatus: (message) => emit(ctx, 'login', message),
  });
  saveManualMakerPat(pat.token);
  const tapAuth = await requestTapAuthWithPat(pat.token, env).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  emit(ctx, 'login', 'Maker CLI login completed', {
    env,
    code: pat.code,
    pat_path: getPatPath(),
    tap_auth_path: getTapAuthPath(),
    kid: mask(tapAuth.kid),
  });
}

async function runPatSet(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const pat = await resolvePatSet(parsed, ctx);
  saveManualMakerPat(pat);
  const env = makerEnvOption(parsed);
  const tapAuth = await requestTapAuthWithPat(pat, env).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
  emit(ctx, 'pat', 'Maker PAT and TapTap token saved', {
    pat_path: getPatPath(),
    tap_auth_path: getTapAuthPath(),
    kid: mask(tapAuth.kid),
  });
}

async function resolvePatSet(parsed: ParsedArgs, ctx: CliContext): Promise<string> {
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

  if (!ctx.json) {
    process.stdout.write('Starting Maker CLI login...\n');
  }
  const result = await loginWithCliAuthCode({
    env: makerEnvOption(parsed),
    onStatus: (message) => emit(ctx, 'login', message),
  });
  return result.token;
}

async function runMcpInstall(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectPackageOption(parsed);
  const ides = parseIdeList(stringOption(parsed, 'ide') || stringOption(parsed, 'ides') || '');
  const results = installMcpConfigs({
    ides: ides.length > 0 ? ides : ['codex', 'cursor', 'claude'],
    env: makerEnvOption(parsed),
    pkg: MAKER_NPM_PACKAGE,
    mcpName: stringOption(parsed, 'name') || DEFAULT_MCP_NAME,
  });

  if (ctx.json) {
    writeJson(results);
    return;
  }

  process.stdout.write(`${results.map((result) => result.message).join('\n')}\n`);
}

async function runMcpVerify(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectPackageOption(parsed);
  const mode = mcpVerifyModeOption(parsed);
  const command = mode === 'npx' ? getNpxCliCommand(MAKER_NPM_PACKAGE) : getCurrentCliCommand();
  const result = spawnSync(command.command, [...command.args, 'help'], {
    encoding: 'utf8',
  });
  const failureType = classifyMcpVerifyFailure(result);
  const commandText = formatShellCommand([command.command, ...command.args, 'help']);
  const payload = {
    mode,
    package: mode === 'npx' ? MAKER_NPM_PACKAGE : undefined,
    command: commandText,
    status: result.status,
    signal: result.signal,
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
    failure_type: failureType,
    explanation: failureType ? getMcpVerifyFailureExplanation(mode, failureType) : undefined,
    next_steps: failureType ? getMcpVerifyNextSteps(mode, commandText) : undefined,
    is_maker_mcp_started: false,
  };
  if (ctx.json) {
    writeJson(payload);
    return;
  }
  process.stdout.write(
    [
      payload.ok
        ? '✓ MCP config command can spawn taptap-maker'
        : '✗ MCP config command check failed before Maker MCP started',
      `- mode: ${payload.mode}`,
      `- command: ${payload.command}`,
      mode === 'npx'
        ? '- scope: verifies the npx command written by taptap-maker mcp install'
        : '- scope: verifies only the currently running CLI binary',
      `- status: ${payload.status}`,
      payload.signal ? `- signal: ${payload.signal}` : '',
      payload.failure_type ? `- failure_type: ${payload.failure_type}` : '',
      payload.explanation ? `- explanation: ${payload.explanation}` : '',
      payload.error ? `- error: ${payload.error}` : '',
      payload.stderr ? `- stderr:\n${indent(payload.stderr)}` : '',
      payload.next_steps
        ? ['Next steps:', ...payload.next_steps.map((step, index) => `${index + 1}. ${step}`)].join(
            '\n'
          )
        : '',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function classifyMcpVerifyFailure(
  result: ReturnType<typeof spawnSync>
): 'spawn_error' | 'signal' | 'non_zero_exit' | 'unknown_no_status' | undefined {
  if (result.status === 0) {
    return undefined;
  }
  if (result.error) {
    return 'spawn_error';
  }
  if (result.signal) {
    return 'signal';
  }
  if (typeof result.status === 'number') {
    return 'non_zero_exit';
  }
  return 'unknown_no_status';
}

function getMcpVerifyFailureExplanation(
  mode: 'npx' | 'self',
  failureType: 'spawn_error' | 'signal' | 'non_zero_exit' | 'unknown_no_status'
): string {
  if (mode === 'self') {
    return [
      'The current taptap-maker CLI help command did not exit cleanly.',
      'This is a local CLI startup check, not a Maker MCP business error.',
    ].join(' ');
  }

  const base = 'This is a local Node/npm/npx startup check, not a Maker MCP business error.';
  if (failureType === 'non_zero_exit') {
    return `The configured npx command exited with a non-zero status. ${base}`;
  }
  if (failureType === 'spawn_error') {
    return `The configured npx command could not be spawned. ${base}`;
  }
  if (failureType === 'signal') {
    return `The configured npx command was terminated by a signal. ${base}`;
  }
  return `The configured npx command did not exit normally. ${base}`;
}

function getMcpVerifyNextSteps(mode: 'npx' | 'self', commandText: string): string[] {
  if (mode === 'self') {
    return ['Run `taptap-maker help` directly and inspect the printed error.'];
  }

  return [
    `Run the command above directly: ${commandText}`,
    'Run `taptap-maker mcp verify --mode self` to verify the current CLI binary.',
    'If direct npx also fails, check `where.exe npx`, `where.exe node`, `where.exe npm`, `node -v`, and `npm -v`.',
  ];
}

async function runDevKitUpdate(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const result = await installAiDevKit({
    targetDir,
    preserveExisting: false,
    replaceManagedEntries: true,
    environment: makerEnvOption(parsed),
  });
  finalizeStagedDevKitGitignore(targetDir);
  emit(ctx, 'dev_kit', formatDevKitInstallMessage('AI dev kit updated', result), result);
  emitDevKitSkillInstallerFailure(ctx, result.skillInstaller, 'AI skills install failed');
}

async function runLogsWatch(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const intervalMs = parseDurationMs(stringOption(parsed, 'interval') || '5s');
  const timeoutMs = numberOption(parsed, 'timeout_ms') ?? 60 * 1000;
  const maxPolls = numberOption(parsed, 'max_polls');
  const maxConsecutiveFailures = numberOption(parsed, 'max_consecutive_failures');
  const proxy = createRemoteProxyContext({
    targetDir,
    serverUrl: stringOption(parsed, 'server_url'),
    env: makerEnvOption(parsed),
  });
  const runtimeDir = path.join(proxy.projectRoot, '.maker', 'logs', 'runtime');
  const runtimeLog = path.join(runtimeDir, 'runtime.log');
  const pidFile = path.join(runtimeDir, 'watcher.pid');
  const replacedWatcher = registerRuntimeLogWatcherProcess(pidFile);
  const runtimeLogClient = createRemoteRuntimeLogClient(proxy, timeoutMs);

  emit(ctx, 'logs_watch_start', 'Maker runtime log watcher started', {
    project_root: proxy.projectRoot,
    project_id: proxy.projectId,
    runtime_log: runtimeLog,
    pid_file: pidFile,
    pid: process.pid,
    ...replacedWatcher,
    reset: booleanOption(parsed, 'reset'),
    interval_ms: intervalMs,
    topics: DEFAULT_RUNTIME_LOG_TOPICS,
  });

  try {
    const result = await watchRuntimeLogs({
      projectRoot: proxy.projectRoot,
      projectId: proxy.projectId,
      reset: booleanOption(parsed, 'reset'),
      intervalMs,
      limit: numberOption(parsed, 'limit'),
      maxPolls,
      maxConsecutiveFailures,
      callRemoteRuntimeLogs: (args) => runtimeLogClient.call(args),
      onPoll: (pullResult) => {
        emit(ctx, 'logs_poll', `Maker runtime logs pulled: ${pullResult.writtenLogs}`, {
          written_logs: pullResult.writtenLogs,
          has_more: pullResult.hasMore,
          next_start_time: pullResult.nextStartTime,
          files: pullResult.files,
        });
      },
      onError: (error, consecutiveFailures) => {
        emit(ctx, 'logs_poll_error', 'Maker runtime log poll failed; watcher will retry', {
          consecutive_failures: consecutiveFailures,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

    emit(ctx, 'logs_watch_stop', 'Maker runtime log watcher stopped', result);
  } finally {
    await runtimeLogClient.close();
  }
}

function registerRuntimeLogWatcherProcess(pidFile: string): {
  previousPid?: number;
  previousStopped?: boolean;
  previousStopError?: string;
} {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  const existingPid = readPidFile(pidFile);
  const previous =
    existingPid && existingPid !== process.pid ? stopExistingRuntimeLogWatcher(pidFile) : {};
  fs.writeFileSync(
    pidFile,
    `${JSON.stringify(
      {
        pid: process.pid,
        command: formatShellCommand([process.execPath, ...process.argv.slice(1)]),
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  installRuntimeLogWatcherPidCleanup(pidFile);
  return previous;
}

function readPidFile(pidFile: string): number | undefined {
  if (!fs.existsSync(pidFile)) {
    return undefined;
  }
  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  let pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    try {
      const parsed = JSON.parse(raw) as { pid?: unknown };
      pid = typeof parsed.pid === 'number' ? parsed.pid : Number.NaN;
    } catch {
      pid = Number.NaN;
    }
  }
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function installRuntimeLogWatcherPidCleanup(pidFile: string): void {
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (readPidFile(pidFile) === process.pid) {
      fs.rmSync(pidFile, { force: true });
    }
  };
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      cleanup();
      process.exit(0);
    });
  }
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
      'Maker PAT missing. Run `taptap-maker login` or provide --pat/MAKER_PAT for non-interactive init.'
    );
  }

  emit(ctx, 'pat_required', 'Maker login is required', {
    next_step: 'taptap-maker login',
  });
  if (!ctx.json) {
    process.stdout.write('Starting Maker CLI login...\n');
  }
  const loginResult = await loginWithCliAuthCode({
    env: makerEnvOption(parsed),
    onStatus: (message) => emit(ctx, 'login', message),
  });
  const pat = loginResult.token;
  saveManualMakerPat(pat);
  return pat;
}

async function resolveProjectSelection(
  parsed: ParsedArgs,
  projects: MakerProjectSummary[],
  options: {
    existingProjectConfig?: { project_id?: string; user_id?: string; sce_endpoint?: string } | null;
    skipConfirm: boolean;
  }
): Promise<MakerProjectSummary> {
  const appId = stringOption(parsed, 'app_id') || parsed.positionals[0];
  if (appId) {
    return projects.find((project) => project.id === appId) || { id: appId };
  }

  if (options.existingProjectConfig?.project_id) {
    const projectId = options.existingProjectConfig.project_id;
    return (
      projects.find((project) => project.id === projectId) || {
        id: projectId,
        user_id: options.existingProjectConfig.user_id,
        sce_endpoint: options.existingProjectConfig.sce_endpoint,
      }
    );
  }

  if (projects.length === 0) {
    throw new Error('No Maker apps found for this PAT.');
  }

  if (options.skipConfirm) {
    throw new Error('Missing --app-id in non-interactive init mode.');
  }

  const orderedProjects = sortProjectsByRecentActivity(projects);
  let showAll = orderedProjects.length <= MAKER_PROJECT_DEFAULT_TEXT_LIMIT;
  for (;;) {
    process.stdout.write(`${formatMakerProjectList(orderedProjects, { showAll })}\n`);
    const answer = await promptRequired("Choose app by index, app_id, or 'all' to show all");
    const normalized = answer.trim().toLowerCase();
    if (['a', 'all'].includes(normalized)) {
      if (showAll) {
        process.stdout.write('Already showing all Maker apps.\n');
      } else {
        showAll = true;
      }
      continue;
    }

    const visibleCount = showAll
      ? orderedProjects.length
      : Math.min(MAKER_PROJECT_DEFAULT_TEXT_LIMIT, orderedProjects.length);
    const byIndex = Number(answer);
    if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= visibleCount) {
      return orderedProjects[byIndex - 1];
    }
    const selected = projects.find((project) => project.id === answer.trim());
    if (!selected) {
      throw new Error(`Unknown Maker app selection: ${answer}`);
    }
    return selected;
  }
}

function ensureInitTargetCanRecordProject(
  targetDir: string,
  existingProjectId: string | undefined,
  selectedProjectId: string
): void {
  if (!existingProjectId || existingProjectId === selectedProjectId) {
    return;
  }

  throw new Error(
    [
      `${targetDir} is already bound to Maker project ${existingProjectId}.`,
      `You are trying to initialize Maker project ${selectedProjectId} into the same directory.`,
      'A Maker workspace directory can only be bound to one project at a time.',
      'Please switch to the directory for the existing project, or create/open a new empty directory for the new project.',
    ].join('\n')
  );
}

async function prepareDevKit(
  targetDir: string,
  ctx: CliContext,
  options: {
    preserveExisting?: boolean;
    finalizeGitignore?: boolean;
    forceInstall?: boolean;
    environment?: MakerEnvironment;
  } = {}
): Promise<void> {
  const before = inspectAiDevKit(targetDir);
  if (before.ready && !options.forceInstall) {
    try {
      const skillInstaller = installAiDevKitSkills(targetDir, {
        onStart: (event) => emitSkillInstallerStart(ctx, event),
      });
      writeDevKitStagedGitignore(
        path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
        listPresentDevKitManagedEntries(targetDir)
      );
      if (options.finalizeGitignore) {
        finalizeStagedDevKitGitignore(targetDir);
      }
      emit(
        ctx,
        'dev_kit',
        formatDevKitInstallMessage('AI dev kit already present', { skillInstaller }),
        {
          ...before,
          skillInstaller,
        }
      );
    } catch (error) {
      writeDevKitStagedGitignore(
        path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
        listPresentDevKitManagedEntries(targetDir)
      );
      if (options.finalizeGitignore) {
        finalizeStagedDevKitGitignore(targetDir);
      }
      const detail = error instanceof Error ? error.message : String(error);
      emit(ctx, 'dev_kit_warning', `AI skills install failed; clone will continue\n${detail}`, {
        error: detail,
      });
    }
    return;
  }

  try {
    const result = await installAiDevKit({
      targetDir,
      preserveExisting: options.preserveExisting,
      environment: options.environment,
      onSkillInstallerStart: (event) => emitSkillInstallerStart(ctx, event),
    });
    if (options.finalizeGitignore) {
      finalizeStagedDevKitGitignore(targetDir);
    }
    emit(ctx, 'dev_kit', formatDevKitInstallMessage('AI dev kit prepared', result), result);
    emitDevKitSkillInstallerFailure(
      ctx,
      result.skillInstaller,
      'AI skills install failed; clone will continue'
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit(ctx, 'dev_kit_warning', `AI dev kit preparation failed; clone will continue\n${detail}`, {
      error: detail,
    });
  }
}

function formatDevKitInstallMessage(
  message: string,
  result: { skillInstaller?: { summary: string } }
): string {
  if (!result.skillInstaller) {
    return message;
  }
  return `${message}\nAI skills install result: ${result.skillInstaller.summary}`;
}

function emitSkillInstallerStart(ctx: CliContext, event: AiDevKitSkillInstallerStart): void {
  emit(ctx, 'dev_kit_skill_install_start', `AI skills install started: ${event.script}`, event);
}

function emitDevKitSkillInstallerFailure(
  ctx: CliContext,
  result: { ok: boolean; status: string; error?: string } | undefined,
  message: string
): void {
  if (!result || result.ok || result.status !== 'failed') {
    return;
  }
  const detail = result.error || 'unknown installer failure';
  emit(ctx, 'dev_kit_warning', `${message}\n${detail}`, {
    error: detail,
  });
}

function appendPatRecoveryUrl(error: unknown, _parsed: ParsedArgs): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (!isPatValidationFailure(message)) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(
    [message, '', '请运行 `taptap-maker login` 重新完成 Maker CLI 登录授权。'].join('\n')
  );
}

function isPatValidationFailure(message: string): boolean {
  return (
    /\b(?:PAT_INVALID|HTTP\s*40[13]|40[13]|unauthori[sz]ed|invalid\s+PAT|PAT\s+invalid|expired)\b/i.test(
      message
    ) || /(?:过期|失效)/.test(message)
  );
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
  const backupPath = backupIfExists(configPath);
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const sectionPattern = createCodexMcpSectionPattern(options.mcpName);
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
  const updated = fs.readFileSync(configPath, 'utf8');
  const duplicates = findCodexMcpTableDuplicates(updated, options.mcpName);
  if (duplicates.length > 0) {
    restoreBackup(configPath, backupPath);
    throw new Error(
      `Codex MCP config update would create duplicate table(s): ${duplicates.join(
        ', '
      )}. Restored previous config.`
    );
  }
}

function createCodexMcpSectionPattern(mcpName: string): RegExp {
  const keyPattern = createCodexMcpKeyPattern(mcpName);
  return new RegExp(
    `\\n?\\[mcp_servers\\.${keyPattern}(?:\\.[^\\]]+)?\\][\\s\\S]*?(?=\\n\\[(?!mcp_servers\\.${keyPattern}(?:\\.|\\]))|$)`,
    'g'
  );
}

function createCodexMcpKeyPattern(mcpName: string): string {
  const quotedKey = `"${escapeRegExp(mcpName)}"`;
  if (!isTomlBareKey(mcpName)) {
    return quotedKey;
  }
  return `(?:${quotedKey}|${escapeRegExp(mcpName)})`;
}

function findCodexMcpTableDuplicates(text: string, mcpName: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const headerPattern = /^\s*\[([^\]]+)\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(text)) !== null) {
    const normalized = normalizeCodexMcpTablePath(match[1], mcpName);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.add(normalized);
      continue;
    }
    seen.add(normalized);
  }
  return Array.from(duplicates);
}

function normalizeCodexMcpTablePath(tablePath: string, mcpName: string): string | undefined {
  const keyPattern = createCodexMcpKeyPattern(mcpName);
  const match = new RegExp(`^mcp_servers\\.${keyPattern}(\\..+)?$`).exec(tablePath);
  if (!match) {
    return undefined;
  }
  return `mcp_servers.${mcpName}${match[1] || ''}`;
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

function getNpxCliCommand(pkg: string): { command: string; args: string[] } {
  return { command: getNpxCommand(), args: ['-y', '-p', pkg, 'taptap-maker'] };
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function rejectPackageOption(parsed: ParsedArgs): void {
  if (Object.prototype.hasOwnProperty.call(parsed.options, 'package')) {
    throw new Error(
      '--package is no longer supported. Maker MCP configs and npx verification use @taptap/maker.'
    );
  }
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

function backupIfExists(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const backupPath = `${filePath}.bak.${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function restoreBackup(filePath: string, backupPath: string | undefined): void {
  if (backupPath) {
    fs.copyFileSync(backupPath, filePath);
    return;
  }
  fs.rmSync(filePath, { force: true });
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

const MAKER_PROJECT_DEFAULT_TEXT_LIMIT = 40;

type MakerProjectListFormatOptions = {
  showAll?: boolean;
};

function getProjectActivityTime(project: MakerProjectSummary): number {
  const value = project.lastConversationAt || project.lastAccessedAt || project.createdAt;
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function sortProjectsByRecentActivity(projects: MakerProjectSummary[]): MakerProjectSummary[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => {
      const timeDiff = getProjectActivityTime(right.project) - getProjectActivityTime(left.project);
      return timeDiff || left.index - right.index;
    })
    .map(({ project }) => project);
}

function formatProjectListItem(project: MakerProjectSummary, index: number): string {
  const name = project.name || '(unnamed)';
  const lastActive = project.lastConversationAt || project.lastAccessedAt || project.createdAt;
  return `${index + 1}. ${name}  id=${project.id}${
    lastActive ? `  last_active=${lastActive}` : ''
  }`;
}

function rejectRemovedAppsPaginationOptions(parsed: ParsedArgs): void {
  const removed = ['limit', 'offset'].filter((key) => parsed.options[key] !== undefined);
  if (removed.length === 0) {
    return;
  }
  throw new Error(
    `taptap-maker apps no longer supports ${removed
      .map((key) => `--${key}`)
      .join(
        ' / '
      )}. Use --all for the full human-readable list, or --json for the machine-readable output.`
  );
}

export function formatMakerProjectList(
  projects: MakerProjectSummary[],
  options: MakerProjectListFormatOptions = {}
): string {
  if (projects.length === 0) {
    return 'No Maker apps found.';
  }
  const sortedProjects = sortProjectsByRecentActivity(projects);
  const showAll = options.showAll === true;
  const visibleProjects = showAll
    ? sortedProjects
    : sortedProjects.slice(0, MAKER_PROJECT_DEFAULT_TEXT_LIMIT);
  const hiddenCount = sortedProjects.length - visibleProjects.length;
  return [
    `Maker apps (${projects.length})`,
    hiddenCount > 0
      ? `Showing ${visibleProjects.length} most recently active apps, sorted by last activity. ${hiddenCount} more hidden. Run \`taptap-maker apps --all\` to show all, or use \`--json\` for the complete machine-readable list.`
      : `Showing all ${visibleProjects.length} Maker apps, sorted by last activity.`,
    '',
    ...visibleProjects.map((project, index) => formatProjectListItem(project, index)),
  ]
    .filter((line) => line !== '')
    .join('\n');
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
    (command === 'dev-kit' && subcommand === 'update') ||
    (command === 'logs' && subcommand === 'watch')
  );
}

function stringOption(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.options[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanOption(parsed: ParsedArgs, key: string): boolean {
  return parsed.options[key] === true || parsed.options[key] === 'true';
}

function numberOption(parsed: ParsedArgs, key: string): number | undefined {
  const value = parsed.options[key];
  if (value === undefined || value === true || value === false) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid --${key.replace(/_/g, '-')} value: ${value}`);
  }
  return number;
}

function parseDurationMs(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(value.trim());
  if (!match) {
    throw new Error('Invalid --interval value. Use seconds, or suffix with s/ms.');
  }
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  return unit === 's' ? amount * 1000 : amount;
}

function makerEnvOption(parsed: ParsedArgs): MakerEnvironment {
  const env = stringOption(parsed, 'env');
  if (env === 'rnd' || env === 'production') {
    return env;
  }
  const targetDir = stringOption(parsed, 'target_dir');
  return getMakerEnvironment(undefined, targetDir ? path.resolve(targetDir) : process.cwd());
}

function mcpVerifyModeOption(parsed: ParsedArgs): 'npx' | 'self' {
  const mode = stringOption(parsed, 'mode') || 'npx';
  if (mode === 'npx' || mode === 'self') {
    return mode;
  }
  throw new Error('Invalid mcp verify --mode. Use npx or self.');
}

/**
 * Parse a comma- and/or whitespace-separated list of IDE keys
 * (e.g. "codex,cursor,claude" or "codex cursor claude").
 *
 * Splits on both commas AND whitespace. Whitespace is intentional: Windows
 * PowerShell 5.1 parses an unquoted `--ide codex,cursor,claude` as an array and
 * passes it to the native command as a single space-joined argument
 * ("codex cursor claude"). Splitting on whitespace too lets that mangled form
 * still resolve to three valid IDEs instead of one unknown IDE. IDE keys never
 * contain spaces, so this is safe — do not narrow it back to commas only.
 */
function parseIdeList(value: string): string[] {
  return value
    .split(/[\s,]+/)
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

function isTomlBareKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function formatShellCommand(parts: string[]): string {
  return parts
    .map((part) => (/\s/.test(part) ? `"${part.replace(/(["\\$`])/g, '\\$1')}"` : part))
    .join(' ');
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage:',
      '  taptap-maker                         Start MCP server mode',
      '  taptap-maker init [--env rnd|production] [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--skip-confirm] [--skip-mcp-install] [--register-mcp codex,cursor,claude]',
      '                     [--json]',
      '  taptap-maker doctor [--target-dir DIR] [--env rnd|production] [--json]',
      '  taptap-maker apps [--pat PAT] [--all] [--json]',
      '                     # --pat warns: PAT appears in ps/history',
      '  taptap-maker login [--env rnd|production] [--json]',
      '  taptap-maker pat set [--pat-stdin] [--json]',
      '  taptap-maker pat set [PAT|--pat PAT] [--json]  # fallback; warns: PAT appears in ps/history',
      '  taptap-maker install [--ide codex,cursor,claude] [--env rnd|production]',
      '                        [--json]  # alias for mcp install',
      '  taptap-maker mcp install [--ide codex,cursor,claude] [--env rnd|production]',
      '                             [--json]',
      '  taptap-maker mcp verify [--mode npx|self] [--json]',
      '  taptap-maker dev-kit update [--target-dir DIR] [--json]',
      '  taptap-maker logs watch [--target-dir DIR] [--interval 5s] [--reset] [--json]',
      '',
      'MCP verify defaults to the npx command written into AI client config.',
      'Maker MCP configs and npx verification use @taptap/maker.',
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
