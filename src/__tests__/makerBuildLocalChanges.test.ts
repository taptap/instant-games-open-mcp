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
  formatBuildResult,
  formatClonePartialStateLines,
  formatPushResult,
  pushThenBuildCurrentDirectory,
  tools,
} from '../maker/server/mcp';
import {
  inspectMakerDirectoryGitStatus,
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

  test('auto-submit build pushes committed but unpushed changes before remote build', async () => {
    const submittedCwds: string[] = [];
    const remoteBuildTargetDirs: string[] = [];
    prepareMakerRemote();
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- committed only\n', 'utf8');
    runGit(['add', 'scripts/main.lua']);
    runGit(['commit', '-m', 'chore: committed only']);

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChangesBeforeBuild: true,
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

  test('blocks build before connecting to remote when local changes are not submitted', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    await expect(buildCurrentDirectory({ targetDir: tempDir })).rejects.toThrow(
      '提交本地改动并触发构建（以后都是如此）'
    );
  });

  test('checks local changes from a Maker project subdirectory', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');

    await expect(
      buildCurrentDirectory({ targetDir: path.join(tempDir, 'scripts') })
    ).rejects.toThrow('Current Maker project has local changes that are not submitted');
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

  test('submit tool description requires commit, push, and build', () => {
    const submitTool = tools.find((item) => item.name === 'maker_submit_current_directory');

    expect(submitTool?.description).toContain('commit + push + build');
    expect(submitTool?.description).toContain('remote Maker build');
    expect(submitTool?.description).not.toContain('maker_push_current_directory');
    expect(submitTool?.description).not.toContain('Commit and push current Maker project');
    expect(submitTool?.description).not.toContain('不负责构建');
    expect(submitTool?.description).not.toContain('Do not use this tool');
    expect(submitTool?.description).not.toContain('automatically triggers build');
    expect(submitTool?.description).not.toContain('Maker auto build');
  });

  test('exposes only the compact Maker tool set', () => {
    const toolNames = tools.map((item) => item.name);

    expect(toolNames).toEqual([
      'maker_exchange_pat',
      'maker_list_apps',
      'maker_status',
      'maker_clone_to_current_directory',
      'maker_submit_current_directory',
      'maker_build_current_directory',
    ]);
    expect(toolNames).not.toContain('maker_exchange_jwt');
    expect(toolNames).not.toContain('maker_tap_login_start');
    expect(toolNames).not.toContain('maker_tap_login_complete');
    expect(toolNames).not.toContain('maker_push_current_directory');
    expect(toolNames).not.toContain('maker_get_mcp_update_guide');
    expect(toolNames).not.toContain('maker_check_environment');
    expect(toolNames).not.toContain('maker_setup_guide');
    expect(toolNames).not.toContain('maker_configure_remote_proxy');
  });

  test('initialization guidance is delegated to bundled skill', () => {
    const listTool = tools.find((item) => item.name === 'maker_list_apps');
    const statusTool = tools.find((item) => item.name === 'maker_status');
    const cloneTool = tools.find((item) => item.name === 'maker_clone_to_current_directory');

    expect(listTool?.description).toContain('unbound Maker directory initialization');
    expect(listTool?.description).toContain('treat this list as reference only');
    expect(listTool?.description).toContain('do not ask which app to clone');
    expect(statusTool?.description).toContain('bundled skill document paths');
    expect(statusTool?.description).toContain('target_dir');
    expect(statusTool?.description).toContain('AI dev kit status');
    expect(statusTool?.description).toContain('current directory is unbound');
    expect(statusTool?.description).not.toContain('If PAT is missing');
    expect(statusTool?.description).not.toContain('ask them to open');
    expect(statusTool?.description).not.toContain('让用户选择');
    expect(cloneTool?.description).toContain('Requires Git and a concrete app_id');
    expect(cloneTool?.description).toContain('prepares the local AI dev kit automatically');
    expect(cloneTool?.description).not.toContain('Call this only after');
    expect(cloneTool?.description).not.toContain('ask them to choose');
  });

  test('submit tool schema does not expose build preference parameter', () => {
    const submitTool = tools.find((item) => item.name === 'maker_submit_current_directory');
    const buildTool = tools.find((item) => item.name === 'maker_build_current_directory');

    expect(Object.keys(submitTool?.inputSchema.properties || {})).toEqual([
      'message',
      'target_dir',
      'files',
    ]);
    expect(submitTool?.inputSchema.properties).not.toHaveProperty(
      'remember_build_submit_preference'
    );
    expect(buildTool?.inputSchema.properties).toHaveProperty('remember_build_submit_preference');
  });

  test('public Maker tool schemas do not expose JWT fallback parameters', () => {
    const listTool = tools.find((item) => item.name === 'maker_list_apps');
    const statusTool = tools.find((item) => item.name === 'maker_status');
    const cloneTool = tools.find((item) => item.name === 'maker_clone_to_current_directory');
    const submitTool = tools.find((item) => item.name === 'maker_submit_current_directory');

    expect(Object.keys(listTool?.inputSchema.properties || {})).toEqual(['pat']);
    expect(Object.keys(statusTool?.inputSchema.properties || {})).toEqual(['target_dir']);
    expect(Object.keys(cloneTool?.inputSchema.properties || {})).toEqual([
      'app_id',
      'target_dir',
      'pat',
      'user_id',
    ]);
    for (const tool of [listTool, cloneTool, submitTool]) {
      expect(tool?.inputSchema.properties).not.toHaveProperty('jwt');
      expect(tool?.inputSchema.properties).not.toHaveProperty('force_pat');
      expect(tool?.description).not.toMatch(/JWT|jwt|legacy/i);
    }
  });

  test('auto submits local changes and then runs remote build when project preference is saved', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
      build_local_changes_policy: 'auto_submit',
    });
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

  test('submits, remembers preference, and runs remote build after user confirms build prompt', async () => {
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- changed\n', 'utf8');
    const remoteBuildTargetDirs: string[] = [];

    const result = await buildCurrentDirectory({
      targetDir: tempDir,
      submitLocalChangesBeforeBuild: true,
      rememberBuildSubmitPreference: true,
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

    const config = JSON.parse(
      fs.readFileSync(path.join(tempDir, '.maker-mcp', 'config.json'), 'utf8')
    );
    expect(config.build_local_changes_policy).toBe('auto_submit');
  });

  test('formats auto-submit build failure with actionable failure details', () => {
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
    expect(output).toContain('- retry_tool: maker_submit_current_directory');
    expect(output).toContain('- do_not_use_generic_git_push: yes');
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
    expect(output).toContain('- retry_tool: maker_submit_current_directory');
    expect(output).toContain('- retry_build_tool: maker_build_current_directory');
    expect(output).toContain('- do_not_use_generic_git_push: yes');
    expect(output).toContain('504 Gateway Timeout');
  });

  test('auto-submit build preserves pushed result when remote build fails', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'app-1',
      user_id: 'user-1',
      build_local_changes_policy: 'auto_submit',
    });
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

  function runGit(args: string[]): void {
    const result = spawnSync('git', args, {
      cwd: tempDir,
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

  function prepareMakerRemote(): string {
    const branch = readGit(['branch', '--show-current']).trim() || 'main';
    const gitBase = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-test-git-base-'));
    const remoteDir = path.join(gitBase, 'app-1.git');
    const initRemote = spawnSync('git', ['init', '--bare', remoteDir], {
      encoding: 'utf8',
    });
    if (initRemote.status !== 0) {
      throw new Error(`git init --bare failed: ${initRemote.stderr || initRemote.stdout}`);
    }
    process.env.TAPTAP_MAKER_GIT_BASE = gitBase;
    process.env.PAT = 'tmpct_test_pat';
    runGit(['remote', 'add', 'origin', remoteDir]);
    runGit(['push', '-u', 'origin', branch]);
    return branch;
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
