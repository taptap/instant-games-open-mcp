#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { readCommitFiles, shouldSkipLegacyRelease } = require('./release-scope.cjs');

const TYPE_SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['revert', 'Reverts'],
  ['docs', 'Documentation'],
  ['style', 'Styles'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['test', 'Tests'],
  ['chore', 'Chores'],
];

const IGNORED_RELEASE_NOTES_PATTERN = /^(Initial plan|WIP|TODO|FIXME)\b[:\s]?.*/i;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function getLastTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
  } catch {
    return '';
  }
}

function parseLog(range) {
  const args = ['log', '--format=%H%x1f%s%x1f%b%x1e'];
  if (range) {
    args.push(range);
  }
  const output = git(args);
  if (!output) {
    return [];
  }
  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, body = ''] = entry.split('\x1f');
      return { hash, subject, body, message: `${subject}\n\n${body}`.trim() };
    });
}

function parseConventionalSubject(subject) {
  const match = /^([a-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/.exec(subject);
  if (!match) {
    return null;
  }
  return { type: match[1], scope: match[2] || '', summary: match[3] };
}

function filterMainCommits(commits) {
  return filterReleaseNotesCommits(
    commits.filter((commit) => {
      const files = readCommitFiles(commit.hash);
      return !shouldSkipLegacyRelease({ files, markerText: commit.message }).skipLegacyRelease;
    })
  );
}

function shouldIgnoreReleaseNotesCommit(commit) {
  return IGNORED_RELEASE_NOTES_PATTERN.test(String(commit.message || commit.subject || '').trim());
}

function filterReleaseNotesCommits(commits) {
  return commits.filter((commit) => !shouldIgnoreReleaseNotesCommit(commit));
}

function formatCommit(commit) {
  const parsed = parseConventionalSubject(commit.subject);
  const label = parsed
    ? `${parsed.scope ? `${parsed.scope}: ` : ''}${parsed.summary}`
    : commit.subject;
  return `* ${label} (${commit.hash.slice(0, 7)})`;
}

function buildReleaseNotes({ version, commits, date = new Date() }) {
  const dateText = date.toISOString().slice(0, 10);
  const lines = [`## <small>${version} (${dateText})</small>`, ''];
  const releaseNotesCommits = filterReleaseNotesCommits(commits);
  const conventional = releaseNotesCommits
    .map((commit) => ({ commit, parsed: parseConventionalSubject(commit.subject) }))
    .filter((item) => item.parsed);

  for (const [type, section] of TYPE_SECTIONS) {
    const group = conventional.filter((item) => item.parsed.type === type);
    if (group.length === 0) {
      continue;
    }
    lines.push(`### ${section}`, '');
    for (const item of group) {
      lines.push(formatCommit(item.commit));
    }
    lines.push('');
  }

  const uncategorized = releaseNotesCommits.filter(
    (commit) => !parseConventionalSubject(commit.subject)
  );
  if (uncategorized.length > 0) {
    lines.push('### Other Changes', '');
    for (const commit of uncategorized) {
      lines.push(formatCommit(commit));
    }
    lines.push('');
  }

  if (releaseNotesCommits.length === 0) {
    lines.push('* No main package changes after filtering Maker-only commits.', '');
  }

  return `${lines.join('\n').trim()}\n\n`;
}

function prependChangelog(notes, changelogPath = 'CHANGELOG.md') {
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
  writeFileSync(changelogPath, `${notes}${existing.replace(/^\s+/, '')}`, 'utf8');
}

function main() {
  const version = process.env.RELEASE_VERSION;
  if (!version) {
    throw new Error('Missing RELEASE_VERSION.');
  }

  const lastTag = process.env.LAST_RELEASE_TAG || getLastTag();
  const range = lastTag ? `${lastTag}..HEAD` : '';
  const commits = filterMainCommits(parseLog(range));
  const notes = buildReleaseNotes({ version, commits });

  writeFileSync('release-notes.md', notes, 'utf8');
  prependChangelog(notes);
  console.log(`Generated filtered main package release notes for ${version}.`);
  console.log(`Included commits: ${commits.length}`);
}

module.exports = {
  buildReleaseNotes,
  filterReleaseNotesCommits,
  filterMainCommits,
  parseConventionalSubject,
  shouldIgnoreReleaseNotesCommit,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
