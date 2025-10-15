/**
 * TapTap Minigame Leaderboard Documentation Tools
 * Each LeaderboardManager API has its own dedicated tool
 */

import {
  searchLeaderboardDocs as searchDocs,
  getLeaderboardOverview as getOverview,
  LEADERBOARD_DOCUMENTATION
} from '../data/leaderboardDocs.js';

interface ToolArgs {
  query?: string;
}

/**
 * Get specific API documentation by name
 */
function getAPIDoc(categoryKey: string, apiName: string): string {
  const category = LEADERBOARD_DOCUMENTATION.categories[categoryKey];
  if (!category) {
    return `Category "${categoryKey}" not found`;
  }

  const api = category.apis.find(a => a.name === apiName);
  if (!api) {
    return `API "${apiName}" not found in category "${categoryKey}"`;
  }

  let doc = `# ${api.name}\n\n`;
  doc += `**Method Signature:**\n\`\`\`javascript\n${api.method}\n\`\`\`\n\n`;
  doc += `**Description:** ${api.description}\n\n`;

  if (api.parameters) {
    doc += `## Parameters\n\n`;
    for (const [param, desc] of Object.entries(api.parameters)) {
      doc += `- **\`${param}\`**: ${desc}\n`;
    }
    doc += '\n';
  }

  if (api.returnValue) {
    doc += `## Returns\n\n${api.returnValue}\n\n`;
  }

  doc += `## Code Example\n\n\`\`\`javascript\n${api.example}\n\`\`\`\n`;

  return doc;
}

// ============ Core API Tools (one for each LeaderboardManager API) ============

/**
 * Get documentation for tap.getLeaderboardManager()
 */
async function getLeaderboardManager(): Promise<string> {
  return getAPIDoc('initialization', 'tap.getLeaderboardManager');
}

/**
 * Get documentation for openLeaderboard()
 */
async function openLeaderboard(): Promise<string> {
  return getAPIDoc('display', 'openLeaderboard');
}

/**
 * Get documentation for submitScores()
 */
async function submitScores(): Promise<string> {
  return getAPIDoc('score_submission', 'submitScores');
}

/**
 * Get documentation for loadLeaderboardScores()
 */
async function loadLeaderboardScores(): Promise<string> {
  return getAPIDoc('score_query', 'loadLeaderboardScores');
}

/**
 * Get documentation for loadCurrentPlayerLeaderboardScore()
 */
async function loadCurrentPlayerScore(): Promise<string> {
  return getAPIDoc('score_query', 'loadCurrentPlayerLeaderboardScore');
}

/**
 * Get documentation for loadPlayerCenteredScores()
 */
async function loadPlayerCenteredScores(): Promise<string> {
  return getAPIDoc('score_query', 'loadPlayerCenteredScores');
}

// ============ Helper Tools ============

/**
 * Search leaderboard documentation by keyword
 */
async function searchLeaderboardDocs(args: ToolArgs): Promise<string> {
  const query = args.query?.toLowerCase() || '';

  if (!query) {
    return 'Please provide a search keyword.';
  }

  const results = searchDocs(query);

  if (results.length === 0) {
    return `No results found for "${query}".\n\nTry searching for: initialization, open, submit, load, score, ranking, leaderboard`;
  }

  return `**🏆 Search Results for "${query}"**\n\n` + results.join('\n---\n\n');
}

/**
 * Get complete leaderboard system overview
 */
async function getLeaderboardOverview(): Promise<string> {
  return getOverview();
}

/**
 * Get integration patterns and best practices
 */
async function getLeaderboardPatterns(): Promise<string> {
  const category = LEADERBOARD_DOCUMENTATION.categories['common_scenarios'];
  if (!category) return 'Common scenarios not found';

  let doc = `# ${category.title}\n\n${category.description}\n\n`;

  for (const api of category.apis) {
    doc += `## ${api.name}\n\n`;
    doc += `${api.description}\n\n`;
    doc += `\`\`\`javascript\n${api.example}\n\`\`\`\n\n`;
  }

  return doc;
}

/**
 * Get quick start guide - step by step tutorial
 */
