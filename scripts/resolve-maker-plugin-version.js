#!/usr/bin/env node

const TAG_PREFIX = 'maker-plugin-v';
const TAG_PATTERN = /^maker-plugin-v(\d+)\.(\d+)\.(\d+)$/;

function parseArgs(argv) {
  let latestTag;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--latest-tag') {
      latestTag = argv[index + 1];
      if (!latestTag) {
        throw new Error('Missing value for --latest-tag.');
      }
      index += 1;
      continue;
    }
    if (option === '--json') {
      json = true;
      continue;
    }
    throw new Error(
      'Usage: node scripts/resolve-maker-plugin-version.js [--latest-tag <tag|none>] [--json]'
    );
  }
  return { latestTag: latestTag === 'none' ? null : latestTag, json };
}

function resolveNextVersion(latestTag) {
  if (!latestTag) {
    return '0.0.1';
  }
  const match = TAG_PATTERN.exec(latestTag);
  if (!match) {
    throw new Error(`Invalid Maker plugin release tag: ${latestTag}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function main() {
  const { latestTag, json } = parseArgs(process.argv.slice(2));
  const version = resolveNextVersion(latestTag);
  const result = {
    latest_tag: latestTag,
    version,
    tag: `${TAG_PREFIX}${version}`,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`${version}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
