/**
 * Maker build local-change guard tests.
 */

import { spawnSync } from 'node:child_process';
import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildCurrentDirectory,
  createBuildArgs,
  createRemoteProxyCallToolOptions,
  listMakerTools,
  MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
  materializeRemoteProxyToolAssets,
  prepareRemoteProxyToolArgs,
  createRemoteProxyContext,
  createRemoteProxyProgressHandler,
  createRemoteRuntimeLogClient,
  refreshMakerPreview,
  formatBuildResult,
  formatToolException,
  formatStatus,
  formatAiDevKitStatus,
  formatClonePartialStateLines,
  formatMakerToolRegistrationCwdStatus,
  formatMakerProxyToolsStatusSafely,
  formatMakerRemoteSyncStatusSafely,
  formatPushResult,
  isSensitiveDiagnosticKey,
  pushThenBuildCurrentDirectory,
  resources,
  retryMakerProxyOperation,
  resolveMakerProjectContext,
  splitRemoteProxyToolPrivateArgs,
  stopExistingRuntimeLogWatcher,
  tools,
} from '../maker/server/mcp';
import {
  getMakerRemoteSyncFailureNextAction,
  inspectMakerDirectoryGitStatus,
  inspectMakerRemoteSyncStatus,
  pushMakerProject,
  readMakerProjectLocalChanges,
} from '../maker/cli/projects';
import { savePat, saveProjectConfig, saveTapAuth } from '../maker/storage';
import { AI_DEV_KIT_VERSION_METADATA_FILE } from '../maker/cli/devKit';
import {
  formatMakerProjectInitializationStatus,
  inspectMakerProjectInitialization,
} from '../maker/projectInitialization';
import {
  formatMakerProjectSettingsStatus,
  inspectMakerProjectSettings,
} from '../maker/projectSettings';

