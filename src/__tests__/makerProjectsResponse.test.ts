/**
 * Maker app list response normalization tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createMakerProject,
  ensureMakerProjectBaseDirectories,
  normalizeProjectsResponse,
} from '../maker/cli/projects';
import { formatMakerProjectList } from '../maker/cli/commands';
import {
  formatAiDialogueDirectoryHint,
  formatStatusProjectList,
  isLikelyAiDialogueDirectory,
} from '../maker/server/mcp';

describe('maker projects response normalization', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.TAPTAP_MAKER_API_BASE;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.TAPTAP_MAKER_API_BASE;
    } else {
      process.env.TAPTAP_MAKER_API_BASE = originalApiBase;
    }
  });

  test('creates base directories for new local Maker projects', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-base-dirs-'));

    ensureMakerProjectBaseDirectories(tempDir);

    expect(fs.statSync(path.join(tempDir, 'assets')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'assets', 'image')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'assets', 'sprites')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'assets', 'video')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'assets', 'audio')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'scripts')).isDirectory()).toBe(true);
  });

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

  test('creates Maker projects with sce game type and normalizes the app response', async () => {
    process.env.TAPTAP_MAKER_API_BASE = 'https://maker.example.test/api/v1';
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        app: {
          id: 'created-app',
          name: 'My Local Game',
          userId: 'user-1',
          createdAt: '2026-06-12T09:33:30.591Z',
          gameType: 'sce',
          stage: 'plan',
        },
      }),
    })) as jest.Mock;
    global.fetch = fetchMock;

    const project = await createMakerProject({
      name: ' My Local Game ',
      gameType: 'sce',
      pat: 'valid-maker-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://maker.example.test/api/v1/apps', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-maker-token',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'My Local Game',
        gameType: 'sce',
      }),
    });
    expect(project).toEqual(
      expect.objectContaining({
        id: 'created-app',
        name: 'My Local Game',
        user_id: 'user-1',
        gameType: 'sce',
        stage: 'plan',
      })
    );
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
    user_id: `user-${index + 1}`,
    gameType: 'single',
    stage: 'development',
    createdAt: new Date(Date.UTC(2025, 0, index + 1, 8)).toISOString(),
    lastConversationAt: new Date(Date.UTC(2026, 0, index + 1, 8)).toISOString(),
  }));

  test('limits CLI text output to the 40 most recently active apps by default', () => {
    const output = formatMakerProjectList(projects);

    expect(output).toContain('Maker apps (120)');
    expect(output).toContain('Showing 40 most recently active apps');
    expect(output).toContain('sorted by last activity');
    expect(output).toContain('80 more hidden');
    expect(output).toContain('1. App 120  id=app-120  last_active=2026-04-30T08:00:00.000Z');
    expect(output).toContain('40. App 81  id=app-81  last_active=2026-03-22T08:00:00.000Z');
    expect(output).not.toContain('41. App 80');
    expect(output).toContain('taptap-maker apps --all');
    expect(output).toContain('--json');
    expect(output).not.toContain('--offset');
    expect(output).not.toContain('--limit');
    expect(output).not.toContain('user_id=');
    expect(output).not.toContain('gameType=');
    expect(output).not.toContain('stage=');
    expect(output).not.toContain('createdAt=');
    expect(output).toContain('0，创建新项目');
    expect(output.indexOf('0，创建新项目')).toBeLessThan(output.indexOf('1. App 120'));
    expect(output).toContain('0. Create a new Maker project');
    expect(output.indexOf('0. Create a new Maker project')).toBeLessThan(
      output.indexOf('1. App 120')
    );
    expect(output.indexOf('40. App 81')).toBeLessThan(
      output.lastIndexOf('0. Create a new Maker project')
    );
  });

  test('shows every app when showAll is set', () => {
    const output = formatMakerProjectList(projects, { showAll: true });

    expect(output).toContain('Maker apps (120)');
    expect(output).toContain('Showing all 120 Maker apps');
    expect(output).toContain('1. App 120  id=app-120');
    expect(output).toContain('120. App 1  id=app-1');
    expect(output).not.toContain('more hidden');
    expect(output).not.toContain('--all');
    expect(output).toContain('0，创建新项目');
    expect(output).toContain('0. Create a new Maker project');
  });

  test('hides the --all hint when the project count fits in one page', () => {
    const output = formatMakerProjectList(projects.slice(0, 29));

    expect(output).toContain('Showing all 29 Maker apps');
    expect(output).not.toContain('more hidden');
    expect(output).not.toContain('--all');
  });

  test('limits status text output to the 40 most recently active apps', () => {
    const output = formatStatusProjectList(projects);

    expect(output).toContain('Maker apps (120)');
    expect(output).toContain('0，创建新项目');
    expect(output.indexOf('0，创建新项目')).toBeLessThan(output.indexOf('1. app-120'));
    expect(output).toContain('0. Create a new Maker project');
    expect(output.indexOf('0. Create a new Maker project')).toBeLessThan(
      output.indexOf('1. app-120')
    );
    expect(output).toContain(
      '为了保持友好的可读性，默认最多展示 40 个 app；如需完整列表，可以选择显示全部。'
    );
    expect(output).toContain('如需完整列表，请运行 taptap-maker apps --json 查看全部 app。');
    expect(output).toContain('1. app-120');
    expect(output).toContain('40. app-81');
    expect(output).not.toContain('41. app-80');
    expect(output).not.toContain('offset');
    expect(output).not.toContain('next_offset');
    expect(output).not.toContain('next_page');
    expect(output).toContain('AI 展示建议');
    expect(output).toContain('两列紧凑布局');
    expect(output).toContain('标准流程：先让用户从 app 列表选择已有 app');
    expect(output).toContain('用户回复序号或 app_id 后，next_step: 执行 `taptap-maker init`');
    expect(output).not.toContain('每一个 app 条目');
  });

  test('status output guides project creation when no apps exist', () => {
    const output = formatStatusProjectList([]);

    expect(output).toContain('No Maker apps found.');
    expect(output).toContain('0，创建新项目');
    expect(output).toContain('0. Create a new Maker project');
    expect(output).toContain('taptap-maker init');
    expect(output).toContain('new');
  });

  test('explains the status app page limit for readable output', () => {
    const output = formatStatusProjectList(projects.slice(0, 29));

    expect(output).toContain('已显示全部 app；请询问用户选择。');
    expect(output).not.toContain('可以选择显示全部');
    expect(output).not.toContain('taptap-maker apps --json');
  });
});
