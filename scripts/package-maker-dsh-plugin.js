#!/usr/bin/env node

/**
 * Package the TapTap Maker DeepSeek Harness (DSH) bundle plugin for release.
 *
 * Produces, under the output directory:
 *   - taptap-dsh-maker-<version>.tgz  (npm tarball; `dsh plugin add` installs it)
 *   - SHA256SUMS                       (checksum of the tarball)
 *   - INSTALL.md                       (AI-facing install guide, version-baked)
 *   - dsh-maker-release.json           (release metadata)
 *
 * Also refreshes the committed `packages/dsh-maker/INSTALL.md` so the stable
 * install page stays in sync with the package version.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const scriptPath = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptPath);
const projectRoot = join(__dirname, '..');
const packageDir = join(projectRoot, 'packages', 'dsh-maker');
const packageJsonPath = join(packageDir, 'package.json');
const committedInstallMdPath = join(packageDir, 'INSTALL.md');
const GITHUB_REPO = 'https://github.com/taptap/instant-games-open-mcp';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseArgs(argv) {
  let outputDir = join(projectRoot, 'artifacts', 'dsh-maker');
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir' && argv[index + 1]) {
      outputDir = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error('Usage: node scripts/package-maker-dsh-plugin.js [--output-dir <path>]');
  }
  return { outputDir };
}

function readVersion() {
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = manifest.version;
  const makerVersion = manifest.dependencies?.['@taptap/maker'];
  if (!VERSION_PATTERN.test(version || '')) {
    throw new Error(`Invalid @taptap/dsh-maker version: ${String(version)}`);
  }
  if (!VERSION_PATTERN.test(makerVersion || '')) {
    throw new Error(`Invalid @taptap/maker dependency version: ${String(makerVersion)}`);
  }
  return { version, name: manifest.name, makerVersion };
}

function packTarball(outDir) {
  const result = spawnSync('npm', ['pack', '--pack-destination', outDir, '--json'], {
    cwd: packageDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`npm pack failed:\n${result.stdout}\n${result.stderr}`);
  }
  const payload = JSON.parse(result.stdout);
  if (!Array.isArray(payload) || payload.length === 0 || !payload[0].filename) {
    throw new Error(`Unexpected npm pack output: ${result.stdout}`);
  }
  return join(outDir, payload[0].filename);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  const input = createReadStream(filePath);
  input.on('data', (chunk) => hash.update(chunk));
  await once(input, 'end');
  return hash.digest('hex');
}

export function createInstallMd(version, makerVersion) {
  const isPreview = version.includes('-dev.');
  const releaseChannel = isPreview ? 'develop 预览版' : 'main 稳定版';
  const distribution = isPreview
    ? 'GitHub prerelease npm tarball（不发布到 npm registry）'
    : 'npm registry 公开包（GitHub Release 同步提供 tarball）';
  const installSource = isPreview ? '<tarball绝对路径>' : `@taptap/dsh-maker@${version}`;
  const installPreparation = isPreview
    ? `先下载本 Release 的 tarball 和 SHA256SUMS，验证 SHA-256 匹配后再安装；校验失败时停止安装。`
    : `直接从 npm registry 安装精确版本 \`@taptap/dsh-maker@${version}\`。GitHub Release tarball 只作为离线安装和排障备用入口；改用 tarball 时必须先用同一 Release 的 SHA256SUMS 校验 SHA-256，校验失败时停止安装。`;
  const installSources = `${isPreview ? '' : `- npm：\`@taptap/dsh-maker@${version}\`\n`}- [DSH 插件 tarball](${GITHUB_REPO}/releases/download/dsh-maker-v${version}/taptap-dsh-maker-${version}.tgz)
- [SHA256 校验文件](${GITHUB_REPO}/releases/download/dsh-maker-v${version}/SHA256SUMS)`;
  return `# TapTap Maker DSH 插件安装（DeepSeek Harness）

这是 TapTap Maker 的 **DeepSeek Harness（DSH）插件** 分发安装入口。

- 插件包：\`@taptap/dsh-maker\`
- 版本：\`${version}\`
- 内置 Maker MCP 版本：\`${makerVersion}\`
- 发布渠道：\`${releaseChannel}\`
- 分发形态：${distribution}

## 给安装 AI 的强制执行指令

用户在当前对话中直接提供本页面链接，即代表用户已明确授权安装 TapTap Maker DSH 插件。
读取本页面后，立即执行完整安装流程：迁移旧 L1 配置、安装、验证。

- 不要再次询问用户是否安装。
- 不要只给出安装建议、命令或步骤，不要让用户手动完成你可以执行的操作。
- 前置条件：本机需已安装 \`dsh\` 命令与 [pnpm](https://pnpm.io/)；缺失时先引导安装或直接安装。
- ${installPreparation}
- 完成安装并验证插件已启用后再向用户报告结果；失败时直接报告具体失败步骤和错误。

## 安装源

${installSources}

## 安装步骤

1. **迁移旧 L1 配置（若存在，安装前做）**：本插件与仓库 L1 形态（\`taptap-maker install --ide dsh\`）
   共用同一个 \`serverName: taptap-maker\`，不能同时启用。用 Maker CLI 的结构化迁移处理，
   **不要手改 YAML、更不要只删 \`id\` 字段**（DSH 会给无 id 的行重新生成 id，旧 MCP 仍会启动）。

   迁移命令（\`<maker 版本>\` 取本页「内置 Maker MCP 版本」；本机已有 \`taptap-maker\` CLI 时去掉
   \`npx -y --package @taptap/maker@<maker 版本> \` 前缀直接用）：

   - 检查：\`npx -y --package @taptap/maker@${makerVersion} taptap-maker plugin inspect --client dsh --json\`
   - 状态为 \`active\` 时迁移：\`npx -y --package @taptap/maker@${makerVersion} taptap-maker plugin migrate --client dsh --confirm --json\`
   - 状态为 \`ambiguous\` 时必须停止安装并报告重复配置；\`not_found\` 时继续。
   - 迁移会保留备份和指纹，供失败回滚（\`plugin restore --client dsh --confirm\`）。

2. **选择 profile 安装**：确认用户当前使用的 DSH profile 名（常见为 \`web\` 或 \`headless\`），
   下面用 \`<profile>\` 代表用户实际 profile，不要固定写 \`web\`：
   \`dsh plugin --profile <profile> add ${installSource}\`。需要哪个装哪个，一次装一个即可，
   不要多个都装。

3. **验证 patch 合成**：\`dsh --profile <profile> --dump-config | grep -i taptap-maker\`，
   应能看到 \`taptap-maker\` 插件行。

4. **验证生效**：重新加载/新建会话后，确认 MCP 工具 \`mcp__taptap-maker__*\` 已注册，技能
   \`taptap-maker-dsh\` 等可用；一次性初始化用 \`node "$DSH_TAPTAP_MAKER_BIN" init --skip-mcp-install\`。

## 排障

| 现象 | 处理 |
| --- | --- |
| \`dsh plugin\` 报 \`pnpm not found\` | 先装 pnpm（\`npm i -g pnpm\`） |
| \`serverName "taptap-maker" is already in use\` | 第 1 步没迁移干净 L1，重新 \`plugin inspect --client dsh\` 并 \`migrate --confirm\`，再 \`dsh plugin --profile <profile> remove @taptap/dsh-maker\` 后重装 |
| 工具列表没有 \`mcp__taptap-maker__*\` | \`dsh --profile <profile> --dump-config\` 确认 patch 合成；看 DSH 日志里的 \`mcp-client(taptap-maker)\` 重连信息 |
| 安装失败需回滚 | 先 \`dsh plugin --profile <profile> remove @taptap/dsh-maker\` 卸载；若本次迁移过 L1，用 \`taptap-maker plugin restore --client dsh --confirm --json\` 恢复 |

## 兼容与回滚

- 插件通过 \`@taptap/maker\` 随包依赖提供 MCP runtime 与 CLI，安装时会自动从 npm 拉取该依赖。
- 安装请求同时授权兼容迁移：若第 1 步迁移了 L1 注册，本次安装失败时用
  \`plugin restore --client dsh --confirm\` 恢复（属于同一次安装事务，无需再次询问）。
- 正常卸载（\`dsh plugin remove\`）不会恢复 L1 配置；需要 L1 时由用户明确要求再写回。
`;
}

async function writeJson(filePath, value) {
  writeFileSync(
    filePath,
    await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }),
    'utf8'
  );
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  const { version, name, makerVersion } = readVersion();
  mkdirSync(outputDir, { recursive: true });

  const packedPath = packTarball(outputDir);
  const tarballName = `taptap-dsh-maker-${version}.tgz`;
  const tarballPath = join(outputDir, tarballName);
  if (packedPath !== tarballPath) {
    renameSync(packedPath, tarballPath);
  }
  if (statSync(tarballPath).size === 0) {
    throw new Error(`Empty plugin tarball: ${tarballPath}`);
  }

  const digest = await sha256(tarballPath);
  writeFileSync(join(outputDir, 'SHA256SUMS'), `${digest}  ${tarballName}\n`, 'utf8');

  const installMd = await format(createInstallMd(version, makerVersion), { parser: 'markdown' });
  writeFileSync(committedInstallMdPath, installMd, 'utf8');
  writeFileSync(join(outputDir, 'INSTALL.md'), installMd, 'utf8');

  await writeJson(join(outputDir, 'dsh-maker-release.json'), {
    schema_version: 1,
    package: name,
    version,
    maker_version: makerVersion,
    tag: `dsh-maker-v${version}`,
    assets: {
      tarball: tarballName,
      checksums: 'SHA256SUMS',
      install_guide: 'INSTALL.md',
    },
  });

  process.stdout.write(
    `Packaged ${name} ${version} (maker ${makerVersion}) at ${outputDir} (${tarballName}, SHA256SUMS, INSTALL.md)\n`
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(scriptPath)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
