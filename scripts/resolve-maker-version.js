#!/usr/bin/env node

/**
 * Resolve the @taptap/maker version for the manual publish workflow.
 *
 * Manual mode requires an exact repeated confirmation. Auto mode only increments
 * the final numeric segment from the current npm dist-tag version.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const PACKAGE_NAME = '@taptap/maker';
const FIRST_BETA_VERSION = '0.0.1-beta.1';
const NPM_VIEW_TIMEOUT_MS = 30 * 1000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function assertValidVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version: ${version}. Expected semver like 0.0.1 or 0.0.1-beta.1.`);
  }
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

function packageHasPublishedVersions() {
  try {
    npmView(['versions', '--json']);
    return true;
  } catch {
    return false;
  }
}

function resolveManualVersion() {
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
  return version;
}

function incrementFinalNumber(version) {
  const match = /^(.*?)(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Cannot auto-increment version without a final numeric segment: ${version}`);
  }
  const [, prefix, lastNumber] = match;
  return `${prefix}${Number(lastNumber) + 1}`;
}

function resolveAutoVersion(tag, hasPublishedVersions) {
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
  const next = incrementFinalNumber(current);
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

  const hasPublishedVersions = packageHasPublishedVersions();
  const version =
    mode === 'manual' ? resolveManualVersion() : resolveAutoVersion(tag, hasPublishedVersions);

  if (!hasPublishedVersions && (tag !== 'beta' || version !== FIRST_BETA_VERSION)) {
    throw new Error(
      `First publish must use tag=beta and version=${FIRST_BETA_VERSION}; got tag=${tag}, version=${version}.`
    );
  }

  if (npmVersionExists(version)) {
    throw new Error(`${PACKAGE_NAME}@${version} already exists on npm.`);
  }

  writeOutput('version', version);
  console.log(`Resolved ${PACKAGE_NAME} version: ${version}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
