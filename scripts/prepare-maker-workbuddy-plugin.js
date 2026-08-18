#!/usr/bin/env node

/**
 * Build and assemble the standalone TapTap Maker WorkBuddy plugin.
 */

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const defaultPluginRoot = join(projectRoot, 'plugins', 'workbuddy', 'taptap-maker');
const workBuddySourceRoot = join(projectRoot, 'plugin-sources', 'taptap-maker', 'workbuddy');
const localMarketplacePath = join(projectRoot, '.codebuddy-plugin', 'marketplace.json');
const MAKER_SOURCE_URL = 'https://github.com/taptap/instant-games-open-mcp/tree/main/src/maker';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHARED_SKILLS = ['taptap-maker-local', 'taptap-maker-dev-kit-guide'];
const WORKBUDDY_SKILLS = ['taptap-maker-plugin-lifecycle', 'update-taptap-mcp'];
const WORKBUDDY_COMMANDS = ['create-project.md', 'sync-project.md'];
const PLUGIN_DESCRIPTION =
  'TapTap Maker 本地游戏开发插件，内置 MCP、CLI、开发技能和项目工作流。';
const PLUGIN_DESCRIPTION_EN =
  'Local TapTap Maker game development with bundled MCP, CLI, and workflows.';
const WORKBUDDY_DISPLAY_DESCRIPTIONS = {
  'commands/create-project.md': '在当前空工作区中创建新的 TapTap Maker 项目',
  'commands/sync-project.md': '将已有的 TapTap Maker 游戏同步到当前空工作区继续开发',
  'skills/taptap-maker-local/SKILL.md':
    '指导 TapTap Maker 本地开发流程，包括初始化、同步项目、状态检查、提交构建和故障诊断。',
  'skills/taptap-maker-dev-kit-guide/SKILL.md':
    '介绍 Maker 项目随附的 AI 开发套件，包括开发指南、示例、模板和引擎参考资料。',
  'skills/taptap-maker-plugin-lifecycle/SKILL.md':
    '管理 WorkBuddy 中 TapTap Maker 插件的首次使用、旧 MCP 迁移、项目初始化、更新和卸载流程。',
  'skills/update-taptap-mcp/SKILL.md':
    '当用户需要更新或升级 WorkBuddy 插件内置的 TapTap Maker 时使用。',
};

function parseArgs(argv) {
  let version;
  let outputDir;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if ((option === '--version' || option === '--output-dir') && value) {
      if (option === '--version') {
        version = value;
      } else {
        outputDir = value;
      }
      index += 1;
      continue;
    }
    throw new Error(
      'Usage: node scripts/prepare-maker-workbuddy-plugin.js [--version <semver>] [--output-dir <path>]'
    );
  }

  if (!version) {
    const policy = JSON.parse(
      readFileSync(join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
    );
    version = policy.latest;
  }
  if (!VERSION_PATTERN.test(version || '')) {
    throw new Error(`Invalid Maker plugin version: ${String(version)}`);
  }
  return {
    version,
    pluginRoot: outputDir ? resolve(outputDir) : defaultPluginRoot,
  };
}

