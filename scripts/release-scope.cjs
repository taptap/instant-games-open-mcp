'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAKER_MARKER_PATTERN = /\(maker\)/i;

const MAKER_PATH_PREFIXES = [
  'packages/maker/',
  'packages/dsh-maker/',
  'plugin-sources/taptap-maker/',
  'plugins/taptap-maker/',
  'plugins/workbuddy/taptap-maker/',
  'src/maker/',
  'skills/taptap-maker-local/',
  'skills/taptap-maker-dev-kit-guide/',
  'skills/update-taptap-mcp/',
];

const MAKER_EXACT_PATHS = new Set([
  '.agents/plugins/marketplace.json',
  '.codebuddy-plugin/marketplace.json',
  '.github/workflows/prepare-maker-plugin-release.yml',
  '.github/workflows/publish-maker-plugin.yml',
  '.github/workflows/publish-dsh-maker-plugin.yml',
  '.github/workflows/publish-maker.yml',
  'bin/taptap-maker',
  'config/maker-plugin-version.json',
  'config/maker-version-policy.json',
  'docs/MAKER.md',
  'docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md',
  'docs/DSH_PLUGIN.md',
  'docs/DSH_PLUGIN_RESEARCH.md',
  'scripts/bundle-maker.js',
  'scripts/package-maker-client-plugins.js',
  'scripts/package-maker-dsh-plugin.js',
  'scripts/prepare-maker-package.js',
  'scripts/prepare-maker-codex-plugin.js',
  'scripts/prepare-maker-workbuddy-plugin.js',
  'scripts/resolve-maker-plugin-version.js',
  'scripts/resolve-maker-version.js',
  'scripts/update-maker-plugin-version.js',
  'scripts/update-maker-version-policy.cjs',
]);

const RELEASE_INFRA_EXACT_PATHS = new Set([
  '.github/workflows/claude-review.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/pr.yml',
  '.github/workflows/release.yml',
  '.github/workflows/publish-maker.yml',
  '.github/workflows/prepare-maker-plugin-release.yml',
  '.github/workflows/publish-maker-plugin.yml',
  '.github/workflows/publish-dsh-maker-plugin.yml',
  '.releaserc.cjs',
  'CONTRIBUTING.md',
  'README.md',
  'config/maker-version-policy.json',
  'docs/CI_CD.md',
  'docs/MAKER.md',
  'package-lock.json',
  'package.json',
  'scripts/check-release-scope.cjs',
  'scripts/generate-main-release-notes.cjs',
  'scripts/release-scope.cjs',
  'scripts/resolve-main-release-version.js',
  'scripts/resolve-maker-version.js',
  'scripts/update-maker-version-policy.cjs',
  'scripts/semantic-release-main-analyzer.cjs',
  'src/__tests__/mainPackageManifest.test.ts',
  'src/__tests__/mainReleaseVersionPolicy.test.ts',
  'src/__tests__/mainReleaseNotes.test.ts',
  'src/__tests__/makerVersionPolicy.test.ts',
  'src/__tests__/makerPluginReleaseWorkflow.test.ts',
  'src/__tests__/releaseScope.test.ts',
  'src/__tests__/releaseScopeCli.test.ts',
  'src/__tests__/semanticReleaseMainAnalyzer.test.ts',
]);

function normalizeGitPath(filePath) {
  return String(filePath || '')
    .replaceAll(path.sep, '/')
    .replace(/^\.\/+/, '');
}

function hasMakerMarker(text) {
  return MAKER_MARKER_PATTERN.test(String(text || ''));
}

function isMakerOwnedPath(filePath) {
  const normalized = normalizeGitPath(filePath);
  if (!normalized) {
    return false;
  }
  if (MAKER_EXACT_PATHS.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('src/__tests__/maker') && normalized.endsWith('.ts')) {
    return true;
  }
  return MAKER_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isReleaseInfrastructurePath(filePath) {
  return RELEASE_INFRA_EXACT_PATHS.has(normalizeGitPath(filePath));
}

function classifyFiles(files) {
  const normalizedFiles = files.map(normalizeGitPath).filter(Boolean);
  const makerFiles = normalizedFiles.filter(isMakerOwnedPath);
  const nonMakerFiles = normalizedFiles.filter((file) => !isMakerOwnedPath(file));
  const releaseInfrastructureFiles = normalizedFiles.filter(isReleaseInfrastructurePath);

  return {
    files: normalizedFiles,
    makerFiles,
    nonMakerFiles,
    releaseInfrastructureFiles,
    hasChanges: normalizedFiles.length > 0,
    onlyMakerChanged: normalizedFiles.length > 0 && nonMakerFiles.length === 0,
    hasMakerChanges: makerFiles.length > 0,
    hasNonMakerChanges: nonMakerFiles.length > 0,
    onlyReleaseInfrastructureChanged:
      normalizedFiles.length > 0 && releaseInfrastructureFiles.length === normalizedFiles.length,
  };
}

function readChangedFiles(baseRef, headRef = 'HEAD', rangeMode = 'two-dot') {
  const separator = rangeMode === 'three-dot' ? '...' : '..';
  const output = execFileSync('git', ['diff', '--name-only', `${baseRef}${separator}${headRef}`], {
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

function readTreeFiles(headRef = 'HEAD') {
  const output = execFileSync('git', ['diff', '--name-only', EMPTY_TREE_SHA, headRef], {
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

function readCommitFiles(commitSha) {
  const output = execFileSync(
    'git',
    ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commitSha],
    { encoding: 'utf8' }
  );
  return output.split('\n').filter(Boolean);
}

function shouldSkipLegacyRelease({ files, markerText }) {
  const fileClassification = classifyFiles(files);
  return {
    ...fileClassification,
    hasMakerMarker: hasMakerMarker(markerText),
    skipLegacyRelease: fileClassification.onlyMakerChanged,
  };
}

module.exports = {
  EMPTY_TREE_SHA,
  MAKER_MARKER_PATTERN,
  classifyFiles,
  hasMakerMarker,
  isMakerOwnedPath,
  isReleaseInfrastructurePath,
  normalizeGitPath,
  readChangedFiles,
  readCommitFiles,
  readTreeFiles,
  shouldSkipLegacyRelease,
};
