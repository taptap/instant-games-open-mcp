/**
 * 广告模块业务处理器
 * 负责广告状态检查、缓存管理等业务逻辑
 */

import { randomUUID } from 'node:crypto';
import type { ResolvedContext } from '../../core/types/index.js';
import {
  getAdConfig,
  AdsStatus,
  STATUS_DESCRIPTIONS,
  type AdConfigResponse,
  type AdSpace,
} from './api.js';
import { fetchAppDetail } from '../app/api.js';
import { mutateAppCache, readAppCache, type AppCacheInfo } from '../../core/utils/cache.js';

const AUTOMATIC_AD_SPACE_ID_GUIDANCE =
  '不要向开发者索要广告位 ID，也不要使用手工填写的 ID 作为兜底。';

interface SelectedAppIdentity {
  developerId: number;
  appId: number;
}

interface AdsStatusRequestState {
  key: string;
  token: symbol;
  cacheKey?: string;
  requestId: string;
  app: SelectedAppIdentity;
}

// 每个应用只有最新发起的查询才能发布可操作结果。
const latestAdsStatusRequests = new Map<string, symbol>();
const SUPERSEDED_STATUS_RESULT =
  '⚠️ 已有更新的广告状态查询，本次较早查询结果已丢弃。\n\n请以最新查询结果为准。';

function normalizeScreenOrientation(value: unknown): 1 | 2 | undefined {
  return value === 1 || value === 2 ? value : undefined;
}

function normalizeAdSpaceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function findValidAdSpace(adSpaces: AdSpace[], type: 1 | 2): AdSpace | undefined {
  const space = adSpaces.find((item) => item.type === type && normalizeAdSpaceId(item.id));
  const id = normalizeAdSpaceId(space?.id);
  return space && id ? { ...space, id } : undefined;
}

function getSelectedAppIdentity(ctx: ResolvedContext): SelectedAppIdentity | null {
  const app = ctx.resolveApp();
  if (!app.developerId || !app.appId) return null;
  return { developerId: app.developerId, appId: app.appId };
}

function isCurrentSelectedApp(ctx: ResolvedContext, expected: SelectedAppIdentity): boolean {
  const current = getSelectedAppIdentity(ctx);
  return current?.developerId === expected.developerId && current.appId === expected.appId;
}

function getAdsCacheKey(ctx: ResolvedContext): string | undefined {
  return ctx.getCacheIsolationKey();
}

function beginAdsStatusRequest(ctx: ResolvedContext): AdsStatusRequestState | null {
  const cacheKey = getAdsCacheKey(ctx);
  const requestId = randomUUID();
  let app: SelectedAppIdentity | undefined;

  mutateAppCache(cacheKey, (current) => {
    if (!current?.developer_id || !current.app_id) return undefined;
    app = { developerId: current.developer_id, appId: current.app_id };
    return {
      ...current,
      ad_config_request_id: requestId,
      ad_config: undefined,
    };
  });

  if (!app) return null;

  const key = `${cacheKey ?? '__workspace__'}\u0000${app.developerId}\u0000${app.appId}`;
  const token = Symbol(key);
  latestAdsStatusRequests.set(key, token);
  return { key, token, cacheKey, requestId, app };
}

function isLatestAdsStatusRequest(state: AdsStatusRequestState | null): boolean {
  return state !== null && latestAdsStatusRequests.get(state.key) === state.token;
}

function getCurrentPersistedAdsStatusRequest(
  state: AdsStatusRequestState | null
): AppCacheInfo | null {
  if (!state) return null;
  const current = readAppCache(state.cacheKey);
  const isCurrent =
    current?.developer_id === state.app.developerId &&
    current.app_id === state.app.appId &&
    current.ad_config_request_id === state.requestId;
  return isCurrent ? current : null;
}

function finishAdsStatusRequest(state: AdsStatusRequestState | null): void {
  if (state && latestAdsStatusRequests.get(state.key) === state.token) {
    latestAdsStatusRequests.delete(state.key);
  }
}

/**
 * 从缓存中获取游戏的横竖屏设置
 * screen_orientation: 1=竖屏, 2=横屏
 * 优先读取 upload_level（审核版本），其次读取 level（线上版本）
 */
function getScreenOrientationFromCache(cache: AppCacheInfo): 1 | 2 | undefined {
  // 优先从审核版本读取
  const fromUpload = cache.upload_level?.form_data?.info?.screen_orientation;
  if (fromUpload !== undefined) return normalizeScreenOrientation(fromUpload);

  // 其次从线上版本读取
  const fromLevel = cache.level?.data?.screen_orientation;
  const levelOrientation = normalizeScreenOrientation(fromLevel);
  if (levelOrientation !== undefined) return levelOrientation;

  return undefined;
}

