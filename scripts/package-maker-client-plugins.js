#!/usr/bin/env node

import archiver from 'archiver';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function parseArgs(argv) {
  let outputDir = join(projectRoot, 'artifacts', 'maker-plugins');
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir' && argv[index + 1]) {
      outputDir = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error('Usage: node scripts/package-maker-client-plugins.js [--output-dir <path>]');
  }
  return { outputDir };
}

function readVersions() {
  const pluginPolicy = JSON.parse(
    readFileSync(join(projectRoot, 'config', 'maker-plugin-version.json'), 'utf8')
  );
  const makerPolicy = JSON.parse(
    readFileSync(join(projectRoot, 'config', 'maker-version-policy.json'), 'utf8')
  );
  return { pluginVersion: pluginPolicy.version, makerVersion: makerPolicy.latest };
}

function preparePlugin(script, outputDir, pluginVersion, makerVersion) {
  const result = spawnSync(
    process.execPath,
    [
      join(projectRoot, 'scripts', script),
      '--plugin-version',
      pluginVersion,
      '--maker-version',
      makerVersion,
      '--output-dir',
      outputDir,
    ],
    { cwd: projectRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Plugin preparation failed:\n${result.stdout}\n${result.stderr}`);
  }
}

async function createZip(sourceDir, outputPath) {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
  archive.on('error', (error) => output.destroy(error));
  archive.pipe(output);
  archive.directory(sourceDir, false);
  await archive.finalize();
  await once(output, 'close');
  if (statSync(outputPath).size === 0) {
    throw new Error(`Empty plugin archive: ${outputPath}`);
  }
}

function assertWorkBuddyPluginLayout(pluginRoot) {
  const requiredRootPaths = ['.codebuddy-plugin/plugin.json', '.mcp.json', 'README.md', 'SKILL.md'];
  for (const relativePath of requiredRootPaths) {
    const entry = statSync(join(pluginRoot, relativePath), { throwIfNoEntry: false });
    if (!entry?.isFile()) {
      throw new Error(`Missing WorkBuddy plugin root entry: ${relativePath}`);
    }
  }

  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      const relativePath = relative(pluginRoot, fullPath).replaceAll('\\', '/');
      const segments = relativePath.split('/').filter(Boolean);
      const directoryDepth = entry.isDirectory() ? segments.length : segments.length - 1;
      if (segments.includes('__MACOSX') || segments.includes('.DS_Store')) {
        throw new Error(`Forbidden WorkBuddy plugin archive entry: ${relativePath}`);
      }
      if (relativePath === '.codebuddy-plugin/marketplace.json') {
        throw new Error(`WorkBuddy plugin must not contain marketplace metadata: ${relativePath}`);
      }
      if (segments[0] === 'plugins') {
        throw new Error(`WorkBuddy plugin must not contain a marketplace wrapper: ${relativePath}`);
      }
      if (directoryDepth > 2) {
        throw new Error(
          `WorkBuddy plugin directory depth exceeds the official two-level limit: ${relativePath}`
        );
      }
      if (entry.isDirectory()) {
        visit(fullPath);
      }
    }
  };

  visit(pluginRoot);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  const input = createReadStream(filePath);
  input.on('data', (chunk) => hash.update(chunk));
  await once(input, 'end');
  return hash.digest('hex');
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  const { pluginVersion, makerVersion } = readVersions();
  const stagingRoot = mkdtempSync(join(tmpdir(), 'maker-client-plugins-'));
  const codexMarketRoot = join(stagingRoot, 'codex');
  const codexRoot = join(codexMarketRoot, 'plugins', 'taptap-maker');
  const workBuddyRoot = join(stagingRoot, 'workbuddy');
  const codexAsset = `taptap-maker-codex-plugin-${pluginVersion}.zip`;
  const workBuddyAsset = `taptap-maker-workbuddy-plugin-${pluginVersion}.zip`;
  mkdirSync(outputDir, { recursive: true });

  try {
    preparePlugin('prepare-maker-codex-plugin.js', codexRoot, pluginVersion, makerVersion);
    preparePlugin('prepare-maker-workbuddy-plugin.js', workBuddyRoot, pluginVersion, makerVersion);
    mkdirSync(join(codexMarketRoot, '.agents', 'plugins'), { recursive: true });
    copyFileSync(
      join(projectRoot, '.agents', 'plugins', 'marketplace.json'),
      join(codexMarketRoot, '.agents', 'plugins', 'marketplace.json')
    );
    assertWorkBuddyPluginLayout(workBuddyRoot);
    await createZip(codexMarketRoot, join(outputDir, codexAsset));
    await createZip(workBuddyRoot, join(outputDir, workBuddyAsset));
    copyFileSync(join(codexRoot, 'README.md'), join(outputDir, 'INSTALL.md'));

    const checksums = [
      `${await sha256(join(outputDir, codexAsset))}  ${codexAsset}`,
      `${await sha256(join(outputDir, workBuddyAsset))}  ${workBuddyAsset}`,
    ];
    writeFileSync(join(outputDir, 'SHA256SUMS'), `${checksums.join('\n')}\n`, 'utf8');
    writeFileSync(
      join(outputDir, 'maker-plugin-release.json'),
      `${JSON.stringify(
        {
          schema_version: 1,
          plugin_version: pluginVersion,
          maker_mcp_version: makerVersion,
          tag: `maker-plugin-v${pluginVersion}`,
          assets: {
            codex: codexAsset,
            workbuddy: workBuddyAsset,
            checksums: 'SHA256SUMS',
            install_guide: 'INSTALL.md',
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  process.stdout.write(
    `Packaged Maker client plugins ${pluginVersion} with Maker MCP ${makerVersion} at ${outputDir}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
