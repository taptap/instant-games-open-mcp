import { formatDevelopersAndApps } from '../features/app/handlers';

describe('developer and app list display', () => {
  test('limits human-readable output for large app lists', () => {
    const apps = Array.from({ length: 35 }, (_, index) => ({
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

    expect(output).toContain('35 个应用');
    expect(output).toContain('默认展示前 10 个');
    expect(output).toContain('10. **Game 10**');
    expect(output).not.toContain('11. **Game 11**');
    expect(output).toContain('offset=10, limit=10');
  });

  test('supports continuing with offset and limit', () => {
    const apps = Array.from({ length: 35 }, (_, index) => ({
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

  test('stops developer sections after the preview reaches the app limit', () => {
    const output = formatDevelopersAndApps({
      list: Array.from({ length: 35 }, (_, index) => ({
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

    expect(output).toContain('**开发者 10: Studio 10**');
    expect(output).not.toContain('**开发者 11: Studio 11**');
    expect(output).toContain('已省略 25 个应用');
  });
});
