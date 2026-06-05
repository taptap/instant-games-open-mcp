/**
 * Maker build local-change guard tests.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCurrentDirectory,
  createBuildArgs,
  listMakerTools,
  MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
  materializeRemoteProxyToolAssets,
  prepareRemoteProxyToolArgs,
  createRemoteProxyContext,
  createRemoteRuntimeLogClient,
  refreshMakerPreview,
  formatBuildResult,
  formatAiDevKitStatus,
  formatClonePartialStateLines,
  formatMakerProxyToolsStatusSafely,
  formatMakerRemoteSyncStatusSafely,
  formatPushResult,
  pushThenBuildCurrentDirectory,
  resources,
  retryMakerProxyOperation,
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

describe('maker build local-change guard', () => {
  let tempDir: string;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalGitBase = process.env.TAPTAP_MAKER_GIT_BASE;
  const originalPat = process.env.PAT;
  const originalEnv = process.env.TAPTAP_MCP_ENV;

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

  test('build request runs remote build directly when project has no local changes', async () => {
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
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
    expect(remoteBuildTargetDirs).toEqual([tempDir]);
  });

  test('build request builds committed remote version when user confirms no submit', async () => {
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

  test('build tool description owns commit, push, and build', () => {
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(buildTool?.description).toContain('commits when needed, pushes');
    expect(buildTool?.description).toContain('remote Maker build');
    expect(buildTool?.description).toContain('If push fails, build is not started');
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
          name: 'text_to_music',
          description: 'Generate music from text',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
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
      'text_to_music',
    ]);
    expect(MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES).toEqual([
      'generate_image',
      'batch_generate_images',
      'edit_image',
      'create_video_task',
      'text_to_music',
    ]);
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
      '- missing_tools: generate_image, batch_generate_images, edit_image, create_video_task, text_to_music'
    );
    expect(output).toContain('- build_available: no');
    expect(output).toContain('- failure_message: connect ECONNREFUSED remote maker proxy');
    expect(output).toContain('远端 proxy tools 和 build 构建都不可用');
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

  test('normalizes edit image bare file names to Maker image asset paths without cdn mapping', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/manual_plane.png'), 'image-bytes', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'edit_image',
      targetDir: tempDir,
      args: {
        image: 'manual_plane.png',
        prompt: 'make it cartoon',
        name: 'manual_plane_cartoon',
        target_size: '64x64',
      },
    });

    expect(args.image).toBe('assets/image/manual_plane.png');
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

  test('normalizes generate image reference image names to Maker asset paths', () => {
    fs.mkdirSync(path.join(tempDir, 'assets/image'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'assets/image/manual_ref.png'), 'image-bytes', 'utf8');

    const args = prepareRemoteProxyToolArgs({
      toolName: 'generate_image',
      targetDir: tempDir,
      args: {
        prompt: 'make a cartoon version',
        reference_images: ['manual_ref.png'],
      },
    });

    expect(args.reference_images).toEqual(['assets/image/manual_ref.png']);
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
  });

  test('build tool schema exposes sync inputs without build preference parameter', () => {
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(buildTool?.inputSchema.properties).toHaveProperty('message');
    expect(buildTool?.inputSchema.properties).toHaveProperty('files');
    expect(buildTool?.inputSchema.properties).toHaveProperty('confirm_remote_build_without_submit');
    expect(buildTool?.inputSchema.properties).not.toHaveProperty(
      'remember_build_submit_preference'
    );
    expect(buildTool?.inputSchema.properties).not.toHaveProperty(
      'submit_local_changes_before_build'
    );
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
      '- maker_url: https://maker.taptap.cn/app/a161a4e5-a226-4133-908f-c28c228b7ea5'
    );
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

    expect(output).toContain('- maker_url: https://fuping.agnt.xd.com/app/app-rnd');
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

  test('remote build refreshes Maker web preview after a build result is returned', async () => {
    const refreshedProjects: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
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
});
