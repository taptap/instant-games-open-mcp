/**
 * Maker git progress parsing tests.
 */

import { parseGitProgressLine } from '../maker/cli/projects';

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
});
