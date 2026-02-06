/**
 * TapTap 广告管理器 - 完整源码和文档
 * 基于用户 demo 优化，保持简单风格
 */

import type { Documentation } from '../../core/utils/docHelpers.js';

/**
 * 生成 AdManager 代码（支持动态广告位 ID）
 * @param spaceId - 广告位ID（从服务器获取）
 * @returns AdManager 完整源码
 */
export function getAdManagerCode(spaceId: string): string {
  return `/**
 * TapTap 广告管理器
 *
 * 核心功能：激励视频广告（Rewarded Video）
 * 额外功能：插屏广告（Interstitial）、Banner 广告（可选）
 *
 * 广告位 ID（从 TapTap 开放平台获取）：
 * - 激励视频/插屏/Banner：${spaceId}
 *
 * 重要机制：
 * - 激励视频和插屏广告：播放完会自动加载下一个广告，无需手动 load()
 * - Banner 广告：不会自动刷新，需要手动销毁旧的并创建新的
 */

class TapAdManager {
  constructor() {
    // 广告位 ID（从 TapTap 后台获取）
    this.spaceId = '${spaceId}';

    // 广告实例
    this.rewardedVideoAd = null;
    this.interstitialAd = null;
    this.bannerAd = null;

    // 用户绑定的奖励回调
    this.rewardCallback = null;
  }

  /**
   * 初始化广告管理器（主要初始化激励视频）
   */
  async init() {
    console.log('[AdManager] 开始初始化...');

    // 检查 TapTap SDK
    if (typeof tap === 'undefined') {
      console.error('[AdManager] TapTap SDK 未加载');
      throw new Error('TapTap SDK 未加载，请在 TapTap 环境中运行');
    }

    // 初始化激励视频广告
    this._initRewardedVideo();

    // 初始化插屏广告
    this._initInterstitial();

    console.log('[AdManager] 初始化完成');
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

    this.rewardedVideoAd.show();
  }

  /**
   * 显示插屏广告
   */
  showInterstitial() {
    console.log('[AdManager] 调用 showInterstitial()');

    if (!this.interstitialAd) {
      console.error('[AdManager] 插屏广告未初始化');
      return;
    }

    this.interstitialAd.show();
  }

  /**
   * 初始化 Banner 广告
   * @param {Object} options - 可选配置
   * @param {Number} options.width - Banner 宽度（默认：屏幕宽度）
   * @param {Number} options.height - Banner 高度（默认：100）
   * @param {String} options.position - Banner 位置（'top' | 'bottom'，默认：'bottom'）
   */
  initBanner(options = {}) {
    console.log('[AdManager] 初始化 Banner 广告');

    const systemInfo = tap.getSystemInfoSync();

    // Banner 样式配置
    const style = {
      left: 0,
      width: options.width || systemInfo.screenWidth,
      height: options.height || 100,
    };

    // 根据位置计算 top 值
    if (options.position === 'top') {
      style.top = 0;
    } else {
      // 默认底部
      style.top = systemInfo.screenHeight - style.height;
    }

    this.bannerAd = tap.createBannerAd({
      adUnitId: this.spaceId,
      style: style,
      adIntervals: 30,  // 30 秒轮播
    });

    this.bannerAd.onLoad(() => {
      console.log('[AdManager] Banner 广告加载成功');
    });

    this.bannerAd.onError((err) => {
      console.error('[AdManager] Banner 广告错误:', err.errMsg);
    });

    console.log('[AdManager] Banner 初始化完成');
  }

  /**
   * 显示 Banner 广告
   */
  showBanner() {
    if (!this.bannerAd) {
      console.error('[AdManager] Banner 未初始化，请先调用 initBanner()');
      return;
    }

    this.bannerAd.show()
      .then(() => console.log('[AdManager] Banner 显示成功'))
      .catch((err) => console.error('[AdManager] Banner 显示失败:', err));
  }

  /**
   * 隐藏 Banner 广告
   */
  hideBanner() {
    if (!this.bannerAd) {
      console.error('[AdManager] Banner 未初始化');
      return;
    }

    this.bannerAd.hide();
    console.log('[AdManager] Banner 已隐藏');
  }

  /**
   * 刷新 Banner 广告
   * 自动销毁旧的 Banner 并创建新的
   * @param {Object} options - 可选配置（同 initBanner）
   */
  refreshBanner(options) {
    console.log('[AdManager] 刷新 Banner 广告');

    // 先销毁旧的 Banner
    if (this.bannerAd) {
      this.bannerAd.destroy();
      this.bannerAd = null;
      console.log('[AdManager] 旧 Banner 已销毁');
    }

    // 创建新的 Banner
    this.initBanner(options);

    // 自动显示新的 Banner
    this.showBanner();
  }

  /**
   * 销毁所有广告（清理资源）
   */
  destroy() {
    if (this.rewardedVideoAd) {
      this.rewardedVideoAd.destroy();
      this.rewardedVideoAd = null;
    }
    if (this.bannerAd) {
      this.bannerAd.destroy();
      this.bannerAd = null;
    }
    console.log('[AdManager] 所有广告已销毁');
  }

  // ============ 私有方法 ============

  /**
   * 初始化激励视频广告
   */
  _initRewardedVideo() {
    console.log('[AdManager] 初始化激励视频，广告位 ID:', this.spaceId);

    // 创建激励视频广告实例（只创建一次）
    this.rewardedVideoAd = tap.createRewardedVideoAd({
      adUnitId: this.spaceId
    });

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

      // 注意：广告播放完会自动加载下一个，无需手动 load()
      console.log('[AdManager] 广告已自动加载下一个');
    });

    // 预加载第一次
    this.rewardedVideoAd.load().catch((err) => {
      console.error('[AdManager] 预加载失败:', err);
    });

    console.log('[AdManager] 激励视频初始化完成');
  }

  /**
   * 初始化插屏广告
   */
  _initInterstitial() {
    console.log('[AdManager] 初始化插屏广告，广告位 ID:', this.spaceId);

    // 创建插屏广告实例（只创建一次）
    this.interstitialAd = tap.createInterstitialAd({
      adUnitId: this.spaceId
    });

    // 监听加载成功
    this.interstitialAd.onLoad(() => {
      console.log('[AdManager] 🎉 插屏广告加载成功，可以播放');
    });

    // 监听加载失败
    this.interstitialAd.onError((err) => {
      console.error('[AdManager] 插屏广告错误');
      console.error('[AdManager] 错误码:', err.errCode || '未知');
      console.error('[AdManager] 错误信息:', err.errMsg || '未知');
    });

    // 监听广告关闭
    this.interstitialAd.onClose(() => {
      console.log('[AdManager] 🚪 插屏广告关闭');
      // 注意：广告播放完会自动加载下一个，无需手动 load()
      console.log('[AdManager] 广告已自动加载下一个');
    });

    // 预加载第一次
    this.interstitialAd.load().catch((err) => {
      console.error('[AdManager] 预加载失败:', err);
    });

    console.log('[AdManager] 插屏广告初始化完成');
  }
}

// 导出单例
const adManager = new TapAdManager();
`;
}

