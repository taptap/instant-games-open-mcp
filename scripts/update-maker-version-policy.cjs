#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POLICY_FILE = path.join(__dirname, '..', 'config', 'maker-version-policy.json');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseArgs(argv) {
  const parsed = {
    file: DEFAULT_POLICY_FILE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tag' || arg === '--version' || arg === '--file' || arg === '--updated-at') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}.`);
      }
      parsed[toCamelCase(arg.slice(2))] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.tag) {
    throw new Error('Missing required --tag.');
  }
  if (!parsed.version) {
    throw new Error('Missing required --version.');
  }

  return parsed;
}

function updateMakerVersionPolicy(options) {
  const tag = options.tag;
  const version = options.version;
  const file = path.resolve(options.file || DEFAULT_POLICY_FILE);
  const field = tag === 'latest' ? 'latest' : tag === 'beta' ? 'latest_beta' : undefined;

  assertValidVersion(version);
  assertVersionMatchesTag(tag, version);

  if (!field) {
    return {
      changed: false,
      field: undefined,
      version,
    };
  }

  const policy = readPolicy(file);
  assertPolicy(policy, file);

  if (policy[field] === version) {
    return {
      changed: false,
      field,
      version,
    };
  }

  const nextPolicy = {
    ...policy,
    [field]: version,
    updated_at: options.updatedAt || new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(nextPolicy, null, 2)}\n`, 'utf8');

  return {
    changed: true,
    field,
    version,
  };
}

function readPolicy(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to read Maker version policy ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function assertPolicy(policy, file) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error(`Invalid Maker version policy ${file}: expected JSON object.`);
  }
  if (policy.schema_version !== 1) {
    throw new Error(`Invalid Maker version policy ${file}: schema_version must be 1.`);
  }
  for (const field of ['latest', 'latest_beta', 'minimum_supported']) {
    assertValidVersion(policy[field], `policy.${field}`);
  }
  if (
    !Array.isArray(policy.blacklist) ||
    policy.blacklist.some((item) => typeof item !== 'string' || !VERSION_PATTERN.test(item))
  ) {
    throw new Error(`Invalid Maker version policy ${file}: blacklist must be a semver string array.`);
  }
}

function assertValidVersion(version, label = 'version') {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid ${label}: ${version}. Expected semver like 0.0.1 or 0.0.1-beta.1.`);
  }
}

function assertVersionMatchesTag(tag, version) {
  const isPrerelease = version.includes('-');
  if (tag === 'latest' && isPrerelease) {
    throw new Error(`Invalid latest version: ${version}. The latest tag must publish a stable version.`);
  }
  if (tag === 'beta' && !isPrerelease) {
    throw new Error(`Invalid beta version: ${version}. The beta tag must publish a prerelease version.`);
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function writeGithubOutput(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  fs.appendFileSync(outputPath, `changed=${String(result.changed)}\n`, 'utf8');
  fs.appendFileSync(outputPath, `field=${result.field || ''}\n`, 'utf8');
  fs.appendFileSync(outputPath, `version=${result.version}\n`, 'utf8');
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = updateMakerVersionPolicy({
    file: parsed.file,
    tag: parsed.tag,
    version: parsed.version,
    updatedAt: parsed.updatedAt,
  });
  writeGithubOutput(result);

  if (result.changed) {
    console.log(`Updated Maker version policy ${result.field} to ${result.version}.`);
  } else {
    console.log(`Maker version policy unchanged for tag ${parsed.tag}.`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  updateMakerVersionPolicy,
};