async function getQuickStartGuide(): Promise<string> {
  return `# TapTap 排行榜快速接入指南

完整的从零到一接入排行榜的步骤教程。

## 📋 前置条件

1. 已在 TapTap 开发者中心创建游戏
2. 已获取 Client ID 和 Client Secret
3. 游戏已集成 TapTap 登录

## 🚀 Step 1: 创建服务端排行榜

### 使用 MCP 工具创建

\`\`\`javascript
// 调用 create_leaderboard 工具
{
  "name": "每周高分榜",
  "reset_cycle": "weekly",    // 每周重置
  "score_type": "better_than", // 高分优先
  "sort_order": "desc",        // 降序排列
  "display_limit": 100         // 显示前100名
}
\`\`\`

### 获取 leaderboard_id

创建成功后会返回 \`leaderboard_id\`，例如：\`weekly_high_score_2024\`

**重要**: 记录这个 ID，客户端需要使用它！

## 📱 Step 2: 客户端集成

### 2.1 获取 LeaderboardManager 实例

\`\`\`javascript
// 在游戏初始化时获取
const leaderboardManager = tap.getLeaderboardManager();
\`\`\`

### 2.2 提交玩家分数

\`\`\`javascript
// 玩家完成游戏后提交分数
leaderboardManager.submitScores({
  scores: [
    {
      leaderboardId: "weekly_high_score_2024",  // 你的排行榜 ID
      score: 9999,                               // 玩家分数
      extra: { level: "expert", time: 120 }     // 可选的额外数据
    }
  ],
  callback: {
    onSuccess: function(result) {
      console.log("分数提交成功！", result);
    },
    onFailure: function(code, message) {
      console.error("提交失败:", code, message);
    }
  }
});
\`\`\`

### 2.3 显示排行榜 UI

\`\`\`javascript
// 玩家点击"查看排行榜"按钮时
leaderboardManager.openLeaderboard({
  leaderboardId: "weekly_high_score_2024",
  collection: "public",  // 'public' = 全局排行榜, 'friends' = 好友排行榜
  callback: {
    onSuccess: function() {
      console.log("排行榜打开成功");
    },
    onFailure: function(code, message) {
      console.error("打开失败:", code, message);
    }
  }
});
\`\`\`

## 🎯 Step 3: 常见场景

### 场景 1: 获取玩家当前排名

\`\`\`javascript
leaderboardManager.loadCurrentPlayerLeaderboardScore({
  leaderboardId: "weekly_high_score_2024",
  collection: "public",
  callback: {
    onSuccess: function(result) {
      console.log("我的分数:", result.score);
      console.log("我的排名:", result.rank);
    }
  }
});
\`\`\`

### 场景 2: 自定义排行榜 UI

\`\`\`javascript
leaderboardManager.loadLeaderboardScores({
  leaderboardId: "weekly_high_score_2024",
  collection: "public",
  offset: 0,
  limit: 10,
  callback: {
    onSuccess: function(result) {
      // 使用 result.scores 数组自己渲染 UI
      result.scores.forEach((entry, index) => {
        console.log(\`#\${index + 1}: \${entry.playerName} - \${entry.score}\`);
      });
    }
  }
});
\`\`\`

## ⚠️ 常见问题

### Q: 错误码 500001 - 排行榜 ID 未找到
**原因**: leaderboard_id 输入错误或排行榜未创建
**解决**: 使用 \`list_leaderboards\` 工具检查所有排行榜 ID

### Q: 错误码 1025 - 未声明好友关系权限
**原因**: 使用 \`collection: "friends"\` 但未申请权限
**解决**: 在开发者中心申请好友关系权限，或使用 \`collection: "public"\`

### Q: 错误码 104 - 用户未授权
**原因**: 用户未登录 TapTap
**解决**: 确保用户已登录后再调用排行榜 API

## 📚 下一步

- 查看具体 API 文档：\`docs://leaderboard/api/*\`
- 查看最佳实践：\`docs://leaderboard/patterns\`
- 查看完整概览：\`docs://leaderboard/overview\`

## 💡 最佳实践

1. **总是实现错误回调** - 处理各种异常情况
2. **先检查登录状态** - 在调用排行榜前确保用户已登录
3. **测试不同场景** - 测试首次提交、更新分数、查看排行榜等
4. **优化用户体验** - 显示加载状态，提供友好的错误提示

---

🎉 恭喜！你已经完成了排行榜的基础接入。现在可以开始测试了！
`;
}

export const leaderboardTools = {
  // Core API tools
  getLeaderboardManager,
  openLeaderboard,
  submitScores,
  loadLeaderboardScores,
  loadCurrentPlayerScore,
  loadPlayerCenteredScores,

  // Helper tools
  searchLeaderboardDocs,
  getLeaderboardOverview,
  getLeaderboardPatterns,
  getQuickStartGuide
};