async function refreshAppInfoForAds(
  state: AdsStatusRequestState,
  ctx: ResolvedContext
): Promise<AppCacheInfo | null> {
  const detail = await fetchAppDetail(state.app.appId, ctx);
  if (
    !detail ||
    detail.appId !== state.app.appId ||
    (detail.developerId !== 0 && detail.developerId !== state.app.developerId)
  ) {
    throw new Error('服务端未返回当前应用信息');
  }

  let refreshed: AppCacheInfo | null = null;
  mutateAppCache(state.cacheKey, (current) => {
    if (
      !current ||
      current.developer_id !== state.app.developerId ||
      current.app_id !== state.app.appId ||
      current.ad_config_request_id !== state.requestId
    ) {
      return undefined;
    }

    refreshed = {
      ...current,
      developer_name: detail.developerName || current.developer_name,
      app_title: detail.appTitle || current.app_title,
      miniapp_id: detail.miniappId || current.miniapp_id,
      level: detail.level,
      upload_level: detail.uploadLevel,
      updated_at: Date.now(),
      status_updated_at: Date.now(),
    };
    return refreshed;
  });

  return refreshed;
}

/**
 * 检查广告开通状态
 * 根据不同状态返回不同的引导信息，状态为"已生效"时自动缓存广告位ID
 *
 * @param ctx - ResolvedContext
 * @returns 格式化的状态信息字符串
 */
export async function checkAdsStatus(ctx: ResolvedContext): Promise<string> {
  let requestState: AdsStatusRequestState | null = null;

  try {
    requestState = beginAdsStatusRequest(ctx);
    const requestedApp = requestState?.app ?? getSelectedAppIdentity(ctx);
    const config = await getAdConfig(ctx, requestedApp ?? undefined);

    if (requestState && !isLatestAdsStatusRequest(requestState)) {
      return SUPERSEDED_STATUS_RESULT;
    }

    if (!requestedApp || !isCurrentSelectedApp(ctx, requestedApp)) {
      return `⚠️ 检查广告状态期间当前应用已切换，本次查询结果已丢弃。\n\n请为当前选中的应用重新调用 \`check_ads_status\`。`;
    }
    let currentCache = getCurrentPersistedAdsStatusRequest(requestState);
    if (requestState && !currentCache) {
      return SUPERSEDED_STATUS_RESULT;
    }

    const statusText = STATUS_DESCRIPTIONS[config.status] || '未知状态';

    let result = `## 🎮 广告功能状态\n\n`;
    result += `**当前状态：** ${statusText}\n\n`;

    switch (config.status) {
      case AdsStatus.NotActivated:
        result += `❌ **广告功能尚未开通**\n\n`;
        if (config.url) {
          result += `请先访问以下链接开通广告功能：\n${config.url}\n\n`;
        }
        result += `⚠️ **无法继续接入广告 SDK，请先完成开通。**\n\n`;
        result += `开通后，你可以说"重新检查广告状态"来刷新状态。\n`;
        break;

      case AdsStatus.Activated: {
        const adSpaces = config.ad_spaces ?? [];
        const landscapeSpace = findValidAdSpace(adSpaces, 1);
        const portraitSpace = findValidAdSpace(adSpaces, 2);

        // 校验：至少需要有一个广告位
        if (!landscapeSpace && !portraitSpace) {
          result += `⚠️ **广告功能已生效，但广告位 ID 获取异常**\n\n`;
          result += `服务器未返回有效的广告位信息，这可能是服务端临时异常，请稍后重试。\n\n`;
          result += `${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n\n`;
          result += `请稍后重新调用 \`check_ads_status\`。\n`;
          break;
        }

        // 读取游戏横竖屏设置
        let screenOrientation = currentCache
          ? getScreenOrientationFromCache(currentCache)
          : undefined;

        if (screenOrientation === undefined && currentCache && requestState) {
          try {
            await refreshAppInfoForAds(requestState, ctx);
          } catch (refreshError) {
            return `⚠️ **无法确认游戏横竖屏设置**\n\n刷新应用信息失败：${
              refreshError instanceof Error ? refreshError.message : String(refreshError)
            }\n\n请重新调用 \`check_ads_status\`，不要重复设置或猜测横竖屏。`;
          }

          if (!isLatestAdsStatusRequest(requestState) || !isCurrentSelectedApp(ctx, requestedApp)) {
            return SUPERSEDED_STATUS_RESULT;
          }

          currentCache = getCurrentPersistedAdsStatusRequest(requestState);
          if (!currentCache) return SUPERSEDED_STATUS_RESULT;
          screenOrientation = getScreenOrientationFromCache(currentCache);
        }

        result += `✅ **广告变现已开通，服务端配置可用于生成接入代码**\n\n`;
        result += `> 此状态不代表 \`window.tap\` 已注入、当前 ZIP 已正确上传或广告已在真机成功播放。\n\n`;

        // 展示游戏横竖屏设置及对应广告位
        if (screenOrientation === undefined) {
          result += `⚠️ **未检测到游戏横竖屏设置**\n\n`;
          result += `服务端当前没有有效的横竖屏设置，无法自动匹配对应广告位 ID。\n\n`;
          result += `请先询问用户选择游戏方向：\n`;
          result += `- \`screenOrientation: 1\` → 竖屏\n`;
          result += `- \`screenOrientation: 2\` → 横屏\n\n`;
          result += `用户确认后，调用 \`update_app_info\`：\n`;
          result += `- \`developerId: ${requestedApp.developerId}\`\n`;
          result += `- \`appId: ${requestedApp.appId}\`\n`;
          result += `- \`screenOrientation: 用户选择的 1 或 2\`\n\n`;
          result += `${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n\n`;
          result += `设置成功后重新调用 \`check_ads_status\`，自动匹配广告位并继续接入。\n`;
        } else {
          const orientationLabel = screenOrientation === 2 ? '横屏' : '竖屏';
          const matchedSpace = screenOrientation === 2 ? landscapeSpace : portraitSpace;

          result += `**游戏屏幕方向：** ${orientationLabel}（screen_orientation=${screenOrientation}）\n`;

          if (matchedSpace) {
            const cached = cacheAdConfig(config, requestState, landscapeSpace, portraitSpace);
            if (!cached) {
              return `⚠️ 检查广告状态期间当前应用已切换或已有更新查询，本次查询结果已丢弃。\n\n请为当前选中的应用重新调用 \`check_ads_status\`。`;
            }
            result += `**匹配广告位 ID：** \`${matchedSpace.id}\`\n\n`;
            result += `接下来请调用 \`get_ad_integration_guide\` 工具获取完整的接入文档。\n`;
            result += `文档中会自动使用匹配的广告位 ID（\`${matchedSpace.id}\`）。\n`;
          } else {
            result += `⚠️ 服务器未返回与游戏方向（${orientationLabel}）对应的广告位。\n\n`;
            result += `${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n\n`;
            result += `请稍后重新调用 \`check_ads_status\`；如果问题持续存在，请联系 TapTap 运营确认。\n`;
          }
        }

        break;
      }

      case AdsStatus.Banned:
        result += `🚫 **账号已被封禁，无法使用广告功能**\n\n`;
        result += `你的账号因违规被封禁，无法继续使用广告功能。\n`;
        if (config.url) {
          result += `请联系 TapTap 客服了解详情：${config.url}\n\n`;
        }
        result += `⚠️ **请勿继续进行广告接入操作。**\n`;
        break;

      default:
        if (config.url) {
          result += `详细信息：${config.url}\n`;
        }
        break;
    }

    return result;
  } catch (error) {
    if (
      requestState &&
      (!isLatestAdsStatusRequest(requestState) ||
        !getCurrentPersistedAdsStatusRequest(requestState))
    ) {
      return SUPERSEDED_STATUS_RESULT;
    }
    if (error instanceof Error) {
      return `❌ 查询广告状态失败：${error.message}\n\n${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n请解决上述错误后重新调用 \`check_ads_status\`。`;
    }
    return `❌ 查询广告状态失败：${String(error)}\n\n${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n请解决上述错误后重新调用 \`check_ads_status\`。`;
  } finally {
    finishAdsStatusRequest(requestState);
  }
}

