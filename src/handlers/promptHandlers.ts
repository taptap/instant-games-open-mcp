/**
 * MCP Prompts Handlers
 * Handle prompt template generation
 */

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface PromptResponse {
  description?: string;
  messages: PromptMessage[];
}

/**
 * Leaderboard integration guide prompt
 */
export async function getLeaderboardIntegrationPrompt(args: any): Promise<PromptResponse> {
  return {
    description: '排行榜接入完整工作流引导',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `我想在我的 TapTap 小游戏/H5 游戏中接入排行榜功能。

⚠️ 重要提醒：
- 客户端 NO npm install 或 SDK 安装
- 直接使用全局 tap 对象
- 不要添加任何 package.json 依赖

请帮我：
1. 检查服务端排行榜配置
2. 如果没有，创建排行榜
3. 提供客户端集成代码（使用全局 tap 对象）

开始检查排行榜。`
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `好的！我会帮你完成排行榜接入。

⚠️ **关键提醒：TapTap 排行榜无需安装任何 SDK！**
- ❌ 不要运行 npm install
- ❌ 不要修改 package.json
- ✅ tap 是全局对象，由 TapTap 运行时自动提供
- ✅ 直接在代码中使用 tap.getLeaderboardManager()

现在开始检查你的排行榜配置...

**步骤 1: 检查服务端排行榜**
调用 list_leaderboards 工具...

**后续步骤：**
- 如果没有排行榜 → 使用 create_leaderboard 创建
- 如果有排行榜 → 提供客户端代码（使用全局 tap 对象，无需安装）`
        }
      }
    ]
  };
}

/**
 * Leaderboard troubleshooting guide prompt
 */
export async function getLeaderboardTroubleshootingPrompt(args: any): Promise<PromptResponse> {
  const errorCode = args.error_code;

  if (errorCode) {
    // Specific error code troubleshooting
    return {
      description: `排行榜错误 ${errorCode} 的排查指南`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `我遇到了排行榜错误代码 ${errorCode}，请帮我排查和解决。`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: getErrorCodeSolution(errorCode)
          }
        }
      ]
    };
  }

  // General troubleshooting guide
  return {
    description: '排行榜常见问题排查指南',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: '我在使用 TapTap 排行榜时遇到了问题，请提供常见问题的排查步骤。'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `# TapTap 排行榜常见问题排查指南

## 🔍 常见错误代码

### 错误码 500001: 排行榜 ID 未找到
**原因：** leaderboard_id 不存在或输入错误

**解决方案：**
1. 使用 list_leaderboards 工具检查你的排行榜 ID
2. 确认排行榜已经创建并发布
3. 检查 leaderboard_id 拼写是否正确

### 错误码 1025: 未声明好友关系权限
**原因：** 尝试访问好友排行榜但未申请权限

**解决方案：**
1. 在 TapTap 开发者中心申请好友关系权限
2. 等待审核通过
3. 或者使用 collection: "public" 显示全局排行榜

### 错误码 104/103: 用户隐私/授权问题
**原因：** 用户未授权或隐私设置限制

**解决方案：**
1. 确保用户已登录 TapTap
2. 引导用户授权必要的权限
3. 处理用户拒绝授权的情况

## 🛠️ 排查步骤

### 1. 检查环境配置
使用 check_environment 工具验证：
- MAC Token 是否正确配置
- Client ID 和 Secret 是否有效
- 网络连接是否正常

### 2. 验证排行榜配置
使用 list_leaderboards 工具检查：
- 排行榜是否已创建
- 排行榜状态是否正常
- leaderboard_id 是否正确

### 3. 检查客户端代码
确认以下几点：
- LeaderboardManager 实例正确获取
- leaderboard_id 传递正确
- 回调函数正确处理错误

### 4. 查看详细文档
使用 Resources 获取详细 API 文档：
- docs://leaderboard/api/open - 打开排行榜 API
- docs://leaderboard/api/submit-scores - 提交分数 API
- docs://leaderboard/overview - 完整概览

## 💡 最佳实践

1. **始终实现错误处理回调**
\`\`\`javascript
callback: {
  onFailure: function(code, message) {
    console.error(\`Error \${code}: \${message}\`);
    // 向用户显示友好的错误提示
  }
}
\`\`\`

2. **先检查后使用**
在使用排行榜前，先调用 list_leaderboards 确认配置

3. **处理网络异常**
实现重试机制和离线提示

需要针对特定错误的帮助吗？请告诉我错误代码，我会提供详细的解决方案。`
        }
      }
    ]
  };
}

