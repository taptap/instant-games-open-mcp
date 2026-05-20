/**
 * Maker Claude Code install command tests.
 */

import { createClaudeMcpAddInvocation, createCwdWrappedCommand } from '../maker/cli/install';

describe('maker Claude Code install', () => {
  test('builds claude mcp add invocation with local scope by default', () => {
    const invocation = createClaudeMcpAddInvocation({
      projectRoot: '/tmp/maker-game',
      server: {
        command: 'node',
        args: ['/repo/dist/maker.js'],
      },
    });

    expect(invocation.command).toBe(process.platform === 'win32' ? 'claude.cmd' : 'claude');
    expect(invocation.args.slice(0, 7)).toEqual([
      'mcp',
      'add',
      '--scope',
      'local',
      'taptap-maker',
      '--',
      process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    ]);
  });

  test('wraps the server command so Claude starts it from the project cwd', () => {
    const wrapped = createCwdWrappedCommand('/tmp/maker-game', {
      command: 'npx',
      args: ['-y', '-p', '@taptap/instant-games-open-mcp', 'taptap-maker'],
    });

    if (process.platform === 'win32') {
      expect(wrapped.command).toBe('cmd.exe');
      expect(wrapped.args.join(' ')).toContain('cd /d');
      expect(wrapped.args.join(' ')).toContain('taptap-maker');
      return;
    }

    expect(wrapped.command).toBe('/bin/sh');
    expect(wrapped.args).toEqual([
      '-lc',
      'cd "$1" && shift && exec "$@"',
      'taptap-maker-cwd',
      '/tmp/maker-game',
      'npx',
      '-y',
      '-p',
      '@taptap/instant-games-open-mcp',
      'taptap-maker',
    ]);
  });

  test('rejects unsupported Claude Code scopes', () => {
    expect(() =>
      createClaudeMcpAddInvocation({
        projectRoot: '/tmp/maker-game',
        server: {
          command: 'node',
          args: ['/repo/dist/maker.js'],
        },
        scope: 'global',
      })
    ).toThrow('Claude Code scope must be one of');
  });
});