/**
 * 缓存广告配置（仅在状态为"已生效"时调用）
 */
function cacheAdConfig(
  config: AdConfigResponse,
  requestState: AdsStatusRequestState | null,
  landscapeSpace?: AdSpace,
  portraitSpace?: AdSpace
): boolean {
  if (!requestState) return false;

  let cached = false;
  mutateAppCache(requestState.cacheKey, (existingCache) => {
    if (
      !existingCache ||
      existingCache.developer_id !== requestState.app.developerId ||
      existingCache.app_id !== requestState.app.appId ||
      existingCache.ad_config_request_id !== requestState.requestId
    ) {
      return undefined;
    }

    cached = true;
    return {
      ...existingCache,
      ad_config: {
        status: config.status,
        landscape_space_id: landscapeSpace?.id,
        portrait_space_id: portraitSpace?.id,
        url: config.url,
        updated_at: Date.now(),
        request_id: requestState.requestId,
      },
    };
  });
  return cached;
}

/**
 * 从缓存读取与游戏方向匹配的广告位 ID
 * 用于 get_ad_integration_guide 工具
 *
 * @param ctx - ResolvedContext
 * @returns 广告位ID，如果不存在或状态非"已生效"则返回 null
 */
export function getSpaceIdFromCache(ctx: ResolvedContext): string | null {
  const cache = readAppCache(getAdsCacheKey(ctx));

  if (!cache?.ad_config) return null;
  if (!cache.ad_config_request_id || cache.ad_config.request_id !== cache.ad_config_request_id) {
    return null;
  }
  if (cache.ad_config.status !== AdsStatus.Activated) return null;

  // 读取游戏横竖屏设置
  const screenOrientation = getScreenOrientationFromCache(cache);

  if (screenOrientation === 2) {
    // 横屏游戏 → 横屏广告位
    return normalizeAdSpaceId(cache.ad_config.landscape_space_id) ?? null;
  } else if (screenOrientation === 1) {
    // 竖屏游戏 → 竖屏广告位
    return normalizeAdSpaceId(cache.ad_config.portrait_space_id) ?? null;
  }

  // 未设置横竖屏时不能猜测广告位，必须先完成应用方向配置
  return null;
}
