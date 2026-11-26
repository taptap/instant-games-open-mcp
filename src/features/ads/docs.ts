/**
 * TapTap 广告管理器 - 完整源码和文档
 * 基于用户 demo 优化，保持简单风格
 */

import type { Documentation } from '../../core/utils/docHelpers.js';
import type { RewardedPlacements } from './handlers.js';

/** 生成当前应用的激励视频接入代码。 */
export function getAdManagerCode(placements: RewardedPlacements): string {
  return `/** TapTap 激励视频广告 */
class TapAdManager {
  constructor() {
    this.rewardedVideoAd = null;

    // 用户绑定的奖励回调
    this.rewardCallback = null;
  }

  /**
   * 初始化激励视频
   */
  async init() {
    console.log('[AdManager] 开始初始化...');

    // 检查 TapTap SDK
    if (typeof tap === 'undefined') {
      console.error('[AdManager] TapTap SDK 未加载');
      throw new Error('TapTap SDK 未加载，请在 TapTap 环境中运行');
    }

    if (!this.rewardedVideoAd) this._initRewardedVideo();
  }

  /**
   * 绑定奖励回调（核心接口）
   * @param {Function} callback - 用户看完广告后的奖励回调
   *
   * 示例：
   * adManager.onReward(() => {
   *   console.log('发放奖励：金币 +100');
   *   player.coins += 100;
   * });
   */
  onReward(callback) {
    if (typeof callback !== 'function') {
      console.error('[AdManager] onReward 参数必须是函数');
      return;
    }
    this.rewardCallback = callback;
    console.log('[AdManager] 奖励回调已绑定');
  }

  /**
   * 显示激励视频广告
   */
  showRewardedVideo() {
    console.log('[AdManager] 调用 showRewardedVideo()');

    if (!this.rewardedVideoAd) {
      console.error('[AdManager] 激励视频未初始化');
      return;
    }

    this.rewardedVideoAd.show().catch((showError) => {
      console.warn('[AdManager] 激励视频未就绪，重新加载后重试一次:', showError);
      return this.rewardedVideoAd.load()
        .then(() => this.rewardedVideoAd.show())
        .catch((retryError) => {
          console.error('[AdManager] 激励视频重试失败:', retryError);
        });
    });
  }

  destroy() {
    if (this.rewardedVideoAd) {
      this.rewardedVideoAd.destroy();
      this.rewardedVideoAd = null;
    }
  }

  // ============ 私有方法 ============

  /**
   * 初始化激励视频广告
   */
  _initRewardedVideo() {
    const placements = ${JSON.stringify(placements)};
    let width = globalThis.innerWidth;
    let height = globalThis.innerHeight;
    if (!(width > 0 && height > 0)) {
      const info = tap.getSystemInfoSync?.() || {};
      const hasWindow = info.windowWidth > 0 && info.windowHeight > 0;
      width = hasWindow ? info.windowWidth : info.screenWidth;
      height = hasWindow ? info.windowHeight : info.screenHeight;
    }
    if (!(width > 0 && height > 0)) {
      console.warn('[AdManager] 游戏窗口尺寸未就绪，请在布局完成后重新初始化');
      return;
    }
    const orientation = width > height ? 'landscape' : 'portrait';
    const adUnitId = placements[orientation];
    if (!adUnitId) {
      console.warn('[AdManager] 当前游戏方向没有可用激励位');
      return;
    }
    this.rewardedVideoAd = tap.createRewardedVideoAd({ adUnitId, orientation });

    // 监听加载成功
    this.rewardedVideoAd.onLoad(() => {
      console.log('[AdManager] 🎉 激励视频加载成功，可以播放');
    });

    // 监听加载失败
    this.rewardedVideoAd.onError((err) => {
      console.error('[AdManager] 激励视频错误');
      console.error('[AdManager] 错误码:', err.errCode || '未知');
      console.error('[AdManager] 错误信息:', err.errMsg || '未知');
    });

    // 监听广告关闭（核心逻辑：判断是否看完并发放奖励）
    this.rewardedVideoAd.onClose((res) => {
      console.log('[AdManager] 🚪 激励视频关闭');

      if (res && res.isEnded) {
        console.log('[AdManager] ✅ 用户完整观看视频，发放奖励');

        // 调用用户绑定的奖励回调
        if (this.rewardCallback) {
          try {
            this.rewardCallback();
          } catch (error) {
            console.error('[AdManager] 奖励回调执行失败:', error);
          }
        } else {
          console.warn('[AdManager] 未绑定奖励回调，请调用 onReward() 绑定');
        }
      } else {
        console.log('[AdManager] ⚠️ 用户提前关闭，未获得奖励');
      }

    });

    // 预加载第一次
    this.rewardedVideoAd.load().catch((err) => {
      console.error('[AdManager] 预加载失败:', err);
    });

    console.log('[AdManager] 激励视频初始化完成');
  }

}

// 导出单例
const adManager = new TapAdManager();
`;
}