/**
 * 激励视频广告管理器（核心实现）
 * 基于 /Volumes/Q/MiniGame/Mcp/TestAds/app/js/AdManager.js 优化
 *
 * @deprecated 使用 getAdManagerCode(spaceId) 代替
 */
export const AD_MANAGER_CORE_CODE = getAdManagerCode('请先调用 check_ads_status 获取广告位ID');

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
 * 插屏广告使用示例（额外功能）
 */
export const INTERSTITIAL_EXAMPLES = `// ========================================
// 插屏广告使用场景
// ========================================

// 初始化（必须先初始化，插屏会自动配置）
await adManager.init();

// 场景 1：关卡结束
function onLevelComplete() {
  showResultScreen();

  // 显示插屏广告
  adManager.showInterstitial();

  setTimeout(() => {
    backToMenu();
  }, 2000);
}

// 场景 2：游戏暂停
function onPauseButtonClick() {
  pauseGame();
  adManager.showInterstitial();
}

// 场景 3：返回主菜单
function onBackToMenuClick() {
  adManager.showInterstitial();
  setTimeout(() => {
    loadMainMenu();
  }, 1000);
}`;

/**
 * Banner 广告使用示例（额外功能）
 */
export const BANNER_EXAMPLES = `// ========================================
// Banner 广告使用场景
// ========================================

// 初始化广告管理器（游戏启动时）
await adManager.init();

// 方式 1：使用默认配置（底部显示）
adManager.initBanner();

// 方式 2：自定义配置
adManager.initBanner({
  width: 320,
  height: 100,
  position: 'bottom'  // 'top' | 'bottom'
});

// 场景 1：进入主菜单时显示
function enterMainMenu() {
  showMenu();
  adManager.showBanner();  // 显示 Banner
}

// 场景 2：开始游戏时隐藏
function startGame() {
  adManager.hideBanner();  // 隐藏 Banner
  loadGameScene();
}

// 场景 3：游戏结束时再显示
function onGameOver() {
  showGameOverScreen();
  adManager.showBanner();  // 重新显示 Banner
}

// 场景 4：刷新 Banner 广告（切换新内容）
// 注意：Banner 不会自动刷新，需要手动刷新
function refreshAd() {
  // 自动销毁旧的并创建新的
  adManager.refreshBanner({
    position: 'bottom'
  });
  console.log('Banner 已刷新为新内容');
}

// 定时刷新（例如每 30 秒刷新一次）
setInterval(() => {
  adManager.refreshBanner();
}, 30000);`;

