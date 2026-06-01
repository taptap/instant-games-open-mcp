'use strict';

const commitAnalyzer = require('@semantic-release/commit-analyzer');
const { readCommitFiles, shouldSkipLegacyRelease } = require('./release-scope.cjs');

function isMakerOnlyReleaseCommit(commit, logger) {
  const markerText = commit.message || commit.subject || '';
  if (!commit.hash) {
    logger.log('Keeping commit without hash during release analysis: %s', markerText.split('\n')[0]);
    return false;
  }

  const files = readCommitFiles(commit.hash);
  return shouldSkipLegacyRelease({ files, markerText }).skipLegacyRelease;
}

function filterMainPackageCommits(commits, logger) {
  const kept = [];
  const skipped = [];

  for (const commit of commits) {
    if (isMakerOnlyReleaseCommit(commit, logger)) {
      skipped.push(commit);
    } else {
      kept.push(commit);
    }
  }

  if (skipped.length > 0) {
    logger.log('Ignoring %d Maker-only commit(s) for main package release analysis.', skipped.length);
    for (const commit of skipped) {
      logger.log('- %s', (commit.subject || commit.message || '').split('\n')[0]);
    }
  }

  return kept;
}

async function analyzeCommits(pluginConfig, context) {
  const commits = filterMainPackageCommits(context.commits || [], context.logger);
  return commitAnalyzer.analyzeCommits(pluginConfig, {
    ...context,
    commits,
  });
}

module.exports = {
  analyzeCommits,
  filterMainPackageCommits,
  isMakerOnlyReleaseCommit,
};
