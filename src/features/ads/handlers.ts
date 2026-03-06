/**
 * 广告模块业务处理器
 * 负责广告状态检查、缓存管理等业务逻辑
 */

import type { ResolvedContext } from '../../core/types/index.js';
import { getAdConfig, AdsStatus, STATUS_DESCRIPTIONS, type AdConfigResponse } from './api.js';
import { readAppCache, saveAppCache } from '../../core/utils/cache.js';

/**
 * 从缓存中获取游戏的横竖屏设置
 * screen_orientation: 1=竖屏, 2=横屏
 * 优先读取 upload_level（审核版本），其次读取 level（线上版本）
 */
function getScreenOrientationFromCache(ctx: ResolvedContext): number | undefined {
  const cache = readAppCache(ctx.projectPath);
  if (!cache) return undefined;

  // 优先从审核版本读取
  const fromUpload = cache.upload_level?.form_data?.info?.screen_orientation;
  if (fromUpload !== undefined) return fromUpload;

  // 其次从线上版本读取
  const fromLevel = cache.level?.data?.screen_orientation;
  if (fromLevel !== undefined) return fromLevel;

  return undefined;
}

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
        const landscapeSpace = adSpaces.find((s) => s.type === 1);
        const portraitSpace = adSpaces.find((s) => s.type === 2);

        // 校验：至少需要有一个广告位
        if (adSpaces.length === 0) {
          result += `⚠️ **广告功能已生效，但广告位 ID 获取异常**\n\n`;
          result += `服务器未返回有效的广告位信息（ad_spaces 为空），这可能是服务端临时异常，请稍后重试。\n\n`;
          result += `你可以稍后说"重新检查广告状态"来重新查询。\n`;
          break;
        }

        // 读取游戏横竖屏设置
        const screenOrientation = getScreenOrientationFromCache(ctx);

        // 展示广告位信息
        result += `✅ **广告功能已开通，可以正常接入**\n\n`;
        result += `**广告位信息：**\n`;
        if (landscapeSpace) {
          result += `- 横屏广告位 ID（type=1）：\`${landscapeSpace.id}\`\n`;
        }
        if (portraitSpace) {
          result += `- 竖屏广告位 ID（type=2）：\`${portraitSpace.id}\`\n`;
        }
        result += '\n';

        // 展示游戏横竖屏设置及对应广告位
        if (screenOrientation === undefined) {
          result += `⚠️ **未检测到游戏横竖屏设置**\n\n`;
          result += `无法自动匹配对应广告位 ID。请先通过 \`update_app_info\` 工具设置游戏的横竖屏方向：\n`;
          result += `- \`screenOrientation: 1\` → 竖屏\n`;
          result += `- \`screenOrientation: 2\` → 横屏\n\n`;
          result += `设置后重新调用 \`check_ads_status\` 即可自动匹配广告位。\n`;
        } else {
          const orientationLabel = screenOrientation === 2 ? '横屏' : '竖屏';
          const matchedSpace = screenOrientation === 2 ? landscapeSpace : portraitSpace;

          result += `**游戏屏幕方向：** ${orientationLabel}（screen_orientation=${screenOrientation}）\n`;

          if (matchedSpace) {
            result += `**匹配广告位 ID：** \`${matchedSpace.id}\`\n\n`;
            result += `接下来请调用 \`get_ad_integration_guide\` 工具获取完整的接入文档。\n`;
            result += `文档中会自动使用匹配的广告位 ID（\`${matchedSpace.id}\`）。\n`;
          } else {
            result += `⚠️ 服务器未返回与游戏方向（${orientationLabel}）对应的广告位，请联系 TapTap 运营确认。\n`;
          }
        }

        // 缓存广告配置
        await cacheAdConfig(config, ctx);
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
    if (error instanceof Error) {
      return `❌ 查询广告状态失败：${error.message}`;
    }
    return `❌ 查询广告状态失败：${String(error)}`;
  }
}

/**
 * 缓存广告配置（仅在状态为"已生效"时调用）
 */
async function cacheAdConfig(config: AdConfigResponse, ctx: ResolvedContext): Promise<void> {
  const projectPath = ctx.projectPath;
  const existingCache = readAppCache(projectPath);

  if (!existingCache) {
    return;
  }

  const adSpaces = config.ad_spaces ?? [];
  const landscapeSpace = adSpaces.find((s) => s.type === 1);
  const portraitSpace = adSpaces.find((s) => s.type === 2);

  const updatedCache = {
    ...existingCache,
    ad_config: {
      status: config.status,
      landscape_space_id: landscapeSpace?.id,
      portrait_space_id: portraitSpace?.id,
      url: config.url,
      updated_at: Date.now(),
    },
  };

  saveAppCache(updatedCache, projectPath);
}

/**
 * 从缓存读取与游戏方向匹配的广告位 ID
 * 用于 get_ad_integration_guide 工具
 *
 * @param ctx - ResolvedContext
 * @returns 广告位ID，如果不存在或状态非"已生效"则返回 null
 */
export function getSpaceIdFromCache(ctx: ResolvedContext): string | null {
  const cache = readAppCache(ctx.projectPath);

  if (!cache?.ad_config) return null;
  if (cache.ad_config.status !== AdsStatus.Activated) return null;

  // 读取游戏横竖屏设置
  const screenOrientation = getScreenOrientationFromCache(ctx);

  if (screenOrientation === 2) {
    // 横屏游戏 → 横屏广告位
    return cache.ad_config.landscape_space_id ?? null;
  } else if (screenOrientation === 1) {
    // 竖屏游戏 → 竖屏广告位
    return cache.ad_config.portrait_space_id ?? null;
  }

  // 未设置横竖屏：返回任意一个可用的广告位
  return cache.ad_config.landscape_space_id ?? cache.ad_config.portrait_space_id ?? null;
}
