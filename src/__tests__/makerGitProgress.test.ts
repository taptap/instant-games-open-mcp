/**
 * Maker git progress parsing tests.
 */

import { getMakerGitRetryDecision, parseGitProgressLine } from '../maker/cli/projects';

describe('maker git progress parsing', () => {
  test('parses percent progress from clone and push stderr lines', () => {
    expect(parseGitProgressLine('Receiving objects: 42% (42/100), 1.23 MiB | 2.34 MiB/s')).toEqual({
      progress: 42,
      total: 100,
      phase: 'git',
      message: 'Receiving objects: 42% (42/100), 1.23 MiB | 2.34 MiB/s',
    });

    expect(parseGitProgressLine('Writing objects: 7% (2/28), 512 bytes | 512.00 KiB/s')).toEqual({
      progress: 7,
      total: 100,
      phase: 'git',
      message: 'Writing objects: 7% (2/28), 512 bytes | 512.00 KiB/s',
    });
  });

  test('keeps useful git messages without inventing a percent', () => {
    expect(parseGitProgressLine("Cloning into '/tmp/game'...")).toEqual({
      phase: 'git',
      message: "Cloning into '/tmp/game'...",
    });
  });

  test('classifies transient git failures as retryable', () => {
    expect(
      getMakerGitRetryDecision('fatal: unable to access url: The requested URL returned error: 503')
    ).toEqual({
      retry: true,
      reason: 'remote_http_5xx',
    });

    expect(getMakerGitRetryDecision('RPC failed; curl 56 Recv failure: Connection reset')).toEqual({
      retry: true,
      reason: 'connection_interrupted',
    });

    expect(getMakerGitRetryDecision('Failed to connect to maker.taptap.cn timed out')).toEqual({
      retry: true,
      reason: 'network_or_timeout',
    });
  });

  test('does not retry auth, rejected remote, or local git failures', () => {
    expect(getMakerGitRetryDecision('fatal: Authentication failed for repo')).toEqual({
      retry: false,
    });
    expect(getMakerGitRetryDecision('! [rejected] HEAD -> main (fetch first)')).toEqual({
      retry: false,
    });
    expect(
      getMakerGitRetryDecision('fatal: destination path exists and is not an empty directory')
    ).toEqual({
      retry: false,
    });
  });
});
