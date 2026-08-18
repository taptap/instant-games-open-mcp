#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function parseArgs(argv) {
  let version;
  let policyPath = resolve('config/maker-plugin-version.json');
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if ((option === '--version' || option === '--policy-path') && value) {
      if (option === '--version') {
        version = value;
      } else {
        policyPath = resolve(value);
      }
      index += 1;
      continue;
    }
    throw new Error(
      'Usage: node scripts/update-maker-plugin-version.js --version <x.y.z> [--policy-path <path>]'
    );
  }
  if (!VERSION_PATTERN.test(version || '')) {
    throw new Error(`Invalid Maker plugin version: ${String(version)}. Expected stable x.y.z.`);
  }
  return { version, policyPath };
}

function main() {
  const { version, policyPath } = parseArgs(process.argv.slice(2));
  const current = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (current.schema_version !== 1 || typeof current.version !== 'string') {
    throw new Error(`Invalid Maker plugin version policy: ${policyPath}`);
  }
  writeFileSync(policyPath, `${JSON.stringify({ schema_version: 1, version }, null, 2)}\n`, 'utf8');
  process.stdout.write(`Updated Maker plugin version to ${version}.\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
