/**
 * MCP Resources Definitions
 * Resources expose read-only documentation and reference data
 */

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Get all resource definitions
 */
export function getResourceDefinitions(): ResourceDefinition[] {
  return [
    // LeaderboardManager API Documentation Resources
    {
      uri: 'docs://leaderboard/api/get-manager',
      name: 'LeaderboardManager 实例获取',
      description: '如何获取 LeaderboardManager 实例以访问排行榜功能',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/open',
      name: '打开排行榜 UI',
      description: 'openLeaderboard() API - 打开并显示排行榜页面',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/submit-scores',
      name: '提交玩家分数',
      description: 'submitScores() API - 向排行榜提交玩家分数',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-scores',
      name: '加载排行榜数据',
      description: 'loadLeaderboardScores() API - 加载排行榜分数列表',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-player-score',
      name: '获取当前玩家分数',
      description: 'loadCurrentPlayerLeaderboardScore() API - 获取当前玩家的分数和排名',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-centered-scores',
      name: '加载玩家周围分数',
      description: 'loadPlayerCenteredScores() API - 加载当前玩家周围的其他玩家分数',
      mimeType: 'text/markdown'
    },

    // Overview and Best Practices
    {
      uri: 'docs://leaderboard/overview',
      name: '排行榜系统完整概览',
      description: '排行榜 API 的完整概览，包括所有功能和使用场景',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/patterns',
      name: '集成模式和最佳实践',
      description: '常见使用场景、集成模式和最佳实践指南',
      mimeType: 'text/markdown'
    }
  ];
}

/**
 * Resource URI mapping to handler keys
 */
export const RESOURCE_URI_MAP: Record<string, string> = {
  'docs://leaderboard/api/get-manager': 'getLeaderboardManager',
  'docs://leaderboard/api/open': 'openLeaderboard',
  'docs://leaderboard/api/submit-scores': 'submitScores',
  'docs://leaderboard/api/load-scores': 'loadLeaderboardScores',
  'docs://leaderboard/api/load-player-score': 'loadCurrentPlayerScore',
  'docs://leaderboard/api/load-centered-scores': 'loadPlayerCenteredScores',
  'docs://leaderboard/overview': 'getLeaderboardOverview',
  'docs://leaderboard/patterns': 'getLeaderboardPatterns'
};
