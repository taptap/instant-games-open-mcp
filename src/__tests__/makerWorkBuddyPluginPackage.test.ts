/**
 * WorkBuddy plugin packaging contract for the standalone Maker distribution.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '../..');
const versionPolicy = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
) as { latest: string };
const makerVersion = versionPolicy.latest;
const pluginVersionPolicy = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'config', 'maker-plugin-version.json'), 'utf8')
) as { version: string };
const pluginVersion = pluginVersionPolicy.version;
const pluginSourceUrl =
  'https://github.com/taptap/instant-games-open-mcp/tree/main/plugins/workbuddy/taptap-maker';
const pluginDescription = 'TapTap Maker 本地游戏开发插件，内置 MCP、CLI、开发技能和项目工作流。';
const pluginDescriptionEn =
  'Local TapTap Maker game development with bundled MCP, CLI, and workflows.';

describe('TapTap Maker WorkBuddy plugin package', () => {
  let tempDir: string;
  let pluginRoot: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-workbuddy-plugin-package-'));
    pluginRoot = path.join(tempDir, 'taptap-maker');
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-maker-workbuddy-plugin.js', '--output-dir', pluginRoot],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );
    if (result.status !== 0) {
      throw new Error(`Plugin preparation failed:\n${result.stdout}\n${result.stderr}`);
    }
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses the independent plugin version and shared CodeBuddy manifest format', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, '.codebuddy-plugin', 'plugin.json'), 'utf8')
    );

    expect(manifest).toEqual(
      expect.objectContaining({
        name: 'taptap-maker',
        version: pluginVersion,
        description: pluginDescription,
        description_en: pluginDescriptionEn,
        homepage: pluginSourceUrl,
        repository: pluginSourceUrl,
        skills: [
          './skills/taptap-maker-local',
          './skills/taptap-maker-dev-kit-guide',
          './skills/taptap-maker-plugin-lifecycle',
          './skills/update-taptap-mcp',
        ],
        commands: ['./commands/create-project.md', './commands/sync-project.md'],
        mcpServers: './.mcp.json',
        hooks: './hooks/hooks.json',
        author: { name: 'TapTap Team' },
      })
    );
    expect(manifest).not.toHaveProperty('interface');
  });

  test('writes generated JSON in the repository format', () => {
    for (const relativePath of ['.codebuddy-plugin/plugin.json', '.mcp.json']) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(projectRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
          '--check',
          relativePath,
        ],
        { cwd: pluginRoot, encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
    }
  });

  test('launches the bundled runtime through WorkBuddy-provided Node', () => {
    const mcpText = fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8');
    const mcp = JSON.parse(mcpText);

    expect(mcp.mcpServers['taptap-maker-plugin']).toEqual({
      command: '${CODEBUDDY_PLUGIN_ROOT}/bin/run-node',
      args: ['${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js'],
      env: {
        TAPTAP_MAKER_DISTRIBUTION: 'workbuddy_plugin',
        TAPTAP_MCP_CLIENT_IDE: 'workbuddy',
      },
    });
    expect(mcpText).not.toMatch(/\b(?:npm|npx)\b/i);
    expect(mcp.mcpServers['taptap-maker-plugin']).not.toHaveProperty('cwd');
  });

  test('contains the runtime, cross-platform CLI, skills, commands, icon, and docs', () => {
    const requiredPaths = [
      'icon.png',
      'icon.svg',
      'dist/maker.js',
      'bin/run-node',
      'bin/run-node.cmd',
      'bin/taptap-maker',
      'bin/taptap-maker.cmd',
      'hooks/hooks.json',
      'hooks/session-start.cjs',
      'commands/create-project.md',
      'commands/sync-project.md',
      'skills/taptap-maker-local/SKILL.md',
      'skills/taptap-maker-dev-kit-guide/SKILL.md',
      'skills/taptap-maker-plugin-lifecycle/SKILL.md',
      'skills/update-taptap-mcp/SKILL.md',
      'assets/taptap-maker.png',
      'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md',
      'README.md',
      'SKILL.md',
    ];

    for (const relativePath of requiredPaths) {
      expect(fs.existsSync(path.join(pluginRoot, relativePath))).toBe(true);
    }
    expect(fs.readFileSync(path.join(pluginRoot, 'dist', 'maker.js'), 'utf8')).toContain(
      `// TapTap Maker MCP version: ${makerVersion}`
    );
    expect(fs.readFileSync(path.join(pluginRoot, 'dist', 'maker.js'), 'utf8')).not.toMatch(
      /[\t ]+$/mu
    );
    expect(fs.readFileSync(path.join(pluginRoot, 'icon.png'))).toEqual(
      fs.readFileSync(path.join(pluginRoot, 'assets', 'taptap-maker.png'))
    );
    expect(fs.readFileSync(path.join(pluginRoot, 'icon.svg'), 'utf8')).toContain(
      'href="assets/taptap-maker.png"'
    );
    const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
    expect(readme).toContain('.workbuddy/skills/taptap-maker-*');
    expect(readme).toContain('只补齐缺失项，不覆盖已有同名 Skill');
    const rootSkill = fs.readFileSync(path.join(pluginRoot, 'SKILL.md'), 'utf8');
    expect(rootSkill).toContain('name: taptap-maker');
    expect(rootSkill).toContain(`插件版本：\`${pluginVersion}\``);
    expect(rootSkill).toContain(`内置 Maker MCP 版本：\`${makerVersion}\``);
  });

  test('uses Chinese display descriptions for commands and skills', () => {
    const expectedDescriptions = new Map([
      ['commands/create-project.md', '在当前空工作区中创建新的 TapTap Maker 项目'],
      ['commands/sync-project.md', '将已有的 TapTap Maker 游戏同步到当前空工作区继续开发'],
      [
        'skills/taptap-maker-local/SKILL.md',
        '指导 TapTap Maker 本地开发流程，包括初始化、同步项目、状态检查、提交构建和故障诊断。',
      ],
      [
        'skills/taptap-maker-dev-kit-guide/SKILL.md',
        '介绍 Maker 项目随附的 AI 开发套件，包括开发指南、示例、模板和引擎参考资料。',
      ],
      [
        'skills/taptap-maker-plugin-lifecycle/SKILL.md',
        '管理 WorkBuddy 中 TapTap Maker 插件的首次使用、旧 MCP 迁移、项目初始化、更新和卸载流程。',
      ],
      [
        'skills/update-taptap-mcp/SKILL.md',
        '当用户需要更新或升级 WorkBuddy 插件内置的 TapTap Maker 时使用。',
      ],
    ]);

    for (const [relativePath, description] of expectedDescriptions) {
      const content = fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
      expect(content).toContain(`description: ${description}`);
    }
  });

  test('prompts for confirmation when a standalone WorkBuddy Maker MCP is active', () => {
    const workBuddyHome = path.join(tempDir, 'hook-active-home');
    const configPath = path.join(workBuddyHome, '.workbuddy', '.mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `${JSON.stringify({ mcpServers: { 'taptap-maker': { command: 'npx' } } }, null, 2)}\n`,
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [path.join(pluginRoot, 'hooks', 'session-start.cjs')],
      {
        cwd: pluginRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: workBuddyHome,
          USERPROFILE: workBuddyHome,
          CODEBUDDY_PLUGIN_ROOT: pluginRoot,
        },
      }
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.additionalContext).toContain('旧的独立 Maker MCP');
    expect(output.hookSpecificOutput.additionalContext).toContain('明确确认');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'plugin migrate --client workbuddy'
    );
  });

  test('keeps the session hook silent when standalone Maker registrations are disabled', () => {
    const workBuddyHome = path.join(tempDir, 'hook-disabled-home');
    const configPath = path.join(workBuddyHome, '.workbuddy', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(
        { mcpServers: { 'taptap-maker': { command: 'node', disabled: true } } },
        null,
        2
      )}\n`,
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [path.join(pluginRoot, 'hooks', 'session-start.cjs')],
      {
        cwd: pluginRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: workBuddyHome,
          USERPROFILE: workBuddyHome,
          CODEBUDDY_PLUGIN_ROOT: pluginRoot,
        },
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ hookSpecificOutput: {} });
  });

  test('resolves WorkBuddy managed Node without relying on Node in PATH', () => {
    if (process.platform === 'win32') {
      return;
    }

    const workBuddyHome = path.join(tempDir, 'workbuddy-home');
    const managedBin = path.join(workBuddyHome, 'binaries', 'node', 'versions', '22.22.2', 'bin');
    const fakeNode = path.join(managedBin, 'node');
    fs.mkdirSync(managedBin, { recursive: true });
    fs.writeFileSync(fakeNode, '#!/bin/sh\nprintf "managed-node:%s\\n" "$*"\n', 'utf8');
    fs.chmodSync(fakeNode, 0o755);

    const result = spawnSync(path.join(pluginRoot, 'bin', 'run-node'), ['maker.js', '--version'], {
      cwd: pluginRoot,
      encoding: 'utf8',
      env: {
        HOME: path.join(tempDir, 'empty-home'),
        PATH: '/usr/bin:/bin',
        WORKBUDDY_CONFIG_DIR: workBuddyHome,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('managed-node:maker.js --version');
  });

  test('marks every bundled launcher invocation as the WorkBuddy plugin distribution', () => {
    if (process.platform === 'win32') {
      return;
    }

    const fakeBin = path.join(tempDir, 'distribution-node-bin');
    const fakeNode = path.join(fakeBin, 'node');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      fakeNode,
      '#!/bin/sh\nprintf "%s:%s\\n" "$TAPTAP_MAKER_DISTRIBUTION" "$TAPTAP_MCP_CLIENT_IDE"\n',
      'utf8'
    );
    fs.chmodSync(fakeNode, 0o755);

    const result = spawnSync(path.join(pluginRoot, 'bin', 'run-node'), ['maker.js'], {
      cwd: pluginRoot,
      encoding: 'utf8',
      env: {
        HOME: path.join(tempDir, 'distribution-empty-home'),
        PATH: '/usr/bin:/bin',
        WORKBUDDY_EXTRA_PATHS: fakeBin,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('workbuddy_plugin:workbuddy');
  });

  test('selects the newest managed Node without GNU version sort', () => {
    if (process.platform === 'win32') {
      return;
    }

    const workBuddyHome = path.join(tempDir, 'workbuddy-home-portable-sort');
    const fakeBin = path.join(tempDir, 'portable-sort-bin');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      path.join(fakeBin, 'sort'),
      '#!/bin/sh\ncase " $* " in *" -V"*|*" -Vr "*) exit 2;; esac\nexec /usr/bin/sort "$@"\n',
      'utf8'
    );
    fs.chmodSync(path.join(fakeBin, 'sort'), 0o755);

    for (const version of ['22.9.0', '22.10.0']) {
      const managedBin = path.join(workBuddyHome, 'binaries', 'node', 'versions', version, 'bin');
      fs.mkdirSync(managedBin, { recursive: true });
      fs.writeFileSync(
        path.join(managedBin, 'node'),
        `#!/bin/sh\nprintf '${version}:%s\\n' "$*"\n`,
        'utf8'
      );
      fs.chmodSync(path.join(managedBin, 'node'), 0o755);
    }

    const result = spawnSync(path.join(pluginRoot, 'bin', 'run-node'), ['maker.js'], {
      cwd: pluginRoot,
      encoding: 'utf8',
      env: {
        HOME: path.join(tempDir, 'empty-home-portable-sort'),
        PATH: `${fakeBin}:/usr/bin:/bin`,
        WORKBUDDY_CONFIG_DIR: workBuddyHome,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('22.10.0:maker.js');
  });

  test('keeps launchers self-contained and covers WorkBuddy Windows managed Node layouts', () => {
    const posixLauncher = fs.readFileSync(path.join(pluginRoot, 'bin', 'run-node'), 'utf8');
    const windowsLauncher = fs.readFileSync(path.join(pluginRoot, 'bin', 'run-node.cmd'), 'utf8');
    const windowsCli = fs.readFileSync(path.join(pluginRoot, 'bin', 'taptap-maker.cmd'), 'utf8');

    for (const launcher of [posixLauncher, windowsLauncher]) {
      expect(launcher).toContain('WORKBUDDY_EXTRA_PATHS');
      expect(launcher).toContain('WORKBUDDY_CONFIG_DIR');
      expect(launcher).toContain('CODEBUDDY_CONFIG_DIR');
      expect(launcher).toContain('binaries');
      expect(launcher).toContain('node');
      expect(launcher).not.toMatch(/\b(?:npm|npx)\b/i);
    }
    expect(windowsLauncher).toContain('node.exe');
    expect(windowsLauncher).toMatch(/bin[\\/]node\.exe/i);
    expect(windowsLauncher).not.toMatch(/set "WB_NODE=[^\r\n]+"\s*&\s*exit \/b 0/i);
    expect(windowsLauncher).not.toContain('/o-n');
    expect(windowsLauncher).toContain('WB_BEST_SCORE');
    expect(windowsLauncher).toMatch(/WB_SCORE=.*1000000.*1000/i);
    expect(windowsLauncher).toContain('call :resolve_managed_node');
    expect(windowsLauncher).not.toMatch(
      /if exist "%WB_VERSIONS%\\" \([\s\S]*if defined WB_BEST_NODE[\s\S]*\)/i
    );
    expect(windowsCli).toContain('run-node.cmd');
  });

  test('documents both supported plugin hosts in the bundled CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(pluginRoot, 'dist', 'maker.js'), '--help'],
      {
        cwd: pluginRoot,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--client codex|workbuddy');
  });

  test('offers only create and sync commands that require an empty workspace', () => {
    expect(fs.readdirSync(path.join(pluginRoot, 'commands')).sort()).toEqual([
      'create-project.md',
      'sync-project.md',
    ]);

    for (const command of ['create-project.md', 'sync-project.md']) {
      const content = fs.readFileSync(path.join(pluginRoot, 'commands', command), 'utf8');
      expect(content).toContain('empty');
      expect(content).toContain('${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js');
      expect(content).toContain('${CODEBUDDY_PLUGIN_ROOT}/bin/run-node"');
      expect(content).toContain('${CODEBUDDY_PLUGIN_ROOT}/bin/run-node.cmd"');
      expect(content).not.toMatch(
        /(?:^|\s)node\s+"\$\{CODEBUDDY_PLUGIN_ROOT\}\/dist\/maker\.js"/mu
      );
      expect(content).toContain('--skip-mcp-install');
    }
    expect(
      fs.readFileSync(path.join(pluginRoot, 'commands', 'create-project.md'), 'utf8')
    ).toContain('--create');
  });

  test('updates through WorkBuddy plugins without invoking the standalone updater', () => {
    const updateSkill = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'update-taptap-mcp', 'SKILL.md'),
      'utf8'
    );

    expect(updateSkill).toContain('WorkBuddy');
    expect(updateSkill).toContain('/plugin');
    expect(updateSkill).not.toMatch(/(?:^|\s)npx\s+-/mu);
    expect(updateSkill).not.toContain('taptap-maker upgrade');
  });

  test('documents both Windows and POSIX bundled CLI launchers for lifecycle commands', () => {
    const lifecycleSkill = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'taptap-maker-plugin-lifecycle', 'SKILL.md'),
      'utf8'
    );

    expect(lifecycleSkill).toContain('${CODEBUDDY_PLUGIN_ROOT}/bin/run-node"');
    expect(lifecycleSkill).toContain('${CODEBUDDY_PLUGIN_ROOT}/bin/run-node.cmd"');
    expect(lifecycleSkill).toContain('TAPTAP_MAKER_DISTRIBUTION');
    expect(lifecycleSkill).toContain('workbuddy_plugin');
  });

  test('keeps the shared local workflow neutral to the active plugin host', () => {
    const localSkill = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'taptap-maker-local', 'SKILL.md'),
      'utf8'
    );

    expect(localSkill).toContain("active plugin's marketplace");
    expect(localSkill).not.toContain('Codex marketplace');
    expect(localSkill).not.toContain('update the Codex plugin');
    expect(localSkill).not.toContain(
      '`taptap-maker agents update --target-dir <project dir>` or `taptap-maker upgrade'
    );
  });

  test('publishes an isolated entry in the repository local marketplace', () => {
    const marketplace = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.codebuddy-plugin', 'marketplace.json'), 'utf8')
    );
    const entry = marketplace.plugins.find(
      (plugin: { name?: string }) => plugin.name === 'taptap-maker'
    );

    expect(marketplace.name).toBe('taptap-maker');
    expect(entry).toEqual(
      expect.objectContaining({
        name: 'taptap-maker',
        version: pluginVersion,
        description: pluginDescription,
        description_en: pluginDescriptionEn,
        source: './plugins/workbuddy/taptap-maker',
        homepage: pluginSourceUrl,
        repository: pluginSourceUrl,
      })
    );
  });
});
