/**
 * TapTap Minigame Leaderboard Documentation Tools
 * Each LeaderboardManager API has its own dedicated tool
 */

import {
  searchLeaderboardDocs as searchDocs,
  getLeaderboardOverview as getOverview,
  LEADERBOARD_DOCUMENTATION
} from './docs.js';

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
    // Suggest relevant Resources based on query
    let suggestions = `No results found for "${query}".\n\n`;
    suggestions += `💡 **建议：直接读取相关 Resources 获取完整文档**\n\n`;

    const query_lower = query.toLowerCase();

    if (query_lower.includes('init') || query_lower.includes('start') || query_lower.includes('get') || query_lower.includes('manager')) {
      suggestions += `- docs://leaderboard/api/get-manager - 如何获取 LeaderboardManager 实例\n`;
    }
    if (query_lower.includes('submit') || query_lower.includes('upload') || query_lower.includes('save') || query_lower.includes('score')) {
      suggestions += `- docs://leaderboard/api/submit-scores - 如何提交分数\n`;
    }
    if (query_lower.includes('open') || query_lower.includes('show') || query_lower.includes('display') || query_lower.includes('ui')) {
      suggestions += `- docs://leaderboard/api/open - 如何显示排行榜 UI\n`;
    }
    if (query_lower.includes('load') || query_lower.includes('get') || query_lower.includes('fetch') || query_lower.includes('rank')) {
      suggestions += `- docs://leaderboard/api/load-scores - 如何加载排行榜数据\n`;
    }
    if (query_lower.includes('integrate') || query_lower.includes('setup') || query_lower.includes('接入') || query_lower.includes('workflow')) {
      suggestions += `- guide://leaderboard/integration-workflow - 完整接入工作流\n`;
    }

    if (suggestions === `No results found for "${query}".\n\n💡 **建议：直接读取相关 Resources 获取完整文档**\n\n`) {
      suggestions += `\n或查看完整概览：\n`;
      suggestions += `- docs://leaderboard/overview - 排行榜完整概览\n`;
      suggestions += `- guide://leaderboard/integration-workflow - 完整接入工作流\n`;
    }

    return suggestions;
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
 * Get quick start guide - client-side integration tutorial
 */
async function getQuickStartGuide(): Promise<string> {
  return `# 排行榜客户端集成快速指南

假设你已经有了 leaderboard_id（从服务端创建），本指南教你如何在客户端集成排行榜功能。

**适用场景**: 你已经有排行榜 ID，需要在游戏中集成排行榜功能。

**如果还没有排行榜**: 使用 Prompt "leaderboard-integration" 获取交互式引导。

---

## 📋 前置条件

✅ 已有 leaderboard_id（例如：\`weekly_high_score_2024\`）
✅ 游戏已集成 TapTap 登录
✅ 用户已登录 TapTap 账号

## 📱 客户端集成三步走

### Step 1: 获取 LeaderboardManager 实例

\`\`\`javascript
// 在游戏初始化时获取
const leaderboardManager = tap.getLeaderboardManager();
\`\`\`

### Step 2: 提交玩家分数

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

### Step 3: 显示排行榜 UI

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

## 🎯 常见使用场景

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

## 📚 需要更多帮助？

### 查看详细 API 文档
- 获取实例：\`docs://leaderboard/api/get-manager\`
- 提交分数：\`docs://leaderboard/api/submit-scores\`
- 打开 UI：\`docs://leaderboard/api/open\`
- 加载数据：\`docs://leaderboard/api/load-scores\`

### 查看其他文档
- 最佳实践：\`docs://leaderboard/patterns\`
- 完整概览：\`docs://leaderboard/overview\`

### 需要创建排行榜？
使用 Prompt \`leaderboard-integration\` 获取交互式引导（包含服务端创建）

## 💡 最佳实践

1. **总是实现错误回调** - 处理各种异常情况
2. **先检查登录状态** - 在调用排行榜前确保用户已登录
3. **测试不同场景** - 测试首次提交、更新分数、查看排行榜等
4. **优化用户体验** - 显示加载状态，提供友好的错误提示

---

🎉 恭喜！你已经完成了排行榜的基础接入。现在可以开始测试了！
`;
}

