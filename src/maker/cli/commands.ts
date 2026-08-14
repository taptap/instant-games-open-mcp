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
import { pathToFileURL } from 'node:url';
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
import { DEFAULT_TOOL_CALL_TIMEOUT_MS } from '../../mcp-proxy/config.js';
import { DEFAULT_RUNTIME_LOG_TOPICS, watchRuntimeLogs } from '../server/runtimeLogs.js';
import {
  cloneMakerProject,
  createMakerProject,
  listMakerProjects,
  type MakerProjectProgress,
} from './projects.js';
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
  formatMakerAgentsPolicyStatus,
  inspectMakerAgentsPolicy,
  updateMakerAgentsPolicy,
} from './agentsPolicy.js';
import {
  MakerGitNotFoundError,
  checkGitEnvironment,
  ensureGitAvailable,
  formatGitEnvironmentStatus,
} from '../system/git.js';
import {
  checkMakerPythonEnvironment,
  formatMakerPythonEnvironmentStatus,
  setupMakerPythonEnvironment,
} from '../system/python.js';
import {
  checkMakerLuaLspEnvironment,
  formatMakerLuaLspEnvironmentStatus,
  setupMakerLuaLspEnvironment,
} from '../system/luaLsp.js';
import { formatMakerSkillStatus } from './skill.js';
import { formatMakerPackageUpdateStatus, getMakerPackageUpdateStatus } from '../versionCheck.js';
import {
  formatMakerProjectInitializationStatus,
  inspectMakerProjectInitialization,
} from '../projectInitialization.js';
import {
  formatMakerProjectSettingsStatus,
  inspectMakerProjectSettings,
} from '../projectSettings.js';
import {
  materializeMakerSelfLauncher,
  resolveMakerPackageSpec,
  resolveMakerMcpLauncher,
  verifyMakerMcpLauncher,
  type MakerMcpLauncher,
  type MakerMcpLauncherVerification,
} from './mcpLauncher.js';
import {
  buildMakerMcpIssue,
  collectMakerMcpIssueDiagnostics,
  parseMakerMcpReportContext,
  submitMakerMcpIssue,
} from './mcpIssueReport.js';

declare const __MAKER_VERSION__: string | undefined;
declare const __MAKER_BUNDLE_URL__: string | undefined;
const VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';