function copyRequiredFile(source, target, description) {
  if (!existsSync(source)) {
    throw new Error(`Missing ${description}: ${source}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
}

function copyRequiredDirectory(source, target, description) {
  if (!existsSync(source)) {
    throw new Error(`Missing ${description}: ${source}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function setFrontmatterDescription(filePath, description) {
  const content = readFileSync(filePath, 'utf8');
  if (!content.startsWith('---\n')) {
    throw new Error(`Missing YAML frontmatter in ${filePath}`);
  }
  const frontmatterEnd = content.indexOf('\n---\n', 4);
  if (frontmatterEnd < 0) {
    throw new Error(`Unterminated YAML frontmatter in ${filePath}`);
  }
  const frontmatter = content.slice(4, frontmatterEnd);
  if (!/^description:.*$/m.test(frontmatter)) {
    throw new Error(`Missing frontmatter description in ${filePath}`);
  }
  const localizedFrontmatter = frontmatter.replace(
    /^description:.*$/m,
    `description: ${description}`
  );
  writeFileSync(
    filePath,
    `---\n${localizedFrontmatter}\n---\n${content.slice(frontmatterEnd + 5)}`,
    'utf8'
  );
}

function buildMakerBundle(version, outfile) {
  const result = spawnSync(process.execPath, [join(projectRoot, 'scripts', 'bundle-maker.js')], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MAKER_PACKAGE_VERSION: version,
      MAKER_BUNDLE_OUTFILE: outfile,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Maker bundle build failed:\n${result.stdout}\n${result.stderr}`);
  }
  const bundle = readFileSync(outfile, 'utf8').replace(/[\t ]+$/gm, '');
  writeFileSync(outfile, bundle, 'utf8');
}

function createManifest(version) {
  return {
    name: 'taptap-maker',
    version,
    description: PLUGIN_DESCRIPTION,
    description_en: PLUGIN_DESCRIPTION_EN,
    author: { name: 'TapTap Team' },
    homepage: MAKER_SOURCE_URL,
    repository: MAKER_SOURCE_URL,
    license: 'MIT',
    keywords: ['taptap', 'maker', 'game-development', 'mcp'],
    category: 'game-development',
    commands: WORKBUDDY_COMMANDS.map((command) => `./commands/${command}`),
    skills: [...SHARED_SKILLS, ...WORKBUDDY_SKILLS].map((skill) => `./skills/${skill}`),
    mcpServers: './.mcp.json',
  };
}

function createMcpConfig() {
  return {
    mcpServers: {
      'taptap-maker-plugin': {
        command: '${CODEBUDDY_PLUGIN_ROOT}/bin/run-node',
        args: ['${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js'],
        env: {
          TAPTAP_MAKER_DISTRIBUTION: 'workbuddy_plugin',
          TAPTAP_MCP_CLIENT_IDE: 'workbuddy',
        },
      },
    },
  };
}

function createReadme(version) {
  return `# TapTap Maker WorkBuddy Plugin

This plugin bundles TapTap Maker ${version}: the local MCP runtime, CLI, workflow Skills, commands,
and connection troubleshooting guide. Its launcher prefers WorkBuddy's managed Node.js, falls back
to a system Node.js when needed, and never downloads or launches Maker through npm or npx.

Use \`/taptap-maker:create-project\` to create a new game in an empty workspace, or
\`/taptap-maker:sync-project\` to sync an existing Maker game into an empty workspace. Existing
Maker authentication and project bindings are reused.
`;
}

function createWorkBuddyIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <image href="assets/taptap-maker.png" width="1000" height="1000" />
</svg>
`;
}

function syncMarketplaceMetadata(version) {
  const marketplace = JSON.parse(readFileSync(localMarketplacePath, 'utf8'));
  const entry = marketplace.plugins?.find((plugin) => plugin.name === 'taptap-maker');
  if (!entry) {
    throw new Error(`Missing taptap-maker entry in ${localMarketplacePath}`);
  }
  entry.version = version;
  entry.description = PLUGIN_DESCRIPTION;
  entry.description_en = PLUGIN_DESCRIPTION_EN;
  writeFileSync(localMarketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, 'utf8');
}

function main() {
  const { version, pluginRoot } = parseArgs(process.argv.slice(2));

  if (pluginRoot === defaultPluginRoot) {
    rmSync(pluginRoot, { recursive: true, force: true });
  } else if (existsSync(pluginRoot)) {
    throw new Error(`Custom plugin output directory already exists: ${pluginRoot}`);
  }
  mkdirSync(join(pluginRoot, '.codebuddy-plugin'), { recursive: true });
  buildMakerBundle(version, join(pluginRoot, 'dist', 'maker.js'));

  for (const launcher of ['run-node', 'run-node.cmd', 'taptap-maker', 'taptap-maker.cmd']) {
    copyRequiredFile(
      join(workBuddySourceRoot, 'bin', launcher),
      join(pluginRoot, 'bin', launcher),
      `WorkBuddy ${launcher} launcher`
    );
  }
  chmodSync(join(pluginRoot, 'bin', 'run-node'), 0o755);
  chmodSync(join(pluginRoot, 'bin', 'taptap-maker'), 0o755);

  for (const skill of SHARED_SKILLS) {
    copyRequiredDirectory(
      join(projectRoot, 'skills', skill),
      join(pluginRoot, 'skills', skill),
      `${skill} skill`
    );
  }
  for (const skill of WORKBUDDY_SKILLS) {
    copyRequiredDirectory(
      join(workBuddySourceRoot, 'skills', skill),
      join(pluginRoot, 'skills', skill),
      `WorkBuddy plugin ${skill} skill`
    );
  }
  for (const command of WORKBUDDY_COMMANDS) {
    copyRequiredFile(
      join(workBuddySourceRoot, 'commands', command),
      join(pluginRoot, 'commands', command),
      `WorkBuddy plugin ${command} command`
    );
  }
  for (const [relativePath, description] of Object.entries(WORKBUDDY_DISPLAY_DESCRIPTIONS)) {
    setFrontmatterDescription(join(pluginRoot, relativePath), description);
  }

  copyRequiredFile(
    join(projectRoot, 'docs', 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'),
    join(pluginRoot, 'docs', 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'),
    'Maker MCP troubleshooting guide'
  );
  copyRequiredFile(
    join(projectRoot, 'src', 'maker', 'assets', 'taptap-maker.png'),
    join(pluginRoot, 'assets', 'taptap-maker.png'),
    'Maker plugin icon'
  );
  copyRequiredFile(
    join(projectRoot, 'src', 'maker', 'assets', 'taptap-maker.png'),
    join(pluginRoot, 'icon.png'),
    'WorkBuddy plugin root icon'
  );
  writeFileSync(join(pluginRoot, 'icon.svg'), createWorkBuddyIcon(), 'utf8');

  writeFileSync(
    join(pluginRoot, '.codebuddy-plugin', 'plugin.json'),
    `${JSON.stringify(createManifest(version), null, 2)}\n`,
    'utf8'
  );
  writeFileSync(
    join(pluginRoot, '.mcp.json'),
    `${JSON.stringify(createMcpConfig(), null, 2)}\n`,
    'utf8'
  );
  writeFileSync(join(pluginRoot, 'README.md'), createReadme(version), 'utf8');

  const bundle = readFileSync(join(pluginRoot, 'dist', 'maker.js'), 'utf8');
  if (!bundle.includes(`// TapTap Maker MCP version: ${version}`)) {
    throw new Error(`Bundled Maker runtime does not contain version ${version}.`);
  }
  if (pluginRoot === defaultPluginRoot) {
    syncMarketplaceMetadata(version);
  }
  console.log(`Prepared TapTap Maker WorkBuddy plugin ${version} at ${pluginRoot}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
