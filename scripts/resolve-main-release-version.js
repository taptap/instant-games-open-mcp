#!/usr/bin/env node

/**
 * Resolve the main package version for the manual publish workflow.
 *
 * Empty manual input means auto-last-number: read npm latest, stay on the same
 * major/minor line, and publish the next available patch.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const PACKAGE_NAME = '@taptap/instant-games-open-mcp';
const NPM_VIEW_TIMEOUT_MS = 30 * 1000;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const RELEASE_BRANCHES = new Set(['main']);

function readEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function npmView(args) {
  return execFileSync('npm', ['view', PACKAGE_NAME, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: NPM_VIEW_TIMEOUT_MS,
  }).trim();
}

function npmVersionExists(version) {
  try {
    execFileSync('npm', ['view', `${PACKAGE_NAME}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NPM_VIEW_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

function readPublishedVersions() {
  const versions = JSON.parse(npmView(['versions', '--json']));
  if (Array.isArray(versions)) {
    return versions;
  }
  if (typeof versions === 'string' && versions) {
    return [versions];
  }
  return [];
}

function assertStableVersion(version) {
  if (!STABLE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid stable version: ${version}. Expected x.y.z, for example 1.24.7.`);
  }
}

function parseStableVersion(version) {
  assertStableVersion(version);
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function compareStableVersions(a, b) {
  const left = parseStableVersion(a);
  const right = parseStableVersion(b);
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function changesMajorOrMinor(previousVersion, nextVersion) {
  const previous = parseStableVersion(previousVersion);
  const next = parseStableVersion(nextVersion);
  return previous.major !== next.major || previous.minor !== next.minor;
}

function maxStablePatchForCurrentLine(currentVersion, publishedVersions) {
  const current = parseStableVersion(currentVersion);
  const sameLineVersions = publishedVersions
    .filter((version) => STABLE_VERSION_PATTERN.test(version))
    .filter((version) => {
      const parsed = parseStableVersion(version);
      return parsed.major === current.major && parsed.minor === current.minor;
    });

  return sameLineVersions.reduce((maxVersion, version) => {
    return compareStableVersions(version, maxVersion) > 0 ? version : maxVersion;
  }, currentVersion);
}

function incrementPatch(version) {
  const parsed = parseStableVersion(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function assertReleaseBranch(branch) {
  if (!RELEASE_BRANCHES.has(branch)) {
    throw new Error(
      `${PACKAGE_NAME} latest can only be published from main; current branch: ${
        branch || '(unknown)'
      }`
    );
  }
}

function resolveAutoVersion(currentVersion, publishedVersions) {
  const autoBase = maxStablePatchForCurrentLine(currentVersion, publishedVersions);
  return incrementPatch(autoBase);
}

function resolveManualVersion(currentVersion) {
  const version = readEnv('MAIN_MANUAL_VERSION').trim();
  assertStableVersion(version);

  if (compareStableVersions(version, currentVersion) < 0) {
    throw new Error(
      `Manual target version ${version} must be greater than or equal to current online latest ${currentVersion}.`
    );
  }

  return version;
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`, 'utf8');
  }
}

function main() {
  const branch = readEnv('GITHUB_REF_NAME');
  assertReleaseBranch(branch);

  const currentVersion = npmView(['dist-tags.latest']);
  assertStableVersion(currentVersion);

  const publishedVersions = readPublishedVersions();
  const manualVersion = readEnv('MAIN_MANUAL_VERSION').trim();
  const version = manualVersion
    ? resolveManualVersion(currentVersion)
    : resolveAutoVersion(currentVersion, publishedVersions);

  if (!manualVersion && npmVersionExists(version)) {
    throw new Error(`${PACKAGE_NAME}@${version} already exists on npm.`);
  }

  const majorMinorChanged = changesMajorOrMinor(currentVersion, version);

  writeOutput('version', version);
  writeOutput('current_version', currentVersion);
  writeOutput('major_minor_changed', String(majorMinorChanged));
  writeOutput('mode', manualVersion ? 'manual' : 'auto-last-number');
  writeOutput('should_release', 'true');

  console.log(`Current online ${PACKAGE_NAME}@latest version: ${currentVersion}`);
  console.log(`Resolved ${PACKAGE_NAME} version: ${version}`);
  console.log(`Version mode: ${manualVersion ? 'manual' : 'auto-last-number'}`);
  console.log(`Major/minor changed: ${majorMinorChanged}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
