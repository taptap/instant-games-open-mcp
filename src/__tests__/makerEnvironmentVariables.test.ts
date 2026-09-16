import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const referencePath = path.join(projectRoot, 'docs', 'MAKER_ENVIRONMENT_VARIABLES.md');
const sourceRoots = [
  path.join(projectRoot, 'src', 'maker'),
  path.join(projectRoot, 'scripts'),
  path.join(projectRoot, 'plugin-sources', 'taptap-maker'),
  path.join(projectRoot, 'packages', 'dsh-maker'),
];
const scannedExtensions = new Set([
  '.ts',
  '.js',
  '.cjs',
  '.mjs',
  '.sh',
  '.cmd',
  '.json',
  '.yml',
  '.yaml',
  '.md',
]);

describe('Maker environment variable reference', () => {
  test('documents every Maker-owned environment variable used by source and plugin integrations', () => {
    const reference = fs.readFileSync(referencePath, 'utf8');
    const variables = new Set<string>();

    for (const root of sourceRoots) {
      for (const filePath of listFiles(root)) {
        if (!scannedExtensions.has(path.extname(filePath)) || filePath.includes('/dist/')) {
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        for (const match of content.matchAll(/\bTAPTAP_MAKER_[A-Z0-9_]+\b/gu)) {
          variables.add(match[0]);
        }
      }
    }

    const undocumented = [...variables]
      .sort()
      .filter((variable) => !reference.includes(`\`${variable}\``));
    expect(undocumented).toEqual([]);
  });

  test('documents shared, compatibility, host, and release variables used by Maker', () => {
    const reference = fs.readFileSync(referencePath, 'utf8');
    const requiredVariables = [
      'TAPTAP_MCP_ENV',
      'TAPTAP_MCP_CLIENT_ID',
      'TAPTAP_MCP_CLIENT_SECRET',
      'TAPTAP_MCP_CLIENT_IDE',
      'TDS_MCP_ENV',
      'TDS_MCP_CLIENT_ID',
      'TDS_MCP_CLIENT_TOKEN',
      'MAKER_PAT',
      'PAT',
      'MAKER_JWT',
      'JWT',
      'MAKER_PROJECT_ID',
      'SCE_MCP_URL',
      'DSH_HOME',
      'DSH_TAPTAP_MAKER_BIN',
      'CODEBUDDY_PLUGIN_ROOT',
      'WORKBUDDY_EXTRA_PATHS',
      'WORKBUDDY_CONFIG_DIR',
      'CODEBUDDY_CONFIG_DIR',
      'MAKER_PACKAGE_VERSION',
      'MAKER_BUNDLE_OUTFILE',
      'MAKER_VERSION_MODE',
      'MAKER_MANUAL_VERSION',
      'MAKER_NPM_TAG',
    ];

    const undocumented = requiredVariables.filter(
      (variable) => !reference.includes(`\`${variable}\``)
    );
    expect(undocumented).toEqual([]);
  });
});

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}
