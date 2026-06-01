#!/usr/bin/env node

/**
 * Resolve the @taptap/maker version for the manual publish workflow.
 *
 * Manual mode requires an exact repeated target-version confirmation. Auto mode
 * only increments the final numeric segment on long-lived release branches.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const PACKAGE_NAME = '@taptap/maker';
const FIRST_BETA_VERSION = '0.0.1-beta.1';
const NPM_VIEW_TIMEOUT_MS = 30 * 1000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELEASE_BRANCHES = new Set(['main', 'beta']);

function readEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function assertValidVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version: ${version}. Expected semver like 0.0.1 or 0.0.1-beta.1.`);
  }
}

function parseVersionCore(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`Invalid version core: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function changesMajorOrMinor(previousVersion, nextVersion) {
  const previous = parseVersionCore(previousVersion);
  const next = parseVersionCore(nextVersion);
  return previous.major !== next.major || previous.minor !== next.minor;
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
  try {
    const versions = JSON.parse(npmView(['versions', '--json']));
    if (Array.isArray(versions)) {
      return versions;
    }
    if (typeof versions === 'string' && versions) {
      return [versions];
    }
    return [];
  } catch {
    return [];
  }
}

function readCurrentDistTagVersion(tag) {
  try {
    return npmView([`dist-tags.${tag}`]);
  } catch {
    return '';
  }
}

function resolveManualVersion(currentVersion) {
  const version = readEnv('MAKER_MANUAL_VERSION').trim();
  const confirmation = readEnv('MAKER_CONFIRM_VERSION').trim();

  if (!version) {
    throw new Error('Manual mode requires MAKER_MANUAL_VERSION.');
  }
  if (!confirmation) {
    throw new Error('Manual mode requires MAKER_CONFIRM_VERSION.');
  }
  if (version !== confirmation) {
    throw new Error(
      `Manual version confirmation mismatch: version=${version}, confirm_version=${confirmation}`
    );
  }

  assertValidVersion(version);

  if (currentVersion) {
    assertValidVersion(currentVersion);
  }

  return version;
}

function incrementFinalNumber(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `auto-last-number requires a stable three-segment version like 0.0.1; got ${version}`
    );
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function assertStableThreeSegmentVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `auto-last-number requires a stable three-segment version like 0.0.1; got ${version}`
    );
  }
}

function assertReleaseBranch(branch) {
  if (!RELEASE_BRANCHES.has(branch)) {
    throw new Error(
      `@taptap/maker can only be published from main or beta; current branch: ${branch || '(unknown)'}`
    );
  }
}

function assertAutoReleaseBranch(branch) {
  if (!RELEASE_BRANCHES.has(branch)) {
    throw new Error(
      `auto-last-number mode is only allowed from main or beta; current branch: ${branch || '(unknown)'}`
    );
  }
}

function maxStablePatchForCurrentLine(currentVersion, publishedVersions) {
  const current = parseVersionCore(currentVersion);
  const stableVersions = publishedVersions
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .map((version) => ({ version, core: parseVersionCore(version) }))
    .filter(({ core }) => core.major === current.major && core.minor === current.minor);

  return stableVersions.reduce((maxVersion, { version, core }) => {
    const max = parseVersionCore(maxVersion);
    return core.patch > max.patch ? version : maxVersion;
  }, currentVersion);
}

function resolveAutoVersion(tag, hasPublishedVersions, publishedVersions) {
  const branch = readEnv('GITHUB_REF_NAME');
  assertAutoReleaseBranch(branch);

  if (!hasPublishedVersions) {
    throw new Error(
      `${PACKAGE_NAME} has no published versions. First publish must use manual ${FIRST_BETA_VERSION}.`
    );
  }

  let current;
  try {
    current = npmView([`dist-tags.${tag}`]);
  } catch (error) {
    throw new Error(
      [
        `Cannot resolve current ${PACKAGE_NAME}@${tag} dist-tag for auto mode.`,
        'Use manual mode for the first publish or when changing version shape.',
        error instanceof Error ? error.message : String(error),
      ].join('\n')
    );
  }

  assertValidVersion(current);
  assertStableThreeSegmentVersion(current);
  const autoBase = maxStablePatchForCurrentLine(current, publishedVersions);
  const next = incrementFinalNumber(autoBase);
  assertValidVersion(next);
  return next;
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`, 'utf8');
  }
}

function main() {
  const mode = readEnv('MAKER_VERSION_MODE', 'manual');
  const tag = readEnv('MAKER_NPM_TAG', 'beta');

  if (!['manual', 'auto-last-number'].includes(mode)) {
    throw new Error(`Unsupported version mode: ${mode}`);
  }

  const branch = readEnv('GITHUB_REF_NAME');
  const publishedVersions = readPublishedVersions();
  const hasPublishedVersions = publishedVersions.length > 0;
  const currentVersion = hasPublishedVersions ? readCurrentDistTagVersion(tag) : '';
  if (mode === 'manual') {
    assertReleaseBranch(branch);
  }
  const version =
    mode === 'manual'
      ? resolveManualVersion(currentVersion)
      : resolveAutoVersion(tag, hasPublishedVersions, publishedVersions);
  const majorMinorChanged = Boolean(
    mode === 'manual' && currentVersion && changesMajorOrMinor(currentVersion, version)
  );

  if (!hasPublishedVersions && (tag !== 'beta' || version !== FIRST_BETA_VERSION)) {
    throw new Error(
      `First publish must use tag=beta and version=${FIRST_BETA_VERSION}; got tag=${tag}, version=${version}.`
    );
  }

  if (npmVersionExists(version)) {
    throw new Error(`${PACKAGE_NAME}@${version} already exists on npm.`);
  }

  writeOutput('version', version);
  writeOutput('current_version', currentVersion);
  writeOutput('major_minor_changed', String(majorMinorChanged));
  console.log(`Resolved ${PACKAGE_NAME} version: ${version}`);
  if (currentVersion) {
    console.log(`Current online ${PACKAGE_NAME}@${tag} version: ${currentVersion}`);
  }
  console.log(`Major/minor changed: ${majorMinorChanged}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
