/**
 * Maker app list response normalization tests.
 */

import { normalizeProjectsResponse } from '../maker/cli/projects';

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
