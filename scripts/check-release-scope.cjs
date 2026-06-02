#!/usr/bin/env node
'use strict';

const { appendFileSync } = require('node:fs');
const {
  classifyFiles,
  hasMakerMarker,
  readChangedFiles,
  readTreeFiles,
  shouldSkipLegacyRelease,
} = require('./release-scope.cjs');

const ZERO_SHA_PATTERN = /^0{40}$/;

function parseArgs(argv) {
  const args = { mode: 'pr', base: '', head: 'HEAD', title: '', range: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index] || '';
    else if (arg === '--base') args.base = argv[++index] || '';
    else if (arg === '--head') args.head = argv[++index] || 'HEAD';
    else if (arg === '--title') args.title = argv[++index] || '';
    else if (arg === '--range') args.range = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.base) {
    throw new Error('Missing --base <sha>');
  }
  return args;
}

function isZeroSha(value) {
  return ZERO_SHA_PATTERN.test(String(value || ''));
}

function readFilesForMode(args) {
  if (args.mode === 'push' && isZeroSha(args.base)) {
    return readTreeFiles(args.head);
  }
  const rangeMode = args.range || (args.mode === 'pr' ? 'three-dot' : 'two-dot');
  return readChangedFiles(args.base, args.head, rangeMode);
}

function writeGithubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
  }
}

function validatePrScope({ files, title }) {
  const classification = classifyFiles(files);
  const markerPresent = hasMakerMarker(title);

  if (
    classification.hasMakerChanges &&
    classification.hasNonMakerChanges &&
    !classification.onlyReleaseInfrastructureChanged
  ) {
    return {
      ok: false,
      reason: 'Maker-owned paths and main package paths must be changed in separate PRs.',
      classification,
    };
  }

  if (
    classification.onlyMakerChanged &&
    !classification.onlyReleaseInfrastructureChanged &&
    !markerPresent
  ) {
    return {
      ok: false,
      reason: 'Maker-only PRs must include `(maker)` in the PR title.',
      classification,
    };
  }

  if (markerPresent && !classification.onlyMakerChanged) {
    return {
      ok: false,
      reason: '`(maker)` PRs may only modify Maker-owned paths.',
      classification,
    };
  }

  return {
    ok: true,
    reason: 'Release scope is valid.',
    classification,
  };
}

function evaluatePushScope({ files, markerText }) {
  return shouldSkipLegacyRelease({ files, markerText });
}

function printClassification(classification) {
  console.log(`Changed files: ${classification.files.length}`);
  console.log(`Maker files: ${classification.makerFiles.length}`);
  console.log(`Non-Maker files: ${classification.nonMakerFiles.length}`);
  if (classification.nonMakerFiles.length > 0) {
    console.log('Non-Maker files:');
    for (const file of classification.nonMakerFiles) {
      console.log(`- ${file}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = readFilesForMode(args);

  if (args.mode === 'push') {
    const result = evaluatePushScope({ files, markerText: args.title });
    writeGithubOutput('skip_legacy_release', String(result.skipLegacyRelease));
    writeGithubOutput('only_maker_changed', String(result.onlyMakerChanged));
    writeGithubOutput('has_maker_marker', String(result.hasMakerMarker));
    writeGithubOutput('non_maker_files', result.nonMakerFiles.join(','));
    console.log(`skip_legacy_release=${result.skipLegacyRelease}`);
    console.log(`only_maker_changed=${result.onlyMakerChanged}`);
    console.log(`has_maker_marker=${result.hasMakerMarker}`);
    printClassification(result);
    return;
  }

  const result = validatePrScope({ files, title: args.title });
  console.log(result.reason);
  printClassification(result.classification);
  if (!result.ok) {
    process.exit(1);
  }
}

module.exports = { evaluatePushScope, isZeroSha, readFilesForMode, validatePrScope };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
