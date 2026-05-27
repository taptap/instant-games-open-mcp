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
  createRemoteRuntimeLogClient,
  formatBuildResult,
  formatClonePartialStateLines,
  formatMakerRemoteSyncStatusSafely,
  formatPushResult,
  pushThenBuildCurrentDirectory,
  resources,
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
import { saveProjectConfig } from '../maker/storage';

describe('maker build local-change guard', () => {
  let tempDir: string;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalGitBase = process.env.TAPTAP_MAKER_GIT_BASE;
  const originalPat = process.env.PAT;

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
    fs.writeFileSync(path.join(remoteWorktree, 'scripts', 'remote.lua'), '-- remote\n', 'utf8');
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
    fs.writeFileSync(path.join(remoteWorktree, 'scripts', 'remote.lua'), '-- remote\n', 'utf8');
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
    expect(
      getMakerRemoteSyncFailureNextAction({
        classification: 'auth',
        retryable: false,
        nextAction: '运行 `taptap-maker pat set` 并粘贴新的 Maker PAT。',
      })
    ).toContain('taptap-maker pat set');
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
    prepareMakerRemote(
      [
        '#!/bin/sh',
        'while read old new ref; do',
        '  if [ "$ref" != "refs/heads/main" ]; then',
        '    echo "[pre-receive] only refs/heads/main is accepted; got $ref" >&2',
        '    echo "status 503 branch guard response" >&2',
        '    exit 1',
        '  fi',
        'done',
        'exit 0',
      ].join('\n')
    );
    runGit(['switch', '-c', 'selftest/non-main-guard']);
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- branch guard\n', 'utf8');

    const result = await pushMakerProject({ cwd: tempDir });

    expect(result.status).toBe('failed_after_commit');
    expect(result.failure?.classification).toBe('branch_not_allowed');
    expect(result.failure?.retryable).toBe(false);
    expect(result.failure?.stderr).toContain('only refs/heads/main is accepted');
    expect(result.failure?.nextAction).toContain('切回 main');
    expect(result.failure?.nextAction).toContain('cherry-pick');
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

  test('ignores dev-kit .gitignore changes for build local-change guard', async () => {
    fs.appendFileSync(path.join(tempDir, '.gitignore'), '\n# local dev kit\nCLAUDE.md\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(false);
    expect(changes.files).toEqual([]);
  });

  test('omits .gitignore from build local-change prompts when game files changed', async () => {
    fs.appendFileSync(path.join(tempDir, '.gitignore'), '\n# local dev kit\nCLAUDE.md\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    const changes = await readMakerProjectLocalChanges(tempDir);

    expect(changes.hasChanges).toBe(true);
    expect(changes.files).toEqual(['scripts/main.lua']);
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

    expect(toolNames).toEqual([
      'maker_status_lite',
      'maker_build_current_directory',
      'maker_pull_runtime_logs',
    ]);
    expect(resources.map((item) => item.uri)).toEqual(['maker://status']);
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

  test('initialization guidance is removed from MCP tools', () => {
    const statusTool = tools.find((item) => item.name === 'maker_status_lite');
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(statusTool?.description).toContain('bundled workflow skill document paths');
    expect(statusTool?.inputSchema.properties).toHaveProperty('target_dir');
    expect(statusTool?.description).toContain('AI dev kit status');
    expect(statusTool?.description).toContain('Compatibility fallback');
    expect(statusTool?.description).not.toContain('If PAT is missing');
    expect(statusTool?.description).not.toContain('ask them to open');
    expect(statusTool?.description).not.toContain('让用户选择');
    expect(buildTool?.description).not.toContain('app list');
    expect(buildTool?.description).not.toContain('clone');
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

  test('runtime log pull tool keeps MCP surface to a fixed one-shot business flow', () => {
    const logTool = tools.find((item) => item.name === 'maker_pull_runtime_logs');

    expect(logTool?.description).toContain('one-shot');
    expect(logTool?.description).toContain('does not start a watcher');
    expect(logTool?.description).toContain('user_script/server_user_script');
    expect(logTool?.description).toContain('runtime.log');
    expect(logTool?.inputSchema.properties).toHaveProperty('since_seconds');
    expect(logTool?.inputSchema.properties).toHaveProperty('start_time');
    expect(logTool?.inputSchema.properties).not.toHaveProperty('topics');
    expect(logTool?.inputSchema.properties).not.toHaveProperty('watch');
    expect(logTool?.inputSchema.properties).not.toHaveProperty('interval_seconds');
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
});
