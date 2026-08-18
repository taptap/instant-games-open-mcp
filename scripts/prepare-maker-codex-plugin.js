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
import { format } from 'prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const defaultPluginRoot = join(projectRoot, 'plugins', 'taptap-maker');
const PLUGIN_SOURCE_URL =
  'https://github.com/taptap/instant-games-open-mcp/tree/main/plugins/taptap-maker';
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
  let pluginVersion;
  let makerVersion;
  let outputDir;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      (option === '--version' ||
        option === '--plugin-version' ||
        option === '--maker-version' ||
        option === '--output-dir') &&
      value
    ) {
      if (option === '--version' || option === '--plugin-version') {
        pluginVersion = value;
      } else if (option === '--maker-version') {
        makerVersion = value;
      } else {
        outputDir = value;
      }
      index += 1;
      continue;
    }
    throw new Error(
      'Usage: node scripts/prepare-maker-codex-plugin.js [--plugin-version <semver>] [--maker-version <semver>] [--output-dir <path>]'
    );
  }

  if (!pluginVersion) {
    const policy = JSON.parse(
      readFileSync(join(projectRoot, 'config', 'maker-plugin-version.json'), 'utf8')
    );
    pluginVersion = policy.version;
  }
  if (!makerVersion) {
    const policy = JSON.parse(
      readFileSync(join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
    );
    makerVersion = policy.latest;
  }
  if (!VERSION_PATTERN.test(pluginVersion || '')) {
    throw new Error(`Invalid Maker plugin version: ${String(pluginVersion)}`);
  }
  if (!VERSION_PATTERN.test(makerVersion || '')) {
    throw new Error(`Invalid embedded Maker MCP version: ${String(makerVersion)}`);
  }
  return {
    pluginVersion,
    makerVersion,
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

function createManifest(pluginVersion) {
  return {
    name: 'taptap-maker',
    version: pluginVersion,
    description: 'Local TapTap Maker game development with bundled MCP, CLI, and workflows.',
    author: { name: 'TapTap Team' },
    homepage: PLUGIN_SOURCE_URL,
    repository: PLUGIN_SOURCE_URL,
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
      websiteURL: PLUGIN_SOURCE_URL,
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

async function writeJson(filePath, value) {
  writeFileSync(filePath, await format(JSON.stringify(value), { parser: 'json' }), 'utf8');
}

function createReadme(pluginVersion, makerVersion) {
  return `# TapTap Maker 客户端插件

TapTap Maker 的 Codex 与 WorkBuddy 客户端插件发布页。

- 插件版本：\`${pluginVersion}\`
- 内置 Maker MCP 版本：\`${makerVersion}\`

## 交给 AI 安装

将本页面链接交给 Codex 或 WorkBuddy，并告诉 AI：\`安装这个 TapTap Maker 插件\`。AI 应根据
当前客户端选择对应安装方式，不要安装独立 npm MCP。

### Codex

\`\`\`bash
codex plugin marketplace add taptap/instant-games-open-mcp --ref main \\
  --sparse .agents/plugins --sparse plugins/taptap-maker
codex plugin add taptap-maker@taptap-maker
\`\`\`

### WorkBuddy

在插件市场中添加本 GitHub 仓库作为本地市场源，然后安装 \`taptap-maker\`。如果当前版本暂不
支持 GitHub 市场源，可下载下方 WorkBuddy ZIP 并按客户端的本地插件导入方式安装。

## 下载

- [Codex 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/taptap-maker-codex-plugin-${pluginVersion}.zip)
- [WorkBuddy 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/taptap-maker-workbuddy-plugin-${pluginVersion}.zip)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/SHA256SUMS)

ZIP 是完整的离线 marketplace 包。AI 下载对应 ZIP 和 \`SHA256SUMS\`、验证 SHA-256 并解压后：

- Codex：执行 \`codex plugin marketplace add <解压目录>\`，再执行
  \`codex plugin add taptap-maker@taptap-maker\`。
- WorkBuddy：在 \`/plugin\` 中把解压目录添加为 marketplace，安装 \`taptap-maker\`，然后执行
  \`/reload-plugins\`。

插件内置本地 MCP runtime、CLI、工作流 Skills 和连接排障文档。运行时不会通过 npm 或 npx
下载或启动 Maker 包。

插件会复用现有 Maker 鉴权和项目绑定。首次使用时先通过插件内 CLI 检查旧的独立 Maker MCP；
只有用户明确确认后，才把旧 Codex 注册设置为 \`enabled = false\`。迁移会保留最新备份并支持恢复，
不会删除旧注册、鉴权、项目绑定或游戏文件。

正常 Maker 开发流程见 \`skills/taptap-maker-local/SKILL.md\`。
`;
}

async function main() {
  const { pluginVersion, makerVersion, pluginRoot } = parseArgs(process.argv.slice(2));

  if (pluginRoot === defaultPluginRoot) {
    rmSync(pluginRoot, { recursive: true, force: true });
  } else if (existsSync(pluginRoot)) {
    throw new Error(`Custom plugin output directory already exists: ${pluginRoot}`);
  }
  mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
  buildMakerBundle(makerVersion, join(pluginRoot, 'dist', 'maker.js'));
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

  await writeJson(join(pluginRoot, '.codex-plugin', 'plugin.json'), createManifest(pluginVersion));
  await writeJson(join(pluginRoot, '.mcp.json'), createMcpConfig());
  writeFileSync(join(pluginRoot, 'README.md'), createReadme(pluginVersion, makerVersion), 'utf8');

  const bundle = readFileSync(join(pluginRoot, 'dist', 'maker.js'), 'utf8');
  if (!bundle.includes(`// TapTap Maker MCP version: ${makerVersion}`)) {
    throw new Error(`Bundled Maker runtime does not contain version ${makerVersion}.`);
  }
  console.log(
    `Prepared TapTap Maker Codex plugin ${pluginVersion} with Maker MCP ${makerVersion} at ${pluginRoot}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
