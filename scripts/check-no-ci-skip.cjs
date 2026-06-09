#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const SKIP_DIRECTIVE_PATTERN = /\[(?:skip ci|ci skip|skip actions|actions skip|no ci)\]/i;

function usage() {
  console.error(
    'Usage: node scripts/check-no-ci-skip.cjs --message <message> | --from <sha> --to <sha>'
  );
}

function readArgs(argv) {
  const args = { messages: [], from: '', to: '' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === '--message') {
      if (!value) {
        usage();
        process.exit(2);
      }
      args.messages.push(value);
      index += 1;
      continue;
    }

    if (arg === '--from') {
      args.from = value || '';
      index += 1;
      continue;
    }

    if (arg === '--to') {
      args.to = value || '';
      index += 1;
      continue;
    }

    usage();
    process.exit(2);
  }

  return args;
}

function readCommitMessages(from, to) {
  if (!from || !to) {
    usage();
    process.exit(2);
  }

  return [
    execFileSync('git', ['log', '--format=%B%x00', from + '..' + to], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ];
}

function findViolation(messages) {
  for (const message of messages) {
    const match = SKIP_DIRECTIVE_PATTERN.exec(message);
    if (match) {
      return match[0];
    }
  }
  return '';
}

const args = readArgs(process.argv.slice(2));
const messages = args.messages.length > 0 ? args.messages : readCommitMessages(args.from, args.to);
const directive = findViolation(messages);

if (directive) {
  console.error(
    'CI skip directives are not allowed in PR commit messages: ' +
      directive +
      '. Required checks must run for every PR.'
  );
  process.exit(1);
}
