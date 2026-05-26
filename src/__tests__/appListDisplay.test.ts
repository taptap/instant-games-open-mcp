import { formatDevelopersAndApps } from '../features/app/handlers';

describe('developer and app list display', () => {
  test('limits human-readable output for large app lists', () => {
    const apps = Array.from({ length: 120 }, (_, index) => ({
      app_id: index + 1,
      app_title: `Game ${index + 1}`,
      is_level: true,
    }));

    const output = formatDevelopersAndApps({
      list: [
        {
          developer_id: 100,
          developer_name: 'Studio',
          apps,
        },
      ],
    });

    expect(output).toContain('120 个应用');
    expect(output).toContain('默认展示前 40 个');
    expect(output).toContain('40. **Game 40**');
    expect(output).not.toContain('41. **Game 41**');
    expect(output).toContain('offset=40, limit=40');
    expect(output).toContain('AI 展示建议');
    expect(output).toContain('两列紧凑布局');
  });

  test('supports continuing with offset and limit', () => {
    const apps = Array.from({ length: 120 }, (_, index) => ({
      app_id: index + 1,
      app_title: `Game ${index + 1}`,
      is_level: true,
    }));

    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio',
            apps,
          },
        ],
      },
      { offset: 10, limit: 10 }
    );

    expect(output).toContain('当前展示第 11-20 个应用');
    expect(output).toContain('11. **Game 11**');
    expect(output).toContain('20. **Game 20**');
    expect(output).not.toContain('10. **Game 10**');
    expect(output).toContain('offset=20, limit=10');
  });

  test('caps requested human-readable app limit at 100', () => {
    const apps = Array.from({ length: 120 }, (_, index) => ({
      app_id: index + 1,
      app_title: `Game ${index + 1}`,
      is_level: true,
    }));

    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio',
            apps,
          },
        ],
      },
      { limit: 120 }
    );

    expect(output).toContain('100. **Game 100**');
    expect(output).not.toContain('101. **Game 101**');
    expect(output).toContain('offset=100, limit=100');
  });

  test('stops developer sections after the preview reaches the app limit', () => {
    const output = formatDevelopersAndApps({
      list: Array.from({ length: 45 }, (_, index) => ({
        developer_id: index + 1,
        developer_name: `Studio ${index + 1}`,
        apps: [
          {
            app_id: index + 1,
            app_title: `Game ${index + 1}`,
            is_level: true,
          },
        ],
      })),
    });

    expect(output).toContain('**开发者 40: Studio 40**');
    expect(output).not.toContain('**开发者 41: Studio 41**');
    expect(output).toContain('本页之后还有 5 个应用');
  });

  test('uses global app numbers and visible app example across developers', () => {
    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio A',
            apps: [
              { app_id: 101, app_title: 'Game 1', is_level: true },
              { app_id: 102, app_title: 'Game 2', is_level: true },
              { app_id: 103, app_title: 'Game 3', is_level: true },
            ],
          },
          {
            developer_id: 200,
            developer_name: 'Studio B',
            apps: [
              { app_id: 201, app_title: 'Game 4', is_level: true },
              { app_id: 202, app_title: 'Game 5', is_level: true },
              { app_id: 203, app_title: 'Game 6', is_level: true },
            ],
          },
        ],
      },
      { offset: 2, limit: 3 }
    );

    expect(output).toContain('当前展示第 3-5 个应用');
    expect(output).toContain('3. **Game 3**');
    expect(output).toContain('4. **Game 4**');
    expect(output).toContain('5. **Game 5**');
    expect(output).toContain('- developer_id: 100');
    expect(output).toContain('- app_id: 103');
  });

  test('does not double count apps skipped by offset in developer hidden hints', () => {
    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio',
            apps: Array.from({ length: 10 }, (_, index) => ({
              app_id: index + 1,
              app_title: `Game ${index + 1}`,
              is_level: true,
            })),
          },
        ],
      },
      { offset: 3, limit: 2 }
    );

    expect(output).toContain('4. **Game 4**');
    expect(output).toContain('5. **Game 5**');
    expect(output).toContain('本页之后还有 5 个应用');
    expect(output).not.toContain('本开发者还有 8 个应用未展示');
  });

  test('skips developer sections with no visible apps on the current page', () => {
    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio A',
            apps: [
              { app_id: 101, app_title: 'Game 1', is_level: true },
              { app_id: 102, app_title: 'Game 2', is_level: true },
            ],
          },
          {
            developer_id: 200,
            developer_name: 'Studio B',
            apps: [{ app_id: 201, app_title: 'Game 3', is_level: true }],
          },
        ],
      },
      { offset: 2, limit: 1 }
    );

    expect(output).not.toContain('**开发者 1: Studio A**');
    expect(output).toContain('**开发者 2: Studio B**');
    expect(output).toContain('3. **Game 3**');
    expect(output).toContain('本页之后还有 0 个应用');
  });

  test('shows an empty page message when offset is beyond all apps', () => {
    const output = formatDevelopersAndApps(
      {
        list: [
          {
            developer_id: 100,
            developer_name: 'Studio A',
            apps: [{ app_id: 101, app_title: 'Game 1', is_level: true }],
          },
        ],
      },
      { offset: 99, limit: 10 }
    );

    expect(output).toContain('当前页无应用');
    expect(output).not.toContain('当前展示第 100-1 个应用');
    expect(output).not.toContain('- developer_id: 100');
    expect(output).not.toContain('- app_id: 101');
  });
});