/**
 * Get specific error code solution
 */
function getErrorCodeSolution(errorCode: string): string {
  const solutions: Record<string, string> = {
    '500001': `# 错误码 500001: 排行榜 ID 未找到

## 问题原因
你使用的 leaderboard_id 在系统中不存在。

## 解决步骤

### 1. 检查现有排行榜
我会帮你调用 list_leaderboards 工具来查看你的所有排行榜。

### 2. 常见原因
- 排行榜尚未创建
- leaderboard_id 拼写错误
- 排行榜已被删除
- 使用了其他应用的 leaderboard_id

### 3. 解决方案
如果你还没有排行榜，可以使用 create_leaderboard 工具创建：

\`\`\`javascript
// 创建排行榜示例
{
  "name": "每周高分榜",
  "score_type": "better_than",
  "reset_cycle": "weekly",
  "sort_order": "desc"
}
\`\`\`

创建成功后，你会获得一个 leaderboard_id，在客户端代码中使用它。

需要我帮你检查或创建排行榜吗？`,

    '1025': `# 错误码 1025: 未声明好友关系权限

## 问题原因
你的代码尝试访问好友排行榜（collection: "friends"），但应用未申请好友关系权限。

## 解决步骤

### 1. 申请权限
前往 TapTap 开发者中心：
1. 选择你的应用
2. 进入"权限管理"
3. 申请"好友关系权限"
4. 等待审核通过

### 2. 临时解决方案
在权限审核期间，使用全局排行榜：

\`\`\`javascript
leaderboardManager.openLeaderboard({
  leaderboardId: "your_leaderboard_id",
  collection: "public",  // 使用全局排行榜
  callback: {
    onSuccess: function(res) {
      console.log("打开成功");
    }
  }
});
\`\`\`

### 3. 权限通过后
权限审核通过后，就可以使用好友排行榜：

\`\`\`javascript
collection: "friends"  // 显示好友排行榜
\`\`\`

需要查看完整的 openLeaderboard API 文档吗？可以访问 Resource: docs://leaderboard/api/open`,

    '104': `# 错误码 104: 用户未授权

## 问题原因
当前用户未登录或未授权访问排行榜功能。

## 解决步骤

### 1. 检查用户登录状态
确保用户已登录 TapTap：

\`\`\`javascript
// 检查登录状态
tap.checkLoginStatus({
  onSuccess: function(res) {
    if (res.isLogin) {
      // 用户已登录，可以使用排行榜
      openLeaderboard();
    } else {
      // 引导用户登录
      tap.login({
        onSuccess: function() {
          openLeaderboard();
        }
      });
    }
  }
});
\`\`\`

### 2. 处理授权流程
\`\`\`javascript
leaderboardManager.openLeaderboard({
  leaderboardId: "your_leaderboard_id",
  callback: {
    onFailure: function(code, message) {
      if (code === 104) {
        // 引导用户登录
        showLoginDialog();
      }
    }
  }
});
\`\`\`

### 3. 用户体验优化
- 在使用排行榜前主动检查登录状态
- 提供清晰的登录引导
- 处理用户拒绝登录的情况

需要更多关于用户认证的帮助吗？`,

    '103': `# 错误码 103: 用户隐私设置限制

## 问题原因
用户的隐私设置限制了排行榜数据的访问。

## 解决步骤

### 1. 尊重用户隐私
这是用户的主动选择，应用应该优雅处理：

\`\`\`javascript
leaderboardManager.openLeaderboard({
  leaderboardId: "your_leaderboard_id",
  callback: {
    onFailure: function(code, message) {
      if (code === 103) {
        // 向用户说明隐私设置的影响
        showMessage("由于隐私设置，无法显示你的排行榜数据");
      }
    }
  }
});
\`\`\`

### 2. 提供替代方案
- 仍然显示全局排行榜（不包含该用户）
- 提供其他游戏功能
- 说明如何修改隐私设置（但不要强制）

### 3. 最佳实践
- 不要重复提示用户修改隐私设置
- 确保应用的其他功能正常可用
- 在 UI 上给予友好提示

用户隐私是重要的，应用应该优雅地处理这种情况。`
  };

  return solutions[errorCode] || `# 错误码 ${errorCode}

这是一个不常见的错误代码。建议：

1. 使用 check_environment 工具检查环境配置
2. 查看完整的 API 文档（使用 Resources）
3. 检查网络连接和 API 响应
4. 联系 TapTap 技术支持获取帮助

需要我帮你检查环境配置吗？`;
}
