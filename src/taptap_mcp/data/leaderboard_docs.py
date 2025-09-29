"""TapTap 排行榜 API 文档"""

LEADERBOARD_DOCUMENTATION = {
    "title": "TapTap 排行榜系统",
    "description": "为小游戏提供完整的竞技排名和分数管理功能",
    "categories": {
        "score_submission": {
            "title": "分数提交",
            "description": "提交玩家分数到排行榜系统",
            "apis": [
                {
                    "name": "提交单个分数",
                    "method": "submitScore",
                    "description": "为当前玩家提交分数到指定排行榜",
                    "parameters": {
                        "leaderboardId": "string, 排行榜唯一标识",
                        "score": "number, 玩家分数",
                        "metadata": "object, 可选的元数据信息"
                    },
                    "example": """
// 提交分数到排行榜
const leaderboard = tap.getLeaderboardManager();

try {
    const result = await leaderboard.submitScore({
        leaderboardId: 'weekly_high_score',
        score: 15000,
        metadata: {
            level: 10,
            playTime: 120,
            achievements: ['perfect_game', 'speed_run']
        }
    });

    console.log('分数提交成功:', result.rank);
    console.log('当前排名:', result.position);

} catch (error) {
    console.error('分数提交失败:', error);
}
"""
                },
                {
                    "name": "批量提交分数",
                    "method": "submitScores",
                    "description": "一次性提交多个排行榜的分数",
                    "parameters": {
                        "scores": "Array<ScoreEntry>, 分数数组"
                    },
                    "example": """
// 批量提交多个分数
const scores = [
    {
        leaderboardId: 'daily_score',
        score: 8500,
        metadata: { mode: 'normal' }
    },
    {
        leaderboardId: 'weekly_score',
        score: 12000,
        metadata: { mode: 'hard' }
    }
];

try {
    const results = await leaderboard.submitScores(scores);
    results.forEach((result, index) => {
        console.log(`排行榜 ${scores[index].leaderboardId}:`, result.rank);
    });
} catch (error) {
    console.error('批量提交失败:', error);
}
"""
                }
            ]
        },
        "ranking_query": {
            "title": "排名查询",
            "description": "查询排行榜数据和玩家排名信息",
            "apis": [
                {
                    "name": "获取排行榜数据",
                    "method": "getLeaderboard",
                    "description": "获取指定排行榜的排名数据",
                    "parameters": {
                        "leaderboardId": "string, 排行榜ID",
                        "options": "object, 查询选项"
                    },
                    "example": """
// 获取排行榜前100名
const topPlayers = await leaderboard.getLeaderboard('global_ranking', {
    offset: 0,
    limit: 100,
    timeRange: 'all_time'  // 'daily', 'weekly', 'monthly', 'all_time'
});

console.log('排行榜数据:', topPlayers.entries);
topPlayers.entries.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.playerName}: ${entry.score}分`);
});
"""
                },
                {
                    "name": "获取玩家排名",
                    "method": "getPlayerRank",
                    "description": "获取当前玩家在指定排行榜中的排名",
                    "example": """
// 获取当前玩家排名
const playerRank = await leaderboard.getPlayerRank('global_ranking');

if (playerRank.hasRank) {
    console.log('当前排名:', playerRank.position);
    console.log('当前分数:', playerRank.score);
    console.log('超越玩家数:', playerRank.position - 1);
} else {
    console.log('玩家暂无排名记录');
}
"""
                },
                {
                    "name": "获取周围玩家",
                    "method": "getNearbyPlayers",
                    "description": "获取玩家排名附近的其他玩家",
                    "example": """
// 获取排名附近的玩家
const nearbyPlayers = await leaderboard.getNearbyPlayers('global_ranking', {
    range: 10  // 获取上下各10名玩家
});

console.log('附近玩家:', nearbyPlayers.entries);
console.log('我的位置:', nearbyPlayers.playerIndex);
"""
                }
            ]
        },
        "leaderboard_ui": {
            "title": "排行榜界面",
            "description": "显示和管理排行榜界面",
            "apis": [
                {
                    "name": "打开排行榜页面",
                    "method": "openLeaderboard",
                    "description": "打开 TapTap 内置的排行榜页面",
                    "parameters": {
                        "leaderboardId": "string, 可选，指定打开的排行榜"
                    },
                    "example": """
// 打开排行榜页面
try {
    await leaderboard.openLeaderboard('global_ranking');
} catch (error) {
    console.error('打开排行榜失败:', error);
}

// 打开排行榜列表页面（不指定具体排行榜）
await leaderboard.openLeaderboard();
"""
                }
            ]
        }
    },
    "integration_patterns": {
        "title": "集成模式",
        "description": "常用的排行榜集成模式和最佳实践",
        "patterns": [
            {
                "name": "游戏结束提交分数",
                "description": "在游戏结束时自动提交分数并显示排名变化",
                "example": """
class GameSession {
    constructor() {
        this.leaderboard = tap.getLeaderboardManager();
        this.currentScore = 0;
    }

    async endGame() {
        try {
            // 提交分数
            const result = await this.leaderboard.submitScore({
                leaderboardId: 'main_leaderboard',
                score: this.currentScore
            });

            // 显示排名信息
            this.showGameOverUI({
                score: this.currentScore,
                rank: result.position,
                isNewRecord: result.isPersonalBest
            });

        } catch (error) {
            console.error('提交分数失败:', error);
            // 显示游戏结束界面，但不显示排名
            this.showGameOverUI({
                score: this.currentScore,
                error: '排名暂时无法获取'
            });
        }
    }
}
"""
            },
            {
                "name": "实时排名显示",
                "description": "在游戏过程中实时显示玩家排名信息",
                "example": """
class RankingDisplay {
    constructor() {
        this.leaderboard = tap.getLeaderboardManager();
        this.updateInterval = null;
    }

    async startRealTimeUpdates() {
        // 初始加载
        await this.updateRanking();

        // 定期更新（避免过于频繁）
        this.updateInterval = setInterval(() => {
            this.updateRanking();
        }, 60000); // 每分钟更新一次
    }

    async updateRanking() {
        try {
            const playerRank = await this.leaderboard.getPlayerRank('main_leaderboard');
            const nearbyPlayers = await this.leaderboard.getNearbyPlayers('main_leaderboard', {
                range: 3
            });

            this.displayRankingInfo(playerRank, nearbyPlayers);
        } catch (error) {
            console.error('更新排名失败:', error);
        }
    }

    stopRealTimeUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}
"""
            }
        ]
    },
    "best_practices": {
        "title": "最佳实践",
        "description": "排行榜开发的最佳实践和建议",
        "practices": [
            {
                "category": "性能优化",
                "items": [
                    "避免频繁查询排行榜数据，建议使用缓存",
                    "使用分页加载来处理大量排行榜数据",
                    "批量提交分数以减少 API 调用次数",
                    "在合适的时机更新排名，避免过度刷新"
                ]
            },
            {
                "category": "用户体验",
                "items": [
                    "在分数提交时显示加载状态",
                    "优雅处理网络错误和超时",
                    "为排名变化提供视觉反馈",
                    "提供离线模式的本地排行榜"
                ]
            },
            {
                "category": "数据管理",
                "items": [
                    "合理设计排行榜的时间周期（日榜、周榜、月榜）",
                    "为不同难度或模式创建独立排行榜",
                    "记录足够的元数据用于反作弊检测",
                    "定期清理过期的排行榜数据"
                ]
            }
        ]
    }
}

LEADERBOARD_SEARCH_INDEX = {
    "keywords": {
        "排行榜": ["score_submission", "ranking_query", "leaderboard_ui"],
        "分数": ["score_submission", "ranking_query"],
        "排名": ["ranking_query", "leaderboard_ui"],
        "提交": ["score_submission"],
        "查询": ["ranking_query"],
        "界面": ["leaderboard_ui"],
        "UI": ["leaderboard_ui"],
        "实时": ["integration_patterns"],
        "性能": ["best_practices"],
        "优化": ["best_practices"]
    }
}