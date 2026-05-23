/**
 * Maker app list response normalization tests.
 */

import { normalizeProjectsResponse } from '../maker/cli/projects';
import { formatAiDialogueDirectoryHint, isLikelyAiDialogueDirectory } from '../maker/server/mcp';

describe('maker projects response normalization', () => {
  test('preserves all known app list fields returned by Maker API', () => {
    const projects = normalizeProjectsResponse({
      apps: [
        {
          archivedAt: null,
          createdAt: '2026-05-20T08:00:00.000Z',
          deletedAt: null,
          gameType: 'single',
          icon: 1,
          iconColor: 2,
          id: 'app-1',
          lastAccessedAt: null,
          lastConversationAt: '2026-05-21T08:00:00.000Z',
          metadata: { source: 'test' },
          name: 'Test App',
          pinnedAt: null,
          stage: 'development',
          userId: 'user-1',
        },
      ],
    });

    expect(projects[0]).toMatchObject({
      archivedAt: null,
      createdAt: '2026-05-20T08:00:00.000Z',
      deletedAt: null,
      gameType: 'single',
      icon: 1,
      iconColor: 2,
      id: 'app-1',
      lastAccessedAt: null,
      lastConversationAt: '2026-05-21T08:00:00.000Z',
      metadata: { source: 'test' },
      name: 'Test App',
      pinnedAt: null,
      stage: 'development',
      userId: 'user-1',
      user_id: 'user-1',
    });
  });
});

describe('maker status dialogue directory guidance', () => {
  test('detects xdt-maker dialogue directories on Windows paths', () => {
    expect(
      isLikelyAiDialogueDirectory(
        'C:\\Users\\liangdong\\AppData\\Roaming\\xdt-maker\\dialogues\\2026-05-23\\841d1eb2-d6da-40f0-be89-2394d1c9cc63'
      )
    ).toBe(true);
  });

  test('does not treat ordinary Maker workspace paths as dialogue directories', () => {
    expect(isLikelyAiDialogueDirectory('F:\\MiniGame\\chinesechess\\test-mcp-2')).toBe(false);
  });

  test('formats dialogue directory hint without app selection prompt', () => {
    const hint = formatAiDialogueDirectoryHint(
      'C:\\Users\\liangdong\\AppData\\Roaming\\xdt-maker\\dialogues\\2026-05-23\\841d1eb2-d6da-40f0-be89-2394d1c9cc63'
    );

    expect(hint).toContain('AI client workspace selection');
    expect(hint).toContain('do_not_clone_here: yes');
    expect(hint).toContain('maker_status(target_dir="<attached project directory>")');
    expect(hint).not.toContain('要 clone 哪个');
    expect(hint).not.toContain('app_id');
  });
});
