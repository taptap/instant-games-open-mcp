/**
 * Maker app list response normalization tests.
 */

import { normalizeProjectsResponse } from '../maker/cli/projects';
import { formatMakerProjectList } from '../maker/cli/commands';
import {
  formatAiDialogueDirectoryHint,
  formatStatusProjectList,
  isLikelyAiDialogueDirectory,
} from '../maker/server/mcp';

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
    expect(hint).toContain(
      'read maker://status or call maker_status_lite with the attached project directory'
    );
    expect(hint).not.toContain('要 clone 哪个');
    expect(hint).not.toContain('app_id');
  });
});

describe('maker app list display', () => {
  const projects = Array.from({ length: 120 }, (_, index) => ({
    id: `app-${index + 1}`,
    name: `App ${index + 1}`,
    lastConversationAt: new Date(Date.UTC(2026, 0, index + 1, 8)).toISOString(),
  }));

  test('limits CLI text output to the 40 most recently active apps by default', () => {
    const output = formatMakerProjectList(projects);

    expect(output).toContain('Maker apps (120)');
    expect(output).toContain('Showing 40 most recently active apps');
    expect(output).toContain('sorted by last activity');
    expect(output).toContain('1. app-120');
    expect(output).toContain('40. app-81');
    expect(output).not.toContain('41. app-80');
    expect(output).toContain('--offset 40 --limit 40');
    expect(output).toContain('AI display suggestion');
    expect(output).toContain('compact two-column layout');
    expect(output).toContain('use --json to get the complete app list');
  });

  test('supports showing the next CLI page while keeping recent activity order', () => {
    const output = formatMakerProjectList(projects, { limit: 40, offset: 40 });

    expect(output).toContain('Showing apps 41-80 of 120');
    expect(output).toContain('1. app-80');
    expect(output).toContain('40. app-41');
    expect(output).toContain('--offset 80 --limit 40');
  });

  test('caps requested CLI text output at 100 apps', () => {
    const output = formatMakerProjectList(projects, { limit: 120 });

    expect(output).toContain('100. app-21');
    expect(output).not.toContain('101. app-20');
    expect(output).toContain('--offset 100 --limit 100');
  });

  test('limits status text output to the 40 most recently active apps', () => {
    const output = formatStatusProjectList(projects);

    expect(output).toContain('Maker apps (120)');
    expect(output).toContain('默认按最近活跃排序展示前 40 个');
    expect(output).toContain('1. app-120');
    expect(output).toContain('40. app-81');
    expect(output).not.toContain('41. app-80');
    expect(output).toContain('AI 展示建议');
    expect(output).toContain('两列紧凑布局');
    expect(output).not.toContain('每一个 app 条目');
  });
});