const DEFAULT_MCP_NAME = 'taptap-maker';
const MAKER_NPM_PACKAGE = '@taptap/maker';
const TWO_PART_COMMANDS = new Set(['pat', 'mcp', 'dev-kit', 'logs', 'python', 'lua-lsp', 'agents']);
const BOOLEAN_OPTIONS = new Set([
  'json',
  'skip_confirm',
  'skip_mcp_install',
  'pat_stdin',
  'pat_from_stdin',
  'reset',
  'all',
  'create',
  'consent',
  'context_stdin',
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

type MakerOrphanProcess = {
  pid: string;
  ppid: string;
  cpu: string;
  elapsed: string;
  command: string;
};

type MakerOrphanProcessCheck = {
  status: 'ok' | 'not_supported_on_windows' | 'check_failed';
  processes: MakerOrphanProcess[];
};

type MakerDoctorExecutionContext = {
  active_client_session: 'not_checked';
  tools_visibility: 'not_checked';
  target_dir?: string;
  doctor_cwd: string;
  doctor_cwd_alignment: 'same_project' | 'different_from_target' | 'not_bound';
};

type WorkBuddyConnectorState = {
  account_id: string;
  path: string;
  enabled: boolean;
  ever_connected: boolean;
  user_disabled: boolean;
};

type WorkBuddyTrustInspection = {
  status: 'trusted' | 'pending' | 'not_found';
  mcp_name: string;
  workbuddy_home: string;
  connectors_dir: string;
  state_files: string[];
  accounts: WorkBuddyConnectorState[];
};

type ConfigWriteResult = {
  changed: boolean;
  backupPath?: string;
  rewroteJsonc?: boolean;
};

type McpInstallResult = {
  ide: string;
  ok: boolean;
  message: string;
  path?: string;
  changed?: boolean;
  backupPath?: string;
  launcher_kind?: MakerMcpLauncher['kind'];
  verified?: boolean;
};

type McpInstallOptions = {
  env: MakerEnvironment;
  mcpName: string;
  launcher: MakerMcpLauncher;
  clientIde?: string;
  disabled?: boolean;
  launcherEnv?: Record<string, string>;
};

type PreparedMcpLauncher =
  | {
      ok: true;
      launcher: MakerMcpLauncher;
      verification: MakerMcpLauncherVerification;
      launcherEnv?: Record<string, string>;
    }
  | McpLauncherFailure;

type McpLauncherFailure = {
  ok: false;
  stage: 'resolve' | MakerMcpLauncherVerification['stage'];
  launcher_kind?: MakerMcpLauncher['kind'];
  command?: string;
  failure_type: string;
  error: string;
  stderr?: string;
  tools: string[];
  explanation?: string;
  next_steps?: string[];
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

  // `--help`/`-h` after a subcommand (e.g. `taptap-maker init --help`) must print help
  // and exit. It must NEVER fall through into the real command: init is interactive and
  // a help-seeking invocation left running can hang forever on prompts.
  if (parsed.options.help || parsed.options.h) {
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

  if (command === 'mcp' && subcommand === 'report') {
    await runMcpReport(parsed, ctx);
    return;
  }

  if (command === 'agents' && subcommand === 'update') {
    await runAgentsUpdate(parsed, ctx);
    return;
  }

  if (command === 'upgrade') {
    await runUpgrade(parsed, ctx);
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

  if (command === 'python') {
    await runPython(parsed, ctx);
    return;
  }

  if (command === 'lua-lsp') {
    await runLuaLsp(parsed, ctx);
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
  ensureInitPythonReady(ctx, targetDir, env);

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
    pat,
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
    const ides = parseIdeList(stringOption(parsed, 'register_mcp') || '');
    const prepared = await prepareMcpLauncher({ env, mode: mcpLauncherOption(parsed) });
    if (!prepared.ok) {
      emit(ctx, 'mcp_install', formatMcpLauncherFailure(prepared), prepared);
      throw new Error(prepared.error);
    }
    const installResults = installMcpConfigs({
      ides: ides.length > 0 ? ides : getDefaultMcpInstallIdes(),
      env: makerMcpConfigEnvOption(parsed),
      mcpName: DEFAULT_MCP_NAME,
      launcher: prepared.launcher,
      launcherEnv: prepared.launcherEnv,
    });
    for (const result of installResults) {
      emit(ctx, 'mcp_install', result.message, result);
    }
    const failedInstalls = installResults.filter((result) => !result.ok);
    if (failedInstalls.length > 0) {
      saveInitState(targetDir, {
        status: 'mcp_install_failed',
        target_dir: targetDir,
        env,
        selected_app_id: selected.id,
        mcp_install_failures: failedInstalls.map((result) => ({
          ide: result.ide,
          message: result.message,
        })),
      });
      throw new Error(
        `Maker project checkout completed, but MCP config installation failed for: ${failedInstalls
          .map((result) => result.ide)
          .join(', ')}. Fix the reported client config issue, then rerun taptap-maker mcp install.`
      );
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
  const python = checkMakerPythonEnvironment();
  const luaLsp = checkMakerLuaLspEnvironment({ pythonEnvironment: python });
  const pat = loadPat();
  const tapAuth = loadTapAuth();
  const identify = identifyMakerProject({ cwd: targetDir });
  const isProjectBound = Boolean(identify.projectRoot);
  const projectRoot = identify.projectRoot || targetDir;
  const devKit = inspectAiDevKit(projectRoot);
  const devKitUpdate = await checkAiDevKitUpdate(projectRoot, { environment: env });
  const packageUpdate = await getMakerPackageUpdateStatus({
    currentVersion: VERSION,
    allowRemoteFetch: false,
    backgroundRefresh: false,
  });
  const agentsPolicy = isProjectBound ? inspectMakerAgentsPolicy(projectRoot) : undefined;
  const orphanProcessCheck = inspectMakerOrphanProcesses();
  const doctorExecutionContext = inspectMakerDoctorExecutionContext({
    makerProjectDir: identify.projectRoot,
  });
  const projectInitialization = isProjectBound
    ? inspectMakerProjectInitialization(projectRoot)
    : undefined;
  const projectSettings = isProjectBound ? inspectMakerProjectSettings(projectRoot) : undefined;
  if (ctx.json) {
    writeJson({
      env,
      git,
      auth: {
        pat: Boolean(pat),
        tap_auth: Boolean(tapAuth),
      },
      python,
      lua_lsp: luaLsp,
      project: identify,
      agents_policy: agentsPolicy,
      dev_kit: devKit,
      dev_kit_update: devKitUpdate,
      package_update: packageUpdate,
      project_initialization: projectInitialization,
      project_settings: projectSettings,
      doctor_execution_context: doctorExecutionContext,
      orphan_process_check: orphanProcessCheck,
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
      formatMakerPythonEnvironmentStatus(python),
      '',
      formatMakerLuaLspEnvironmentStatus(luaLsp),
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
      projectInitialization ? formatMakerProjectInitializationStatus(projectInitialization) : '',
      projectSettings ? formatMakerProjectSettingsStatus(projectSettings) : '',
      isProjectBound ? formatMakerAgentsPolicyStatus(projectRoot) : '',
      '',
      'AI dev kit',
      `- ready: ${devKit.ready ? 'yes' : 'no'}`,
      `- missing_entries: ${devKit.missingEntries.join(', ') || '(none)'}`,
      `- installed_version: ${devKitUpdate.installed?.version || '(unknown)'}`,
      `- latest_version: ${devKitUpdate.latest?.version || '(unknown)'}`,
      `- update_available: ${devKitUpdate.updateAvailable ? 'yes' : 'no'}`,
      devKitUpdate.versionCheckError ? `- version_check: ${devKitUpdate.versionCheckError}` : '',
      '',
      formatMakerPackageUpdateStatus(packageUpdate),
      '',
      formatMakerDoctorExecutionContext(doctorExecutionContext),
      '',
      formatMakerOrphanProcessStatus(orphanProcessCheck),
      '',
      formatMakerSkillStatus({ projectRoot }),
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function inspectMakerDoctorExecutionContext(options: {
  makerProjectDir?: string;
}): MakerDoctorExecutionContext {
  const doctorCwd = path.resolve(process.cwd());
  const makerProjectDir = options.makerProjectDir
    ? path.resolve(options.makerProjectDir)
    : undefined;

  if (!makerProjectDir) {
    return {
      active_client_session: 'not_checked',
      tools_visibility: 'not_checked',
      doctor_cwd: doctorCwd,
      doctor_cwd_alignment: 'not_bound',
    };
  }

  return {
    active_client_session: 'not_checked',
    tools_visibility: 'not_checked',
    target_dir: makerProjectDir,
    doctor_cwd: doctorCwd,
    doctor_cwd_alignment: samePath(doctorCwd, makerProjectDir)
      ? 'same_project'
      : 'different_from_target',
  };
}

function formatMakerDoctorExecutionContext(context: MakerDoctorExecutionContext): string {
  const lines = [
    'Doctor execution context',
    `- active_client_session: ${context.active_client_session}`,
    `- tools_visibility: ${context.tools_visibility}`,
    "- note: doctor cannot inspect the active AI client's loaded tools or configuration.",
    `- doctor_cwd_alignment: ${context.doctor_cwd_alignment}`,
    `- doctor_cwd: ${context.doctor_cwd}`,
  ];

  if (context.target_dir) {
    lines.push(`- target_dir: ${context.target_dir}`);
  }

  return lines.join('\n');
}

function samePath(left: string, right: string): boolean {
  return normalizePathForCompare(left) === normalizePathForCompare(right);
}

function normalizePathForCompare(value: string): string {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function inspectMakerOrphanProcesses(): MakerOrphanProcessCheck {
  if (process.platform === 'win32') {
    // The ps-based scan below is POSIX-only. Report that honestly instead of "none",
    // because Windows is where orphan detection matters most and a false "none"
    // misleads troubleshooting.
    return { status: 'not_supported_on_windows', processes: [] };
  }
  const result = spawnSync('ps', ['-axo', 'pid,ppid,pcpu,etime,command'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { status: 'check_failed', processes: [] };
  }

  const processes = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => parseMakerProcessLine(line))
    .filter((processInfo): processInfo is MakerOrphanProcess => Boolean(processInfo));
  return { status: 'ok', processes };
}

function parseMakerProcessLine(line: string): MakerOrphanProcess | null {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(\S+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const [, pid, ppid, cpu, elapsed, command] = match;
  if (ppid !== '1') {
    return null;
  }
  if (/\blogs\b.*\bwatch\b/.test(command)) {
    return null;
  }
  if (!/\bmaker\.js\b/.test(command) && !/\btaptap-maker\b/.test(command)) {
    return null;
  }
  return { pid, ppid, cpu, elapsed, command };
}

function formatMakerOrphanProcessStatus(check: MakerOrphanProcessCheck): string {
  const lines = ['Maker orphan process check'];
  if (check.status === 'not_supported_on_windows') {
    return [...lines, '- orphan_processes: not_supported_on_windows'].join('\n');
  }
  if (check.status === 'check_failed') {
    return [...lines, '- orphan_processes: check_failed'].join('\n');
  }
  if (check.processes.length === 0) {
    return [...lines, '- orphan_processes: none'].join('\n');
  }
  for (const processInfo of check.processes) {
    lines.push(
      `- pid: ${processInfo.pid} ppid: ${processInfo.ppid} cpu: ${processInfo.cpu} elapsed: ${processInfo.elapsed}`
    );
    lines.push(`  command: ${processInfo.command}`);
  }
  lines.push('- action: safe_to_kill_orphan_maker_processes');
  lines.push('- note: these PPID=1 Maker processes are detached from the AI client.');
  return lines.join('\n');
}

function ensureInitPythonReady(ctx: CliContext, targetDir: string, env: MakerEnvironment): void {
  const initial = checkMakerPythonEnvironment();
  if (initial.ready) {
    emit(ctx, 'python', 'Python environment is ready', {
      status: initial.status,
      version: initial.version,
      provider: initial.provider,
    });
    ensureInitLuaLspReady(ctx, initial);
    return;
  }

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!ctx.json && attempt === 1) {
        process.stderr.write('Maker 本地开发需要 Python 环境，正在自动准备 Python 3.12...\n');
      }
      const result = setupMakerPythonEnvironment();
      emit(ctx, 'python', 'Python environment is ready', {
        status: result.environment.status,
        version: result.environment.version,
        provider: result.environment.provider,
        attempts: attempt,
      });
      ensureInitLuaLspReady(ctx, result.environment);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const retryIndex = attempt;
        if (ctx.json) {
          writeJson({
            step: 'python',
            status: 'retry',
            message: `Python environment setup failed; retrying ${retryIndex}/2.`,
            data: {
              attempt,
              max_attempts: maxAttempts,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } else {
          process.stderr.write(`Python 环境准备失败，正在重试 ${retryIndex}/2...\n`);
        }
      }
    }
  }

  const message = formatInitPythonBlockedMessage(lastError);
  saveInitState(targetDir, {
    status: 'blocked',
    blocking_prerequisite: 'python',
    target_dir: targetDir,
    env,
    python_status: 'setup_failed',
  });
  if (ctx.json) {
    writeJson({
      step: 'python',
      status: 'blocked',
      message: 'TapTap Maker initialization paused because Python setup failed.',
      data: {
        blocking_prerequisite: 'python',
        python_status: 'setup_failed',
        attempts: maxAttempts,
        next_commands: [
          'taptap-maker python setup',
          'taptap-maker python doctor',
          'taptap-maker init',
        ],
      },
    });
  }
  throw new Error(message);
}

function ensureInitLuaLspReady(
  ctx: CliContext,
  python: ReturnType<typeof checkMakerPythonEnvironment>
): void {
  const current = checkMakerLuaLspEnvironment({ pythonEnvironment: python });
  const environment = current.ready
    ? current
    : setupMakerLuaLspEnvironment({ pythonEnvironment: python }).environment;
  emit(
    ctx,
    'lua_lsp',
    environment.ready
      ? 'Maker Lua LSP is ready'
      : 'Maker Lua LSP setup did not complete; continuing because remote build is not blocked',
    {
      status: environment.status,
      ready: environment.ready,
      command: environment.command,
      error: environment.error,
      next_action: environment.nextAction,
    }
  );
}

function formatInitPythonBlockedMessage(error: unknown): string {
  const errorText = error instanceof Error ? error.message : String(error);
  return [
    'TapTap Maker 初始化已暂停：Python 环境准备失败。',
    '',
    'Maker 本地开发需要 Python 环境。已自动尝试 3 次，仍未成功，因此后续的登录、项目拉取和 MCP 配置还没有继续执行。',
    '',
    '原因：',
    `- Python 环境准备失败：${summarizeError(errorText)}`,
    '',
    '你可以选择：',
    '',
    '1. 让当前 AI 稍后重试自动准备 Python：',
    '   taptap-maker python setup',
    '',
    '2. 自己安装 Python 3.12，并确保 pip 可用，然后检查：',
    '   taptap-maker python doctor',
    '',
    '修复后重新运行：',
    'taptap-maker init',
  ].join('\n');
}

function summarizeError(errorText: string): string {
  const lines = errorText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 4).join(' | ') || 'unknown error';
}

async function runPython(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const [, subcommand] = parsed.command;
  if (!subcommand || subcommand === 'doctor') {
    const environment = checkMakerPythonEnvironment();
    if (ctx.json) {
      writeJson(environment);
      return;
    }
    process.stdout.write(`${formatMakerPythonEnvironmentStatus(environment)}\n`);
    return;
  }

  if (subcommand === 'setup') {
    process.stderr.write(
      'Maker Python setup may download and run the official uv installer from https://astral.sh.\n'
    );
    const result = setupMakerPythonEnvironment();
    const luaLsp = setupMakerLuaLspEnvironment({ pythonEnvironment: result.environment });
    if (ctx.json) {
      writeJson({ ...result, luaLsp });
      return;
    }
    process.stdout.write(
      [
        result.changed ? 'Maker Python runtime prepared' : 'Maker Python runtime already available',
        '',
        formatMakerPythonEnvironmentStatus(result.environment),
        '',
        luaLsp.environment.ready
          ? 'Maker Lua LSP prepared'
          : 'Maker Lua LSP setup did not complete; remote build is not blocked.',
        '',
        formatMakerLuaLspEnvironmentStatus(luaLsp.environment),
        '',
      ].join('\n')
    );
    return;
  }

  if (subcommand === 'path') {
    const environment = checkMakerPythonEnvironment();
    if (ctx.json) {
      writeJson({
        ready: environment.ready,
        status: environment.status,
        python: environment.python,
        provider: environment.provider,
        version: environment.version,
        nextAction: environment.nextAction,
      });
      return;
    }
    if (!environment.ready || !environment.python) {
      throw new Error(
        [
          'Maker Python runtime is not ready.',
          `- status: ${environment.status}`,
          `- next_action: ${environment.nextAction}`,
        ].join('\n')
      );
    }
    process.stdout.write(`${environment.python}\n`);
    return;
  }

  throw new Error(`Unknown taptap-maker python command: ${formatUnknownCommand(parsed.command)}`);
}

async function runLuaLsp(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const [, subcommand] = parsed.command;
  if (!subcommand || subcommand === 'doctor') {
    const environment = checkMakerLuaLspEnvironment();
    if (ctx.json) {
      writeJson(environment);
      return;
    }
    process.stdout.write(`${formatMakerLuaLspEnvironmentStatus(environment)}\n`);
    return;
  }

  if (subcommand === 'setup') {
    const result = setupMakerLuaLspEnvironment();
    if (ctx.json) {
      writeJson(result);
      return;
    }
    process.stdout.write(
      [
        result.environment.ready
          ? 'Maker Lua LSP prepared'
          : 'Maker Lua LSP setup did not complete; remote build is not blocked.',
        '',
        formatMakerLuaLspEnvironmentStatus(result.environment),
        '',
      ].join('\n')
    );
    return;
  }

  throw new Error(`Unknown taptap-maker lua-lsp command: ${formatUnknownCommand(parsed.command)}`);
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
  const env = makerEnvOption(parsed);
  const prepared = await prepareMcpLauncher({ env, mode: mcpLauncherOption(parsed) });
  if (!prepared.ok) {
    writeMcpLauncherFailure(ctx, prepared);
    return;
  }
  const results = installMcpConfigs({
    ides: ides.length > 0 ? ides : getDefaultMcpInstallIdes(),
    env: makerMcpConfigEnvOption(parsed),
    mcpName: stringOption(parsed, 'name') || DEFAULT_MCP_NAME,
    launcher: prepared.launcher,
    launcherEnv: prepared.launcherEnv,
  });
  const ok = results.every((result) => result.ok);
  if (!ok) {
    process.exitCode = 1;
  }

  if (ctx.json) {
    writeJson(results);
    return;
  }

  process.stdout.write(`${results.map((result) => result.message).join('\n')}\n`);
}

async function prepareMcpLauncher(options: {
  env: MakerEnvironment;
  mode: 'self' | 'npx';
}): Promise<PreparedMcpLauncher> {
  let launcher: MakerMcpLauncher;
  let launcherEnv: Record<string, string> | undefined;
  try {
    if (options.mode === 'self') {
      launcher = materializeMakerSelfLauncher({
        version: VERSION,
        bundleUrl:
          typeof __MAKER_BUNDLE_URL__ !== 'undefined'
            ? __MAKER_BUNDLE_URL__
            : pathToFileURL(path.resolve(process.cwd(), 'dist', 'maker.js')).href,
        makerHome: getMakerHome(),
      });
    } else {
      const packageSpec = resolveMakerPackageSpec(MAKER_NPM_PACKAGE, VERSION);
      launcher = resolveMakerMcpLauncher({ packageName: packageSpec });
      const configuredCache = process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE;
      const npmCacheDir = path.resolve(
        configuredCache || path.join(getMakerHome(), 'cache', 'npm')
      );
      fs.mkdirSync(npmCacheDir, { recursive: true });
      launcherEnv = { npm_config_cache: npmCacheDir };
    }
  } catch (error) {
    return createMcpLauncherResolutionFailure(error);
  }

  const verification = await verifyMakerMcpLauncher(launcher, {
    env: {
      ...(options.env === 'production' ? {} : { TAPTAP_MCP_ENV: options.env }),
      ...launcherEnv,
    },
  });
  if (!verification.ok) {
    return addMcpLauncherFailureGuidance({
      ok: false,
      stage: verification.stage,
      launcher_kind: verification.launcherKind,
      command: verification.command,
      failure_type: verification.failureType || 'protocol_error',
      error: verification.error || 'Maker MCP launcher connectivity check failed.',
      stderr: verification.stderr,
      tools: verification.toolNames,
    });
  }
  return { ok: true, launcher, verification, launcherEnv };
}

function createMcpLauncherResolutionFailure(error: unknown): McpLauncherFailure {
  return {
    ok: false,
    stage: 'resolve',
    failure_type: 'launcher_not_found',
    error: error instanceof Error ? error.message : String(error),
    tools: [],
  };
}

function writeMcpLauncherFailure(ctx: CliContext, failure: McpLauncherFailure): void {
  process.exitCode = 1;
  if (ctx.json) {
    writeJson(failure);
    return;
  }
  process.stdout.write(`${formatMcpLauncherFailure(failure)}\n`);
}

function formatMcpLauncherFailure(failure: McpLauncherFailure): string {
  return [
    '✗ Maker MCP launcher connectivity check failed; no client config was changed',
    `- stage: ${failure.stage}`,
    failure.launcher_kind ? `- launcher_kind: ${failure.launcher_kind}` : '',
    failure.command ? `- command: ${failure.command}` : '',
    `- failure_type: ${failure.failure_type}`,
    `- error: ${failure.error}`,
    failure.stderr ? `- stderr:\n${indent(failure.stderr)}` : '',
    failure.explanation ? `- explanation: ${failure.explanation}` : '',
    ...(
      failure.next_steps || ['Fix the launcher shown above, then rerun `taptap-maker mcp install`.']
    ).map((step) => `- next_action: ${step}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function addMcpLauncherFailureGuidance(failure: McpLauncherFailure): McpLauncherFailure {
  if (failure.failure_type !== 'npm_environment_error') {
    return failure;
  }
  return {
    ...failure,
    explanation:
      'The npm cache is not writable in the current environment. This is a local sandbox or cache restriction, not a Maker protocol error.',
    next_steps: [
      'Run `taptap-maker mcp install --launcher self --ide <client>` to avoid npm.',
      'If npx mode is required, set a writable `npm_config_cache` before retrying. Do not change npm cache ownership based only on the generic npm message.',
    ],
  };
}

async function runMcpVerify(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectPackageOption(parsed);
  const mode = mcpVerifyModeOption(parsed);
  const prepared = await prepareMcpLauncher({ env: makerEnvOption(parsed), mode });
  if (!prepared.ok && prepared.stage === 'resolve') {
    writeMcpLauncherFailure(ctx, prepared);
    return;
  }
  const result: MakerMcpLauncherVerification = prepared.ok
    ? prepared.verification
    : {
        ok: false,
        stage: prepared.stage,
        launcherKind: prepared.launcher_kind!,
        command: prepared.command || '',
        toolNames: prepared.tools,
        stderr: prepared.stderr,
        error: prepared.error,
        failureType: prepared.failure_type as MakerMcpLauncherVerification['failureType'],
      };
  const payload = {
    mode,
    package: mode === 'npx' ? resolveMakerPackageSpec(MAKER_NPM_PACKAGE, VERSION) : undefined,
    launcher_kind: result.launcherKind,
    command: result.command,
    stage: result.stage,
    ok: result.ok,
    tools: result.toolNames,
    stderr: result.stderr,
    error: result.error,
    failure_type: result.failureType,
    explanation: result.ok ? undefined : getMcpVerifyFailureExplanation(mode, result),
    next_steps: result.ok ? undefined : getMcpVerifyNextSteps(mode, result.command),
    is_maker_mcp_started: result.stage === 'tools_list',
  };
  if (!payload.ok) {
    process.exitCode = 1;
  }
  if (ctx.json) {
    writeJson(payload);
    return;
  }
  process.stdout.write(
    [
      payload.ok
        ? '✓ Maker MCP launcher connectivity verified'
        : payload.stage === 'tools_list'
          ? '✗ Maker MCP started but tools/list validation failed'
          : '✗ MCP config command check failed before Maker MCP started',
      `- mode: ${payload.mode}`,
      `- command: ${payload.command}`,
      mode === 'npx'
        ? '- scope: verifies the exact-version npm package launcher'
        : '- scope: verifies the stable self runtime written by taptap-maker mcp install',
      `- launcher_kind: ${payload.launcher_kind}`,
      `- stage: ${payload.stage}`,
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

async function runMcpReport(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectPackageOption(parsed);
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const contextInput = booleanOption(parsed, 'context_stdin') ? await readStdinText() : '';
  const context = parseMakerMcpReportContext(contextInput);
  const diagnostics = await collectMakerMcpIssueDiagnostics({
    ide: stringOption(parsed, 'ide'),
    targetDir,
    makerVersion: VERSION,
    verify: async () => {
      const prepared = await prepareMcpLauncher({
        env: makerEnvOption(parsed),
        mode: 'self',
      });
      if (!prepared.ok) {
        return prepared;
      }
      return {
        ok: prepared.verification.ok,
        stage: prepared.verification.stage,
        launcher_kind: prepared.verification.launcherKind,
        command: prepared.verification.command,
        tools: prepared.verification.toolNames,
        stderr: prepared.verification.stderr,
        error: prepared.verification.error,
        failure_type: prepared.verification.failureType,
      };
    },
  });
  const issue = buildMakerMcpIssue({
    context,
    diagnostics,
    homeDir: os.homedir(),
  });
  const submission = booleanOption(parsed, 'consent')
    ? submitMakerMcpIssue(issue)
    : {
        status: 'consent_required' as const,
        issue_url: 'https://github.com/taptap/instant-games-open-mcp/issues/new',
        ...issue,
      };

  if (ctx.json) {
    writeJson(submission);
    return;
  }

  if (submission.status === 'created') {
    process.stdout.write(`Maker MCP issue submitted: ${submission.issue_url}\n`);
    return;
  }

  process.stdout.write(
    [
      submission.status === 'consent_required'
        ? 'Maker MCP issue report prepared but not submitted: user consent is required.'
        : 'Maker MCP issue report prepared, but GitHub submission is unavailable.',
      `Manual issue URL: ${submission.issue_url}`,
      '',
      submission.body,
      '',
    ].join('\n')
  );
}

async function runAgentsUpdate(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  const targetDir = path.resolve(stringOption(parsed, 'target_dir') || process.cwd());
  const result = updateMakerAgentsPolicy(targetDir);
  if (ctx.json) {
    writeJson(result);
    return;
  }

  process.stdout.write(
    [
      result.changed ? '✓ AGENTS.md managed policy updated' : '✓ AGENTS.md managed policy current',
      `- path: ${result.path}`,
      `- previous_status: ${result.previousStatus}`,
      `- expected_hash: sha256:${result.expectedHash}`,
      '',
    ].join('\n')
  );
}

async function runUpgrade(parsed: ParsedArgs, ctx: CliContext): Promise<void> {
  rejectPackageOption(parsed);
  const explicitTargetDir = stringOption(parsed, 'target_dir');
  const targetDir = path.resolve(explicitTargetDir || process.cwd());
  const env = makerEnvOption(parsed);
  const ides = parseIdeList(stringOption(parsed, 'ide') || stringOption(parsed, 'ides') || '');
  const prepared = await prepareMcpLauncher({ env, mode: mcpLauncherOption(parsed) });
  if (!prepared.ok) {
    writeMcpLauncherFailure(ctx, prepared);
    return;
  }
  const installResults = installMcpConfigs({
    ides: ides.length > 0 ? ides : getDefaultMcpInstallIdes(),
    env: makerMcpConfigEnvOption(parsed),
    mcpName: stringOption(parsed, 'name') || DEFAULT_MCP_NAME,
    launcher: prepared.launcher,
    launcherEnv: prepared.launcherEnv,
  });
  const identify = identifyMakerProject({ cwd: targetDir });
  const agentsResult = identify.projectRoot
    ? updateMakerAgentsPolicy(identify.projectRoot)
    : undefined;
  const payload = {
    ok: installResults.every((result) => result.ok),
    target_dir: targetDir,
    env,
    mcp_install: installResults,
    agents_policy: agentsResult,
    restart_required: false,
    apply_mode: 'next_mcp_start',
    current_session: 'preserved',
  };
  if (!payload.ok) {
    process.exitCode = 1;
  }
  if (ctx.json) {
    writeJson(payload);
    return;
  }

  process.stdout.write(
    [
      payload.ok ? 'TapTap Maker upgrade completed' : 'TapTap Maker upgrade completed with errors',
      '',
      ...installResults.map((result) => result.message),
      '',
      agentsResult
        ? [
            agentsResult.changed
              ? '✓ AGENTS.md managed policy updated'
              : '✓ AGENTS.md managed policy current',
            `- path: ${agentsResult.path}`,
            `- previous_status: ${agentsResult.previousStatus}`,
          ].join('\n')
        : 'AGENTS.md managed policy skipped: current directory is not bound to a Maker project.',
      '',
      'Current MCP session remains unchanged and continues using the existing version.',
      'The updated package and AGENTS.md will take effect on the next MCP start or user-requested reconnect.',
      '',
    ].join('\n')
  );
}

function getMcpVerifyFailureExplanation(
  mode: 'npx' | 'self',
  result: MakerMcpLauncherVerification
): string {
  if (mode === 'self') {
    return [
      `The stable self runtime failed during MCP ${result.stage}.`,
      'This is a local Node and stdio MCP connectivity check, not a Maker business tool error.',
    ].join(' ');
  }

  if (result.failureType === 'npm_environment_error') {
    return [
      'The npm launcher could not write its cache in the current sandbox or user environment.',
      'Do not change cache ownership based only on npm generic guidance.',
    ].join(' ');
  }

  return [
    `The configured package launcher failed during MCP ${result.stage}.`,
    'This is a local Node/npm/npx and stdio MCP connectivity check, not a Maker business tool error.',
  ].join(' ');
}

function getMcpVerifyNextSteps(mode: 'npx' | 'self', commandText: string): string[] {
  if (mode === 'self') {
    return [
      `Run the command above directly: ${commandText}`,
      'Rerun `taptap-maker mcp install --launcher self` to rebuild the stable runtime.',
    ];
  }

  return [
    `Run the command above directly: ${commandText}`,
    'Use `taptap-maker mcp install --launcher self` to avoid npm cache and npx startup.',
    'On Windows, check the absolute node/npm paths shown above; do not repair cwd with `cd && npx.cmd`.',
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
  const timeoutMs = numberOption(parsed, 'timeout_ms') ?? DEFAULT_TOOL_CALL_TIMEOUT_MS;
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
    pat: string;
    skipConfirm: boolean;
  }
): Promise<MakerProjectSummary> {
  const appId = stringOption(parsed, 'app_id') || parsed.positionals[0];
  const createNewProject = booleanOption(parsed, 'create');
  if (createNewProject && appId) {
    throw new Error('Cannot use --create together with --app-id or a positional app id.');
  }

  if (createNewProject) {
    return createProjectFromInit(parsed, options);
  }

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
    if (options.skipConfirm) {
      throw new Error('No Maker apps found for this PAT. Use --create --name to create one.');
    }
    process.stdout.write(`${formatMakerProjectList(projects)}\n`);
    return createProjectFromInit(parsed, options);
  }

  if (options.skipConfirm) {
    throw new Error('Missing --app-id in non-interactive init mode.');
  }

  const orderedProjects = sortProjectsByRecentActivity(projects);
  let showAll = orderedProjects.length <= MAKER_PROJECT_DEFAULT_TEXT_LIMIT;
  for (;;) {
    process.stdout.write(`${formatMakerProjectList(orderedProjects, { showAll })}\n`);
    const answer = await promptRequired(
      "Choose app by index, app_id, '0'/'new' to 创建新项目 / Create a new Maker project, or 'all' to show all"
    );
    const normalized = answer.trim().toLowerCase();
    if (['a', 'all'].includes(normalized)) {
      if (showAll) {
        process.stdout.write('Already showing all Maker apps.\n');
      } else {
        showAll = true;
      }
      continue;
    }
    if (['0', 'n', 'new', 'create'].includes(normalized)) {
      return createProjectFromInit(parsed, options);
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

async function createProjectFromInit(
  parsed: ParsedArgs,
  options: {
    existingProjectConfig?: { project_id?: string; user_id?: string; sce_endpoint?: string } | null;
    pat: string;
    skipConfirm: boolean;
  }
): Promise<MakerProjectSummary> {
  const existingProjectId = options.existingProjectConfig?.project_id;
  if (existingProjectId) {
    throw new Error(
      [
        `Current directory is already bound to Maker project ${existingProjectId}.`,
        'A Maker workspace directory can only be bound to one project at a time.',
        'Please create/open a new empty directory before creating a new Maker project.',
      ].join('\n')
    );
  }

  const name = stringOption(parsed, 'name') || stringOption(parsed, 'project_name');
  if (!name && options.skipConfirm) {
    throw new Error('Missing --name in non-interactive create mode.');
  }
  const projectName = name || (await promptRequired('Enter new Maker project name'));
  return createMakerProject({
    name: projectName,
    gameType: 'sce',
    pat: options.pat,
  }).catch((error) => {
    throw appendPatRecoveryUrl(error, parsed);
  });
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
  mcpName: string;
  launcher: MakerMcpLauncher;
  launcherEnv?: Record<string, string>;
}): McpInstallResult[] {
  return uniqueStrings(options.ides)
    .flatMap((ide) => installMcpConfig(ide, options))
    .map((result) => ({
      ...result,
      launcher_kind: options.launcher.kind,
      verified: true,
    }));
}

function installMcpConfig(ide: string, options: McpInstallOptions): McpInstallResult[] {
  try {
    return installMcpConfigUnsafe(ide, options);
  } catch (error) {
    return [
      {
        ide,
        ok: false,
        message: `✗ ${ide} MCP config update failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ];
  }
}

function installMcpConfigUnsafe(ide: string, options: McpInstallOptions): McpInstallResult[] {
  if (ide === 'codex') {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const write = mergeCodexMcpConfig(configPath, withClientIde(options, 'codex'));
    return [createMcpInstallResult(ide, 'Codex', configPath, write)];
  }

  if (ide === 'cursor') {
    const configPath = path.join(os.homedir(), '.cursor', 'mcp.json');
    const write = mergeJsonMcpConfig(configPath, withClientIde(options, 'cursor'));
    return [createMcpInstallResult(ide, 'Cursor', configPath, write)];
  }

  if (ide === 'claude') {
    const claudeOptions = withClientIde(options, 'claude');
    const claudeResult = tryClaudeMcpAdd(claudeOptions);
    if (claudeResult.ok) {
      return [
        {
          ide,
          ok: true,
          changed: claudeResult.changed,
          message: claudeResult.changed
            ? '✓ Claude Code MCP config updated with claude mcp add'
            : '✓ Claude Code MCP config already current; no update required',
        },
      ];
    }
    const configPath = path.join(os.homedir(), '.claude.json');
    const write = mergeJsonMcpConfig(configPath, claudeOptions);
    return [createMcpInstallResult(ide, 'Claude fallback', configPath, write)];
  }

  if (ide === 'trae') {
    return installJsonMcpConfigTargets(
      ide,
      getTraeMcpInstallPaths(),
      'Trae',
      withClientIde(options, 'trae')
    );
  }

  if (ide === 'opencode') {
    const configPath = getOpenCodeMcpConfigPath();
    if (!fs.existsSync(configPath)) {
      return [{ ide, ok: false, message: 'Skipped OpenCode: no supported config file found' }];
    }
    const write = mergeOpenCodeMcpConfig(configPath, withClientIde(options, 'opencode'));
    const result = createMcpInstallResult(ide, 'OpenCode', configPath, write);
    if (write.rewroteJsonc) {
      result.message += '\n  Note: OpenCode config was rewritten as standard JSON.';
    }
    return [result];
  }

  if (ide === 'workbuddy') {
    const results = installJsonMcpConfigTargets(
      ide,
      getWorkBuddyMcpInstallPaths({ createPrimary: true }),
      'WorkBuddy',
      {
        ...options,
        clientIde: 'workbuddy',
        disabled: false,
      }
    );
    const trust = inspectWorkBuddyTrustState(options.mcpName);
    return results.map((result) =>
      result.ok
        ? {
            ...result,
            message: `${result.message}\n${formatWorkBuddyTrustInspection(trust)}`,
          }
        : result
    );
  }

  return [{ ide, ok: false, message: `Skipped unknown IDE: ${ide}` }];
}

function withClientIde(options: McpInstallOptions, clientIde: string): McpInstallOptions {
  return { ...options, clientIde };
}

function installJsonMcpConfigTargets(
  ide: string,
  configPaths: string[],
  label: string,
  options: McpInstallOptions
): McpInstallResult[] {
  if (configPaths.length === 0) {
    return [{ ide, ok: false, message: `Skipped ${label}: no supported config file found` }];
  }

  return configPaths.map((configPath) => {
    try {
      const write = mergeJsonMcpConfig(configPath, options);
      return createMcpInstallResult(ide, label, configPath, write);
    } catch (error) {
      return {
        ide,
        ok: false,
        path: configPath,
        message: `✗ ${label} MCP config update failed for ${configPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  });
}

function createMcpInstallResult(
  ide: string,
  label: string,
  configPath: string,
  write: ConfigWriteResult
): McpInstallResult {
  return {
    ide,
    ok: true,
    path: configPath,
    changed: write.changed,
    backupPath: write.backupPath,
    message: formatMcpInstallMessage(label, configPath, write),
  };
}

function getDefaultMcpInstallIdes(): string[] {
  const ides = ['codex', 'cursor', 'claude'];
  if (getTraeMcpInstallPaths().length > 0) {
    ides.push('trae');
  }
  if (fs.existsSync(getOpenCodeMcpConfigPath())) {
    ides.push('opencode');
  }
  if (getWorkBuddyMcpInstallPaths().length > 0) {
    ides.push('workbuddy');
  }
  return ides;
}

function getTraeMcpInstallPaths(): string[] {
  const soloPaths = getExistingTraeUserConfigPaths(getTraeSoloMcpConfigPaths());
  const unverifiedPaths = getExistingConfigPaths(getTraeUnverifiedMcpConfigPaths());
  return uniqueStrings([...soloPaths, ...unverifiedPaths]);
}

function getExistingTraeUserConfigPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((configPath) => {
    const key = normalizeConfigPathKey(configPath);
    if (seen.has(key) || !fs.existsSync(path.dirname(configPath))) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getExistingConfigPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((configPath) => {
    const key = normalizeConfigPathKey(configPath);
    if (seen.has(key) || !fs.existsSync(configPath)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeConfigPathKey(configPath: string): string {
  const resolved = path.resolve(configPath);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved;
}

function getTraeSoloMcpConfigPaths(): string[] {
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return [
      path.join(roaming, 'TRAE SOLO', 'User', 'mcp.json'),
      path.join(roaming, 'TRAE SOLO CN', 'User', 'mcp.json'),
    ];
  }

  const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
  return [
    path.join(appSupport, 'TRAE SOLO CN', 'User', 'mcp.json'),
    path.join(appSupport, 'TRAE SOLO', 'User', 'mcp.json'),
  ];
}

function getTraeUnverifiedMcpConfigPaths(): string[] {
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return [
      path.join(roaming, 'Trae', 'User', 'mcp.json'),
      path.join(roaming, 'TRAE', 'User', 'mcp.json'),
      path.join(roaming, 'Trae CN', 'User', 'mcp.json'),
    ];
  }

  const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
  return [
    path.join(appSupport, 'Trae', 'User', 'mcp.json'),
    path.join(appSupport, 'TRAE', 'User', 'mcp.json'),
    path.join(appSupport, 'Trae CN', 'User', 'mcp.json'),
  ];
}

function getOpenCodeMcpConfigPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');
}

function getWorkBuddyHome(): string {
  return path.join(os.homedir(), '.workbuddy');
}

function getWorkBuddyMcpInstallPaths(options: { createPrimary?: boolean } = {}): string[] {
  const primary = path.join(getWorkBuddyHome(), 'mcp.json');
  if (fs.existsSync(primary) || options.createPrimary) {
    return [primary];
  }
  const legacy = path.join(getWorkBuddyHome(), '.mcp.json');
  if (fs.existsSync(legacy)) {
    return [legacy];
  }
  return [];
}

function inspectWorkBuddyTrustState(mcpName: string): WorkBuddyTrustInspection {
  const workbuddyHome = getWorkBuddyHome();
  const connectorsDir = path.join(workbuddyHome, 'connectors');
  const accounts: WorkBuddyConnectorState[] = [];
  const stateFiles: string[] = [];

  if (!fs.existsSync(connectorsDir)) {
    return {
      status: 'not_found',
      mcp_name: mcpName,
      workbuddy_home: workbuddyHome,
      connectors_dir: connectorsDir,
      state_files: [],
      accounts,
    };
  }

  for (const entry of fs.readdirSync(connectorsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const statePath = path.join(connectorsDir, entry.name, 'connector-states.json');
    if (!fs.existsSync(statePath)) {
      continue;
    }
    stateFiles.push(statePath);
    let state: Record<string, unknown>;
    try {
      state = readJsonObject(statePath);
    } catch {
      continue;
    }
    accounts.push({
      account_id: entry.name,
      path: statePath,
      enabled: asStringArray(state.enabled).includes(mcpName),
      ever_connected: asStringArray(state.everConnected).includes(mcpName),
      user_disabled: asStringArray(state.userDisabled).includes(mcpName),
    });
  }

  const trusted = accounts.some((account) => account.enabled && !account.user_disabled);
  return {
    status: trusted ? 'trusted' : stateFiles.length > 0 ? 'pending' : 'not_found',
    mcp_name: mcpName,
    workbuddy_home: workbuddyHome,
    connectors_dir: connectorsDir,
    state_files: stateFiles,
    accounts,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function formatWorkBuddyTrustInspection(inspection: WorkBuddyTrustInspection): string {
  const lines = [
    'WorkBuddy MCP trust',
    `- config_server: ${inspection.mcp_name}`,
    '- config_requirement: mcp.json mcpServers entry must include "disabled": false.',
    `- trust_storage: ${getReadableWorkBuddyTrustPath()}`,
  ];

  if (inspection.status === 'trusted') {
    const trustedAccounts = inspection.accounts
      .filter((account) => account.enabled && !account.user_disabled)
      .map((account) => account.account_id);
    lines.push(`- status: trusted (${trustedAccounts.join(', ')})`);
    lines.push('- next_action: none');
    return lines.join('\n');
  }

  if (inspection.status === 'pending') {
    lines.push('- status: pending_user_trust');
    lines.push(`- state_files: ${inspection.state_files.join(', ')}`);
  } else {
    lines.push('- status: trust_state_not_found');
    lines.push(`- checked: ${inspection.connectors_dir}`);
  }

  lines.push(
    `- expected_state: enabled includes "${inspection.mcp_name}" and userDisabled does not include it.`
  );
  lines.push(
    `- next_action: Open WorkBuddy MCP settings, enable/trust ${inspection.mcp_name}, then reconnect or restart WorkBuddy.`
  );
  return lines.join('\n');
}

function getReadableWorkBuddyTrustPath(): string {
  return process.platform === 'win32'
    ? '%USERPROFILE%\\.workbuddy\\connectors\\<account-id>\\connector-states.json'
    : '~/.workbuddy/connectors/<account-id>/connector-states.json';
}

function mergeJsonMcpConfig(configPath: string, options: McpInstallOptions): ConfigWriteResult {
  const existing = readJsonObject(configPath);
  const mcpServers = asObject(existing.mcpServers);
  const desired = createJsonMcpServerConfig(options);
  if (deepJsonEqual(mcpServers[options.mcpName], desired)) {
    return { changed: false };
  }
  mcpServers[options.mcpName] = desired;
  existing.mcpServers = mcpServers;
  return writeConfigWithTapTapBackupIfChanged(
    configPath,
    `${JSON.stringify(existing, null, 2)}\n`,
    (updated) => validateJsonMcpServersConfig(updated, options)
  );
}

function mergeOpenCodeMcpConfig(configPath: string, options: McpInstallOptions): ConfigWriteResult {
  const rawContent = fs.readFileSync(configPath, 'utf8');
  const rewroteJsonc = normalizeJsonConfigContent(rawContent, { jsonc: true }) !== rawContent;
  const existing = readJsonObject(configPath, { jsonc: true });
  const mcp = asObject(existing.mcp);
  const desired = createOpenCodeMcpServerConfig(options);
  const legacyMcpServers = asObject(existing.mcpServers);
  if (
    deepJsonEqual(mcp[options.mcpName], desired) &&
    !Object.prototype.hasOwnProperty.call(legacyMcpServers, options.mcpName) &&
    existing.$schema === 'https://opencode.ai/config.json'
  ) {
    return { changed: false, rewroteJsonc: false };
  }
  mcp[options.mcpName] = desired;
  existing.mcp = mcp;

  const mcpServers = legacyMcpServers;
  if (Object.prototype.hasOwnProperty.call(mcpServers, options.mcpName)) {
    delete mcpServers[options.mcpName];
    if (Object.keys(mcpServers).length === 0) {
      delete existing.mcpServers;
    } else {
      existing.mcpServers = mcpServers;
    }
  }

  if (!existing.$schema) {
    existing.$schema = 'https://opencode.ai/config.json';
  }

  const write = writeConfigWithTapTapBackupIfChanged(
    configPath,
    `${JSON.stringify(existing, null, 2)}\n`,
    (updated) => validateOpenCodeMcpConfig(updated, options)
  );
  return { ...write, rewroteJsonc: write.changed && rewroteJsonc };
}

function mergeCodexMcpConfig(configPath: string, options: McpInstallOptions): ConfigWriteResult {
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const sectionPattern = createCodexMcpSectionPattern(options.mcpName);
  const withoutOld = existing.replace(sectionPattern, '').trimEnd();
  const launch = options.launcher;
  const envValues = createMcpEnvironmentValues(options.env, options.clientIde, options.launcherEnv);
  const envSection =
    Object.keys(envValues).length === 0
      ? []
      : [
          '',
          `[mcp_servers."${options.mcpName}".env]`,
          ...Object.entries(envValues).map(([key, value]) => `${key} = "${escapeToml(value)}"`),
        ];
  const section = [
    `[mcp_servers."${options.mcpName}"]`,
    `command = "${escapeToml(launch.command)}"`,
    `args = [${launch.args.map((arg) => `"${escapeToml(arg)}"`).join(', ')}]`,
    ...envSection,
    '',
  ].join('\n');
  return writeConfigWithTapTapBackupIfChanged(
    configPath,
    [withoutOld, section].filter(Boolean).join('\n\n'),
    (updated) => {
      const duplicates = findCodexMcpTableDuplicates(updated, options.mcpName);
      if (duplicates.length > 0) {
        throw new Error(
          `Codex MCP config update would create duplicate table(s): ${duplicates.join(
            ', '
          )}. Restored previous config.`
        );
      }
    }
  );
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

function tryClaudeMcpAdd(options: McpInstallOptions): { ok: boolean; changed: boolean } {
  const configPath = path.join(os.homedir(), '.claude.json');
  try {
    const existing = readJsonObject(configPath);
    const server = asObject(asObject(existing.mcpServers)[options.mcpName]);
    if (deepJsonEqual(server, createJsonMcpServerConfig(options))) {
      return { ok: true, changed: false };
    }
  } catch {
    // Let the official CLI attempt the update. The fallback writer will retain
    // its existing validation and recovery behavior if the CLI cannot repair it.
  }

  const npxLaunch = options.launcher;
  const claudeArgs = [
    'mcp',
    'add',
    '--scope',
    'user',
    '--transport',
    'stdio',
    ...Object.entries(
      createMcpEnvironmentValues(options.env, options.clientIde, options.launcherEnv)
    ).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    options.mcpName,
    '--',
    ...npxLaunch.commandAndArgs,
  ];
  const claude = getWindowsCmdLaunchCommand('claude.cmd', claudeArgs);
  const result = spawnSync(
    process.platform === 'win32' ? claude.command : 'claude',
    process.platform === 'win32' ? claude.args : claudeArgs,
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    return { ok: false, changed: false };
  }

  try {
    const updated = readJsonObject(configPath);
    const server = asObject(asObject(updated.mcpServers)[options.mcpName]);
    return deepJsonEqual(server, createJsonMcpServerConfig(options))
      ? { ok: true, changed: true }
      : { ok: false, changed: false };
  } catch {
    return { ok: false, changed: false };
  }
}

function createJsonMcpServerConfig(options: McpInstallOptions): {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
} {
  const launch = options.launcher;
  return {
    command: launch.command,
    args: launch.args,
    ...createOptionalMcpEnvironment(options.env, 'env', options.clientIde, options.launcherEnv),
    ...(options.disabled !== undefined ? { disabled: options.disabled } : {}),
  };
}

function createOpenCodeMcpServerConfig(options: McpInstallOptions): {
  type: 'local';
  command: string[];
  enabled: true;
  environment?: Record<string, string>;
} {
  return {
    type: 'local',
    command: options.launcher.commandAndArgs,
    ...createOptionalMcpEnvironment(
      options.env,
      'environment',
      options.clientIde,
      options.launcherEnv
    ),
    enabled: true,
  };
}

function createOptionalMcpEnvironment<Key extends 'env' | 'environment'>(
  env: MakerEnvironment,
  key: Key,
  clientIde?: string,
  launcherEnv?: Record<string, string>
): Record<Key, Record<string, string>> | Record<string, never> {
  const values = createMcpEnvironmentValues(env, clientIde, launcherEnv);
  if (Object.keys(values).length === 0) {
    return {};
  }
  return {
    [key]: values,
  } as Record<Key, Record<string, string>>;
}

function createMcpEnvironmentValues(
  env: MakerEnvironment,
  clientIde?: string,
  launcherEnv?: Record<string, string>
): Record<string, string> {
  const values: Record<string, string> = { ...launcherEnv };
  if (env !== 'production') {
    values.TAPTAP_MCP_ENV = env;
  }
  if (clientIde) {
    values.TAPTAP_MCP_CLIENT_IDE = clientIde;
  }
  return values;
}

function getWindowsCmdLaunchCommand(
  command: string,
  args: string[]
): { command: string; args: string[] } {
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
}

function rejectPackageOption(parsed: ParsedArgs): void {
  if (Object.prototype.hasOwnProperty.call(parsed.options, 'package')) {
    throw new Error(
      '--package is no longer supported. @taptap/maker uses its packaged runtime; select only --launcher self or npx.'
    );
  }
}

function readJsonObject(
  filePath: string,
  options: { jsonc?: boolean } = {}
): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const normalized = normalizeJsonConfigContent(raw, options);
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('top-level value must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${filePath}: ${detail}`);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function writeConfigWithTapTapBackupIfChanged(
  filePath: string,
  nextContent: string,
  validate?: (content: string) => void
): ConfigWriteResult {
  const existed = fs.existsSync(filePath);
  const previousContent = existed ? fs.readFileSync(filePath, 'utf8') : undefined;
  if (previousContent === nextContent) {
    return { changed: false };
  }

  const backupPath = existed ? `${filePath}.taptap-maker.bak.latest` : undefined;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (previousContent !== undefined && backupPath) {
    fs.writeFileSync(backupPath, previousContent, 'utf8');
  }

  try {
    fs.writeFileSync(filePath, nextContent, 'utf8');
    validate?.(fs.readFileSync(filePath, 'utf8'));
    return { changed: true, backupPath };
  } catch (error) {
    if (previousContent !== undefined) {
      fs.writeFileSync(filePath, previousContent, 'utf8');
    } else {
      fs.rmSync(filePath, { force: true });
    }
    throw error;
  }
}

function validateJsonMcpServersConfig(content: string, options: McpInstallOptions): void {
  const parsed = parseGeneratedJsonObject(content);
  const server = asObject(asObject(parsed.mcpServers)[options.mcpName]);
  const expected = createJsonMcpServerConfig(options);
  if (!deepJsonEqual(server, expected)) {
    throw new Error(`Generated MCP config for ${options.mcpName} failed validation.`);
  }
}

function validateOpenCodeMcpConfig(content: string, options: McpInstallOptions): void {
  const parsed = parseGeneratedJsonObject(content);
  const server = asObject(asObject(parsed.mcp)[options.mcpName]);
  const expected = createOpenCodeMcpServerConfig(options);
  if (!deepJsonEqual(server, expected)) {
    throw new Error(`Generated OpenCode MCP config for ${options.mcpName} failed validation.`);
  }
  const legacyServer = asObject(parsed.mcpServers)[options.mcpName];
  if (legacyServer !== undefined) {
    throw new Error(
      `Generated OpenCode config still contains legacy mcpServers.${options.mcpName}.`
    );
  }
}

function parseGeneratedJsonObject(content: string): Record<string, unknown> {
  const parsed = JSON.parse(stripLeadingBom(content));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Generated JSON config top-level value must be an object.');
  }
  return parsed as Record<string, unknown>;
}

function deepJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJsonObjectKeys(left)) === JSON.stringify(sortJsonObjectKeys(right));
}

function sortJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonObjectKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonObjectKeys(item)])
  );
}

function normalizeJsonConfigContent(content: string, options: { jsonc?: boolean } = {}): string {
  const withoutBom = stripLeadingBom(content);
  return options.jsonc ? normalizeJsonc(withoutBom) : withoutBom;
}

function stripLeadingBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function normalizeJsonc(content: string): string {
  return removeTrailingCommas(stripJsonComments(content));
}

function stripJsonComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      } else if (char === '\n' || char === '\r') {
        result += char;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

function removeTrailingCommas(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (/\s/.test(content[lookahead] || '')) {
        lookahead += 1;
      }
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        continue;
      }
    }

    result += char;
  }

  return result;
}

function formatMcpInstallMessage(
  label: string,
  configPath: string,
  write: ConfigWriteResult
): string {
  if (!write.changed) {
    return `✓ ${label} MCP config unchanged: ${configPath}`;
  }
  return [
    `✓ ${label} MCP config updated: ${configPath}`,
    write.backupPath ? `  Backup: ${write.backupPath}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
    return ['No Maker apps found.', '', '0，创建新项目 / 0. Create a new Maker project'].join('\n');
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
    '0，创建新项目 / 0. Create a new Maker project',
    '',
    ...visibleProjects.map((project, index) => formatProjectListItem(project, index)),
    '',
    '0，创建新项目 / 0. Create a new Maker project',
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
  // stdin EOF (Ctrl+D, detached terminal) closes the interface without settling the
  // pending question promise; without this guard the prompt awaits forever.
  let settled = false;
  const closed = new Promise<never>((_, reject) => {
    rl.once('close', () => {
      if (!settled) {
        reject(new Error(`${label} input closed before a value was provided.`));
      }
    });
  });
  try {
    const answer = await Promise.race([rl.question(`${label}: `), closed]);
    if (!answer.trim()) {
      throw new Error(`${label} cannot be empty.`);
    }
    return answer.trim();
  } finally {
    settled = true;
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
    (command === 'mcp' &&
      (subcommand === 'install' || subcommand === 'verify' || subcommand === 'report')) ||
    (command === 'agents' && subcommand === 'update') ||
    command === 'upgrade' ||
    (command === 'dev-kit' && subcommand === 'update') ||
    (command === 'logs' && subcommand === 'watch') ||
    (command === 'python' &&
      (subcommand === 'doctor' || subcommand === 'setup' || subcommand === 'path')) ||
    (command === 'lua-lsp' && (subcommand === 'doctor' || subcommand === 'setup'))
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

function makerMcpConfigEnvOption(parsed: ParsedArgs): MakerEnvironment {
  return stringOption(parsed, 'env') === 'rnd' ? 'rnd' : 'production';
}

function mcpVerifyModeOption(parsed: ParsedArgs): 'npx' | 'self' {
  const mode = stringOption(parsed, 'mode') || 'self';
  if (mode === 'npx' || mode === 'self') {
    return mode;
  }
  throw new Error('Invalid mcp verify --mode. Use npx or self.');
}

function mcpLauncherOption(parsed: ParsedArgs): 'npx' | 'self' {
  const launcher = stringOption(parsed, 'launcher') || 'self';
  if (launcher === 'npx' || launcher === 'self') {
    return launcher;
  }
  throw new Error('Invalid --launcher value. Use self or npx.');
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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
      '  taptap-maker init [--app-id ID] [--target-dir DIR] [--pat PAT]',
      '                     [--create --name NAME]',
      '                     [--skip-confirm] [--skip-mcp-install]',
      '                     [--launcher self|npx]',
      '                     [--register-mcp codex,cursor,claude,trae,opencode,workbuddy]',
      '                     [--json]',
      '',
      'Init flows:',
      '  Standard init/clone/download flow: run `taptap-maker init`; the CLI shows',
      '    the Maker app list, then the user chooses an existing app or 0/new.',
      '  Create-new-project flow: add `--create --name NAME` only when the user',
      '    clearly asks to create a new Maker project; NAME is the requested project name.',
      '',
      '  taptap-maker doctor [--target-dir DIR] [--json]',
      '  taptap-maker python doctor [--json]',
      '  taptap-maker python setup [--json]',
      '  taptap-maker python path [--json]',
      '  taptap-maker lua-lsp doctor [--json]',
      '  taptap-maker lua-lsp setup [--json]',
      '  taptap-maker apps [--pat PAT] [--all] [--json]',
      '                     # --pat warns: PAT appears in ps/history',
      '  taptap-maker login [--json]',
      '  taptap-maker pat set [--pat-stdin] [--json]',
      '  taptap-maker pat set [PAT|--pat PAT] [--json]  # fallback; warns: PAT appears in ps/history',
      '  taptap-maker install [--ide codex,cursor,claude,trae,opencode,workbuddy]',
      '                        [--launcher self|npx] [--json]  # alias for mcp install',
      '  taptap-maker mcp install [--ide codex,cursor,claude,trae,opencode,workbuddy]',
      '                             [--launcher self|npx] [--json]',
      '  taptap-maker mcp verify [--mode npx|self] [--json]',
      '  taptap-maker mcp report [--ide CLIENT] [--target-dir DIR]',
      '                            [--context-stdin] [--consent] [--json]',
      '                            # Run only after the user agrees to submit',
      '  taptap-maker agents update [--target-dir DIR] [--json]',
      '  taptap-maker upgrade [--ide codex,cursor,claude,trae,opencode,workbuddy]',
      '                         [--launcher self|npx] [--target-dir DIR] [--json]',
      '  taptap-maker dev-kit update [--target-dir DIR] [--json]',
      '  taptap-maker logs watch [--target-dir DIR] [--interval 5s] [--reset] [--json]',
      '',
      'MCP install and verify default to a stable self runtime under the Maker home directory.',
      'Use --launcher npx only when npm startup is explicitly required; released builds pin',
      'the exact @taptap/maker version and persist a dedicated writable npm cache.',
      '',
      'MCP install defaults:',
      '  Writes Codex, Cursor, Claude, detected Trae/OpenCode/WorkBuddy configs,',
      '  unless --ide is specified. It does not create missing Trae config files.',
      '',
      'Windows note:',
      '  The default self launcher uses absolute node.exe plus a stable versioned maker.js.',
      '  Explicit npx mode uses absolute node.exe + npm-cli.js and never persists .cmd wrappers.',
      '',
    ].join('\n')
  );
}

async function readStdinText(): Promise<string> {
  const chunks: string[] = [];
  let length = 0;
  const maxLength = 256 * 1024;
  for await (const chunk of input) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const remaining = maxLength - length;
    if (remaining <= 0) {
      break;
    }
    chunks.push(text.slice(0, remaining));
    length += Math.min(text.length, remaining);
  }
  return chunks.join('');
}

export function formatCliError(error: unknown): string {
  if (error instanceof MakerGitNotFoundError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