describe('maker build local-change guard', () => {
  let tempDir: string;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalGitBase = process.env.TAPTAP_MAKER_GIT_BASE;
  const originalPat = process.env.PAT;
  const originalEnv = process.env.TAPTAP_MCP_ENV;
  const originalMakerWebUrl = process.env.TAPTAP_MAKER_WEB_URL;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-build-local-changes-'));
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    runGit(['init']);
    runGit(['config', 'user.email', 'maker-test@example.test']);
    runGit(['config', 'user.name', 'maker-test']);
    fs.writeFileSync(path.join(tempDir, '.gitignore'), '.maker-mcp/\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- initial\n', 'utf8');
    runGit(['add', '.gitignore', 'scripts/main.lua']);
    runGit(['commit', '-m', 'chore: initial maker project']);
    runGit(['branch', '-M', 'main']);
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
    });
  });

  afterEach(() => {
    if (originalMakerHome === undefined) {
      delete process.env.TAPTAP_MAKER_HOME;
    } else {
      process.env.TAPTAP_MAKER_HOME = originalMakerHome;
    }
    if (originalGitBase === undefined) {
      delete process.env.TAPTAP_MAKER_GIT_BASE;
    } else {
      process.env.TAPTAP_MAKER_GIT_BASE = originalGitBase;
    }
    if (originalPat === undefined) {
      delete process.env.PAT;
    } else {
      process.env.PAT = originalPat;
    }
    if (originalEnv === undefined) {
      delete process.env.TAPTAP_MCP_ENV;
    } else {
      process.env.TAPTAP_MCP_ENV = originalEnv;
    }
    if (originalMakerWebUrl === undefined) {
      delete process.env.TAPTAP_MAKER_WEB_URL;
    } else {
      process.env.TAPTAP_MAKER_WEB_URL = originalMakerWebUrl;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('reports clean Maker project state', async () => {
    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(false);
    expect(changes.files).toEqual([]);
  });

  test('reports local Maker project changes', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.files).toEqual(['scripts/main.lua']);
  });

  test('reports local Maker project changes when filenames contain arrow text', async () => {
    const fileName = 'scripts/name -> arrow.lua';
    fs.writeFileSync(path.join(tempDir, fileName), '-- changed\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.files).toContain(fileName);
  });

  test('remote proxy context uses project local rnd environment config', () => {
    process.env.TAPTAP_MCP_ENV = 'production';
    saveTapAuth({
      kid: 'prod-kid',
      token: 'prod-token',
      mac_key: 'prod-mac-key',
    });
    process.env.TAPTAP_MCP_ENV = 'rnd';
    saveTapAuth({
      kid: 'rnd-kid',
      token: 'rnd-token',
      mac_key: 'rnd-mac-key',
    });
    delete process.env.TAPTAP_MCP_ENV;
    fs.mkdirSync(path.join(tempDir, '.maker'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.maker', 'taptap-maker.local.json'),
      '{"env":"rnd"}\n',
      'utf8'
    );

    const proxy = createRemoteProxyContext({ targetDir: tempDir });
    const proxyConfig = JSON.parse(proxy.proxyConfigJson);

    expect(proxy.env).toBe('rnd');
    expect(proxy.serverUrl).toBe('https://fuping.agnt.xd.com/mcp/v1');
    expect(proxyConfig.server.env).toBe('rnd');
    expect(proxyConfig.auth.kid).toBe('rnd-kid');
    expect(proxyConfig.auth.mac_key).toBe('rnd-mac-key');
  });

  test('remote proxy context configures progress token injection without tool timeout override', () => {
    saveTapAuth({
      kid: 'rnd-kid',
      token: 'rnd-token',
      mac_key: 'rnd-mac-key',
    });

    const proxy = createRemoteProxyContext({ targetDir: tempDir });
    const proxyConfig = JSON.parse(proxy.proxyConfigJson);

    expect(proxyConfig.options).not.toHaveProperty('tool_call_timeout');
    expect(proxyConfig.options.reset_timeout_on_progress).toBe(true);
    expect(proxyConfig.options.force_inject_progress_token).toBe(true);
  });

  test('remote proxy progress handler keeps upstream progress active without client token', () => {
    const extra = {
      sendNotification: jest.fn(),
    };

    const onprogress = createRemoteProxyProgressHandler(undefined, extra as never);

    expect(typeof onprogress).toBe('function');
    onprogress({ progress: 1, total: 100, message: '__keepalive__' });
    expect(extra.sendNotification).not.toHaveBeenCalled();
  });

  test('remote proxy progress handler forwards progress when client token exists', () => {
    const extra = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    const onprogress = createRemoteProxyProgressHandler('client-token', extra as never);

    onprogress({ progress: 7, total: 100, message: 'working' });
    expect(extra.sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 'client-token',
        progress: 7,
        total: 100,
        message: 'working',
      },
    });
  });

  test('reports committed but unpushed Maker changes', async () => {
    const branch = prepareMakerRemote();
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- committed only\n', 'utf8');
    runGit(['add', 'scripts/main.lua']);
    runGit(['commit', '-m', 'chore: committed only']);

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.hasUnpushedCommits).toBe(true);
    expect(changes.files).toEqual([]);
    expect(changes.ahead).toContain(`origin/${branch}..HEAD`);
  });

  test('status detects remote commits and guides dirty workspaces before pull', async () => {
    runGit(['branch', '-M', 'main']);
    prepareMakerRemote();
    const remoteWorktree = cloneRemoteWorktree();
    writeRemoteScript(remoteWorktree);
    runGit(['add', 'scripts/remote.lua'], remoteWorktree);
    runGit(['commit', '-m', 'chore: remote update'], remoteWorktree);
    runGit(['push', 'origin', 'main'], remoteWorktree);
    fs.writeFileSync(path.join(tempDir, 'scripts', 'local.lua'), '-- local\n', 'utf8');

    const status = await inspectMakerRemoteSyncStatus(tempDir);

    expect(status.status).toBe('needs_pull');
    expect(status.behindCount).toBe(1);
    expect(status.hasLocalChanges).toBe(true);
    expect(status.nextAction).toContain('本地有未提交改动');
    expect(status.nextAction).toContain('不要直接 pull');
  });

  test('status allows straightforward pull when remote is ahead and workspace is clean', async () => {
    runGit(['branch', '-M', 'main']);
    prepareMakerRemote();
    const remoteWorktree = cloneRemoteWorktree();
    writeRemoteScript(remoteWorktree);
    runGit(['add', 'scripts/remote.lua'], remoteWorktree);
    runGit(['commit', '-m', 'chore: remote update'], remoteWorktree);
    runGit(['push', 'origin', 'main'], remoteWorktree);

    const status = await inspectMakerRemoteSyncStatus(tempDir);

    expect(status.status).toBe('needs_pull');
    expect(status.hasLocalChanges).toBe(false);
    expect(status.nextAction).toContain('工作区干净');
    expect(status.nextAction).toContain('git pull --ff-only origin main');
  });

  test('status fetch auth failures guide users to refresh Maker PAT', () => {
    const nextAction = getMakerRemoteSyncFailureNextAction({
      classification: 'auth',
      retryable: false,
      nextAction: '运行 `taptap-maker login` 重新完成 Maker 登录授权。',
    });

    expect(nextAction).toContain('taptap-maker login');
    expect(nextAction).not.toContain('pat-tokens');
    expect(nextAction).not.toContain('PAT 页面');
    expect(nextAction).not.toContain('粘贴');
    expect(
      getMakerRemoteSyncFailureNextAction({
        classification: 'auth',
        retryable: false,
        nextAction: '运行 `taptap-maker login` 重新完成 Maker 登录授权。',
      })
    ).not.toContain('控制台');
  });

  test('pushes committed but unpushed Maker changes when workspace is clean', async () => {
    const branch = prepareMakerRemote();
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- committed only\n', 'utf8');
    runGit(['add', 'scripts/main.lua']);
    runGit(['commit', '-m', 'chore: committed only']);
    const head = readGit(['rev-parse', '--short', 'HEAD']).trim();

    const result = await pushMakerProject({ cwd: tempDir });

    expect(result.pushed).toBe(true);
    expect(result.committed).toBe(false);
    expect(result.commitHash).toBe(head);
    expect(result.status).toBe('pushed');
    expect(
      readGit(
        ['rev-parse', '--short', branch],
        path.join(process.env.TAPTAP_MAKER_GIT_BASE!, 'app-1.git')
      )
    ).toBe(`${head}\n`);
  });

  test('pushes an empty wake commit when explicitly allowed for a clean Maker project', async () => {
    const branch = prepareMakerRemote();

    const result = await pushMakerProject({
      cwd: tempDir,
      allowEmpty: true,
      message: 'chore: wake maker build server',
    });

    const head = readGit(['rev-parse', '--short', 'HEAD']).trim();
    const subject = readGit(['log', '-1', '--format=%s']).trim();

    expect(result.pushed).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.commitHash).toBe(head);
    expect(result.message).toBe('chore: wake maker build server');
    expect(subject).toBe('chore: wake maker build server');
    expect(
      readGit(
        ['rev-parse', '--short', branch],
        path.join(process.env.TAPTAP_MAKER_GIT_BASE!, 'app-1.git')
      )
    ).toBe(`${head}\n`);
  });

  test('push failure explains that Maker remote only accepts main branch', async () => {
    runGit(['branch', '-M', 'main']);
    prepareMakerRemote();
    runGit(['switch', '-c', 'selftest/non-main-guard']);
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- branch guard\n', 'utf8');

    const result = await pushMakerProject({ cwd: tempDir });

    expect(result.status).toBe('clean');
    expect(result.committed).toBe(false);
    expect(result.failure?.classification).toBe('branch_not_allowed');
    expect(result.failure?.retryable).toBe(false);
    expect(result.failure?.stage).toBe('remote_sync');
    expect(result.failure?.nextAction).toContain('切回 main');
    expect(result.failure?.nextAction).not.toContain('远端已有新提交');
    expect(result.transientRetries).toBe(0);

    const output = formatPushResult(
      tempDir,
      { targetDir: tempDir, submitResult: result },
      { elapsedMs: 1000, elapsed: '1s', progressEvents: 1 }
    );
    expect(output).toContain('- classification: branch_not_allowed');
    expect(output).toContain('Maker 远端只接受 main 分支');
    expect(output).toContain('请切回 main');
  });

  test('push stops before commit when Maker remote is ahead', async () => {
    runGit(['branch', '-M', 'main']);
    prepareMakerRemote();
    const remoteWorktree = cloneRemoteWorktree();
    writeRemoteScript(remoteWorktree);
    runGit(['add', 'scripts/remote.lua'], remoteWorktree);
    runGit(['commit', '-m', 'chore: remote update'], remoteWorktree);
    runGit(['push', 'origin', 'main'], remoteWorktree);
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- local\n', 'utf8');
    const headBefore = readGit(['rev-parse', '--short', 'HEAD']).trim();

    const result = await pushMakerProject({ cwd: tempDir });

    expect(result.status).toBe('clean');
    expect(result.committed).toBe(false);
    expect(result.pushed).toBe(false);
    expect(result.failure?.stage).toBe('remote_sync');
    expect(result.failure?.classification).toBe('remote_rejected');
    expect(result.failure?.stderr).toContain('Maker remote sync status: needs_pull');
    expect(result.failure?.nextAction).toContain('远端有 1 个新提交');
    expect(readGit(['rev-parse', '--short', 'HEAD']).trim()).toBe(headBefore);
  });

  test('push selected files still includes Maker generated .gitignore changes', async () => {
    runGit(['branch', '-M', 'main']);
    prepareMakerRemote();
    fs.appendFileSync(path.join(tempDir, '.gitignore'), '\n# local dev kit\nCLAUDE.md\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    const result = await pushMakerProject({
      cwd: tempDir,
      files: ['scripts/main.lua'],
      message: 'chore: update maker project',
    });

    expect(result.status).toBe('pushed');
    expect(result.committed).toBe(true);
    const committedFiles = readGit(['show', '--name-only', '--format=', 'HEAD'])
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(committedFiles).toEqual(['.gitignore', 'scripts/main.lua']);
  });

  test('push failure explains that remote forbidden directories cannot be submitted', async () => {
    runGit(['branch', '-M', 'main']);
    fs.appendFileSync(path.join(tempDir, '.gitignore'), 'server-only-cache/\n', 'utf8');
    runGit(['add', '.gitignore']);
    runGit(['commit', '-m', 'chore: ignore remote forbidden path']);
    prepareMakerRemote(
      [
        '#!/bin/sh',
        'while read old new ref; do',
        '  if git diff-tree --no-commit-id --name-only -r "$new" | grep -q "^server-only-cache/"; then',
        '    echo "matches forbidden pattern \\"server-only-cache/*\\"" >&2',
        '    exit 1',
        '  fi',
        'done',
        'exit 0',
      ].join('\n')
    );
    fs.mkdirSync(path.join(tempDir, 'server-only-cache'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'server-only-cache', '_selftest_guardrail.txt'),
      'local\n',
      'utf8'
    );
    runGit(['add', '-f', 'server-only-cache/_selftest_guardrail.txt']);
    runGit(['commit', '-m', 'chore: force add remote forbidden file']);

    const result = await pushMakerProject({ cwd: tempDir });

    expect(result.status).toBe('failed_after_commit');
    expect(result.failure?.classification).toBe('forbidden_path');
    expect(result.failure?.stderr).toContain('matches forbidden pattern "server-only-cache/*"');
    expect(result.failure?.nextAction).toContain('远端禁止提交的路径或目录');
    expect(result.failure?.nextAction).toContain('从本地 commit 移除');
    expect(result.failure?.nextAction).not.toContain('粘贴新的 Maker PAT');

    const output = formatPushResult(
      tempDir,
      { targetDir: tempDir, submitResult: result },
      { elapsedMs: 1000, elapsed: '1s', progressEvents: 1 }
    );
    expect(output).toContain('- classification: forbidden_path');
    expect(output).toContain('Maker 远端禁止提交');
    expect(output).toContain('移除这些路径');
  });

  test('build sync pushes committed but unpushed changes before remote build', async () => {
    const submittedCwds: string[] = [];
    const remoteBuildTargetDirs: string[] = [];
    prepareMakerRemote();
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- committed only\n', 'utf8');
    runGit(['add', 'scripts/main.lua']);
    runGit(['commit', '-m', 'chore: committed only']);

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async (options) => {
        submittedCwds.push(options.cwd);
        return {
          branch: 'main',
          committed: false,
          commitHash: 'abc1234',
          pushed: true,
          status: 'pushed',
        };
      },
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: tempDir,
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'production',
          timeoutMs: 1000,
          buildArgs: {},
          resultText: 'ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect(submittedCwds.map(normalizePath)).toEqual([gitProjectRoot()].map(normalizePath));
    expect(remoteBuildTargetDirs.map(normalizePath)).toEqual([gitProjectRoot()].map(normalizePath));
  });

  test('reports .gitignore changes for build local-change guard', async () => {
    fs.appendFileSync(path.join(tempDir, '.gitignore'), '\n# local dev kit\nCLAUDE.md\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.files).toEqual(['.gitignore']);
  });

  test('includes .gitignore in build local-change prompts when game files changed', async () => {
    fs.appendFileSync(path.join(tempDir, '.gitignore'), '\n# local dev kit\nCLAUDE.md\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.files).toEqual(['.gitignore', 'scripts/main.lua']);
  });

  test('formats clone partial state after a failed clone leaves local setup behind', () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-clone-partial-'));
    try {
      fs.mkdirSync(path.join(targetDir, '.git'), { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, '.gitignore.dev-kit-before-clone'),
        'CLAUDE.md\n',
        'utf8'
      );
      fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '# dev kit\n', 'utf8');
      for (const entry of ['examples', 'templates', 'urhox-libs']) {
        fs.mkdirSync(path.join(targetDir, entry), { recursive: true });
      }

      const text = formatClonePartialStateLines(targetDir).join('\n');

      expect(text).toContain('partial_state:');
      expect(text).toContain('- git_initialized: yes');
      expect(text).toContain('- project_bound: no');
      expect(text).toContain('- ai_dev_kit_present: yes');
      expect(text).toContain('- staged_dev_kit_gitignore: yes');
      expect(text).toContain('- safe_to_retry: yes');
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });

  test('rejects Maker config inside a parent git repo without an independent project git root', async () => {
    fs.rmSync(path.join(tempDir, '.maker-mcp'), { recursive: true, force: true });
    const nestedMakerDir = path.join(tempDir, 'Tests', 'MacroTests');
    fs.mkdirSync(nestedMakerDir, { recursive: true });
    saveProjectConfig(nestedMakerDir, {
      project_id: 'nested-app',
      user_id: 'user-1',
    });

    await expect(readMakerProjectLocalChanges(nestedMakerDir)).rejects.toThrow(
      'must be an independent Git repository'
    );
  });

  test('reports unusable Maker git status when binding is inside a parent git repo', () => {
    fs.rmSync(path.join(tempDir, '.maker-mcp'), { recursive: true, force: true });
    const nestedMakerDir = path.join(tempDir, 'Tests', 'MacroTests');
    fs.mkdirSync(nestedMakerDir, { recursive: true });
    saveProjectConfig(nestedMakerDir, {
      project_id: 'nested-app',
      user_id: 'user-1',
    });

    const status = inspectMakerDirectoryGitStatus(nestedMakerDir);

    expect(status.issue).toBe('inside_parent_git_repo');
    expect(status.isUsableMakerGitRepo).toBe(false);
    expect(status.makerProjectRoot).toBe(nestedMakerDir);
    expect(normalizePath(status.gitRoot || '')).toBe(normalizePath(tempDir));
  });

  test('blocks submit from Maker config inside a parent git repo before touching git remote', async () => {
    fs.rmSync(path.join(tempDir, '.maker-mcp'), { recursive: true, force: true });
    const nestedMakerDir = path.join(tempDir, 'Tests', 'MacroTests');
    fs.mkdirSync(nestedMakerDir, { recursive: true });
    saveProjectConfig(nestedMakerDir, {
      project_id: 'nested-app',
      user_id: 'user-1',
    });

    await expect(pushMakerProject({ cwd: nestedMakerDir })).rejects.toThrow(
      'must be an independent Git repository'
    );
  });

  test('syncs local changes before remote build by default', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const submitCwds: string[] = [];
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async (options) => {
        submitCwds.push(options.cwd);
        return {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: options.message || 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        };
      },
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect('submitResult' in result ? result.submitResult?.pushed : undefined).toBe(true);
    expect(submitCwds.map(normalizePath)).toEqual([normalizePath(fs.realpathSync(tempDir))]);
    expect(remoteBuildTargetDirs.map(normalizePath)).toEqual([
      normalizePath(fs.realpathSync(tempDir)),
    ]);
  });

  test('syncs local changes from a Maker project subdirectory', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const submitCwds: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: path.join(tempDir, 'scripts'),
      submitLocalChanges: async (options) => {
        submitCwds.push(options.cwd);
        return {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          pushed: false,
          status: 'failed_after_commit',
          failure: {
            stage: 'push',
            classification: 'remote_rejected',
            retryable: false,
            message: 'remote rejected',
            nextAction: 'pull/rebase before retrying Maker build',
          },
        };
      },
    });

    expect(result.mode).toBe('submit_failed_before_build');
    expect(submitCwds.map(normalizePath)).toEqual([normalizePath(fs.realpathSync(tempDir))]);
  });

  test('allows explicitly confirmed remote build to pass the local-change guard', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    await expect(
      buildCurrentDirectory({
        targetDir: tempDir,
        confirmRemoteBuildWithoutSubmit: true,
      })
    ).rejects.toThrow('Tap auth not found');
  });

  test('build request pushes an empty commit before remote build when project has no local changes', async () => {
    const submitOptions: Array<{ cwd: string; allowEmpty?: boolean; message?: string }> = [];
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async (options) => {
        submitOptions.push({
          cwd: options.cwd,
          allowEmpty: options.allowEmpty,
          message: options.message,
        });
        return {
          branch: 'main',
          committed: true,
          commitHash: 'wake123',
          message: options.message || 'chore: wake maker build server',
          pushed: true,
          status: 'pushed',
        };
      },
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect('submitResult' in result ? result.submitResult?.pushed : undefined).toBe(true);
    expect(
      submitOptions.map((item) => ({
        ...item,
        cwd: normalizePath(item.cwd),
      }))
    ).toEqual([
      {
        cwd: normalizePath(fs.realpathSync(tempDir)),
        allowEmpty: true,
        message: 'chore: wake maker build server',
      },
    ]);
    expect(remoteBuildTargetDirs.map(normalizePath)).toEqual([
      normalizePath(fs.realpathSync(tempDir)),
    ]);
  });

  test('build request does not open Maker page when building committed remote version', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      confirmRemoteBuildWithoutSubmit: true,
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect('submitResult' in result ? result.submitResult : undefined).toBeUndefined();
    expect('makerPageOpen' in result).toBe(false);
    expect(remoteBuildTargetDirs).toEqual([tempDir]);
  });

  test('defaults single-player build entry to scripts/main.lua when present', () => {
    const buildArgs = createBuildArgs(tempDir, {});

    expect(buildArgs).toMatchObject({
      scriptsPath: 'scripts',
      entry: 'main.lua',
      multiplayer: { enabled: false },
    });
  });

  test('does not default build entry when scripts/main.lua is missing', () => {
    fs.unlinkSync(path.join(tempDir, 'scripts', 'main.lua'));

    const buildArgs = createBuildArgs(tempDir, {});

    expect(buildArgs).not.toHaveProperty('scriptsPath');
    expect(buildArgs).not.toHaveProperty('entry');
    expect(buildArgs).toMatchObject({
      multiplayer: { enabled: false },
    });
  });

  test('does not inject single-player multiplayer default for explicit multiplayer entries', () => {
    const buildArgs = createBuildArgs(tempDir, {
      scriptsPath: 'scripts',
      entryClient: 'client_main.lua',
      entryServer: 'server_main.lua',
    });

    expect(buildArgs).toEqual({
      scriptsPath: 'scripts',
      entry_client: 'client_main.lua',
      entry_server: 'server_main.lua',
    });
  });

  test('keeps explicit build entry when user overrides the default', () => {
    const buildArgs = createBuildArgs(tempDir, {
      scriptsPath: 'custom',
      entry: 'boot.lua',
    });

    expect(buildArgs).toMatchObject({
      scriptsPath: 'custom',
      entry: 'boot.lua',
    });
  });

  test('project settings check allows runtime config but reports broken build fields', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {
          engine: { tag: 'stable' },
          'engine-res': { tag: 'latest' },
          'official-res': { tag: 'stable' },
        },
        build: {
          generate_fs_path: true,
          output_dir: '../dist',
          asset_dirs: ['../assets', '../scripts'],
          asset_ignores: [],
        },
        '@runtime': {
          multiplayer: { enabled: true },
        },
      }),
      'utf8'
    );

    const status = inspectMakerProjectSettings(tempDir);
    const output = formatMakerProjectSettingsStatus(status);

    expect(status.status).toBe('invalid_project_settings');
    expect(status.issues).toEqual(['sources.engine-res.tag must be "stable"']);
    expect(output).toContain('Maker project settings');
    expect(output).toContain('- status: invalid_project_settings');
    expect(output).toContain('sources.engine-res.tag must be "stable"');
  });

  test('project settings check only requires asset ignores to exist', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {
          engine: { tag: 'stable' },
          'engine-res': { tag: 'stable' },
          'official-res': { tag: 'stable' },
        },
        build: {
          generate_fs_path: true,
          output_dir: '../dist',
          asset_dirs: ['../assets', '../scripts'],
          asset_ignores: 'remote-managed-value',
        },
        '@runtime': {
          multiplayer: { enabled: true },
        },
      }),
      'utf8'
    );

    const status = inspectMakerProjectSettings(tempDir);

    expect(status.status).toBe('ready');
    expect(formatMakerProjectSettingsStatus(status)).toBe('');
  });

  test('project settings check reports missing asset ignores field', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {
          engine: { tag: 'stable' },
          'engine-res': { tag: 'stable' },
          'official-res': { tag: 'stable' },
        },
        build: {
          generate_fs_path: true,
          output_dir: '../dist',
          asset_dirs: ['../assets', '../scripts'],
        },
      }),
      'utf8'
    );

    const status = inspectMakerProjectSettings(tempDir);

    expect(status.status).toBe('invalid_project_settings');
    expect(status.issues).toEqual(['build.asset_ignores must exist']);
  });

  test('project settings check reports missing required root sections', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
      }),
      'utf8'
    );

    const status = inspectMakerProjectSettings(tempDir);

    expect(status.status).toBe('invalid_project_settings');
    expect(status.issues).toEqual(['sources must be an object', 'build must be an object']);
  });

  test('status reports project settings problems without remote sync', async () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.project', 'settings.json'), '{ bad json', 'utf8');

    const output = await formatStatus({ targetDir: tempDir, skipRemoteSync: true });

    expect(output).toContain('Maker project settings');
    expect(output).toContain('- status: invalid_settings_json');
    expect(output).toContain('构建可能失败或游戏黑屏');
  });

  test('build blocks before submit when required project settings fields drift from template', async () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({
        $schema: '../schemas/settings.schema.json',
        sources: {
          engine: { tag: 'stable' },
          'engine-res': { tag: 'stable' },
          'official-res': { tag: 'stable' },
        },
        build: {
          generate_fs_path: true,
          output_dir: '../dist',
          asset_dirs: ['../assets'],
          asset_ignores: [],
        },
      }),
      'utf8'
    );
    const submitLocalChanges = jest.fn();

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges,
    });

    expect(result.mode).toBe('settings_invalid_before_build');
    expect(submitLocalChanges).not.toHaveBeenCalled();
    expect(formatBuildResult(result, emptyProgressSummary())).toContain(
      'build.asset_dirs must contain only "../assets" and "../scripts"'
    );
  });

  test('build blocks before submit when project settings json is invalid', async () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.project', 'settings.json'), '{ bad json', 'utf8');
    const submitLocalChanges = jest.fn();

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges,
    });

    expect(result.mode).toBe('settings_invalid_before_build');
    expect(submitLocalChanges).not.toHaveBeenCalled();
    expect(formatBuildResult(result, emptyProgressSummary())).toContain(
      'Maker project settings are invalid'
    );
  });

  test('remote-only build skips local project settings validation', async () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.project', 'settings.json'), '{ bad json', 'utf8');
    const callRemoteBuild = jest.fn(async () => ({
      mode: 'remote_build' as const,
      projectRoot: fs.realpathSync(tempDir),
      projectId: 'app-1',
      projectPath: 'app-1/workspace',
      serverUrl: 'https://maker.example.test/mcp',
      env: 'rnd',
      timeoutMs: 600000,
      buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
      resultText: 'build ok',
    }));

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      confirmRemoteBuildWithoutSubmit: true,
      callRemoteBuild,
    });

    expect(result.mode).toBe('remote_build');
    expect(callRemoteBuild).toHaveBeenCalledWith(tempDir);
  });

  test('forwards complete multiplayer build config without changing nested fields', () => {
    const multiplayer = {
      enabled: true,
      max_players: 8,
      background_match: true,
      match_info: {
        desc_name: 'free_match_with_ai',
        player_number: 4,
        immediately_start: false,
        match_timeout: 30,
      },
      persistent_world: {
        enabled: false,
      },
    };

    const buildArgs = createBuildArgs(tempDir, {
      scriptsPath: 'scripts',
      entryClient: 'client_main.lua',
      entryServer: 'server_main.lua',
      multiplayer,
    });

    expect(buildArgs).toEqual({
      scriptsPath: 'scripts',
      entry_client: 'client_main.lua',
      entry_server: 'server_main.lua',
      multiplayer,
    });
  });

  test('does not inject default multiplayer when settings.json exists', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'settings.json'),
      JSON.stringify({ '@runtime': { multiplayer: { enabled: true, max_players: 4 } } }),
      'utf8'
    );

    const buildArgs = createBuildArgs(tempDir, {});

    expect(buildArgs).toMatchObject({
      scriptsPath: 'scripts',
      entry: 'main.lua',
    });
    expect(buildArgs).not.toHaveProperty('multiplayer');
  });

  test('build tool description owns commit, push, and build', () => {
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(buildTool?.description).toContain('always pushes before remote Maker build');
    expect(buildTool?.description).toContain('bound Maker project');
    expect(buildTool?.description).toContain('验证游戏效果');
    expect(buildTool?.description).toContain('Do not treat generic code validation requests');
    expect(buildTool?.description).toContain(
      'Preview/build intent does not select or change the service environment'
    );
    expect(buildTool?.description).toContain('Do not add environment parameters');
    expect(buildTool?.description).toContain('empty wake-up commit');
    expect(buildTool?.description).toContain('remote Maker build');
    expect(buildTool?.description).toContain('If push fails, build is not started');
    expect(buildTool?.description).toContain('does not auto-open Maker pages');
    expect(buildTool?.description).not.toContain('maker_page_url');
    expect(buildTool?.description).toContain('runtime_logs.local_file');
    expect(buildTool?.description).toContain('runtime_logs.state_file');
    expect(buildTool?.description).not.toContain('maker_submit_current_directory');
    expect(buildTool?.description).not.toContain('maker_push_current_directory');
    expect(buildTool?.description).not.toContain('Do not use this tool');
  });

  test('exposes only the compact Maker tool set', () => {
    const toolNames = tools.map((item) => item.name);

    expect(toolNames).toEqual(['maker_status_lite', 'maker_build_current_directory']);
    expect(resources.map((item) => item.uri)).toEqual(['maker://status']);
    expect(toolNames).not.toContain('maker_pull_runtime_logs');
    expect(toolNames).not.toContain('maker_exchange_pat');
    expect(toolNames).not.toContain('maker_list_apps');
    expect(toolNames).not.toContain('maker_status');
    expect(toolNames).not.toContain('maker_clone_to_current_directory');
    expect(toolNames).not.toContain('maker_submit_current_directory');
    expect(toolNames).not.toContain('maker_exchange_jwt');
    expect(toolNames).not.toContain('maker_tap_login_start');
    expect(toolNames).not.toContain('maker_tap_login_complete');
    expect(toolNames).not.toContain('maker_push_current_directory');
    expect(toolNames).not.toContain('maker_get_mcp_update_guide');
    expect(toolNames).not.toContain('maker_check_environment');
    expect(toolNames).not.toContain('maker_setup_guide');
    expect(toolNames).not.toContain('maker_configure_remote_proxy');
  });

  test('lists local Maker tools plus selected remote proxy tools', async () => {
    const result = await listMakerTools({
      targetDir: tempDir,
      listRemoteTools: async () => [
        {
          name: 'generate_image',
          description: 'Generate one image',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
        },
        {
          name: 'batch_generate_images',
          description: 'Generate several images',
          inputSchema: { type: 'object', properties: { prompts: { type: 'array' } } },
        },
        {
          name: 'edit_image',
          description: 'Edit an image',
          inputSchema: { type: 'object', properties: { image: { type: 'string' } } },
        },
        {
          name: 'create_video_task',
          description: 'Create a text-to-video generation task',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
        },
        {
          name: 'query_video_task',
          description: 'Query a text-to-video generation task',
          inputSchema: { type: 'object', properties: { task_id: { type: 'string' } } },
        },
        {
          name: 'text_to_music',
          description: 'Generate music from text',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
        },
        {
          name: 'text_to_sound_effect',
          description: 'Generate one sound effect',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
        {
          name: 'batch_sound_effects',
          description: 'Generate several sound effects',
          inputSchema: {
            type: 'object',
            properties: { sounds: { type: 'array' } },
            required: ['sounds'],
          },
        },
        {
          name: 'text_to_dialogue',
          description: 'Generate character dialogue',
          inputSchema: {
            type: 'object',
            properties: {
              inputs: {
                type: 'array',
                maxItems: 50,
                items: {
                  type: 'object',
                  properties: {
                    character_name: { type: 'string' },
                    text: { type: 'string' },
                    reference_audio: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 28 * 1024 * 1024,
                      description:
                        'Optional Doubao project audio path, HTTP(S) URL, or audio data URL.',
                    },
                    delivery_instruction: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 300,
                      description: 'Optional line-specific delivery instruction.',
                    },
                    reference_audio_path: {
                      type: 'string',
                      description: 'Optional Doubao-only project audio resource.',
                    },
                  },
                  required: ['character_name', 'text'],
                },
              },
            },
            required: ['inputs'],
          },
        },
        {
          name: 'audition_voices_for_character',
          description: 'Generate voice candidates for one character',
          inputSchema: {
            type: 'object',
            properties: {
              character_name: { type: 'string' },
              voice_profile: {
                type: 'object',
                properties: {
                  gender: { type: 'string', enum: ['male', 'female'] },
                },
              },
            },
            required: ['character_name'],
          },
        },
        {
          name: 'confirm_character_voice',
          description: 'Confirm one voice candidate',
          inputSchema: {
            type: 'object',
            properties: { character_name: { type: 'string' } },
            required: ['character_name'],
          },
        },
        {
          name: 'create_3d_asset',
          description: 'Create or continue a controlled 3D asset generation lifecycle',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              asset_id: { type: 'string' },
              task_id: { type: 'string' },
              step_id: { type: 'string' },
              payload: { type: 'object' },
            },
            required: ['action'],
          },
        },
        {
          name: 'generate_test_qrcode',
          description: 'Generate a test QR code for mobile testing',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_ad_config',
          description: 'Sync ad config into project settings',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_debug_feedbacks',
          description: 'Download debug feedbacks and query game session logs',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              game_session_id: { type: 'string' },
            },
            required: [],
          },
        },
        {
          name: 'build',
          description: 'Hidden remote build tool',
          inputSchema: { type: 'object' },
        },
      ],
    });

    expect(result.tools.map((item) => item.name)).toEqual([
      'maker_status_lite',
      'maker_build_current_directory',
      'generate_image',
      'batch_generate_images',
      'edit_image',
      'create_video_task',
      'query_video_task',
      'text_to_music',
      'text_to_sound_effect',
      'batch_sound_effects',
      'text_to_dialogue',
      'audition_voices_for_character',
      'confirm_character_voice',
      'create_3d_asset',
      'generate_test_qrcode',
      'get_ad_config',
      'get_debug_feedbacks',
    ]);
    expect(MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES).toEqual([
      'generate_image',
      'batch_generate_images',
      'edit_image',
      'create_video_task',
      'query_video_task',
      'text_to_music',
      'text_to_sound_effect',
      'batch_sound_effects',
      'text_to_dialogue',
      'audition_voices_for_character',
      'confirm_character_voice',
      'create_3d_asset',
      'generate_test_qrcode',
      'get_ad_config',
      'get_debug_feedbacks',
    ]);
    expect(result.tools.find((item) => item.name === 'generate_image')?.description).toContain(
      'prefer this Maker MCP proxy tool for Maker project assets'
    );
    expect(result.tools.find((item) => item.name === 'edit_image')?.description).toContain(
      'prefer this Maker MCP proxy tool for image editing'
    );
    expect(result.tools.find((item) => item.name === 'create_video_task')?.description).toContain(
      'resolvable local files that the local proxy can forward as data URLs'
    );
    expect(result.tools.find((item) => item.name === 'create_video_task')?.description).toContain(
      'Large local/data URL media can be slow or fail'
    );
    expect(result.tools.find((item) => item.name === 'query_video_task')?.description).toContain(
      'Use this Maker MCP proxy tool to refresh video task status'
    );
    const audioTools = [
      'text_to_sound_effect',
      'batch_sound_effects',
      'text_to_dialogue',
      'audition_voices_for_character',
      'confirm_character_voice',
    ];
    for (const audioToolName of audioTools) {
      expect(
        result.tools.find((item) => item.name === audioToolName)?.inputSchema.properties
      ).toHaveProperty('target_dir');
    }
    expect(
      result.tools.find((item) => item.name === 'text_to_sound_effect')?.inputSchema.required
    ).toEqual(['text']);
    expect(
      result.tools.find((item) => item.name === 'batch_sound_effects')?.inputSchema.required
    ).toEqual(['sounds']);
    for (const audioToolName of audioTools) {
      expect(
        result.tools.find((item) => item.name === audioToolName)?.inputSchema.required || []
      ).not.toContain('target_dir');
    }
    expect(
      result.tools.find((item) => item.name === 'audition_voices_for_character')?.inputSchema
        .required
    ).toEqual(['character_name', 'voice_profile']);
    expect(
      result.tools.find((item) => item.name === 'audition_voices_for_character')?.inputSchema
        .properties.voice_profile.required
    ).toEqual(['gender']);
    expect(
      result.tools.find((item) => item.name === 'confirm_character_voice')?.inputSchema.required
    ).toEqual(['character_name']);
    const dialogueTool = result.tools.find((item) => item.name === 'text_to_dialogue');
    expect(dialogueTool?.inputSchema.required).toEqual(['inputs']);
    expect(dialogueTool?.inputSchema.properties.inputs.maxItems).toBe(50);
    expect(dialogueTool?.inputSchema.properties.inputs.items.required).toEqual([
      'character_name',
      'text',
    ]);
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.reference_audio.maxLength
    ).toBe(28 * 1024 * 1024);
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.delivery_instruction.maxLength
    ).toBe(300);
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.reference_audio.description
    ).toContain('project audio path under assets/audio/');
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.reference_audio.description
    ).toContain('HTTP(S) URL');
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.reference_audio.description
    ).toContain('must exist in the current project and is converted to a data URL');
    expect(
      dialogueTool?.inputSchema.properties.inputs.items.properties.reference_audio_path.description
    ).toContain('legacy local project audio path');
    expect(dialogueTool?.description).toContain(
      'reference_audio and reference_audio_path are mutually exclusive'
    );
    expect(dialogueTool?.description).toContain(
      'automatically reuses a confirmed local Doubao reference'
    );
    expect(
      result.tools.find((item) => item.name === 'audition_voices_for_character')?.description
    ).toContain('temporary preview');
    expect(
      result.tools.find((item) => item.name === 'audition_voices_for_character')?.description
    ).toContain('voice_profile.gender');
    expect(
      result.tools.find((item) => item.name === 'confirm_character_voice')?.description
    ).toContain('after the user selects');
    const createAssetTool = result.tools.find((item) => item.name === 'create_3d_asset');
    expect(createAssetTool?.inputSchema.properties).toHaveProperty('action');
    expect(createAssetTool?.inputSchema.properties).toHaveProperty('asset_id');
    expect(createAssetTool?.inputSchema.properties).toHaveProperty('step_id');
    expect(createAssetTool?.inputSchema.properties).toHaveProperty('payload');
    expect(createAssetTool?.inputSchema.properties).toHaveProperty('target_dir');
    expect(createAssetTool?.inputSchema.properties.target_dir.description).toContain(
      'not forwarded to the remote Maker tool'
    );
    expect(createAssetTool?.inputSchema.required).toEqual(['action']);
    expect(createAssetTool?.description).toContain('start, query, continue');
    expect(
      result.tools.find((item) => item.name === 'generate_image')?.inputSchema.properties
    ).toHaveProperty('target_dir');
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'Trigger this tool for any ad-related request'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'ad activation status and ad config'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'do not infer ad readiness from local SDK docs'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'ShowRewardVideoAd'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'If .project/project.json is missing'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'app_id or developer_id is missing'
    );
    expect(result.tools.find((item) => item.name === 'get_ad_config')?.description).toContain(
      'generate_test_qrcode'
    );
    expect(
      result.tools.find((item) => item.name === 'generate_test_qrcode')?.description
    ).toContain('user explicitly asks for a test QR code');
    expect(
      result.tools.find((item) => item.name === 'generate_test_qrcode')?.description
    ).toContain('after get_ad_config reports missing app_id or developer_id');
    expect(
      result.tools.find((item) => item.name === 'generate_test_qrcode')?.inputSchema.properties
    ).toHaveProperty('target_dir');
    expect(result.tools.find((item) => item.name === 'get_debug_feedbacks')?.description).toContain(
      'Fetch online player feedback'
    );
    expect(result.tools.find((item) => item.name === 'get_debug_feedbacks')?.description).toContain(
      'local_dir/local_log_paths/local_screenshot_paths'
    );
  });

  test('remote proxy private target_dir is stripped before forwarding upstream', () => {
    const { targetDir, remoteArgs } = splitRemoteProxyToolPrivateArgs({
      target_dir: tempDir,
      prompt: 'coin icon',
      target_size: '128x128',
    });

    expect(targetDir).toBe(tempDir);
    expect(remoteArgs).toEqual({
      prompt: 'coin icon',
      target_size: '128x128',
    });
  });

  test('falls back to local Maker tools when remote proxy tool listing is unavailable', async () => {
    const result = await listMakerTools({
      targetDir: tempDir,
      listRemoteTools: async () => {
        throw new Error('remote project is not bound');
      },
    });

    expect(result.tools.map((item) => item.name)).toEqual([
      'maker_status_lite',
      'maker_build_current_directory',
    ]);
  });

  test('proxy status warns that remote tools and build are unavailable when proxy fails', async () => {
    const output = await formatMakerProxyToolsStatusSafely({
      targetDir: tempDir,
      listRemoteTools: async () => {
        throw new Error('connect ECONNREFUSED remote maker proxy');
      },
    });

    expect(output).toContain('Maker proxy tools');
    expect(output).toContain('- status: unavailable');
    expect(output).toContain('- available_tools: (none)');
    expect(output).toContain(
      '- missing_tools: generate_image, batch_generate_images, edit_image, create_video_task, query_video_task, text_to_music, text_to_sound_effect, batch_sound_effects, text_to_dialogue, audition_voices_for_character, confirm_character_voice, create_3d_asset, generate_test_qrcode, get_ad_config, get_debug_feedbacks'
    );
    expect(output).toContain('- build_available: no');
    expect(output).toContain('- failure_message: connect ECONNREFUSED remote maker proxy');
    expect(output).toContain('远端 proxy tools 和 build 构建都不可用');
  });

  test('tool registration cwd status explains why proxy tools are missing from the session', () => {
    const dialogueDir = path.join(tempDir, '..', 'dialogue-cwd');
    const output = formatMakerToolRegistrationCwdStatus({
      mcpCwd: dialogueDir,
      targetDir: tempDir,
      projectRoot: tempDir,
      mcpProjectRoot: undefined,
    });

    expect(output).toContain('MCP tool registration cwd');
    expect(output).toContain('- status: mismatch');
    expect(output).toContain(`- mcp_cwd: ${path.resolve(dialogueDir)}`);
    expect(output).toContain(`- maker_project_dir: ${tempDir}`);
    expect(output).toContain('- mcp_cwd_project_dir: (none)');
    expect(output).toContain('proxy tools may not appear in this MCP session');
    expect(output).toContain('Reconnect');
  });

  test('project context prefers the single MCP client root over stale MCP cwd', async () => {
    const staleCwd = process.cwd();

    const context = await resolveMakerProjectContext({
      listClientRoots: async () => [{ uri: pathToFileURL(tempDir).href, name: 'current-game' }],
    });

    expect(normalizePath(context.targetDir)).toBe(normalizePath(tempDir));
    expect(context.source).toBe('client_roots');
    expect(normalizePath(context.targetDir)).not.toBe(normalizePath(staleCwd));
  });

  test('project context selects the only bound Maker project from multiple roots', async () => {
    const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-notes-root-'));
    try {
      const context = await resolveMakerProjectContext({
        listClientRoots: async () => [
          { uri: pathToFileURL(notesDir).href, name: 'notes' },
          { uri: pathToFileURL(tempDir).href, name: 'maker-game' },
        ],
      });

      expect(normalizePath(context.targetDir)).toBe(normalizePath(tempDir));
      expect(context.source).toBe('client_roots');
      expect(context.roots.status).toBe('selected');
    } finally {
      fs.rmSync(notesDir, { recursive: true, force: true });
    }
  });

  test('project context rejects multiple attached Maker project roots', async () => {
    const otherMakerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-other-root-'));
    try {
      saveProjectConfig(otherMakerDir, {
        project_id: 'app-2',
        user_id: 'user-2',
      });

      await expect(
        resolveMakerProjectContext({
          listClientRoots: async () => [
            { uri: pathToFileURL(tempDir).href, name: 'maker-a' },
            { uri: pathToFileURL(otherMakerDir).href, name: 'maker-b' },
          ],
        })
      ).rejects.toThrow('Multiple Maker project roots');
    } finally {
      fs.rmSync(otherMakerDir, { recursive: true, force: true });
    }
  });

  test('proxy retry stops after the bounded default attempts', async () => {
    let attempts = 0;
    const retryMessages: string[] = [];

    await expect(
      retryMakerProxyOperation(
        async () => {
          attempts += 1;
          throw new Error(`connect ECONNREFUSED attempt ${attempts}`);
        },
        {
          delayMs: 0,
          sleep: async () => {},
          onRetry: (event) => retryMessages.push(event.message),
        }
      )
    ).rejects.toThrow('connect ECONNREFUSED attempt 5');

    expect(attempts).toBe(5);
    expect(retryMessages).toHaveLength(4);
    expect(retryMessages[0]).toContain('attempt 1/5');
    expect(retryMessages[3]).toContain('attempt 4/5');
  });

  test('downloads generated image proxy result into Maker image assets', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:10Z'),
      fetchImpl: fakeAssetFetch('image-bytes'),
      result: proxyTextResult({
        success: true,
        name: '红色 药水/图标',
        prompt: '红色药水',
        previewUrl: 'https://example.test/red.png',
        actualSize: '64x64',
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.localPath).toBe('assets/image/红色_药水_图标_20260602080910.png');
    expect(parsed.absolutePath).toBe(
      path.join(tempDir, 'assets/image/红色_药水_图标_20260602080910.png')
    );
    expect(
      fs.readFileSync(path.join(tempDir, 'assets/image/红色_药水_图标_20260602080910.png'), 'utf8')
    ).toBe('image-bytes');
    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry['assets/image/红色_药水_图标_20260602080910.png'].previewUrl).toBe(
      'https://example.test/red.png'
    );
  });

  test('downloads successful batch image proxy results only', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'batch_generate_images',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:11Z'),
      fetchImpl: fakeAssetFetch('batch-image'),
      result: proxyTextResult({
        total: 3,
        succeeded: 2,
        failed: 1,
        results: [
          {
            success: true,
            name: 'blue_icon',
            previewUrl: 'https://example.test/blue.png',
          },
          {
            success: true,
            name: 'blue_icon',
            previewUrl: 'https://example.test/blue-variant.png',
          },
          {
            success: false,
            name: 'failed_icon',
            error: 'upstream failed',
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.results[0].localPath).toBe('assets/image/blue_icon_20260602080911.png');
    expect(parsed.results[1].localPath).toBe('assets/image/blue_icon_20260602080911_2.png');
    expect(parsed.results[2].localPath).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, 'assets/image/blue_icon_20260602080911.png'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(tempDir, 'assets/image/blue_icon_20260602080911_2.png'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(tempDir, 'assets/image/failed_icon_20260602080911.png'))).toBe(
      false
    );
    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry['assets/image/blue_icon_20260602080911.png'].cdnUrl).toBe(
      'https://example.test/blue.png'
    );
    expect(registry['assets/image/blue_icon_20260602080911_2.png'].cdnUrl).toBe(
      'https://example.test/blue-variant.png'
    );
  });

  test('downloads video and music proxy results into Maker asset directories', async () => {
    const video = await materializeRemoteProxyToolAssets({
      toolName: 'create_video_task',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:12Z'),
      fetchImpl: fakeAssetFetch('video-bytes'),
      result: proxyTextResult({
        task_id: 'cgt-20260602155659-vggcg',
        status: 'succeeded',
        cdn_url: 'https://example.test/video.mp4',
      }),
    });
    const music = await materializeRemoteProxyToolAssets({
      toolName: 'text_to_music',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:13Z'),
      fetchImpl: fakeAssetFetch('audio-bytes'),
      result: proxyTextResult({
        success: true,
        taskId: 'temp-1',
        music: {
          title: 'Empty Hall Echo',
          audioUrl: 'https://example.test/music.mp3',
        },
      }),
    });

    const videoText = video.content[0]?.type === 'text' ? video.content[0].text : '';
    const musicText = music.content[0]?.type === 'text' ? music.content[0].text : '';
    expect(JSON.parse(videoText).localPath).toBe(
      'assets/video/cgt-20260602155659-vggcg_20260602080912.mp4'
    );
    expect(JSON.parse(musicText).music.localPath).toBe(
      'assets/audio/Empty_Hall_Echo_20260602080913.mp3'
    );
    expect(
      fs.readFileSync(
        path.join(tempDir, 'assets/video/cgt-20260602155659-vggcg_20260602080912.mp4'),
        'utf8'
      )
    ).toBe('video-bytes');
    expect(
      fs.readFileSync(path.join(tempDir, 'assets/audio/Empty_Hall_Echo_20260602080913.mp3'), 'utf8')
    ).toBe('audio-bytes');
    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry['assets/video/cgt-20260602155659-vggcg_20260602080912.mp4'].cdnUrl).toBe(
      'https://example.test/video.mp4'
    );
    expect(registry['assets/audio/Empty_Hall_Echo_20260602080913.mp3'].cdnUrl).toBe(
      'https://example.test/music.mp3'
    );
  });

  test('downloads queried video proxy results into Maker asset directories', async () => {
    const video = await materializeRemoteProxyToolAssets({
      toolName: 'query_video_task',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:16Z'),
      fetchImpl: fakeAssetFetch('queried-video-bytes'),
      result: proxyTextResult({
        task_id: 'cgt-20260602155659-query',
        status: 'succeeded',
        cdn_url: 'https://example.test/query-video.mp4',
      }),
    });

    const videoText = video.content[0]?.type === 'text' ? video.content[0].text : '';
    expect(JSON.parse(videoText).localPath).toBe(
      'assets/video/cgt-20260602155659-query_20260602080916.mp4'
    );
    expect(
      fs.readFileSync(
        path.join(tempDir, 'assets/video/cgt-20260602155659-query_20260602080916.mp4'),
        'utf8'
      )
    ).toBe('queried-video-bytes');
    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry['assets/video/cgt-20260602155659-query_20260602080916.mp4'].tool).toBe(
      'query_video_task'
    );
    expect(registry['assets/video/cgt-20260602155659-query_20260602080916.mp4'].taskId).toBe(
      'cgt-20260602155659-query'
    );
    expect(registry['assets/video/cgt-20260602155659-query_20260602080916.mp4'].cdnUrl).toBe(
      'https://example.test/query-video.mp4'
    );
  });

  test('reuses materialized video when querying the same task result again', async () => {
    const firstFetch = jest.fn(fakeAssetFetch('video-bytes'));
    const secondFetch = jest.fn(fakeAssetFetch('duplicate-video-bytes'));

    const created = await materializeRemoteProxyToolAssets({
      toolName: 'create_video_task',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:20Z'),
      fetchImpl: firstFetch as typeof fetch,
      result: proxyTextResult({
        task_id: 'cgt-20260602155659-reuse',
        status: 'succeeded',
        cdn_url: 'https://example.test/reuse-video.mp4',
      }),
    });
    const queried = await materializeRemoteProxyToolAssets({
      toolName: 'query_video_task',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:10:20Z'),
      fetchImpl: secondFetch as typeof fetch,
      result: proxyTextResult({
        task_id: 'cgt-20260602155659-reuse',
        status: 'succeeded',
        cdn_url: 'https://example.test/reuse-video.mp4',
      }),
    });

    const createdText = created.content[0]?.type === 'text' ? created.content[0].text : '';
    const queriedText = queried.content[0]?.type === 'text' ? queried.content[0].text : '';
    const createdPayload = JSON.parse(createdText);
    const queriedPayload = JSON.parse(queriedText);
    expect(queriedPayload.localPath).toBe(createdPayload.localPath);
    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).not.toHaveBeenCalled();
    expect(
      fs.readFileSync(
        path.join(tempDir, 'assets/video/cgt-20260602155659-reuse_20260602080920.mp4'),
        'utf8'
      )
    ).toBe('video-bytes');

    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    const matchingVideos = Object.values(registry).filter(
      (record) =>
        typeof record === 'object' &&
        record !== null &&
        (record as { taskId?: string }).taskId === 'cgt-20260602155659-reuse'
    );
    expect(matchingVideos).toHaveLength(1);
  });

  test('downloads edit image proxy result into Maker image assets', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'edit_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:14Z'),
      fetchImpl: fakeAssetFetch('edited-image'),
      result: proxyTextResult({
        success: true,
        name: 'edited_icon',
        previewUrl: 'https://example.test/edited.png',
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.localPath).toBe('assets/image/edited_icon_20260602080914.png');
    expect(
      fs.readFileSync(path.join(tempDir, 'assets/image/edited_icon_20260602080914.png'), 'utf8')
    ).toBe('edited-image');
    const registry = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker/assets/generated-assets.json'), 'utf8')
    );
    expect(registry['assets/image/edited_icon_20260602080914.png'].cdnUrl).toBe(
      'https://example.test/edited.png'
    );
    expect(registry['assets/image/edited_icon_20260602080914.png'].tool).toBe('edit_image');
  });

  test('rewrites edit image input to cdn url for locally generated images', async () => {
    await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:16Z'),
      fetchImpl: fakeAssetFetch('image-bytes'),
      result: proxyTextResult({
        success: true,
        name: 'source_icon',
        prompt: 'source',
        previewUrl: 'https://example.test/source.png',
        actualSize: '64x64',
      }),
    });

    const args = prepareRemoteProxyToolArgs({
      toolName: 'edit_image',
      targetDir: tempDir,
      args: {
        image: 'assets/image/source_icon_20260602080916.png',
        reference_images: [
          path.join(tempDir, 'assets/image/source_icon_20260602080916.png'),
          'https://example.test/already-cdn.png',
        ],
        prompt: 'add glow',
        name: 'source_icon_glow',
        target_size: '64x64',
      },
    });

    expect(args.image).toBe('https://example.test/source.png');
    expect(args.reference_images).toEqual([
      'https://example.test/source.png',
      'https://example.test/already-cdn.png',
    ]);
    expect(args.prompt).toBe('add glow');
  });

  test('resolves edit image input from generated asset file name and asset name', async () => {
    await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:20Z'),
      fetchImpl: fakeAssetFetch('image-bytes'),
      result: proxyTextResult({
        success: true,
        name: '飞机图',
        prompt: 'source',
        previewUrl: 'https://example.test/plane.png',
        actualSize: '64x64',
      }),
    });

    const args = prepareRemoteProxyToolArgs({
      toolName: 'edit_image',
      targetDir: tempDir,
      args: {
        image: '飞机图_20260602080920.png',
        reference_images: ['飞机图'],
        prompt: 'make it cartoon',
        name: '飞机图_卡通版',
        target_size: '64x64',
      },
    });

    expect(args.image).toBe('https://example.test/plane.png');
    expect(args.reference_images).toEqual(['https://example.test/plane.png']);
  });

  test('converts edit image local references without cdn mapping to image data urls', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/manual_plane.png'), 'image-bytes', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'assets/image/manual_style.png'), 'style-bytes', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'edit_image',
      targetDir: tempDir,
      args: {
        image: 'manual_plane.png',
        reference_images: [
          'manual_style.png',
          'https://example.test/already-cdn.png',
          'data:image/png;base64,YWxyZWFkeQ==',
        ],
        prompt: 'make it cartoon',
        name: 'manual_plane_cartoon',
        target_size: '64x64',
      },
    });

    expect(args.image).toBe(dataUrl('image/png', 'image-bytes'));
    expect(args.reference_images).toEqual([
      dataUrl('image/png', 'style-bytes'),
      'https://example.test/already-cdn.png',
      'data:image/png;base64,YWxyZWFkeQ==',
    ]);
  });

  test('keeps edit image input unchanged when no generated image mapping exists', () => {
    const args = prepareRemoteProxyToolArgs({
      toolName: 'edit_image',
      targetDir: tempDir,
      args: {
        image: 'assets/image/server_existing.png',
        prompt: 'add glow',
        name: 'server_existing_glow',
        target_size: '64x64',
      },
    });

    expect(args.image).toBe('assets/image/server_existing.png');
  });

  test('rewrites video task local reference assets to cdn urls', async () => {
    await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:17Z'),
      fetchImpl: fakeAssetFetch('image-bytes'),
      result: proxyTextResult({
        success: true,
        name: 'video_ref_image',
        previewUrl: 'https://example.test/video-ref-image.png',
      }),
    });
    await materializeRemoteProxyToolAssets({
      toolName: 'create_video_task',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:18Z'),
      fetchImpl: fakeAssetFetch('video-bytes'),
      result: proxyTextResult({
        task_id: 'video-ref-task',
        status: 'succeeded',
        cdn_url: 'https://example.test/video-ref.mp4',
      }),
    });
    await materializeRemoteProxyToolAssets({
      toolName: 'text_to_music',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:19Z'),
      fetchImpl: fakeAssetFetch('audio-bytes'),
      result: proxyTextResult({
        success: true,
        taskId: 'audio-ref-task',
        music: {
          audioUrl: 'https://example.test/audio-ref.mp3',
        },
      }),
    });

    const args = prepareRemoteProxyToolArgs({
      toolName: 'create_video_task',
      targetDir: tempDir,
      args: {
        mode: 'multi_modal_reference',
        images: [{ url: 'video_ref_image' }, { url: 'https://example.test/already-cdn-image.png' }],
        videos: [{ url: 'video-ref-task' }],
        audios: [{ url: 'audio-ref-task' }],
      },
    });

    expect(args.images).toEqual([
      { url: 'https://example.test/video-ref-image.png' },
      { url: 'https://example.test/already-cdn-image.png' },
    ]);
    expect(args.videos).toEqual([{ url: 'https://example.test/video-ref.mp4' }]);
    expect(args.audios).toEqual([{ url: 'https://example.test/audio-ref.mp3' }]);
  });

  test('converts generate image reference image names to image data urls', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/manual_ref.png'), 'image-bytes', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'assets/image/legacy_ref.webp'), 'legacy-bytes', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'generate_image',
      targetDir: tempDir,
      args: {
        prompt: 'make a cartoon version',
        reference_image: 'legacy_ref.webp',
        reference_images: ['manual_ref.png'],
      },
    });

    expect(args.reference_image).toBe(dataUrl('image/webp', 'legacy-bytes'));
    expect(args.reference_images).toEqual([dataUrl('image/png', 'image-bytes')]);
  });

  test('converts generate image explicit outside-project reference path to image data url', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-reference-outside-'));
    try {
      const outsideImage = path.join(outsideDir, 'desktop-ref.jpg');
      fs.writeFileSync(outsideImage, 'outside-image-bytes', 'utf8');

      const args = prepareRemoteProxyToolArgs({
        toolName: 'generate_image',
        targetDir: tempDir,
        args: {
          prompt: 'make a cartoon version',
          reference_images: [outsideImage],
        },
      });

      expect(args.reference_images).toEqual([dataUrl('image/jpeg', 'outside-image-bytes')]);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test('keeps parent-relative outside-project references unchanged', () => {
    const outsideDir = fs.mkdtempSync(path.join(path.dirname(tempDir), 'maker 外部素材 '));
    try {
      const outsideImage = path.join(outsideDir, '桌面 ref.png');
      fs.writeFileSync(outsideImage, 'outside-image-bytes', 'utf8');
      const parentRelativeImage = path.relative(tempDir, outsideImage);

      const args = prepareRemoteProxyToolArgs({
        toolName: 'generate_image',
        targetDir: tempDir,
        args: {
          prompt: 'make a cartoon version',
          reference_images: [parentRelativeImage],
        },
      });

      expect(args.reference_images).toEqual([parentRelativeImage]);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test('converts project-relative references with spaces and chinese characters', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image/参考 图'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'assets/image/参考 图/角色 草图.png'),
      'image-bytes',
      'utf8'
    );

    const args = prepareRemoteProxyToolArgs({
      toolName: 'generate_image',
      targetDir: tempDir,
      args: {
        prompt: 'make a cartoon version',
        reference_images: ['assets/image/参考 图/角色 草图.png'],
      },
    });

    expect(args.reference_images).toEqual([dataUrl('image/png', 'image-bytes')]);
  });

  test('converts batch generate image local references to image data urls', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/batch_ref.gif'), 'batch-bytes', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'batch_generate_images',
      targetDir: tempDir,
      args: {
        images: [
          {
            prompt: 'make a cartoon version',
            reference_images: ['batch_ref.gif'],
          },
        ],
      },
    });

    expect(args.images).toEqual([
      {
        prompt: 'make a cartoon version',
        reference_images: [dataUrl('image/gif', 'batch-bytes')],
      },
    ]);
  });

  test('converts video task local reference media to data urls', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'assets/video'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'assets/audio'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/video_image_ref.png'), 'image-ref', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'assets/video/video_ref.mp4'), 'video-ref', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'assets/audio/audio_ref.mp3'), 'audio-ref', 'utf8');
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-video-reference-outside-'));

    try {
      const outsideImage = path.join(outsideDir, 'desktop-ref.webp');
      const outsideVideo = path.join(outsideDir, 'desktop-ref.mov');
      const outsideAudio = path.join(outsideDir, 'desktop-ref.wav');
      fs.writeFileSync(outsideImage, 'outside-image-ref', 'utf8');
      fs.writeFileSync(outsideVideo, 'outside-video-ref', 'utf8');
      fs.writeFileSync(outsideAudio, 'outside-audio-ref', 'utf8');

      const args = prepareRemoteProxyToolArgs({
        toolName: 'create_video_task',
        targetDir: tempDir,
        args: {
          mode: 'multi_modal_reference',
          images: [
            { role: 'reference_image', url: 'video_image_ref.png' },
            { role: 'reference_image', url: outsideImage },
            { role: 'reference_image', url: 'https://example.test/ref.png' },
            { role: 'reference_image', url: 'data:image/png;base64,YWxyZWFkeQ==' },
          ],
          videos: [
            { role: 'reference_video', url: 'video_ref.mp4' },
            { role: 'reference_video', url: outsideVideo },
          ],
          audios: [
            { role: 'reference_audio', url: 'audio_ref.mp3' },
            { role: 'reference_audio', url: outsideAudio },
          ],
        },
      });

      expect(args.images).toEqual([
        { role: 'reference_image', url: dataUrl('image/png', 'image-ref') },
        { role: 'reference_image', url: dataUrl('image/webp', 'outside-image-ref') },
        { role: 'reference_image', url: 'https://example.test/ref.png' },
        { role: 'reference_image', url: 'data:image/png;base64,YWxyZWFkeQ==' },
      ]);
      expect(args.videos).toEqual([
        { role: 'reference_video', url: dataUrl('video/mp4', 'video-ref') },
        { role: 'reference_video', url: dataUrl('video/quicktime', 'outside-video-ref') },
      ]);
      expect(args.audios).toEqual([
        { role: 'reference_audio', url: dataUrl('audio/mpeg', 'audio-ref') },
        { role: 'reference_audio', url: dataUrl('audio/wav', 'outside-audio-ref') },
      ]);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test('rewrites create_3d_asset nested local image inputs without changing lifecycle fields', async () => {
    await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-07-16T08:09:20Z'),
      fetchImpl: fakeAssetFetch('front-image'),
      result: proxyTextResult({
        success: true,
        name: 'hero_front',
        previewUrl: 'https://example.test/hero-front.png',
      }),
    });
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/hero-left.png'), 'left-image', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      args: {
        action: 'start',
        asset_id: 'asset-preserved',
        payload: {
          generation_strategy: 'reviewed',
          quality_tier: 'balanced',
          images: {
            front: 'hero_front',
            left: 'assets/image/hero-left.png',
            back: 'https://example.test/hero-back.png',
            right: 'data:image/png;base64,cmlnaHQ=',
          },
        },
      },
    });

    expect(args.action).toBe('start');
    expect(args.asset_id).toBe('asset-preserved');
    expect(args.payload).toEqual({
      generation_strategy: 'reviewed',
      quality_tier: 'balanced',
      images: {
        front: 'https://example.test/hero-front.png',
        left: dataUrl('image/png', 'left-image'),
        back: 'https://example.test/hero-back.png',
        right: 'data:image/png;base64,cmlnaHQ=',
      },
    });
  });

  test('preserves unknown create_3d_asset review fields in structured content', async () => {
    const payload = {
      asset_id: 'asset-review-1',
      status: 'awaiting_review',
      current_step: 'four_view_review',
      review_contract_from_server: {
        tiles: [
          { view: 'front', cdn_url: 'https://example.test/front.png' },
          { view: 'back', cdn_url: 'https://example.test/back.png' },
        ],
        server_revision: 7,
      },
    };

    const result = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      result: proxyTextResult(payload),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(JSON.parse(text)).toEqual(payload);
    expect((result as { structuredContent?: unknown }).structuredContent).toEqual(payload);
  });

  test('materializes create_3d_asset copy instructions into the requested local path', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      now: new Date('2026-07-16T08:09:21Z'),
      fetchImpl: fakeAssetFetch('new-model-bytes'),
      result: proxyTextResult({
        asset_id: 'asset-final-1',
        status: 'completed',
        runtime: 'local',
        model_files: [
          {
            kind: 'model',
            assetId: 'asset-final-1',
            modelUrl: 'https://cdn.example.test/final-model.glb',
            mimeType: 'model/gltf-binary',
            format: 'glb',
            suggestedFileName: 'asset-final-1.glb',
            targetDirectory: 'assets/model',
            materialization: 'copy',
          },
        ],
        delivery_failures: [],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.model_files).toHaveLength(1);
    expect(parsed.local_delivery).toMatchObject({
      status: 'success',
      asset_id: 'asset-final-1',
      model: {
        remote_url: 'https://cdn.example.test/final-model.glb',
        local_path: 'assets/model/asset-final-1.glb',
        format: 'glb',
        materialization: 'copy',
      },
    });
    expect(
      fs.readFileSync(path.join(tempDir, parsed.local_delivery.model.local_path), 'utf8')
    ).toBe('new-model-bytes');
  });

  test('rejects create_3d_asset copy targets outside assets/model', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      fetchImpl: fakeAssetFetch('malicious-script'),
      result: proxyTextResult({
        asset_id: 'asset-escape-copy',
        status: 'completed',
        runtime: 'local',
        model_files: [
          {
            kind: 'model',
            assetId: 'asset-escape-copy',
            modelUrl: 'https://cdn.example.test/model.glb',
            format: 'glb',
            suggestedFileName: 'main.lua',
            targetDirectory: 'assets/model/../../scripts',
            materialization: 'copy',
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.local_delivery.status).toBe('failed');
    expect(parsed.local_delivery.model.download.error).toMatch(/invalid.*target path/i);
    expect(fs.readFileSync(path.join(tempDir, 'scripts/main.lua'), 'utf8')).toBe('-- initial\n');
  });

  test('rejects create_3d_asset extract targets outside assets/model', async () => {
    const modelZip = await createZipBuffer({ 'Meshes/main.mdl': 'mdl-bytes' });
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      fetchImpl: (async () => new Response(modelZip, { status: 200 })) as typeof fetch,
      result: proxyTextResult({
        asset_id: 'asset-escape-extract',
        status: 'completed',
        runtime: 'local',
        model_files: [
          {
            kind: 'model',
            assetId: 'asset-escape-extract',
            modelUrl: 'https://cdn.example.test/model.zip',
            format: 'mdl',
            suggestedFileName: 'model.zip',
            targetDirectory: 'assets/model/../../config',
            materialization: 'extract',
            entrypointExtension: '.mdl',
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.local_delivery.status).toBe('failed');
    expect(parsed.local_delivery.model.download.error).toMatch(/invalid.*target path/i);
    expect(fs.existsSync(path.join(tempDir, 'config/Meshes/main.mdl'))).toBe(false);
  });

  test('extracts create_3d_asset MDL bundles and reuses the local entrypoint', async () => {
    const modelZip = await createZipBuffer({
      'Meshes/main.mdl': 'mdl-bytes',
      'Materials/main.xml': '<material />',
    });
    let downloadCount = 0;
    const fetchImpl = (async () => {
      downloadCount += 1;
      return new Response(modelZip, { status: 200 });
    }) as typeof fetch;
    const remoteResult = proxyTextResult({
      asset_id: 'asset-stable-1',
      status: 'completed',
      runtime: 'local',
      model_files: [
        {
          kind: 'model',
          assetId: 'asset-stable-1',
          modelUrl: 'https://cdn.example.test/stable-model.zip',
          mimeType: 'application/zip',
          format: 'mdl',
          archiveFormat: 'zip',
          suggestedFileName: 'asset-stable-1.zip',
          targetDirectory: 'assets/model/asset-stable-1',
          materialization: 'extract',
          entrypointExtension: '.mdl',
        },
      ],
      delivery_failures: [],
    });

    const first = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      now: new Date('2026-07-16T08:09:22Z'),
      fetchImpl,
      result: remoteResult,
    });
    const second = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      now: new Date('2026-07-16T08:10:22Z'),
      fetchImpl,
      result: remoteResult,
    });

    const firstParsed = JSON.parse(first.content[0]?.type === 'text' ? first.content[0].text : '');
    const secondParsed = JSON.parse(
      second.content[0]?.type === 'text' ? second.content[0].text : ''
    );
    expect(downloadCount).toBe(1);
    expect(firstParsed.local_delivery.model.local_path).toBe(
      'assets/model/asset-stable-1/Meshes/main.mdl'
    );
    expect(secondParsed.local_delivery.model.local_path).toBe(
      'assets/model/asset-stable-1/Meshes/main.mdl'
    );
    expect(secondParsed.local_delivery.model.reused).toBe(true);
    expect(secondParsed.local_delivery.model.format).toBe('mdl');
    expect(
      fs.readFileSync(path.join(tempDir, 'assets/model/asset-stable-1/Meshes/main.mdl'), 'utf8')
    ).toBe('mdl-bytes');
  });

  test('downloads create_3d_asset review previews for local user confirmation', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'create_3d_asset',
      targetDir: tempDir,
      now: new Date('2026-07-16T08:09:23Z'),
      fetchImpl: fakeAssetFetch('preview-bytes'),
      result: proxyTextResult({
        asset_id: 'asset-review-2',
        status: 'waiting_user_confirmation',
        current_step: 'multiview_review',
        preview: {
          front: 'https://cdn.example.test/front.png',
          left: 'https://cdn.example.test/left.png',
          back: 'https://cdn.example.test/back.png',
          right: 'https://cdn.example.test/right.png',
        },
        next_action: {
          action: 'continue',
          step_id: 'multiview_review',
          payload: { confirm: true },
        },
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.next_action).toEqual({
      action: 'continue',
      step_id: 'multiview_review',
      payload: { confirm: true },
    });
    expect(parsed.preview_assets.front.localPath).toBe(
      'assets/image/asset-review-2_front_20260716080923.png'
    );
    expect(parsed.preview_assets.right.localPath).toBe(
      'assets/image/asset-review-2_right_20260716080923.png'
    );
    expect(
      fs.readFileSync(
        path.join(tempDir, 'assets/image/asset-review-2_front_20260716080923.png'),
        'utf8'
      )
    ).toBe('preview-bytes');
  });

  test('overrides sdk default timeout for remote proxy generation tool calls', () => {
    const options = createRemoteProxyCallToolOptions(undefined, {
      sendNotification: jest.fn(),
    } as never);

    expect(options.timeout).toBe(60 * 60 * 1000);
    expect(options.resetTimeoutOnProgress).toBe(true);
    expect(typeof options.onprogress).toBe('function');
  });

  test('keeps proxy result readable when asset download fails', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'generate_image',
      targetDir: tempDir,
      now: new Date('2026-06-02T08:09:15Z'),
      fetchImpl: (async () => new Response('missing', { status: 500 })) as typeof fetch,
      result: proxyTextResult({
        success: true,
        name: 'download_failed',
        previewUrl: 'https://example.test/missing.png',
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.localPath).toBeUndefined();
    expect(parsed.download).toEqual({
      success: false,
      error: 'Asset download failed: HTTP 500',
    });
  });

  test('annotates maker feedback proxy relative paths without local downloading', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'get_debug_feedbacks',
      targetDir: tempDir,
      result: proxyTextResult({
        success: true,
        save_dir: 'logs/feed_back/',
        summary: {
          fetched: 1,
          logs_downloaded: 1,
          screenshots_downloaded: 1,
          feedbacks: [
            {
              feedback_id: 11001,
              dir: 'logs/feed_back/feedback_11001',
              logs_downloaded: 1,
              screenshots_downloaded: 1,
            },
          ],
        },
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);

    expect(parsed.save_dir).toBe('logs/feed_back/');
    expect(parsed.local_path_hint).toEqual({
      remote_save_dir: 'logs/feed_back/',
      local_candidate_save_dir: path.join(tempDir, 'logs', 'feed_back'),
      local_project_dir: tempDir,
      files_verified_locally: false,
      note: 'Use local_dir/local_log_paths/local_screenshot_paths when they are returned. If only local_candidate_* is present, it is a possible project-relative location and must not be treated as a downloaded local file.',
    });
    expect(parsed.summary.feedbacks[0].dir).toBe('logs/feed_back/feedback_11001');
    expect(parsed.summary.feedbacks[0].local_candidate_dir).toBe(
      path.join(tempDir, 'logs', 'feed_back', 'feedback_11001')
    );
    expect(fs.existsSync(path.join(tempDir, 'logs', 'feed_back'))).toBe(false);
  });

  test('keeps maker feedback no-data results unchanged', async () => {
    const payload = {
      success: true,
      total: 0,
      message: '没有找到调试反馈数据',
      list: [],
    };
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'get_debug_feedbacks',
      targetDir: tempDir,
      result: proxyTextResult(payload),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);

    expect(parsed).toEqual(payload);
    expect('structuredContent' in result).toBe(true);
  });

  test('downloads maker feedback artifact urls into local feedback directories', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'get_debug_feedbacks',
      targetDir: tempDir,
      fetchImpl: (async (url: string) => {
        if (url.endsWith('/runtime.log')) {
          return new Response('runtime log body');
        }
        if (url.endsWith('/screenshot.png')) {
          return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        }
        return new Response('missing', { status: 404 });
      }) as typeof fetch,
      result: proxyTextResult({
        success: true,
        message: '已拉取 1 条反馈，仅返回下载地址',
        total: 1,
        fetched: 1,
        save_dir: null,
        feedbacks: [
          {
            feedback_id: 10001,
            description: 'crash',
            log_file_urls: ['https://cdn.example.com/runtime.log'],
            screenshots: ['https://cdn.example.com/screenshot.png'],
            download_urls: [
              'https://cdn.example.com/runtime.log',
              'https://cdn.example.com/screenshot.png',
            ],
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    const feedback = parsed.feedbacks[0];

    expect(feedback.local_dir).toBe(path.join(tempDir, 'logs', 'feed_back', 'feedback_10001'));
    expect(feedback.local_log_paths).toEqual([
      path.join(tempDir, 'logs', 'feed_back', 'feedback_10001', 'logs', 'runtime.log'),
    ]);
    expect(feedback.local_screenshot_paths).toEqual([
      path.join(tempDir, 'logs', 'feed_back', 'feedback_10001', 'screenshots', 'screenshot.png'),
    ]);
    expect(feedback.artifacts_downloaded).toBe(2);
    expect(feedback.artifact_download_errors).toEqual([]);
    expect(fs.readFileSync(feedback.local_log_paths[0], 'utf8')).toBe('runtime log body');
    expect(fs.readFileSync(feedback.local_screenshot_paths[0])).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
  });

  test('downloads maker feedback artifacts when feedback id is zero', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'get_debug_feedbacks',
      targetDir: tempDir,
      fetchImpl: (async () => new Response('zero id runtime log')) as typeof fetch,
      result: proxyTextResult({
        success: true,
        feedbacks: [
          {
            feedback_id: 0,
            log_file_urls: ['https://cdn.example.com/runtime.log'],
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    const feedback = parsed.feedbacks[0];

    expect(feedback.local_dir).toBe(path.join(tempDir, 'logs', 'feed_back', 'feedback_0'));
    expect(feedback.local_log_paths).toEqual([
      path.join(tempDir, 'logs', 'feed_back', 'feedback_0', 'logs', 'runtime.log'),
    ]);
    expect(feedback.artifacts_downloaded).toBe(1);
    expect(fs.readFileSync(feedback.local_log_paths[0], 'utf8')).toBe('zero id runtime log');
  });

  test('uses windows-safe names for maker feedback artifact files', async () => {
    const result = await materializeRemoteProxyToolAssets({
      toolName: 'get_debug_feedbacks',
      targetDir: tempDir,
      fetchImpl: (async () => new Response('reserved name log')) as typeof fetch,
      result: proxyTextResult({
        success: true,
        feedbacks: [
          {
            feedback_id: 10002,
            log_file_urls: ['https://cdn.example.com/CON.log'],
          },
        ],
      }),
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    const logPath = parsed.feedbacks[0].local_log_paths[0];

    expect(path.basename(logPath)).toBe('_CON.log');
    expect(fs.readFileSync(logPath, 'utf8')).toBe('reserved name log');
  });

  test('throws proxy error results with the remote payload intact', async () => {
    await expect(
      materializeRemoteProxyToolAssets({
        toolName: 'create_video_task',
        targetDir: tempDir,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'failed',
                task_id: 'video-task-1',
                error: 'upstream video generation failed',
              }),
            },
          ],
        },
      })
    ).rejects.toThrow(/remote_result:[\s\S]*upstream video generation failed/);
  });

  test('formats nested remote MCP errors with a concise user-facing message', () => {
    const error = Object.assign(
      new Error(
        "MCP error -32603: MCP error -32603: MCP error -32603: Tool 'create_3d_asset' failed: unsupported MDL source format"
      ),
      {
        name: 'McpError',
        code: -32603,
        data: { operation: 'convert' },
      }
    );

    const output = formatToolException('create_3d_asset', error);

    expect(output).toContain('- reason: remote_proxy_tool_call_error');
    expect(output).toContain(
      "- message: Tool 'create_3d_asset' failed: unsupported MDL source format"
    );
    expect(output).not.toContain('- message: MCP error -32603');
    expect(output).toContain('debug:');
    expect(output).toContain('MCP error -32603: MCP error -32603: MCP error -32603:');
    expect(output).toContain('"operation": "convert"');
  });

  test('flattens nested MCP prefixes inside remote proxy isError results', async () => {
    let thrown: unknown;
    try {
      await materializeRemoteProxyToolAssets({
        toolName: 'create_3d_asset',
        targetDir: tempDir,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: "MCP error -32603: MCP error -32603: MCP error -32603: Tool 'create_3d_asset' failed: unsupported MDL source format",
            },
          ],
        },
      });
    } catch (error) {
      thrown = error;
    }

    const output = formatToolException('create_3d_asset', thrown);

    expect(output).toContain('- reason: remote_proxy_tool_result_error');
    expect(output).toContain(
      "- message: Tool 'create_3d_asset' failed: unsupported MDL source format"
    );
    expect(output).not.toContain('MCP error -32603: MCP error -32603:');
    expect(output).toContain("Tool 'create_3d_asset' failed: unsupported MDL source format");
  });

  test('uses the proxy error summary when structured error content has no message field', async () => {
    let thrown: unknown;
    try {
      await materializeRemoteProxyToolAssets({
        toolName: 'create_3d_asset',
        targetDir: tempDir,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'failed', code: 400 }, null, 2),
            },
          ],
        },
      });
    } catch (error) {
      thrown = error;
    }

    const output = formatToolException('create_3d_asset', thrown);

    expect(output).toContain(
      '- message: Remote proxy tool create_3d_asset returned an error result.'
    );
    expect(output).not.toContain('- message: {');
  });

  test('sensitive diagnostic keys do not redact path fields', () => {
    expect(isSensitiveDiagnosticKey('pat')).toBe(true);
    expect(isSensitiveDiagnosticKey('personal_access_token')).toBe(true);
    expect(isSensitiveDiagnosticKey('path')).toBe(false);
    expect(isSensitiveDiagnosticKey('localPath')).toBe(false);
    expect(isSensitiveDiagnosticKey('absolutePath')).toBe(false);
    expect(isSensitiveDiagnosticKey('project_path')).toBe(false);
  });

  test('status lite exposes skip_remote_sync for quick local polling', () => {
    const statusTool = tools.find((item) => item.name === 'maker_status_lite');

    expect(statusTool?.inputSchema.properties).toHaveProperty('skip_remote_sync');
    expect(statusTool?.inputSchema.properties.skip_remote_sync.description).toContain(
      'frequent polling'
    );
  });

  test('remote sync status falls back when git inspection throws', async () => {
    const output = await formatMakerRemoteSyncStatusSafely(path.join(tempDir, 'missing-project'));

    expect(output).toContain('Maker remote sync');
    expect(output).toContain('- status: unavailable');
    expect(output).toContain('- failure_message:');
    expect(output).toContain('- next_action: 远端同步检查失败');
  });

  test('project initialization status guides first build when project json is missing', () => {
    const status = inspectMakerProjectInitialization(tempDir);
    const output = formatMakerProjectInitializationStatus(status);

    expect(status.status).toBe('missing_project_json');
    expect(status.projectJsonPath).toBe(path.join(tempDir, '.project', 'project.json'));
    expect(output).toContain('Maker project initialization');
    expect(output).toContain('- status: missing_project_json');
    expect(output).toContain('get_ad_config');
    expect(output).toContain('maker_build_current_directory');
    expect(output).toContain('.project/project.json');
  });

  test('project initialization status guides test QR code when TapTap identity is missing', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.project', 'project.json'), '{}\n', 'utf8');

    const status = inspectMakerProjectInitialization(tempDir);
    const output = formatMakerProjectInitializationStatus(status);

    expect(status.status).toBe('missing_taptap_identity');
    expect(status.missingFields).toEqual(['app_id', 'developer_id']);
    expect(output).toContain('Maker project initialization');
    expect(output).toContain('- status: missing_taptap_identity');
    expect(output).toContain('- missing_fields: app_id, developer_id');
    expect(output).toContain('get_ad_config');
    expect(output).toContain('generate_test_qrcode');
    expect(output).toContain('不要为这个恢复流程调用发布类工具');
  });

  test('project initialization does not treat unrelated nested identity-like fields as ready', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'project.json'),
      JSON.stringify(
        {
          build_config: {
            app_id: 'not-taptap-app',
            developer_id: 'not-taptap-developer',
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const status = inspectMakerProjectInitialization(tempDir);
    const output = formatMakerProjectInitializationStatus(status);

    expect(status.status).toBe('missing_taptap_identity');
    expect(status.missingFields).toEqual(['app_id', 'developer_id']);
    expect(output).toContain('generate_test_qrcode');
  });

  test('project initialization status stays quiet after project identity exists', () => {
    fs.mkdirSync(path.join(tempDir, '.project'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.project', 'project.json'),
      JSON.stringify(
        {
          project_id: 'project-1',
          taptap_publish: {
            app_id: 'app-1',
            developer_id: 'developer-1',
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const status = inspectMakerProjectInitialization(tempDir);
    const output = formatMakerProjectInitializationStatus(status);

    expect(status.status).toBe('ready');
    expect(output).toBe('');
  });

  test('AI dev kit status checks latest version for new AI conversations', async () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# guide\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'examples'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'urhox-libs'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.maker'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, AI_DEV_KIT_VERSION_METADATA_FILE),
      JSON.stringify({
        env: 'production',
        version: '20260604-150856',
        source_url:
          'https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/20260604-150856/ai-dev-kit.zip',
        installed_at: '2026-06-04T16:00:00.000Z',
      }),
      'utf8'
    );
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        current: {
          version: '20260605-053736',
          md5: '6ced394e09fed25c2b946889e0171b36',
          size: 27048639,
          uploaded_at: '2026-06-05T05:37:52.000Z',
        },
        history: [],
      }),
    })) as jest.MockedFunction<typeof fetch>;

    try {
      const output = await formatAiDevKitStatus(tempDir);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://maker.taptap.cn/mcp/v1/ai-dev-kit/versions',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
      expect(output).toContain('- installed_version: 20260604-150856');
      expect(output).toContain('- latest_version: 20260605-053736');
      expect(output).toContain('- update_available: yes');
      expect(output).toContain('- next_step: 请运行 taptap-maker dev-kit update。');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('AI dev kit status can skip latest version check for frequent polling', async () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# guide\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'examples'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'urhox-libs'), { recursive: true });
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    try {
      const output = await formatAiDevKitStatus(tempDir, { skipVersionCheck: true });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(output).toContain('- version_check: skipped');
      expect(output).not.toContain('- latest_version:');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('initialization guidance is removed from MCP tools', () => {
    const statusTool = tools.find((item) => item.name === 'maker_status_lite');
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(statusTool?.description).toContain('bundled workflow guide document paths');
    expect(statusTool?.inputSchema.properties).toHaveProperty('target_dir');
    expect(statusTool?.description).toContain('AI dev kit status');
    expect(statusTool?.description).toContain('Python runtime readiness');
    expect(statusTool?.description).toContain('maker-lua-lsp readiness');
    expect(statusTool?.description).toContain('Compatibility status surface');
    expect(statusTool?.description).toContain('Maker Git Workflow Policy');
    expect(statusTool?.description).toContain('Maker Creative Asset Tool Policy');
    expect(statusTool?.description).toContain('prefer Maker MCP proxy tools');
    expect(statusTool?.description).not.toContain('If PAT is missing');
    expect(statusTool?.description).not.toContain('ask them to open');
    expect(statusTool?.description).not.toContain('让用户选择');
    expect(buildTool?.description).not.toContain('app list');
    expect(buildTool?.description).not.toContain('clone');
    expect(buildTool?.description).toContain('ignore generic local Git skills');
    expect(buildTool?.description).toContain('taptap-maker-local > Maker Git Workflow Policy');
    expect(buildTool?.description).toContain('Python environment section');
    expect(buildTool?.description).toContain('Lua LSP environment');
    expect(buildTool?.description).toContain('taptap-maker python setup');
    expect(buildTool?.description).toContain('best-effort installs maker-lua-lsp');
    expect(buildTool?.description).toContain('must not block the remote build flow');
  });

  test('build tool schema keeps remote build controls synchronous', () => {
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(buildTool?.inputSchema).toMatchObject({ additionalProperties: false });
    expect(buildTool?.inputSchema.properties).toHaveProperty('message');
    expect(buildTool?.inputSchema.properties).toHaveProperty('files');
    expect(buildTool?.inputSchema.properties).toHaveProperty('confirm_remote_build_without_submit');
    expect(buildTool?.inputSchema.properties).not.toHaveProperty('env');
    expect(buildTool?.inputSchema.properties).not.toHaveProperty('server_url');
    expect(JSON.stringify(buildTool?.inputSchema)).not.toMatch(/\brnd\b|TAPTAP_MCP_ENV/iu);
    expect(buildTool?.inputSchema.properties).not.toHaveProperty('async_build');
    expect(buildTool?.inputSchema.properties).not.toHaveProperty(
      'remember_build_submit_preference'
    );
    expect(buildTool?.inputSchema.properties).not.toHaveProperty(
      'submit_local_changes_before_build'
    );
  });

  test('build tool schema exposes maker-tools multiplayer fields', () => {
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');
    const properties = buildTool?.inputSchema.properties || {};
    const multiplayer = properties.multiplayer as {
      properties?: Record<string, { properties?: Record<string, unknown>; enum?: string[] }>;
    };
    const multiplayerProperties = multiplayer.properties || {};
    const matchInfo = multiplayerProperties.match_info;
    const persistentWorld = multiplayerProperties.persistent_world;

    expect(properties.entry_client.description).toContain('entry@client');
    expect(properties.entry_client.description).toContain('multiplayer.enabled=true');
    expect(properties.entry_server.description).toContain('entry@server');
    expect(properties.entry_server.description).toContain('multiplayer.enabled=true');
    expect(properties.multiplayer.description).toContain('Maker MCP sends { enabled: false }');
    expect(properties.multiplayer.description).toContain('First multiplayer build');
    expect(multiplayerProperties).toHaveProperty('enabled');
    expect(multiplayerProperties).toHaveProperty('max_players');
    expect(multiplayerProperties).not.toHaveProperty('mode');
    expect(multiplayerProperties).toHaveProperty('background_match');
    expect(multiplayerProperties).toHaveProperty('match_info');
    expect(multiplayerProperties).toHaveProperty('persistent_world');
    expect(multiplayerProperties.max_players).toMatchObject({ minimum: 2, maximum: 100 });
    expect(matchInfo?.properties?.desc_name).toMatchObject({
      enum: ['free_match', 'free_match_with_ai'],
    });
    expect(matchInfo?.properties).toHaveProperty('player_number');
    expect(matchInfo?.properties).toHaveProperty('immediately_start');
    expect(matchInfo?.properties).toHaveProperty('match_timeout');
    expect(persistentWorld?.properties).toHaveProperty('enabled');
  });

  test('runtime log pull is not exposed as a public MCP tool', () => {
    const toolNames = tools.map((item) => item.name);
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(toolNames).not.toContain('maker_pull_runtime_logs');
    expect(buildTool?.description).toContain('local runtime log watcher');
    expect(buildTool?.description).toContain('runtime_logs.local_file');
    expect(buildTool?.description).toContain('runtime_logs.state_file');
  });

  test('public Maker tool schemas do not expose JWT fallback parameters', () => {
    const statusTool = tools.find((item) => item.name === 'maker_status_lite');
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(Object.keys(statusTool?.inputSchema.properties || {})).toEqual([
      'target_dir',
      'skip_remote_sync',
    ]);
    for (const tool of [statusTool, buildTool]) {
      expect(tool?.inputSchema.properties).not.toHaveProperty('jwt');
      expect(tool?.inputSchema.properties).not.toHaveProperty('force_pat');
      expect(tool?.description).not.toMatch(/JWT|jwt|legacy/i);
    }
  });

  test('syncs local changes and then runs remote build from subdirectory', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const submittedCwds: string[] = [];
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: path.join(tempDir, 'scripts'),
      submitLocalChanges: async (options) => {
        submittedCwds.push(options.cwd);
        return {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        };
      },
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect('submitResult' in result ? result.submitResult?.commitHash : undefined).toBe('abc1234');
    expect(submittedCwds.map(normalizePath)).toEqual([gitProjectRoot()].map(normalizePath));
    expect(remoteBuildTargetDirs.map(normalizePath)).toEqual([gitProjectRoot()].map(normalizePath));
  });

  test('syncs local changes and runs remote build without build preference state', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'def5678',
        message: 'chore: update maker project',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.mode).toBe('remote_build');
    expect('submitResult' in result ? result.submitResult?.commitHash : undefined).toBe('def5678');
    expect(remoteBuildTargetDirs.map(normalizePath)).toEqual([gitProjectRoot()].map(normalizePath));
  });

  test('formats sync-before-build failure with actionable failure details', () => {
    const output = formatBuildResult(
      {
        mode: 'submit_failed_before_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        submitResult: {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: false,
          status: 'failed_after_commit',
          failure: {
            stage: 'push',
            classification: 'remote_rejected',
            retryable: false,
            exitCode: 1,
            stdout: '',
            stderr: 'rejected',
            message: 'failed to push some refs',
            nextAction: '先询问用户是否 pull/rebase 当前 Maker 远端变更，再重试 push。',
          },
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('failure:');
    expect(output).toContain('- stage: push');
    expect(output).toContain('- classification: remote_rejected');
    expect(output).toContain('rejected');
    expect(output).toContain('pull/rebase');
    expect(output).toContain('push_recovery:');
    expect(output).toContain('- committed_but_unpushed: yes');
    expect(output).toContain('- retry_tool: maker_build_current_directory');
    expect(output).toContain('- do_not_use_generic_git_push: yes');
  });

  test('formats successful remote build with Maker app preview URL', () => {
    const output = formatBuildResult(
      {
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'a161a4e5-a226-4133-908f-c28c228b7ea5',
        projectPath: 'a161a4e5-a226-4133-908f-c28c228b7ea5/workspace',
        serverUrl: 'https://maker.taptap.cn/mcp/v1',
        env: 'production',
        timeoutMs: 600000,
        buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
        resultText: 'build ok',
        runtimeLogWatch: {
          started: true,
          command: 'node maker.js logs watch --reset --interval 5s',
          runtimeLog: path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'),
          pid: 12345,
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain(
      '- maker_url: https://maker.taptap.cn/app/a161a4e5-a226-4133-908f-c28c228b7ea5?localDev=1'
    );
    expect(output).not.toContain('- server_url:');
    expect(output).not.toContain('- env:');
    expect(output).toContain('runtime_logs:');
    expect(output).toContain('- watch_started: yes');
    expect(output).toContain('- watch_pid: 12345');
    expect(output).toContain('taptap-maker logs watch');
    expect(output).toContain('--reset');
    expect(output).toContain('--interval 5s');
    expect(output).toContain(
      `- state_file: ${path.join(tempDir, '.maker', 'logs', 'runtime', 'state.json')}`
    );
    expect(output).toContain(
      '- next_action: 如需分析游戏运行结果或报错，请读取 runtime_logs.local_file；如需判断 watcher 是否正常，请读取 runtime_logs.state_file。'
    );
  });

  test('formats remote-only build without Maker page open guidance', () => {
    const output = formatBuildResult(
      {
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://maker.taptap.cn/mcp/v1',
        env: 'production',
        timeoutMs: 600000,
        buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
        resultText: 'build ok',
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('- maker_url: https://maker.taptap.cn/app/app-1?localDev=1');
    expect(output).not.toContain('maker_page_open');
    expect(output).not.toContain('maker_page_url');
    expect(output).not.toContain('自动弹出');
  });

  test('maker app preview URL keeps custom web URL path and appends localDev', () => {
    process.env.TAPTAP_MAKER_WEB_URL = 'https://maker.example.test/tenant/dev';

    const output = formatBuildResult(
      {
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://maker.example.test/tenant/dev/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
        resultText: 'build ok',
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain(
      '- maker_url: https://maker.example.test/tenant/dev/app/app-1?localDev=1'
    );
  });

  test('submit tool pushes and then runs remote build', async () => {
    const pushedCwds: string[] = [];
    const remoteBuildTargetDirs: string[] = [];

    const result = await pushThenBuildCurrentDirectory({
      targetDir: tempDir,
      pushLocalChanges: async (options) => {
        pushedCwds.push(options.cwd);
        return {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        };
      },
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        return {
          mode: 'remote_build',
          projectRoot: fs.realpathSync(tempDir),
          projectId: 'app-1',
          projectPath: 'app-1/workspace',
          serverUrl: 'https://maker.example.test/mcp',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: { scriptsPath: 'scripts', entry: 'main.lua' },
          resultText: 'build ok',
        };
      },
    });

    expect(result.submitResult.pushed).toBe(true);
    expect(result.buildResult?.mode).toBe('remote_build');
    expect(pushedCwds).toEqual([tempDir]);
    expect(remoteBuildTargetDirs).toEqual([tempDir]);
  });

  test('submit tool does not run remote build when push has no changes', async () => {
    const remoteBuildTargetDirs: string[] = [];

    const result = await pushThenBuildCurrentDirectory({
      targetDir: tempDir,
      pushLocalChanges: async () => ({
        branch: 'main',
        committed: false,
        pushed: false,
        status: 'clean',
      }),
      callRemoteBuild: async (targetDir) => {
        remoteBuildTargetDirs.push(targetDir);
        throw new Error('should not build clean submit');
      },
    });

    expect(result.submitResult.status).toBe('clean');
    expect(result.buildResult).toBeUndefined();
    expect(remoteBuildTargetDirs).toEqual([]);
  });

  test('submit tool preserves pushed result when remote build fails', async () => {
    const result = await pushThenBuildCurrentDirectory({
      targetDir: tempDir,
      pushLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'abc1234',
        message: 'chore: update maker project',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async () => {
        throw new Error('remote build failed');
      },
    });

    expect(result.submitResult.pushed).toBe(true);
    expect(result.submitResult.commitHash).toBe('abc1234');
    expect(result.buildResult).toBeUndefined();
    expect(result.buildFailure?.message).toBe('remote build failed');
  });

  test('push result only reports build finished when remote build result exists', () => {
    const output = formatPushResult(
      tempDir,
      {
        targetDir: tempDir,
        submitResult: {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('remote build result is missing');
    expect(output).toContain('internal contract error');
    expect(output).not.toContain('remote Maker build finished');
    expect(output).not.toContain('remote_build:');
  });

  test('formats push remote build block with Maker app preview URL', () => {
    const output = formatPushResult(
      tempDir,
      {
        targetDir: tempDir,
        submitResult: {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        },
        buildResult: {
          mode: 'remote_build',
          projectRoot: tempDir,
          projectId: 'app-rnd',
          projectPath: 'app-rnd/workspace',
          serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
          env: 'rnd',
          timeoutMs: 600000,
          buildArgs: {},
          resultText: 'build ok',
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('- maker_url: https://fuping.agnt.xd.com/app/app-rnd?localDev=1');
  });

  test('push failure output explains Maker retry path without generic git push', () => {
    const output = formatPushResult(
      tempDir,
      {
        targetDir: tempDir,
        submitResult: {
          branch: 'main',
          committed: true,
          commitHash: 'abc1234',
          message: 'chore: update maker project',
          pushed: false,
          status: 'failed_after_commit',
          ahead: '## main...origin/main [ahead 1]',
          failure: {
            stage: 'push',
            classification: 'remote_transient',
            retryable: true,
            retryReason: 'remote_http_5xx',
            exitCode: 128,
            stdout: '',
            stderr: '504 Gateway Timeout',
            message: '504 Gateway Timeout',
            nextAction: '远端 Maker git 服务临时不可用。',
          },
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('push_recovery:');
    expect(output).toContain('- committed_but_unpushed: yes');
    expect(output).toContain('- retry_tool: maker_build_current_directory');
    expect(output).toContain('- do_not_use_generic_git_push: yes');
    expect(output).toContain('504 Gateway Timeout');
  });

  test('sync-before-build preserves pushed result when remote build fails', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'def5678',
        message: 'chore: update maker project',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async () => {
        throw new Error('remote build failed');
      },
    });

    expect(result.mode).toBe('build_failed_after_submit');
    expect('submitResult' in result ? result.submitResult.commitHash : undefined).toBe('def5678');
    expect('buildFailure' in result ? result.buildFailure.message : undefined).toBe(
      'remote build failed'
    );
  });

  test('formats remote build server error diagnostic fields for client output', async () => {
    const output = formatBuildResult(
      {
        mode: 'build_failed_after_submit',
        projectRoot: tempDir,
        projectId: 'app-1',
        submitResult: {
          branch: 'main',
          committed: true,
          commitHash: 'def5678',
          message: 'chore: update maker project',
          pushed: true,
          status: 'pushed',
        },
        buildFailure: {
          name: 'McpError',
          message: 'MCP error -32603: Remote build failed',
          code: -32603,
          data: {
            remote_result: {
              error: 'BUILD FAILED: lua syntax error',
              token: 'secret-token',
            },
          },
        },
      },
      {
        elapsedMs: 1000,
        elapsed: '1s',
        progressEvents: 1,
      }
    );

    expect(output).toContain('error_details:');
    expect(output).toContain('BUILD FAILED: lua syntax error');
    expect(output).toContain('"token": "<redacted>"');
    expect(output).not.toContain('secret-token');
  });

  test('remote build refreshes Maker web preview after a build result is returned', async () => {
    const refreshedProjects: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'abc1234',
        message: 'chore: wake maker build server',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async () => ({
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: {},
        resultText: 'build ok',
      }),
      refreshPreview: async (buildResult) => {
        refreshedProjects.push(buildResult.projectId);
        return {
          ok: true,
          status: 200,
          url: 'https://fuping.agnt.xd.com/api/v1/apps/app-1/preview-refresh',
        };
      },
    });

    expect(refreshedProjects).toEqual(['app-1']);
    expect(result.mode).toBe('remote_build');
    expect('previewRefresh' in result ? result.previewRefresh?.ok : undefined).toBe(true);
  });

  test('default preview refresh uses PAT from the remote build environment', async () => {
    process.env.TAPTAP_MAKER_HOME = path.join(os.tmpdir(), `maker-home-${path.basename(tempDir)}`);
    process.env.TAPTAP_MCP_ENV = 'production';
    savePat({ token: 'prod-pat' });
    process.env.TAPTAP_MCP_ENV = 'rnd';
    savePat({ token: 'rnd-pat' });
    delete process.env.TAPTAP_MCP_ENV;
    const fetchMock = jest.fn(async () => new Response('ok', { status: 200 }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await refreshMakerPreview({
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: {},
        resultText: 'build ok',
      });

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://fuping.agnt.xd.com/api/v1/apps/app-1/preview-refresh',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer rnd-pat',
          }),
        })
      );
    } finally {
      global.fetch = originalFetch;
      fs.rmSync(process.env.TAPTAP_MAKER_HOME || '', { recursive: true, force: true });
    }
  });

  test('remote build starts local runtime log watcher after a successful build result', async () => {
    const startedProjects: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'abc1234',
        message: 'chore: wake maker build server',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async () => ({
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: {},
        resultText: 'build ok',
      }),
      refreshPreview: async () => ({
        ok: true,
        status: 200,
        url: 'https://fuping.agnt.xd.com/api/v1/apps/app-1/preview-refresh',
      }),
      startRuntimeLogWatch: async (buildResult) => {
        startedProjects.push(buildResult.projectId);
        return {
          started: true,
          command: 'node dist/maker.js logs watch --reset --interval 5s',
          runtimeLog: path.join(
            buildResult.projectRoot,
            '.maker',
            'logs',
            'runtime',
            'runtime.log'
          ),
          pid: 12345,
        };
      },
    });

    expect(startedProjects).toEqual(['app-1']);
    expect(result.mode).toBe('remote_build');
    expect('runtimeLogWatch' in result ? result.runtimeLogWatch?.started : undefined).toBe(true);
  });

  test('failed remote build text does not trigger preview refresh or runtime watcher', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const refreshedProjects: string[] = [];
    const startedProjects: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChanges: async () => ({
        branch: 'main',
        committed: true,
        commitHash: 'abc1234',
        message: 'chore: update maker project',
        pushed: true,
        status: 'pushed',
      }),
      callRemoteBuild: async () => ({
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: {},
        resultText: 'BUILD FAILED: lua syntax error',
      }),
      refreshPreview: async (buildResult) => {
        refreshedProjects.push(buildResult.projectId);
        return { ok: true, status: 200, url: 'preview-refresh' };
      },
      startRuntimeLogWatch: async (buildResult) => {
        startedProjects.push(buildResult.projectId);
        return { started: true, command: 'watch', runtimeLog: 'runtime.log' };
      },
    });

    expect(result.mode).toBe('build_failed_after_submit');
    expect('buildFailure' in result ? result.buildFailure.message : '').toContain('BUILD FAILED');
    expect(refreshedProjects).toEqual([]);
    expect(startedProjects).toEqual([]);
  });

  test('failed remote build text stays structured when no submit happened', async () => {
    const refreshedProjects: string[] = [];
    const startedProjects: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      confirmRemoteBuildWithoutSubmit: true,
      callRemoteBuild: async () => ({
        mode: 'remote_build',
        projectRoot: tempDir,
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        serverUrl: 'https://fuping.agnt.xd.com/mcp/v1',
        env: 'rnd',
        timeoutMs: 600000,
        buildArgs: {},
        resultText: 'BUILD FAILED: lua syntax error',
      }),
      refreshPreview: async (buildResult) => {
        refreshedProjects.push(buildResult.projectId);
        return { ok: true, status: 200, url: 'preview-refresh' };
      },
      startRuntimeLogWatch: async (buildResult) => {
        startedProjects.push(buildResult.projectId);
        return { started: true, command: 'watch', runtimeLog: 'runtime.log' };
      },
    });

    expect(result.mode).toBe('remote_build_failed');
    expect('buildFailure' in result ? result.buildFailure.message : '').toContain('BUILD FAILED');
    expect('buildResult' in result ? result.buildResult.projectId : undefined).toBe('app-1');
    expect(refreshedProjects).toEqual([]);
    expect(startedProjects).toEqual([]);
  });

  test('runtime log watcher startup stops an existing watcher from pid file first', () => {
    const pidFile = path.join(tempDir, '.maker', 'logs', 'runtime', 'watcher.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: 12345, command: 'node maker.js logs watch --target-dir game' }),
      'utf8'
    );
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const result = stopExistingRuntimeLogWatcher(pidFile, {
        getProcessCommand: () => 'node maker.js logs watch --target-dir game',
        waitForExit: () => true,
      });

      expect(result).toEqual({ previousPid: 12345, previousStopped: true });
      expect(killSpy).toHaveBeenNthCalledWith(1, 12345, 0);
      expect(killSpy).toHaveBeenNthCalledWith(2, 12345, 'SIGTERM');
    } finally {
      killSpy.mockRestore();
    }
  });

  test('runtime log watcher startup does not kill a reused pid with a mismatched command', () => {
    const pidFile = path.join(tempDir, '.maker', 'logs', 'runtime', 'watcher.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: 12345, command: 'node maker.js logs watch --target-dir game' }),
      'utf8'
    );
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const result = stopExistingRuntimeLogWatcher(pidFile, {
        getProcessCommand: () => '/Applications/Editor.app/Contents/MacOS/editor',
      });

      expect(result.previousPid).toBe(12345);
      expect(result.previousStopped).toBe(false);
      expect(result.previousStopError).toContain('does not look like a Maker log watcher');
      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(12345, 0);
    } finally {
      killSpy.mockRestore();
    }
  });

  test('runtime log watcher startup does not kill unrelated logs watch processes', () => {
    const pidFile = path.join(tempDir, '.maker', 'logs', 'runtime', 'watcher.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: 12345, command: 'node maker.js logs watch --target-dir game' }),
      'utf8'
    );
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const result = stopExistingRuntimeLogWatcher(pidFile, {
        getProcessCommand: () => 'tail -f /var/logs/game/watch',
      });

      expect(result.previousPid).toBe(12345);
      expect(result.previousStopped).toBe(false);
      expect(result.previousStopError).toContain('does not look like a Maker log watcher');
      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(12345, 0);
    } finally {
      killSpy.mockRestore();
    }
  });

  test('runtime log watcher startup can verify ownership from pid file command when process command is unavailable', () => {
    const pidFile = path.join(tempDir, '.maker', 'logs', 'runtime', 'watcher.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: 12345, command: 'node maker.js logs watch --target-dir game' }),
      'utf8'
    );
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const result = stopExistingRuntimeLogWatcher(pidFile, {
        getProcessCommand: () => undefined,
        waitForExit: () => true,
      });

      expect(result).toEqual({ previousPid: 12345, previousStopped: true });
      expect(killSpy).toHaveBeenNthCalledWith(1, 12345, 0);
      expect(killSpy).toHaveBeenNthCalledWith(2, 12345, 'SIGTERM');
    } finally {
      killSpy.mockRestore();
    }
  });

  test('runtime log watcher startup refuses legacy pid files when process command is unavailable', () => {
    const pidFile = path.join(tempDir, '.maker', 'logs', 'runtime', 'watcher.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, '12345\n', 'utf8');
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const result = stopExistingRuntimeLogWatcher(pidFile, {
        getProcessCommand: () => undefined,
      });

      expect(result.previousPid).toBe(12345);
      expect(result.previousStopped).toBe(false);
      expect(result.previousStopError).toContain('could not be verified');
      expect(killSpy).toHaveBeenCalledTimes(1);
    } finally {
      killSpy.mockRestore();
    }
  });

  test('runtime log remote client reuses one MCP connection across polls', async () => {
    const connect = jest.fn(async () => undefined);
    const callTool = jest.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            logs: [],
            nextStartTime: 1710000001,
            serverTime: 1710000001,
            hasMore: false,
          }),
        },
      ],
    }));
    const close = jest.fn(async () => undefined);
    const createClient = jest.fn(() => ({ connect, callTool, close }));
    const createTransport = jest.fn(() => ({}) as never);

    const runtimeLogClient = createRemoteRuntimeLogClient(
      {
        projectRoot: tempDir,
        serverUrl: 'https://maker.example.test/mcp',
        env: 'rnd',
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        userId: 'user-1',
        proxyConfigJson: '{}',
        command: 'node',
        args: ['proxy.js'],
        envVars: {},
      },
      60000,
      { createClient, createTransport }
    );

    try {
      await runtimeLogClient.call({ sinceSeconds: 0 });
      await runtimeLogClient.call({ startTime: 1710000001 });
    } finally {
      await runtimeLogClient.close();
    }

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('runtime log remote client defaults to long mcp tool timeout', async () => {
    const connect = jest.fn(async () => undefined);
    const callTool = jest.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            logs: [],
            nextStartTime: 1710000001,
            serverTime: 1710000001,
            hasMore: false,
          }),
        },
      ],
    }));
    const close = jest.fn(async () => undefined);
    const createClient = jest.fn(() => ({ connect, callTool, close }));
    const createTransport = jest.fn(() => ({}) as never);

    const runtimeLogClient = createRemoteRuntimeLogClient(
      {
        projectRoot: tempDir,
        serverUrl: 'https://maker.example.test/mcp',
        env: 'rnd',
        projectId: 'app-1',
        projectPath: 'app-1/workspace',
        userId: 'user-1',
        proxyConfigJson: '{}',
        command: 'node',
        args: ['proxy.js'],
        envVars: {},
      },
      undefined,
      { createClient, createTransport }
    );

    try {
      await runtimeLogClient.call({ sinceSeconds: 0 });
    } finally {
      await runtimeLogClient.close();
    }

    expect(callTool).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      expect.objectContaining({ timeout: 60 * 60 * 1000 })
    );
  });

  function runGit(args: string[], cwd = tempDir): void {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
  }

  function readGit(args: string[], cwd = tempDir): string {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }

  function prepareMakerRemote(preReceiveHook?: string): string {
    const branch = readGit(['branch', '--show-current']).trim() || 'main';
    const gitBase = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-test-git-base-'));
    const remoteDir = path.join(gitBase, 'app-1.git');
    const initRemote = spawnSync('git', ['init', '--bare', remoteDir], {
      encoding: 'utf8',
    });
    if (initRemote.status !== 0) {
      throw new Error(`git init --bare failed: ${initRemote.stderr || initRemote.stdout}`);
    }
    if (preReceiveHook) {
      const hookPath = path.join(remoteDir, 'hooks', 'pre-receive');
      fs.writeFileSync(hookPath, `${preReceiveHook}\n`, 'utf8');
      fs.chmodSync(hookPath, 0o755);
    }
    process.env.TAPTAP_MAKER_GIT_BASE = gitBase;
    process.env.PAT = 'tmpct_test_pat';
    runGit(['remote', 'add', 'origin', remoteDir]);
    runGit(['push', '-u', 'origin', branch]);
    const setHead = spawnSync(
      'git',
      ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`],
      {
        encoding: 'utf8',
      }
    );
    if (setHead.status !== 0) {
      throw new Error(`git symbolic-ref HEAD failed: ${setHead.stderr || setHead.stdout}`);
    }
    return branch;
  }

  function cloneRemoteWorktree(): string {
    const remoteUrl = readGit(['remote', 'get-url', 'origin']).trim();
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-test-remote-worktree-'));
    const clone = spawnSync('git', ['clone', remoteUrl, worktree], {
      encoding: 'utf8',
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
    }
    runGit(['config', 'user.email', 'maker-remote@example.test'], worktree);
    runGit(['config', 'user.name', 'maker-remote'], worktree);
    return worktree;
  }

  function writeRemoteScript(worktree: string): void {
    fs.mkdirSync(path.join(worktree, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(worktree, 'scripts', 'remote.lua'), '-- remote\n', 'utf8');
  }

  function gitProjectRoot(): string {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: tempDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(`git rev-parse failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout.trim();
  }

  function normalizePath(value: string): string {
    return fs.realpathSync.native(value);
  }

  function proxyTextResult(value: unknown): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(value, null, 2),
        },
      ],
    };
  }

  function fakeAssetFetch(body: string): typeof fetch {
    return (async () => new Response(body, { status: 200 })) as typeof fetch;
  }

  function dataUrl(mime: string, body: string): string {
    return `data:${mime};base64,${Buffer.from(body).toString('base64')}`;
  }

  function emptyProgressSummary(): {
    elapsedMs: number;
    elapsed: string;
    progressEvents: number;
  } {
    return {
      elapsedMs: 0,
      elapsed: '0s',
      progressEvents: 0,
    };
  }

  async function createZipBuffer(files: Record<string, string>): Promise<Buffer> {
    const archive = archiver('zip');
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    for (const [name, content] of Object.entries(files)) {
      archive.append(content, { name });
    }
    await archive.finalize();
    return Buffer.concat(chunks);
  }
});
