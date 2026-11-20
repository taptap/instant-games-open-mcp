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
 * 检查广告开通状态
 * 广告位由服务端按游戏实际方向下发，接入代码不需要广告位 ID，
 * 因此这里也不再要求开发者设置横竖屏。
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
    const currentCache = getCurrentPersistedAdsStatusRequest(requestState);
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

        const cached = cacheAdConfig(config, requestState, landscapeSpace, portraitSpace);
        if (!cached) {
          return `⚠️ 检查广告状态期间当前应用已切换或已有更新查询，本次查询结果已丢弃。\n\n请为当前选中的应用重新调用 \`check_ads_status\`。`;
        }

        result += `✅ **广告变现已开通，可以生成接入代码**\n\n`;
        result += `> 此状态不代表 \`window.tap\` 已注入、当前 ZIP 已正确上传或广告已在真机成功播放。\n\n`;
        result += `**广告位：** 由平台按游戏实际方向自动下发，**接入代码里不需要填写广告位 ID**。\n\n`;

        if (landscapeSpace && portraitSpace) {
          result += `服务端已就绪的广告位类型：横屏 + 竖屏激励视频。\n\n`;
        } else if (landscapeSpace || portraitSpace) {
          result += `⚠️ 服务端本次只返回了一个方向的广告位，请稍后重新调用 \`check_ads_status\` 确认。\n\n`;
        } else {
          result += `⚠️ 服务端本次未返回广告位配置，可能为临时异常，请稍后重新调用 \`check_ads_status\`。\n\n`;
        }

        result += `${AUTOMATIC_AD_SPACE_ID_GUIDANCE}\n\n`;
        result += `接下来请调用 \`get_ad_integration_guide\` 获取接入文档。\n`;

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
 * 读取广告配置缓存状态
 * 广告位由服务端下发，接入指南只依赖「是否已生效」，不再依赖广告位 ID。
 *
 * @param ctx - ResolvedContext
 * @returns 是否已生效，以及缓存的横/竖广告位（仅用于状态展示）
 */
export interface AdsActivation {
  activated: boolean;
  adSpaces: AdSpace[];
}

export function getAdsActivation(ctx: ResolvedContext): AdsActivation {
  const inactive: AdsActivation = { activated: false, adSpaces: [] };
  const cache = readAppCache(getAdsCacheKey(ctx));

  if (!cache?.ad_config) return inactive;
  if (!cache.ad_config_request_id || cache.ad_config.request_id !== cache.ad_config_request_id) {
    return inactive;
  }
  if (cache.ad_config.status !== AdsStatus.Activated) return inactive;

  const adSpaces: AdSpace[] = [];
  const landscape = normalizeAdSpaceId(cache.ad_config.landscape_space_id);
  if (landscape) adSpaces.push({ id: landscape, type: 1 });
  const portrait = normalizeAdSpaceId(cache.ad_config.portrait_space_id);
  if (portrait) adSpaces.push({ id: portrait, type: 2 });

  return { activated: true, adSpaces };
}
