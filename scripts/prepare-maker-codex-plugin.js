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
  const releaseChannel = pluginVersion.includes('-dev.') ? 'develop 预览版' : 'main 稳定版';
  return `# TapTap Maker 客户端插件安装

这是 TapTap Maker 的统一插件安装入口，支持 Codex 和 WorkBuddy。两个插件使用同一版本，
但安装包和客户端配置彼此独立。

- 插件版本：\`${pluginVersion}\`
- 发布渠道：\`${releaseChannel}\`
- 内置 Maker MCP 版本：\`${makerVersion}\`

## 用户如何安装

把本页面链接交给当前正在使用的 AI，并告诉它：\`请按照页面说明安装 TapTap Maker 插件\`。

## 给安装 AI 的选择规则

安装前必须先识别自己当前运行在哪个宿主客户端，再选择安装包：

| 当前宿主客户端 | 只能选择的安装包 |
| --- | --- |
| 当前宿主客户端是 Codex | \`taptap-maker-codex-plugin-${pluginVersion}.zip\` |
| 当前宿主客户端是 WorkBuddy | \`taptap-maker-workbuddy-plugin-${pluginVersion}.zip\` |

必须遵守以下规则：

1. 以当前对话所属的宿主客户端为准。不要根据操作系统、Node.js 环境，或本机是否存在
   \`~/.codex\`、\`~/.workbuddy\` 目录来猜测；同一台电脑可能同时安装两个客户端。
2. 无法确认当前宿主客户端时，先询问用户“你现在使用的是 Codex 还是 WorkBuddy？”，得到明确
   回答前不要下载或安装。
3. 一次只安装当前客户端对应的一个 ZIP，不要同时安装两个插件包。
4. 不要通过 npm 或 npx 安装独立 Maker MCP；ZIP 已包含完整 MCP runtime、CLI 和 Skills。

## 下载

- [Codex 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/taptap-maker-codex-plugin-${pluginVersion}.zip)
- [WorkBuddy 插件 ZIP](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/taptap-maker-workbuddy-plugin-${pluginVersion}.zip)
- [SHA256 校验文件](https://github.com/taptap/instant-games-open-mcp/releases/download/maker-plugin-v${pluginVersion}/SHA256SUMS)

ZIP 是完整的离线 marketplace 包。AI 只下载所选 ZIP 和 \`SHA256SUMS\`，验证 SHA-256 后解压。

## 安装所选插件

### Codex

仅当当前宿主是 Codex 时执行：

1. 执行 \`codex plugin marketplace add <解压目录>\`。
2. 执行 \`codex plugin add taptap-maker@taptap-maker\`。
3. 重新加载插件或新建任务，确认 TapTap Maker 插件已启用。

### WorkBuddy

仅当当前宿主是 WorkBuddy 时执行：

1. 在 \`/plugin\` 中把解压目录添加为 marketplace。
2. 安装 marketplace 中的 \`taptap-maker\`。
3. 执行 \`/reload-plugins\`，确认 TapTap Maker 插件已启用。

如果当前客户端既不是 Codex 也不是 WorkBuddy，应告知用户该客户端暂未提供对应安装包，不要把
其中一个 ZIP 当作通用 MCP 包安装。

## 兼容已有 Maker MCP

插件内置本地 MCP runtime、CLI、工作流 Skills 和连接排障文档。运行时不会通过 npm 或 npx
下载或启动 Maker 包。

插件会复用现有 Maker 鉴权和项目绑定。首次使用时会检查旧的独立 Maker MCP；WorkBuddy 通过
SessionStart Hook 做只读检查并提醒 AI。只有用户明确确认后，才把旧 Codex 注册设置为
\`enabled = false\`，或把旧 WorkBuddy 注册设置为 \`disabled: true\`。迁移会保留最新备份并支持
恢复，不会删除旧注册、鉴权、项目绑定或游戏文件。

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
  writeFileSync(
    join(pluginRoot, 'README.md'),
    await format(createReadme(pluginVersion, makerVersion), { parser: 'markdown' }),
    'utf8'
  );

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
