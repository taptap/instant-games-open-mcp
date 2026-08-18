#!/usr/bin/env node

/**
 * Build and assemble the standalone TapTap Maker Codex plugin.
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
const defaultPluginRoot = join(projectRoot, 'plugins', 'taptap-maker');
const MAKER_SOURCE_URL = 'https://github.com/taptap/instant-games-open-mcp/tree/main/src/maker';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REQUIRED_SKILLS = [
  'taptap-maker-local',
  'taptap-maker-dev-kit-guide',
  'taptap-maker-plugin-lifecycle',
];
const CODEX_PLUGIN_SKILLS = ['update-taptap-mcp'];
const CODEX_PLUGIN_SKILLS_ROOT = join(
  projectRoot,
  'plugin-sources',
  'taptap-maker',
  'codex',
  'skills'
);

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
      'Usage: node scripts/prepare-maker-codex-plugin.js [--version <semver>] [--output-dir <path>]'
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
    description: 'Local TapTap Maker game development with bundled MCP, CLI, and workflows.',
    author: { name: 'TapTap Team' },
    homepage: MAKER_SOURCE_URL,
    repository: MAKER_SOURCE_URL,
    license: 'MIT',
    keywords: ['taptap', 'maker', 'game-development', 'mcp'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'TapTap Maker',
      shortDescription: 'Build and preview TapTap Maker games locally.',
      longDescription:
        'Bundled TapTap Maker MCP, CLI, skills, project workflows, asset tools, and remote build support.',
      developerName: 'TapTap Team',
      category: 'Developer Tools',
      capabilities: ['Local game development', 'Maker MCP tools', 'Project build and preview'],
      brandColor: '#16B8C4',
      websiteURL: MAKER_SOURCE_URL,
      composerIcon: './assets/taptap-maker.png',
      logo: './assets/taptap-maker.png',
      logoDark: './assets/taptap-maker.png',
      defaultPrompt: [
        '快速创建一个新的 TapTap Maker 项目。必须先在 Codex 中选择并打开一个空目录。',
        '同步 TapTap Maker 游戏到本地继续开发。必须先在 Codex 中选择并打开一个空目录。',
      ],
    },
  };
}

function createMcpConfig() {
  return {
    mcpServers: {
      'taptap-maker-plugin': {
        command: 'node',
        args: ['./dist/maker.js'],
        cwd: '.',
        env: {
          TAPTAP_MAKER_DISTRIBUTION: 'codex_plugin',
          TAPTAP_MCP_CLIENT_IDE: 'codex',
        },
      },
    },
  };
}

function createReadme(version) {
  return `# TapTap Maker Codex Plugin

This plugin bundles TapTap Maker ${version}: the local MCP runtime, CLI, workflow skills, and
connection troubleshooting guide. Runtime startup uses the host Node.js executable and never
downloads or launches the Maker package through npm or npx.

Existing Maker authentication and project bindings are reused. Before using the plugin alongside
an older standalone Codex MCP registration, inspect and migrate that registration with the bundled
CLI. Migration only sets the old registration to \`enabled = false\`, keeps a latest backup, and can
be restored.

See \`skills/taptap-maker-local/SKILL.md\` for the normal Maker development workflow.
`;
}

function main() {
  const { version, pluginRoot } = parseArgs(process.argv.slice(2));

  if (pluginRoot === defaultPluginRoot) {
    rmSync(pluginRoot, { recursive: true, force: true });
  } else if (existsSync(pluginRoot)) {
    throw new Error(`Custom plugin output directory already exists: ${pluginRoot}`);
  }
  mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
  buildMakerBundle(version, join(pluginRoot, 'dist', 'maker.js'));
  copyRequiredFile(
    join(projectRoot, 'bin', 'taptap-maker'),
    join(pluginRoot, 'bin', 'taptap-maker'),
    'Maker CLI entry'
  );
  chmodSync(join(pluginRoot, 'bin', 'taptap-maker'), 0o755);

  for (const skill of REQUIRED_SKILLS) {
    copyRequiredDirectory(
      join(projectRoot, 'skills', skill),
      join(pluginRoot, 'skills', skill),
      `${skill} skill`
    );
  }
  for (const skill of CODEX_PLUGIN_SKILLS) {
    copyRequiredDirectory(
      join(CODEX_PLUGIN_SKILLS_ROOT, skill),
      join(pluginRoot, 'skills', skill),
      `Codex plugin ${skill} skill`
    );
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

  writeFileSync(
    join(pluginRoot, '.codex-plugin', 'plugin.json'),
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
  console.log(`Prepared TapTap Maker Codex plugin ${version} at ${pluginRoot}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