/**
 * Get current app information from cache
 */
async function getCurrentAppInfo(): Promise<string> {
  try {
    const { readAppCache, getCachePath } = await import('../../core/utils/cache.js');
    const cache = readAppCache(process.env.TDS_MCP_PROJECT_PATH);

    if (!cache || !cache.developer_id || !cache.app_id) {
      return `# Current App Information

⚠️ **No app selected yet**

You need to select an app first. Use these tools:
1. \`list_developers_and_apps\` - List all available developers and apps
2. \`select_app\` - Select a specific app to use

Once selected, the app information will be cached and displayed here.
`;
    }

    const cachePath = getCachePath(process.env.TDS_MCP_PROJECT_PATH);

    let info = `# Current App Information

## 📱 Selected App

- **Developer ID**: \`${cache.developer_id}\`
- **App ID**: \`${cache.app_id}\`
- **Miniapp ID**: \`${cache.miniapp_id || 'Not available'}\`
- **App Name**: ${cache.app_title || cache.developer_name || '_Not available_'}

## 📂 Cache Location

\`${cachePath}\`

## 🏆 Leaderboard Configuration

`;

    // Note: Leaderboard ID is typically provided by create_leaderboard, not cached in app.json
    info += `- **Leaderboard IDs**: See \`list_leaderboards\` tool
  - Use \`list_leaderboards\` to view all leaderboards for this app
  - Use \`create_leaderboard\` to create a new one

## 💡 Next Steps

- View leaderboards: Use \`list_leaderboards\` tool
- Create leaderboard: Use \`create_leaderboard\` tool
- Change app: Use \`select_app\` tool with different developer_id/app_id
`;

    return info;
  } catch (error) {
    return `# Current App Information

❌ **Error loading app information**

${error instanceof Error ? error.message : String(error)}

Please use \`check_environment\` tool to verify your configuration.
`;
  }
}

/**
 * Get complete integration workflow guide
 */
async function getIntegrationWorkflow(): Promise<string> {
  return `# TapTap 排行榜完整接入工作流

## ⚠️ 关键原则：客户端无需安装 SDK

**请勿执行以下操作**：
- ❌ npm install @taptap/xxx
- ❌ 修改 package.json 添加依赖
- ❌ import 或 require 任何 TapTap 模块

**原因**：tap 是全局对象，由 TapTap 运行时自动提供（类似 window、document）

---

## 📋 完整步骤

### 步骤 1: 检查服务端排行榜

**工具**：\`list_leaderboards\`

**判断**：
- 已有排行榜 → 跳到步骤 3
- 无排行榜 → 继续步骤 2

### 步骤 2: 创建服务端排行榜

**工具**：\`create_leaderboard\`

**示例参数**：
\`\`\`json
{
  "title": "周榜",
  "period_type": 3,
  "score_type": 1,
  "score_order": 1,
  "calc_type": 2
}
\`\`\`

**获得**：leaderboard_id（记录下来）

### 步骤 3: 客户端代码集成

**3.1 获取实例**
\`\`\`javascript
const leaderboardManager = tap.getLeaderboardManager();
\`\`\`

**3.2 提交分数**
\`\`\`javascript
leaderboardManager.submitScores({
  scores: [{
    leaderboardId: "your_leaderboard_id",
    score: playerScore
  }],
  callback: {
    onSuccess: (res) => console.log("成功"),
    onFailure: (code, msg) => console.error(code, msg)
  }
});
\`\`\`

**3.3 显示排行榜**
\`\`\`javascript
leaderboardManager.openLeaderboard({
  leaderboardId: "your_leaderboard_id",
  collection: "public",
  callback: {
    onSuccess: () => console.log("打开成功"),
    onFailure: (code, msg) => console.error(code, msg)
  }
});
\`\`\`

---

## ✅ 完成！

总共 3 个步骤，10-15 分钟即可完成接入。
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
  getQuickStartGuide,
  getCurrentAppInfo,
  getIntegrationWorkflow
};