/**
 * 文档数据（用于 Resource 生成）
 */
export const ADS_DOCUMENTATION: Documentation = {
  title: 'TapTap 广告管理器 (AdManager)',
  description: `简单易用的广告管理工具类，基于用户 demo 优化。

核心特性：
- ✅ 保持 demo 的简单风格，不使用 Promise
- ✅ 提供 onReward() 接口绑定奖励回调
- ✅ 主要功能：激励视频广告
- ✅ 额外功能：插屏广告、Banner 广告（可选）
- ✅ 固定广告 ID，无需配置`,

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
    optional: {
      title: '额外功能：插屏和 Banner 广告',
      description: '可选的广告类型，使用率较低',
      apis: [
        {
          name: 'showInterstitial',
          method: 'adManager.showInterstitial()',
          description: '显示插屏广告（无需预初始化）',
          parameters: {},
          returnValue: 'void',
          example: 'adManager.showInterstitial();',
        },
        {
          name: 'initBanner',
          method: 'adManager.initBanner(options)',
          description: '初始化 Banner 广告',
          parameters: {
            'options.width': 'Number - 宽度（可选，默认：屏幕宽度）',
            'options.height': 'Number - 高度（可选，默认：100）',
            'options.position': "String - 位置（'top' | 'bottom'，默认：'bottom'）",
          },
          returnValue: 'void',
          example: `adManager.initBanner({
  position: 'bottom'
});`,
        },
        {
          name: 'showBanner',
          method: 'adManager.showBanner()',
          description: '显示 Banner 广告',
          parameters: {},
          returnValue: 'void',
          example: 'adManager.showBanner();',
        },
        {
          name: 'hideBanner',
          method: 'adManager.hideBanner()',
          description: '隐藏 Banner 广告',
          parameters: {},
          returnValue: 'void',
          example: 'adManager.hideBanner();',
        },
        {
          name: 'refreshBanner',
          method: 'adManager.refreshBanner(options)',
          description: '刷新 Banner 广告（自动销毁旧的并创建新的）',
          parameters: {
            'options.width': 'Number - 宽度（可选）',
            'options.height': 'Number - 高度（可选）',
            'options.position': "String - 位置（'top' | 'bottom'，可选）",
          },
          returnValue: 'void',
          example: `adManager.refreshBanner({
  position: 'bottom'
});`,
        },
      ],
    },
  },
};
