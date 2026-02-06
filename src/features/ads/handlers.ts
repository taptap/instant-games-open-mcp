/**
 * 广告模块业务处理器
 * 负责广告状态检查、缓存管理等业务逻辑
 */

import type { ResolvedContext } from '../../core/types/index.js';
import { getAdConfig, AdsStatus, STATUS_DESCRIPTIONS, type AdConfigResponse } from './api.js';
import { readAppCache, saveAppCache } from '../../core/utils/cache.js';

/**
 * 检查广告开通状态
 * 根据不同状态返回不同的引导信息，状态为"已生效"时自动缓存广告位ID
 *
 * @param ctx - ResolvedContext
 * @returns 格式化的状态信息字符串
 */
export async function checkAdsStatus(ctx: ResolvedContext): Promise<string> {
  try {
    const config = await getAdConfig(ctx);

    const statusText = STATUS_DESCRIPTIONS[config.status] || '未知状态';

    let result = `## 🎮 广告功能状态\n\n`;
    result += `**当前状态：** ${statusText}\n`;
    result += `**广告位 ID：** ${config.space_id}\n\n`;

    // 根据不同状态提供不同的引导信息
    switch (config.status) {
      case AdsStatus.NotActivated:
        result += `❌ **广告功能尚未开通**\n\n`;
        result += `请先访问以下链接开通广告功能：\n`;
        result += `${config.url}\n\n`;
        result += `⚠️ **无法继续接入广告 SDK，请先完成开通。**\n\n`;
        result += `开通后，你可以说"重新检查广告状态"来刷新状态。\n`;
        break;

      case AdsStatus.UnderReview:
        result += `⏳ **资料正在审核中**\n\n`;
        result += `请耐心等待审核通过，审核通过后即可接入广告。\n`;
        result += `如有疑问，请访问：${config.url}\n\n`;
        result += `⚠️ **审核期间无法接入广告 SDK。**\n\n`;
        result += `审核通过后，你可以说"重新检查广告状态"来刷新状态。\n`;
        break;

      case AdsStatus.Activated:
        // ✅ 状态为 2，双条件校验：状态已生效 + space_id 有效
        if (!config.space_id || config.space_id.trim() === '') {
          result += `⚠️ **广告功能已生效，但广告位 ID 获取异常**\n\n`;
          result += `当前状态为"已生效"，但服务器未返回有效的广告位 ID（space_id）。\n`;
          result += `这可能是服务端临时异常，请稍后重试。\n\n`;
          result += `你可以稍后说"重新检查广告状态"来重新查询。\n`;
          break;
        }

        // 双条件满足，缓存数据
        await cacheAdConfig(config, ctx);

        result += `✅ **广告功能已开通，可以正常接入**\n\n`;
        result += `广告位 ID（space_id）已缓存：\`${config.space_id}\`\n\n`;
        result += `**两个前提条件已满足：**\n`;
        result += `- ✅ 状态：已生效\n`;
        result += `- ✅ 广告位 ID：${config.space_id}\n\n`;
        result += `接下来请调用 \`get_ad_integration_guide\` 工具获取完整的接入文档。\n`;
        result += `文档中会自动使用你的广告位 ID（${config.space_id}）。\n`;
        break;

      case AdsStatus.Banned:
        result += `🚫 **账号已被封禁，无法使用广告功能**\n\n`;
        result += `你的账号因违规被封禁，无法继续使用广告功能。\n`;
        result += `请联系 TapTap 客服了解详情：${config.url}\n\n`;
        result += `⚠️ **请勿继续进行广告接入操作。**\n`;
        break;

      default:
        result += `详细信息：${config.url}\n`;
        break;
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 查询广告状态失败：${error.message}`;
    }
    return `❌ 查询广告状态失败：${String(error)}`;
  }
}

/**
 * 缓存广告配置（仅在状态为 2 时调用）
 *
 * @param config - 服务器返回的广告配置
 * @param ctx - ResolvedContext
 */
async function cacheAdConfig(config: AdConfigResponse, ctx: ResolvedContext): Promise<void> {
  const projectPath = ctx.projectPath;

  // 读取现有缓存
  const existingCache = readAppCache(projectPath);

  if (!existingCache) {
    console.error('[Ads] Cannot cache ad config: No app cache found');
    return;
  }

  // 合并广告配置到现有缓存
  const updatedCache = {
    ...existingCache,
    ad_config: {
      status: config.status,
      space_id: config.space_id,
      url: config.url,
      updated_at: Date.now(),
    },
  };

  // 保存到缓存
  saveAppCache(updatedCache, projectPath);
}

/**
 * 从缓存读取广告位 ID
 * 用于 get_ad_integration_guide 工具
 *
 * @param ctx - ResolvedContext
 * @returns 广告位ID，如果不存在或状态非"已生效"则返回 null
 */
export function getSpaceIdFromCache(ctx: ResolvedContext): string | null {
  const projectPath = ctx.projectPath;
  const cache = readAppCache(projectPath);

  if (!cache?.ad_config) {
    return null;
  }

  // 检查状态是否为"已生效"
  if (cache.ad_config.status !== AdsStatus.Activated) {
    return null;
  }

  return cache.ad_config.space_id;
}
