#!/usr/bin/env node

/**
 * Resolve the DSH plugin release version from `packages/dsh-maker/package.json`.
 *
 * - stable: version = base (e.g. 0.1.0), tag = dsh-maker-v0.1.0
 * - dev:    version = <base|base+1patch>-dev.<run-number>, tag = dsh-maker-v<version>
 *
 * The dev channel never occupies a stable tag; `--latest-tag` (the stable base
 * tag) triggers a patch increment so a subsequent main release stays ahead.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = join(__dirname, '..', 'packages', 'dsh-maker', 'package.json');
const TAG_PREFIX = 'dsh-maker-v';
const STABLE_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseArgs(argv) {
  let channel = 'stable';
  let runNumber;
  let latestTag = 'none';
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === '--channel' && value) {
      channel = value;
      index += 1;
      continue;
    }
    if (option === '--run-number' && value) {
      runNumber = value;
      index += 1;
      continue;
    }
    if (option === '--latest-tag' && value) {
      latestTag = value;
      index += 1;
      continue;
    }
    if (option === '--json') {
      json = true;
      continue;
    }
    throw new Error(
      'Usage: node scripts/resolve-dsh-maker-version.js [--channel stable|dev] [--run-number <n>] [--latest-tag <tag|none>] [--json]'
    );
  }
  if (channel !== 'stable' && channel !== 'dev') {
    throw new Error(`Unsupported release channel: ${channel}`);
  }
  if (channel === 'dev' && (!runNumber || !/^\d+$/.test(runNumber))) {
    throw new Error('dev channel requires a numeric --run-number.');
  }
  return { channel, runNumber, latestTag, json };
}

function readBaseVersion() {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const version = manifest.version;
  if (!STABLE_PATTERN.test(version || '')) {
    throw new Error(`@taptap/dsh-maker version must be a stable x.y.z, got: ${String(version)}`);
  }
  return version;
}

function incrementPatch(version) {
  const match = STABLE_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Cannot increment non-stable version: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function resolveVersion({ channel, runNumber, latestTag }) {
  const base = readBaseVersion();
  if (channel === 'stable') {
    return { version: base, tag: `${TAG_PREFIX}${base}`, base_version: base, prerelease: false };
  }
  const next =
    latestTag !== 'none' && latestTag.startsWith(TAG_PREFIX) ? incrementPatch(base) : base;
  const version = `${next}-dev.${runNumber}`;
  return {
    version,
    tag: `${TAG_PREFIX}${version}`,
    base_version: base,
    prerelease: true,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = resolveVersion(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`${result.version}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
