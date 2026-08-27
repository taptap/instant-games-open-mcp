import { HttpClient } from '../core/network/httpClient';
import { ResolvedContext } from '../core/types/context';
import { clearAppCache, readAppCache, saveAppCache } from '../core/utils/cache';
import { selectApp } from '../features/app/api';
import { adsTools } from '../features/ads/docTools';
import { getAdManagerCode } from '../features/ads/docs';
import { checkAdsStatus, getSpaceIdFromCache } from '../features/ads/handlers';
import { adsResources } from '../features/ads/resources';
import { adsTools_Registration } from '../features/ads/tools';

const AUTOMATIC_ID_CONTRACT = /must not ask the user for an ad space id/iu;
const CHINESE_AUTOMATIC_ID_CONTRACT = /不要向开发者索要广告位 ID/u;

function createProjectPath(label: string): string {
  return `/tmp/taptap-ads-workflow-${label}-${Date.now()}-${Math.random()}`;
}

function createContext(projectPath: string): ResolvedContext {
  return new ResolvedContext({ _project_path: projectPath }, {});
}

function mockAppDetail(appId: number, developerId: number): void {
  jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
    level: {
      app_id: appId,
      app_title: `game-${appId}`,
      developer_id: developerId,
      developer_name: `developer-${developerId}`,
      status: 4,
      data: {
        title: `Game ${appId}`,
        screen_orientation: 2,
      },
    },
  });
}

describe('H5 ads workflow contract', () => {
  const cacheKeys: string[] = [];

  afterEach(() => {
    jest.restoreAllMocks();
    for (const cacheKey of cacheKeys.splice(0)) {
      clearAppCache(cacheKey);
    }
  });

  test('forbids asking developers for an ad space ID across every tool entry', async () => {
    const descriptions = adsTools_Registration.map((tool) => tool.definition.description || '');
    const workflow = adsTools_Registration.find(
      (tool) => tool.definition.name === 'get_ads_integration_workflow'
    );
    const workflowOutput = await workflow?.handler({}, createContext(createProjectPath('prompt')));

    expect(descriptions).toHaveLength(3);
    for (const description of descriptions) {
      expect(description).toMatch(AUTOMATIC_ID_CONTRACT);
      expect(description).toMatch(/check_ads_status.{0,160}only source/isu);
    }
    expect(workflowOutput).toMatch(CHINESE_AUTOMATIC_ID_CONTRACT);
    expect(workflowOutput).toMatch(/check_ads_status.{0,80}唯一来源/su);
  });

  test('uses status 2 as the banned state in tool guidance', () => {
    const description =
      adsTools_Registration.find((tool) => tool.definition.name === 'check_ads_status')?.definition
        .description || '';

    expect(description).toMatch(/Status 2 \(已封禁\)/u);
    expect(description).not.toContain('Status 3');
  });

  test('keeps the compatibility resource but never emits placeholder ad code', async () => {
    const resource = adsResources.find((item) => item.uri === 'docs://ads/ad-manager');
    const output = await resource?.handler();

    expect(output).toContain('get_ads_integration_workflow');
    expect(output).toMatch(CHINESE_AUTOMATIC_ID_CONTRACT);
    expect(output).not.toContain('this.spaceId');
    expect(output).not.toContain('请先调用 check_ads_status 获取广告位ID');
  });

  test('routes a missing cached ID back to automatic status lookup without manual fallback', async () => {
    const output = await adsTools.getAdIntegrationGuide(
      createContext(createProjectPath('missing-guide'))
    );

    expect(output).toContain('check_ads_status');
    expect(output).toMatch(CHINESE_AUTOMATIC_ID_CONTRACT);
    expect(output).not.toMatch(/提供.{0,12}广告位 ID/u);
  });

  test('does not guess an ad space when screen orientation is unknown', () => {
    const projectPath = createProjectPath('orientation');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        ad_config: {
          status: 1,
          landscape_space_id: 'landscape-id',
          portrait_space_id: 'portrait-id',
          updated_at: Date.now(),
        },
      },
      projectPath
    );

    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('explains that an empty server response must not be replaced with a developer-provided ID', async () => {
    const projectPath = createProjectPath('empty-spaces');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: {
            title: 'Game 200',
            screen_orientation: 2,
          },
        },
      },
      projectPath
    );
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({ status: 1, ad_spaces: [] });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(output).toMatch(CHINESE_AUTOMATIC_ID_CONTRACT);
    expect(output).toContain('稍后重新调用 `check_ads_status`');
  });

  test('preserves cached ad configuration when refreshing the same app', async () => {
    const projectPath = createProjectPath('same-app');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        app_title: 'game-200',
        ad_config: {
          status: 1,
          landscape_space_id: 'landscape-id',
          portrait_space_id: 'portrait-id',
          updated_at: 123,
        },
      },
      projectPath
    );
    mockAppDetail(200, 100);

    await selectApp(100, 200, projectPath);

    expect(readAppCache(projectPath)?.ad_config).toEqual({
      status: 1,
      landscape_space_id: 'landscape-id',
      portrait_space_id: 'portrait-id',
      updated_at: 123,
    });
  });

  test('does not carry cached ad configuration to a different app', async () => {
    const projectPath = createProjectPath('different-app');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        app_title: 'game-200',
        ad_config: {
          status: 1,
          landscape_space_id: 'old-landscape-id',
          updated_at: 123,
        },
      },
      projectPath
    );
    mockAppDetail(300, 100);

    await selectApp(100, 300, projectPath);

    expect(readAppCache(projectPath)?.ad_config).toBeUndefined();
  });

  test('describes generated IDs as MCP-injected instead of manually retrieved', () => {
    const code = getAdManagerCode('automatic-id');

    expect(code).toContain('由 check_ads_status 自动获取并注入');
    expect(code).not.toContain('从 TapTap 后台获取');
  });
});
