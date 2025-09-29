"""TapTap SDK 集成文档"""

SDK_DOCUMENTATION = {
    "title": "TapTap SDK 集成指南",
    "description": "在各种游戏引擎和平台中集成 TapTap SDK 的完整指南",
    "categories": {
        "unity": {
            "title": "Unity 集成",
            "description": "在 Unity 游戏引擎中集成 TapTap SDK",
            "setup": {
                "title": "安装和配置",
                "steps": [
                    "从 TapTap 开发者后台下载 Unity SDK",
                    "导入 .unitypackage 文件到项目",
                    "配置应用信息和权限",
                    "初始化 SDK"
                ],
                "example": """
// 1. 导入命名空间
using TapTap.Common;
using TapTap.Login;
using TapTap.Achievement;
using TapTap.Leaderboard;

public class TapTapManager : MonoBehaviour
{
    [Header("TapTap 配置")]
    public string clientId = "your_client_id";
    public string clientToken = "your_client_token";

    void Start()
    {
        InitializeTapTap();
    }

    void InitializeTapTap()
    {
        // 初始化 TapTap SDK
        TapTapSDK.Init(clientId, clientToken, TapTapRegionType.CN);

        // 初始化登录模块
        TapLogin.Init(clientId);

        // 初始化成就模块
        TapAchievement.Init(clientId);

        // 初始化排行榜模块
        TapLeaderboard.Init(clientId);

        Debug.Log("TapTap SDK 初始化完成");
    }
}
"""
            },
            "features": {
                "login": {
                    "title": "用户登录",
                    "description": "实现 TapTap 用户登录功能",
                    "example": """
public class LoginManager : MonoBehaviour
{
    public async void LoginWithTapTap()
    {
        try
        {
            var profile = await TapLogin.Login();

            Debug.Log($"登录成功: {profile.name}");
            Debug.Log($"用户ID: {profile.userId}");
            Debug.Log($"头像: {profile.avatar}");

            // 保存用户信息
            PlayerPrefs.SetString("UserId", profile.userId);
            PlayerPrefs.SetString("UserName", profile.name);

            // 跳转到游戏主界面
            SceneManager.LoadScene("MainGame");
        }
        catch (TapException e)
        {
            Debug.LogError($"登录失败: {e.Message}");
            ShowErrorMessage("登录失败，请重试");
        }
    }

    public void Logout()
    {
        TapLogin.Logout();
        PlayerPrefs.DeleteKey("UserId");
        PlayerPrefs.DeleteKey("UserName");

        // 返回登录界面
        SceneManager.LoadScene("Login");
    }
}
"""
                },
                "achievements": {
                    "title": "成就系统",
                    "description": "管理游戏成就的解锁和查询",
                    "example": """
public class AchievementManager : MonoBehaviour
{
    // 解锁成就
    public async void UnlockAchievement(string achievementId)
    {
        try
        {
            await TapAchievement.Unlock(achievementId);
            Debug.Log($"成就已解锁: {achievementId}");

            // 显示成就解锁动画
            ShowAchievementUnlockedUI(achievementId);
        }
        catch (TapException e)
        {
            Debug.LogError($"解锁成就失败: {e.Message}");
        }
    }

    // 显示成就页面
    public void ShowAchievements()
    {
        TapAchievement.ShowAchievementsList();
    }

    // 获取成就列表
    public async void LoadAchievements()
    {
        try
        {
            var achievements = await TapAchievement.GetAchievementsList();

            foreach (var achievement in achievements)
            {
                Debug.Log($"成就: {achievement.displayName}");
                Debug.Log($"状态: {(achievement.unlocked ? "已解锁" : "未解锁")}");
            }
        }
        catch (TapException e)
        {
            Debug.LogError($"获取成就失败: {e.Message}");
        }
    }
}
"""
                }
            }
        },
        "cocos": {
            "title": "Cocos Creator 集成",
            "description": "在 Cocos Creator 游戏引擎中集成 TapTap SDK",
            "setup": {
                "title": "安装和配置",
                "steps": [
                    "安装 TapTap Cocos Creator SDK",
                    "在项目设置中配置 SDK",
                    "配置应用信息",
                    "初始化并使用 API"
                ],
                "example": """
// 导入 SDK
const { TapTapSDK, TapLogin, TapAchievement } = require('taptap-sdk');

cc.Class({
    extends: cc.Component,

    properties: {
        clientId: 'your_client_id',
        clientToken: 'your_client_token'
    },

    onLoad() {
        this.initTapTap();
    },

    initTapTap() {
        // 初始化 TapTap SDK
        TapTapSDK.init({
            clientId: this.clientId,
            clientToken: this.clientToken,
            region: 'CN'
        });

        console.log('TapTap SDK 初始化完成');
    },

    // 用户登录
    async loginWithTapTap() {
        try {
            const result = await TapLogin.login();

            console.log('登录成功:', result.profile.name);

            // 保存用户信息到本地存储
            cc.sys.localStorage.setItem('userId', result.profile.userId);
            cc.sys.localStorage.setItem('userName', result.profile.name);

            // 切换到游戏场景
            cc.director.loadScene('GameScene');

        } catch (error) {
            console.error('登录失败:', error);
            this.showErrorDialog('登录失败，请重试');
        }
    }
});
"""
            }
        },
        "web": {
            "title": "Web 集成",
            "description": "在 Web 游戏中集成 TapTap SDK",
            "setup": {
                "title": "安装和配置",
                "steps": [
                    "引入 TapTap Web SDK",
                    "配置应用信息",
                    "初始化 SDK",
                    "实现登录和功能调用"
                ],
                "example": """
<!DOCTYPE html>
<html>
<head>
    <title>TapTap Web 游戏</title>
    <!-- 引入 TapTap Web SDK -->
    <script src="https://sdk.taptap.com/web/v1/taptap-sdk.min.js"></script>
</head>
<body>
    <button onclick="loginWithTapTap()">TapTap 登录</button>
    <button onclick="showAchievements()">查看成就</button>

    <script>
        // 初始化 TapTap SDK
        TapTapSDK.init({
            clientId: 'your_client_id',
            region: 'CN'
        });

        // 用户登录
        async function loginWithTapTap() {
            try {
                const result = await TapTapSDK.login();

                console.log('登录成功:', result.profile);

                // 保存用户信息
                localStorage.setItem('taptap_user', JSON.stringify(result.profile));

                // 更新 UI
                updateUserUI(result.profile);

            } catch (error) {
                console.error('登录失败:', error);
                alert('登录失败，请重试');
            }
        }

        // 解锁成就
        async function unlockAchievement(achievementId) {
            try {
                await TapTapSDK.unlockAchievement(achievementId);
                console.log('成就已解锁:', achievementId);

                // 显示成就解锁提示
                showAchievementNotification(achievementId);

            } catch (error) {
                console.error('解锁成就失败:', error);
            }
        }

        // 显示成就页面
        function showAchievements() {
            TapTapSDK.showAchievements();
        }
    </script>
</body>
</html>
"""
            }
        }
    },
    "best_practices": {
        "title": "最佳实践",
        "description": "TapTap SDK 集成的最佳实践和建议",
        "practices": [
            {
                "category": "初始化",
                "items": [
                    "在游戏启动时尽早初始化 SDK",
                    "确保网络权限配置正确",
                    "处理初始化失败的情况",
                    "验证 clientId 和 clientToken 的有效性"
                ]
            },
            {
                "category": "用户登录",
                "items": [
                    "提供清晰的登录入口和说明",
                    "处理登录失败和网络异常",
                    "支持登出功能",
                    "定期检查登录状态的有效性"
                ]
            },
            {
                "category": "错误处理",
                "items": [
                    "捕获并妥善处理所有 SDK 异常",
                    "为用户提供友好的错误提示",
                    "记录错误日志用于调试",
                    "实现重试机制"
                ]
            },
            {
                "category": "性能优化",
                "items": [
                    "异步调用 API 避免阻塞主线程",
                    "缓存用户信息减少 API 调用",
                    "合理控制功能调用频率",
                    "在适当时机释放 SDK 资源"
                ]
            }
        ]
    }
}

SDK_SEARCH_INDEX = {
    "keywords": {
        "SDK": ["unity", "cocos", "web"],
        "集成": ["unity", "cocos", "web"],
        "Unity": ["unity"],
        "Cocos": ["cocos"],
        "Web": ["web"],
        "初始化": ["unity", "cocos", "web"],
        "登录": ["unity", "cocos", "web"],
        "成就": ["unity", "cocos"],
        "配置": ["unity", "cocos", "web"],
        "最佳实践": ["best_practices"],
        "错误处理": ["best_practices"]
    }
}