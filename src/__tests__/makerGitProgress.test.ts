/**
 * Maker git progress parsing tests.
 */

import {
  getMakerGitRetryDecision,
  parseGitProgressLine,
  runMakerGitNetworkOperationWithTransientRetry,
} from '../maker/cli/projects';

describe('maker git progress parsing', () => {
  const originalRetryDelay = process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS;

  beforeEach(() => {
    process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS = '0';
  });

  afterAll(() => {
    if (originalRetryDelay === undefined) {
      delete process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS;
    } else {
      process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS = originalRetryDelay;
    }
  });

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

    expect(getMakerGitRetryDecision('remote server does not support HTTP/2')).toEqual({
      retry: true,
      reason: 'http2_transport_error',
      fallbackHttpVersion: 'HTTP/1.1',
    });
  });

  test('retries explicit HTTP/2 transport failures with command-local HTTP/1.1', async () => {
    const attempts: string[][] = [];

    await runMakerGitNetworkOperationWithTransientRetry(
      ['fetch', '--progress', 'origin'],
      async (args) => {
        attempts.push([...args]);
        if (attempts.length === 1) {
          throw new Error(
            'RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly: CANCEL (err 8)'
          );
        }
        if (attempts.length === 2) {
          throw new Error('RPC failed; curl 56 Recv failure: Connection reset');
        }
      },
      { stage: 'fetch' }
    );

    expect(attempts).toEqual([
      ['fetch', '--progress', 'origin'],
      ['-c', 'http.version=HTTP/1.1', 'fetch', '--progress', 'origin'],
      ['-c', 'http.version=HTTP/1.1', 'fetch', '--progress', 'origin'],
    ]);
  });

  test('keeps ordinary connection retries on the original Git command', async () => {
    const attempts: string[][] = [];

    await runMakerGitNetworkOperationWithTransientRetry(
      ['push', 'origin', 'HEAD:main'],
      async (args) => {
        attempts.push([...args]);
        if (attempts.length === 1) {
          throw new Error('RPC failed; curl 56 Recv failure: Connection reset');
        }
      },
      { stage: 'push' }
    );

    expect(attempts).toEqual([
      ['push', 'origin', 'HEAD:main'],
      ['push', 'origin', 'HEAD:main'],
    ]);
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
