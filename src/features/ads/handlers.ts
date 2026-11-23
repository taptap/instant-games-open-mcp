/**
 * 广告模块业务处理器
 * 负责广告状态检查、缓存管理等业务逻辑
 */

import { randomUUID } from 'node:crypto';
import type { ResolvedContext } from '../../core/types/context.js';
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

export interface RewardedPlacements {
  landscape?: string;
  portrait?: string;
}

// 两端共有的广告位格式是正整数字符串，Android 还要求可以转成 Long。
function getRewardedPlacements(spaces: AdSpace[]): RewardedPlacements | null {
  const placements: RewardedPlacements = {};
  for (const space of spaces) {
    const id = typeof space?.id === 'string' ? space.id.trim() : '';
    if (!/^[1-9]\d{0,18}$/u.test(id) || BigInt(id) > 9223372036854775807n) continue;
    if (space.type === 1) placements.landscape ??= id;
    if (space.type === 2) placements.portrait ??= id;
  }
  // 两项均缺失或同一广告位被配给两个方向。
  return placements.landscape === placements.portrait ? null : placements;
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
 * 按当前应用查询激励位，游戏方向在创建广告时判定。
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
        const placements = getRewardedPlacements(config.ad_spaces ?? []);
        if (!placements) {
          result += `服务端未返回可用的国内激励视频广告位，请核查广告风控或广告位配置。\n\n`;
          result += `${AUTOMATIC_AD_SPACE_ID_GUIDANCE} 处理后重新调用 \`check_ads_status\`。\n`;
          break;
        }

        const cached = cacheAdConfig(config, requestState, placements);
        if (!cached) {
          return `⚠️ 检查广告状态期间当前应用已切换或已有更新查询，本次查询结果已丢弃。\n\n请为当前选中的应用重新调用 \`check_ads_status\`。`;
        }

        result += `✅ **广告变现已开通，可以生成接入代码**\n\n`;
        result += `> 此状态不代表 \`window.tap\` 已注入、当前 ZIP 已正确上传或广告已在真机成功播放。\n\n`;
        if (!placements.landscape || !placements.portrait) {
          result += `当前仅有${placements.landscape ? '横屏' : '竖屏'}激励位，另一方向无法加载广告。\n\n`;
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
  placements: RewardedPlacements
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
        landscape_space_id: placements.landscape,
        portrait_space_id: placements.portrait,
        url: config.url,
        updated_at: Date.now(),
        request_id: requestState.requestId,
      },
    };
  });
  return cached;
}

/** 只读取当前应用最近一次状态查询缓存的有效激励位。 */
export function getCachedPlacements(ctx: ResolvedContext): RewardedPlacements | null {
  const cache = readAppCache(getAdsCacheKey(ctx));
  const config = cache?.ad_config;
  if (
    config?.status !== AdsStatus.Activated ||
    !cache?.ad_config_request_id ||
    config.request_id !== cache.ad_config_request_id
  )
    return null;

  return getRewardedPlacements([
    { type: 1, id: config.landscape_space_id ?? '' },
    { type: 2, id: config.portrait_space_id ?? '' },
  ]);
}
