import { HttpClient } from '../core/network/httpClient';
import { ResolvedContext } from '../core/types/context';
import * as cacheUtils from '../core/utils/cache';
import { clearAppCache, readAppCache, saveAppCache } from '../core/utils/cache';
import { selectApp } from '../features/app/api';
import { adsTools } from '../features/ads/docTools';
import { getAdManagerCode } from '../features/ads/docs';
import { checkAdsStatus, getSpaceIdFromCache } from '../features/ads/handlers';
import { adsResources } from '../features/ads/resources';
import { adsTools_Registration } from '../features/ads/tools';

const AUTOMATIC_ID_CONTRACT = /must not ask the user for an ad space id/iu;
const CHINESE_AUTOMATIC_ID_CONTRACT = /不要向开发者索要广告位 ID/u;
const H5_SCOPE_CONTRACT = /only supports TapTap Minigame\/H5 ad integration/iu;
const MAKER_EXCLUSION_CONTRACT = /must not be used for TapTap Maker\/UrhoX projects/iu;

function createProjectPath(label: string): string {
  return `/tmp/taptap-ads-workflow-${label}-${Date.now()}-${Math.random()}`;
}

function createContext(projectPath: string): ResolvedContext {
  return new ResolvedContext({ _project_path: projectPath }, {});
}

function createProjectIdContext(projectId: string): ResolvedContext {
  return new ResolvedContext({ _project_id: projectId }, {});
}

