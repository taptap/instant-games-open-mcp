/**
 * Maker MCP update guide tests.
 */

import { createMakerMcpUpdateGuide } from '../maker/system/updateGuide';

describe('maker MCP update guide', () => {
  test('returns macOS/Linux shell instructions without self-updating', () => {
    const guide = createMakerMcpUpdateGuide({ platform: 'darwin' });

    expect(guide).toContain('TapTap Maker MCP update guide');
    expect(guide).toContain('macOS / Linux');
    expect(guide).toContain('node --version');
    expect(guide).toContain('npm --version');
    expect(guide).toContain('npx --version');
    expect(guide).toContain('npm view @taptap/instant-games-open-mcp@beta version');
    expect(guide).toContain('taptap-maker');
    expect(guide).toContain('rm -rf "$d"');
    expect(guide).toContain('maker_status');
    expect(guide).toContain('重启 MCP 客户端');
    expect(guide).toContain('本工具不会直接执行更新命令');
  });

  test('returns Windows PowerShell instructions', () => {
    const guide = createMakerMcpUpdateGuide({ platform: 'win32' });

    expect(guide).toContain('TapTap Maker MCP update guide');
    expect(guide).toContain('Windows PowerShell');
    expect(guide).toContain("npm view '@taptap/instant-games-open-mcp@beta' version");
    expect(guide).toContain('Remove-Item -Recurse -Force');
    expect(guide).toContain('Start-Process -FilePath npx');
    expect(guide).toContain('taptap-maker');
    expect(guide).toContain('新开 Claude Code / Codex / Cursor 窗口');
    expect(guide).toContain('本工具不会直接执行更新命令');
  });

  test('supports default package bin update instructions', () => {
    const guide = createMakerMcpUpdateGuide({
      platform: 'linux',
      packageSpec: '@taptap/instant-games-open-mcp',
      bin: 'instant-games-open-mcp',
      client: 'codex',
    });

    expect(guide).toContain('client: codex');
    expect(guide).toContain('npm view @taptap/instant-games-open-mcp version');
    expect(guide).toContain('npx -y --prefer-online @taptap/instant-games-open-mcp');
    expect(guide).not.toContain('-p @taptap/instant-games-open-mcp instant-games-open-mcp');
  });
});
