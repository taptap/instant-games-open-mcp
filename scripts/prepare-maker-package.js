#!/usr/bin/env node

/**
 * Prepare the standalone @taptap/maker npm package.
 *
 * The package is intentionally assembled into packages/maker so the legacy
 * @taptap/instant-games-open-mcp release flow remains untouched.
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const packageRoot = join(projectRoot, 'packages', 'maker');

const REQUIRED_SKILLS = ['taptap-maker-local', 'taptap-maker-dev-kit-guide', 'update-taptap-mcp'];
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const LEGACY_PACKAGE = '@taptap/instant-games-open-mcp';
const MAKER_PACKAGE = '@taptap/maker';

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      const version = argv[index + 1];
      if (!version || version.startsWith('--')) {
        throw new Error('Missing value for --version.');
      }
      parsed.version = version;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!parsed.version) {
    throw new Error('Usage: node scripts/prepare-maker-package.js --version <version>');
  }
  if (!VERSION_PATTERN.test(parsed.version)) {
    throw new Error(
      `Invalid version: ${parsed.version}. Expected semver like 0.0.1 or 0.0.1-beta.1.`
    );
  }
  return parsed;
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

function rewriteMakerSkillPackageReferences(skillRoot) {
  const skillPath = join(skillRoot, 'update-taptap-mcp', 'SKILL.md');
  if (!existsSync(skillPath)) {
    throw new Error(`Missing update-taptap-mcp skill after copy: ${skillPath}`);
  }

  const content = readFileSync(skillPath, 'utf8').replaceAll(LEGACY_PACKAGE, MAKER_PACKAGE);
  writeFileSync(skillPath, content, 'utf8');
}

function createPackageJson(version) {
  return {
    name: '@taptap/maker',
    version,
    type: 'module',
    description: 'TapTap Maker local development CLI and MCP server',
    main: 'dist/maker.js',
    bin: {
      'taptap-maker': 'bin/taptap-maker',
    },
    exports: {
      '.': './dist/maker.js',
      './package.json': './package.json',
    },
    files: [
      'bin/taptap-maker',
      'dist/maker.js',
      'skills/taptap-maker-local/',
      'skills/taptap-maker-dev-kit-guide/',
      'skills/update-taptap-mcp/',
      'README.md',
    ],
    keywords: ['taptap', 'maker', 'mcp', 'cli', 'game-development'],
    author: 'TapTap Team',
    license: 'MIT',
    publishConfig: {
      access: 'public',
    },
    engines: {
      node: '>=18.14.1',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/taptap/instant-games-open-mcp.git',
      directory: 'packages/maker',
    },
    homepage: 'https://github.com/taptap/instant-games-open-mcp/tree/main/packages/maker#readme',
    bugs: {
      url: 'https://github.com/taptap/instant-games-open-mcp/issues',
    },
  };
}

function createReadme(version) {
  return `# @taptap/maker

TapTap Maker local development CLI and MCP server.

## Usage

\`\`\`bash
npx -y @taptap/maker init
\`\`\`

Common commands:

\`\`\`bash
taptap-maker init
taptap-maker doctor
taptap-maker apps --json
taptap-maker pat set
taptap-maker install --ide codex,cursor,claude
taptap-maker mcp verify
taptap-maker dev-kit update
\`\`\`

\`taptap-maker install\` is a shortcut alias for \`taptap-maker mcp install\`.

This package contains only the Maker CLI/MCP bundle and Maker workflow skills.
It does not include the legacy TapTap Open API MCP server, proxy, native signer,
or OpenClaw plugin package contents.

Version: ${version}
`;
}

function main() {
  const { version } = parseArgs(process.argv.slice(2));
  const makerBundle = join(projectRoot, 'dist', 'maker.js');
  if (!existsSync(makerBundle)) {
    throw new Error(
      `Missing Maker bundle: ${makerBundle}\nRun this first: npm run build -- --skip-server --skip-proxy --skip-native`
    );
  }

  rmSync(packageRoot, { recursive: true, force: true });
  mkdirSync(packageRoot, { recursive: true });

  copyRequiredFile(
    join(projectRoot, 'bin', 'taptap-maker'),
    join(packageRoot, 'bin', 'taptap-maker'),
    'Maker bin'
  );
  chmodSync(join(packageRoot, 'bin', 'taptap-maker'), 0o755);
  copyRequiredFile(makerBundle, join(packageRoot, 'dist', 'maker.js'), 'Maker bundle');

  for (const skill of REQUIRED_SKILLS) {
    copyRequiredDirectory(
      join(projectRoot, 'skills', skill),
      join(packageRoot, 'skills', skill),
      `${skill} skill`
    );
  }
  rewriteMakerSkillPackageReferences(join(packageRoot, 'skills'));

  writeFileSync(
    join(packageRoot, 'package.json'),
    `${JSON.stringify(createPackageJson(version), null, 2)}\n`,
    'utf8'
  );
  writeFileSync(join(packageRoot, 'README.md'), createReadme(version), 'utf8');

  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  console.log(`Prepared ${packageJson.name}@${packageJson.version} at ${packageRoot}`);
  console.log('Included: bin/taptap-maker, dist/maker.js, Maker skills, README.md');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