function loadIsolatedAdsProcess(): {
  HttpClient: typeof HttpClient;
  checkAdsStatus: typeof checkAdsStatus;
} {
  let isolatedProcess:
    | {
        HttpClient: typeof HttpClient;
        checkAdsStatus: typeof checkAdsStatus;
      }
    | undefined;

  jest.isolateModules(() => {
    const isolatedNetwork =
      require('../core/network/httpClient') as typeof import('../core/network/httpClient');
    const isolatedHandlers =
      require('../features/ads/handlers') as typeof import('../features/ads/handlers');
    isolatedProcess = {
      HttpClient: isolatedNetwork.HttpClient,
      checkAdsStatus: isolatedHandlers.checkAdsStatus,
    };
  });

  return isolatedProcess!;
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

  test('declares the H5-only scope across every ads tool entry', async () => {
    const descriptions = adsTools_Registration.map((tool) => tool.definition.description || '');
    const workflow = adsTools_Registration.find(
      (tool) => tool.definition.name === 'get_ads_integration_workflow'
    );
    const workflowOutput = await workflow?.handler({}, createContext(createProjectPath('scope')));
    const resource = adsResources.find((item) => item.uri === 'docs://ads/ad-manager');
    const resourceOutput = await resource?.handler();

    for (const description of descriptions) {
      expect(description).toMatch(H5_SCOPE_CONTRACT);
      expect(description).toMatch(MAKER_EXCLUSION_CONTRACT);
    }
    expect(workflowOutput).toContain('仅适用于 TapTap 小游戏/H5');
    expect(workflowOutput).toContain('不适用于 TapTap Maker/UrhoX');
    expect(resource?.description).toMatch(H5_SCOPE_CONTRACT);
    expect(resource?.description).toMatch(MAKER_EXCLUSION_CONTRACT);
    expect(resourceOutput).toContain('仅适用于 TapTap 小游戏/H5');
    expect(resourceOutput).toContain('不适用于 TapTap Maker/UrhoX');
  });

  test('scopes the ads trigger to H5 instead of all advertising requests', async () => {
    const workflow = adsTools_Registration.find(
      (tool) => tool.definition.name === 'get_ads_integration_workflow'
    );
    const description = workflow?.definition.description || '';
    const workflowOutput = await workflow?.handler(
      {},
      createContext(createProjectPath('scoped-trigger'))
    );

    expect(description).toMatch(/ANY TapTap Minigame\/H5 ads-related request/iu);
    expect(description).not.toContain('For ANY ads-related request');
    expect(workflowOutput).toContain('任何 TapTap 小游戏/H5 广告相关操作之前');
  });

  test('describes the latest selected-app lookup without claiming runtime playback readiness', async () => {
    const descriptions = adsTools_Registration.map((tool) => tool.definition.description || '');
    const workflow = adsTools_Registration.find(
      (tool) => tool.definition.name === 'get_ads_integration_workflow'
    );
    const workflowOutput = await workflow?.handler(
      {},
      createContext(createProjectPath('runtime-boundary'))
    );

    for (const description of descriptions) {
      expect(description).toMatch(/current selected app/iu);
      expect(description).not.toMatch(/Ads SDK status/iu);
    }
    expect(workflowOutput).toContain('当前选中应用的本次 `check_ads_status` 查询结果');
    expect(workflowOutput).toContain('不代表 `window.tap` 已注入');
    expect(workflowOutput).toContain('不代表广告已在真机环境中成功播放');
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

  test('selects an ad space from one cache snapshot during an app switch', () => {
    const firstSnapshot = {
      developer_id: 100,
      app_id: 200,
      ad_config_request_id: 'request-a',
      ad_config: {
        status: 1,
        landscape_space_id: 'app-a-landscape',
        portrait_space_id: 'app-a-portrait',
        updated_at: Date.now(),
        request_id: 'request-a',
      },
      level: {
        app_id: 200,
        app_title: 'app-a',
        status: 4,
        data: { title: 'App A', screen_orientation: 2 },
      },
    };
    const secondSnapshot = {
      ...firstSnapshot,
      app_id: 300,
      ad_config_request_id: 'request-b',
      ad_config: {
        ...firstSnapshot.ad_config,
        landscape_space_id: 'app-b-landscape',
        portrait_space_id: 'app-b-portrait',
        request_id: 'request-b',
      },
      level: {
        app_id: 300,
        app_title: 'app-b',
        status: 4,
        data: { title: 'App B', screen_orientation: 1 },
      },
    };
    const readCache = jest
      .spyOn(cacheUtils, 'readAppCache')
      .mockReturnValueOnce(firstSnapshot)
      .mockReturnValueOnce(secondSnapshot);

    expect(getSpaceIdFromCache(createContext(createProjectPath('one-read')))).toBe(
      'app-a-landscape'
    );
    expect(readCache).toHaveBeenCalledTimes(1);
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

  test.each([
    ['not activated', { status: 0 }],
    ['banned', { status: 2 }],
    ['empty spaces', { status: 1, ad_spaces: [] }],
    ['missing landscape space', { status: 1, ad_spaces: [{ id: 'portrait-id', type: 2 }] }],
  ])('invalidates a stale cached ID when the latest status is %s', async (_, response) => {
    const projectPath = createProjectPath('stale-status');
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
        ad_config: {
          status: 1,
          landscape_space_id: 'stale-landscape-id',
          updated_at: 123,
        },
      },
      projectPath
    );
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue(response);

    await checkAdsStatus(createContext(projectPath));

    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
    expect(await adsTools.getAdIntegrationGuide(createContext(projectPath))).not.toContain(
      'stale-landscape-id'
    );
  });

  test('invalidates a stale cached ID when status lookup fails', async () => {
    const projectPath = createProjectPath('stale-error');
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
        ad_config: {
          status: 1,
          landscape_space_id: 'stale-landscape-id',
          updated_at: 123,
        },
      },
      projectPath
    );
    jest.spyOn(HttpClient.prototype, 'get').mockRejectedValue(new Error('network unavailable'));

    await checkAdsStatus(createContext(projectPath));

    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('discards an ads response when the selected app changes during the request', async () => {
    const projectPath = createProjectPath('concurrent-switch');
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

    let resolveRequest: ((value: unknown) => void) | undefined;
    const request = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    jest.spyOn(HttpClient.prototype, 'get').mockReturnValue(request);

    const pendingStatus = checkAdsStatus(createContext(projectPath));
    saveAppCache(
      {
        developer_id: 100,
        app_id: 300,
        level: {
          app_id: 300,
          app_title: 'game-300',
          status: 4,
          data: {
            title: 'Game 300',
            screen_orientation: 2,
          },
        },
      },
      projectPath
    );
    resolveRequest?.({
      status: 1,
      ad_spaces: [{ id: 'app-200-landscape-id', type: 1 }],
    });

    const output = await pendingStatus;

    expect(output).toContain('应用已切换');
    expect(readAppCache(projectPath)?.app_id).toBe(300);
    expect(readAppCache(projectPath)?.ad_config).toBeUndefined();
  });

  test('pins the ads API request to the app selected when the check starts', async () => {
    const projectPath = createProjectPath('request-app-identity');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );

    const context = createContext(projectPath);
    let initialIdentityRead = false;
    let requestStarted = false;
    jest.spyOn(context, 'resolveApp').mockImplementation(() => {
      if (requestStarted || !initialIdentityRead) {
        initialIdentityRead = true;
        return { developerId: 100, appId: 200, projectPath };
      }
      return { developerId: 100, appId: 300, projectPath };
    });

    const getRequest = jest
      .spyOn(HttpClient.prototype, 'get')
      .mockImplementation((_path, options) => {
        requestStarted = true;
        const appId = options.params?.app_id;
        return Promise.resolve({
          status: 1,
          ad_spaces: [{ id: `app-${appId}-landscape-id`, type: 1 }],
        });
      });

    const output = await checkAdsStatus(context);

    expect(getRequest).toHaveBeenCalledWith('/ad/v1/config', {
      params: { developer_id: '100', app_id: '200' },
    });
    expect(output).toContain('app-200-landscape-id');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBe('app-200-landscape-id');
  });

  test('does not let an old process overwrite ads after an A-to-B-to-A switch', async () => {
    const projectPath = createProjectPath('cross-process-aba');
    cacheKeys.push(projectPath);
    const appA = {
      developer_id: 100,
      app_id: 200,
      level: {
        app_id: 200,
        app_title: 'game-200',
        status: 4,
        data: { title: 'Game 200', screen_orientation: 2 },
      },
    };
    saveAppCache(appA, projectPath);

    const processA = loadIsolatedAdsProcess();
    const processB = loadIsolatedAdsProcess();
    let resolveOlder: ((value: unknown) => void) | undefined;
    const olderRequest = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    jest.spyOn(processA.HttpClient.prototype, 'get').mockReturnValue(olderRequest);
    jest.spyOn(processB.HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [{ id: 'newer-app-200-id', type: 1 }],
    });

    const olderStatus = processA.checkAdsStatus(createContext(projectPath));
    saveAppCache(
      {
        developer_id: 100,
        app_id: 300,
        level: {
          app_id: 300,
          app_title: 'game-300',
          status: 4,
          data: { title: 'Game 300', screen_orientation: 2 },
        },
      },
      projectPath
    );
    saveAppCache(appA, projectPath);
    await processB.checkAdsStatus(createContext(projectPath));
    resolveOlder?.({ status: 1, ad_spaces: [{ id: 'older-app-200-id', type: 1 }] });
    await olderStatus;

    expect(getSpaceIdFromCache(createContext(projectPath))).toBe('newer-app-200-id');
  });

  test('does not publish an old process non-success status after a newer lookup', async () => {
    const projectPath = createProjectPath('cross-process-stale-status');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );

    const processA = loadIsolatedAdsProcess();
    const processB = loadIsolatedAdsProcess();
    let resolveOlder: ((value: unknown) => void) | undefined;
    const olderRequest = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    jest.spyOn(processA.HttpClient.prototype, 'get').mockReturnValue(olderRequest);
    jest.spyOn(processB.HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [{ id: 'newer-app-200-id', type: 1 }],
    });

    const olderStatus = processA.checkAdsStatus(createContext(projectPath));
    await processB.checkAdsStatus(createContext(projectPath));
    resolveOlder?.({ status: 0, url: 'https://example.com/activate' });

    const olderOutput = await olderStatus;

    expect(olderOutput).toContain('已有更新的广告状态查询');
    expect(olderOutput).not.toContain('广告功能尚未开通');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBe('newer-app-200-id');
  });

  test('does not let an older successful lookup restore cache after a newer lookup fails', async () => {
    const projectPath = createProjectPath('same-app-newer-failure');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );

    let resolveOlder: ((value: unknown) => void) | undefined;
    const olderRequest = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    jest
      .spyOn(HttpClient.prototype, 'get')
      .mockReturnValueOnce(olderRequest)
      .mockRejectedValueOnce(new Error('newer request failed'));

    const olderStatus = checkAdsStatus(createContext(projectPath));
    await checkAdsStatus(createContext(projectPath));
    resolveOlder?.({ status: 1, ad_spaces: [{ id: 'older-id', type: 1 }] });

    const olderOutput = await olderStatus;

    expect(olderOutput).toContain('已有更新的广告状态查询');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('does not let an older response overwrite a newer successful lookup', async () => {
    const projectPath = createProjectPath('same-app-newer-success');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );

    let resolveOlder: ((value: unknown) => void) | undefined;
    const olderRequest = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    jest
      .spyOn(HttpClient.prototype, 'get')
      .mockReturnValueOnce(olderRequest)
      .mockResolvedValueOnce({ status: 1, ad_spaces: [{ id: 'newer-id', type: 1 }] });

    const olderStatus = checkAdsStatus(createContext(projectPath));
    await checkAdsStatus(createContext(projectPath));
    resolveOlder?.({ status: 1, ad_spaces: [{ id: 'older-id', type: 1 }] });

    const olderOutput = await olderStatus;

    expect(olderOutput).toContain('已有更新的广告状态查询');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBe('newer-id');
  });

  test('treats an unsupported screen orientation as unknown', async () => {
    const projectPath = createProjectPath('invalid-orientation');
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
            screen_orientation: 0,
          },
        },
      },
      projectPath
    );
    jest
      .spyOn(HttpClient.prototype, 'get')
      .mockResolvedValueOnce({
        status: 1,
        ad_spaces: [
          { id: 'landscape-id', type: 1 },
          { id: 'portrait-id', type: 2 },
        ],
      })
      .mockResolvedValueOnce({
        level: {
          app_id: 200,
          app_title: 'game-200',
          developer_id: 100,
          developer_name: 'developer-100',
          status: 4,
          data: {
            title: 'Game 200',
            screen_orientation: 0,
          },
        },
      });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(output).toContain('未检测到游戏横竖屏设置');
    expect(output).not.toContain('游戏屏幕方向：** 竖屏');
    expect(output).not.toContain('landscape-id');
    expect(output).not.toContain('portrait-id');
    expect(output).not.toContain('广告位信息：');
    expect(output).toContain('请先询问用户选择游戏方向');
    expect(output).toContain('调用 `update_app_info`');
    expect(output).toContain('重新调用 `check_ads_status`');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('refreshes app info before reporting that screen orientation is missing', async () => {
    const projectPath = createProjectPath('stale-missing-orientation');
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
            screen_orientation: 0,
          },
        },
      },
      projectPath
    );
    const get = jest
      .spyOn(HttpClient.prototype, 'get')
      .mockResolvedValueOnce({
        status: 1,
        ad_spaces: [
          { id: 'landscape-id', type: 1 },
          { id: 'portrait-id', type: 2 },
        ],
      })
      .mockResolvedValueOnce({
        level: {
          app_id: 200,
          app_title: 'game-200',
          developer_id: 100,
          developer_name: 'developer-100',
          status: 4,
          data: {
            title: 'Game 200',
            screen_orientation: 2,
          },
        },
      });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(get).toHaveBeenCalledTimes(2);
    expect(output).toContain('游戏屏幕方向：** 横屏');
    expect(output).toContain('landscape-id');
    expect(output).not.toContain('未检测到游戏横竖屏设置');
  });

  test('does not restore an old app when selection changes during orientation refresh', async () => {
    const projectPath = createProjectPath('orientation-refresh-app-switch');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 0 },
        },
      },
      projectPath
    );

    let resolveAppDetail: ((value: unknown) => void) | undefined;
    const pendingAppDetail = new Promise((resolve) => {
      resolveAppDetail = resolve;
    });
    const get = jest
      .spyOn(HttpClient.prototype, 'get')
      .mockResolvedValueOnce({
        status: 1,
        ad_spaces: [{ id: 'app-200-landscape-id', type: 1 }],
      })
      .mockReturnValueOnce(pendingAppDetail);

    const pendingStatus = checkAdsStatus(createContext(projectPath));
    await new Promise((resolve) => setImmediate(resolve));
    expect(get).toHaveBeenCalledTimes(2);

    saveAppCache(
      {
        developer_id: 100,
        app_id: 300,
        level: {
          app_id: 300,
          app_title: 'game-300',
          status: 4,
          data: { title: 'Game 300', screen_orientation: 2 },
        },
      },
      projectPath
    );
    resolveAppDetail?.({
      level: {
        app_id: 200,
        app_title: 'game-200',
        developer_id: 100,
        developer_name: 'developer-100',
        status: 4,
        data: { title: 'Game 200', screen_orientation: 2 },
      },
    });

    const output = await pendingStatus;

    expect(output).toContain('查询结果已丢弃');
    expect(readAppCache(projectPath)?.app_id).toBe(300);
    expect(readAppCache(projectPath)?.ad_config).toBeUndefined();
  });

  test('does not fall back to the published orientation when the upload orientation is invalid', async () => {
    const projectPath = createProjectPath('invalid-upload-orientation');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        upload_level: {
          app_id: 200,
          app_title: 'game-200',
          status: 2,
          form_data: {
            info: { title: 'Game 200 draft', screen_orientation: 0 },
          },
        },
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );
    jest
      .spyOn(HttpClient.prototype, 'get')
      .mockResolvedValueOnce({
        status: 1,
        ad_spaces: [
          { id: 'landscape-id', type: 1 },
          { id: 'portrait-id', type: 2 },
        ],
      })
      .mockResolvedValueOnce({
        upload_level: {
          app_id: 200,
          app_title: 'game-200',
          developer_id: 100,
          developer_name: 'developer-100',
          status: 2,
          form_data: {
            info: { title: 'Game 200 draft', screen_orientation: 0 },
          },
        },
        level: {
          app_id: 200,
          app_title: 'game-200',
          developer_id: 100,
          developer_name: 'developer-100',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(output).toContain('未检测到游戏横竖屏设置');
    expect(output).not.toContain('landscape-id');
    expect(output).not.toContain('portrait-id');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('does not expose an unmatched ad space ID for the opposite orientation', async () => {
    const projectPath = createProjectPath('missing-matched-orientation');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectPath
    );
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [{ id: 'portrait-only-id', type: 2 }],
    });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(output).toContain('未返回与游戏方向（横屏）对应的广告位');
    expect(output).not.toContain('portrait-only-id');
    expect(output).not.toContain('广告位信息：');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('rejects blank ad space IDs returned by the server', async () => {
    const projectPath = createProjectPath('blank-space');
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
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [{ id: '   ', type: 1 }],
    });

    const output = await checkAdsStatus(createContext(projectPath));

    expect(output).not.toContain('匹配广告位 ID');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBeNull();
  });

  test('stores the latest valid matched ID and injects it into the generated guide', async () => {
    const projectPath = createProjectPath('fresh-success');
    cacheKeys.push(projectPath);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
        ad_config: {
          status: 1,
          landscape_space_id: 'stale-id',
          updated_at: 123,
        },
      },
      projectPath
    );
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [
        { id: ' fresh-id ', type: 1 },
        { id: 'opposite-orientation-id', type: 2 },
      ],
    });

    const output = await checkAdsStatus(createContext(projectPath));
    const guide = await adsTools.getAdIntegrationGuide(createContext(projectPath));

    expect(output).toContain('fresh-id');
    expect(output).not.toContain('opposite-orientation-id');
    expect(getSpaceIdFromCache(createContext(projectPath))).toBe('fresh-id');
    expect(guide).toContain("this.spaceId = 'fresh-id'");
    expect(guide).not.toContain('stale-id');
  });

  test('uses projectId as the cache isolation key when projectPath is unavailable', async () => {
    const projectId = createProjectPath('project-id-only');
    cacheKeys.push(projectId);
    saveAppCache(
      {
        developer_id: 100,
        app_id: 200,
        level: {
          app_id: 200,
          app_title: 'game-200',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      },
      projectId
    );
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
      status: 1,
      ad_spaces: [{ id: 'project-id-space', type: 1 }],
    });

    const context = createProjectIdContext(projectId);
    await checkAdsStatus(context);

    expect(getSpaceIdFromCache(context)).toBe('project-id-space');
  });

  test('keeps select_app and ads lookup on the same projectId-only cache', async () => {
    const projectId = createProjectPath('project-id-selection');
    cacheKeys.push(projectId);
    const context = createProjectIdContext(projectId);
    jest
      .spyOn(HttpClient.prototype, 'get')
      .mockResolvedValueOnce({
        level: {
          app_id: 200,
          app_title: 'game-200',
          developer_id: 100,
          developer_name: 'developer-100',
          status: 4,
          data: { title: 'Game 200', screen_orientation: 2 },
        },
      })
      .mockResolvedValueOnce({
        status: 1,
        ad_spaces: [{ id: 'selected-project-id-space', type: 1 }],
      });

    await selectApp(100, 200, undefined, context);
    await checkAdsStatus(context);

    expect(context.resolveApp()).toEqual(expect.objectContaining({ developerId: 100, appId: 200 }));
    expect(getSpaceIdFromCache(context)).toBe('selected-project-id-space');
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

  test('reloads and retries rewarded video once when show runs before the ad is ready', () => {
    const code = getAdManagerCode('automatic-id');
    const guideDescription =
      adsTools_Registration.find((tool) => tool.definition.name === 'get_ad_integration_guide')
        ?.definition.description || '';

    expect(code).toMatch(/this\.rewardedVideoAd\.show\(\)\s*\.catch/isu);
    expect(code).toMatch(
      /this\.rewardedVideoAd\.load\(\)\s*\.then\(\(\) => this\.rewardedVideoAd\.show\(\)\)/isu
    );
    expect(guideDescription).not.toContain('NO Promise style');
    expect(guideDescription).toMatch(/show\/load Promise recovery/iu);
  });
});