/**
 * 激励视频广告使用示例（核心）
 */
export const REWARDED_VIDEO_EXAMPLES = `// ========================================
// 示例 1：游戏复活功能
// ========================================

// 在游戏启动时初始化（异步）
async function initGame() {
  await adManager.init();

  // 绑定奖励回调
  adManager.onReward(() => {
    console.log('用户看完广告，复活玩家');
    player.revive();
    resumeGame();
  });

  console.log('游戏初始化完成');
}

// 调用初始化
initGame();

// 玩家死亡时显示复活按钮
function onPlayerDead() {
  showReviveButton();
}

// 点击复活按钮
function onReviveButtonClick() {
  adManager.showRewardedVideo();
}

// ========================================
// 示例 2：获取金币奖励
// ========================================

// 初始化和绑定回调
async function setupAds() {
  await adManager.init();
  adManager.onReward(() => {
    console.log('用户看完广告，发放金币奖励');
    player.coins += 100;
    showRewardMessage('获得 100 金币！');
  });
}

setupAds();

// 点击"看广告获取金币"按钮
function onGetCoinsButtonClick() {
  adManager.showRewardedVideo();
}

// ========================================
// 示例 3：跳过关卡
// ========================================

async function initAdManager() {
  await adManager.init();
  adManager.onReward(() => {
    console.log('用户看完广告，跳过当前关卡');
    skipCurrentLevel();
    loadNextLevel();
  });
}

initAdManager();

function onSkipLevelButtonClick() {
  adManager.showRewardedVideo();
}

// ========================================
// 示例 4：多场景奖励（动态更改回调）
// ========================================

// 初始化（只需一次）
await adManager.init();

// 场景 1：复活
function showReviveAd() {
  adManager.onReward(() => {
    player.revive();
  });
  adManager.showRewardedVideo();
}

// 场景 2：金币
function showCoinsAd() {
  adManager.onReward(() => {
    player.coins += 100;
  });
  adManager.showRewardedVideo();
}

// 场景 3：道具
function showItemAd() {
  adManager.onReward(() => {
    player.addItem('super_power');
  });
  adManager.showRewardedVideo();
}`;

/**
 * 文档数据（用于 Resource 生成）
 */
export const ADS_DOCUMENTATION: Documentation = {
  title: 'TapTap 广告管理器 (AdManager)',
  description: '初始化时按游戏窗口方向选择激励位，完整观看后触发 onReward。',

  categories: {
    core: {
      title: '核心功能：激励视频广告',
      description: '最重要的广告类型，用于复活、奖励等场景',
      apis: [
        {
          name: 'init',
          method: 'adManager.init()',
          description: '初始化广告管理器（必须在使用前调用）',
          parameters: {},
          returnValue: 'void',
          example: 'adManager.init();',
        },
        {
          name: 'onReward',
          method: 'adManager.onReward(callback)',
          description: '绑定奖励回调，用户看完广告后自动调用',
          parameters: {
            callback: 'Function - 奖励回调函数',
          },
          returnValue: 'void',
          example: `adManager.onReward(() => {
  player.coins += 100;
});`,
        },
        {
          name: 'showRewardedVideo',
          method: 'adManager.showRewardedVideo()',
          description: '显示激励视频广告',
          parameters: {},
          returnValue: 'void',
          example: 'adManager.showRewardedVideo();',
        },
      ],
    },
  },
};
