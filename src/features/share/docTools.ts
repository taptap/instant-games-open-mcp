/**
 * TapTap Minigame Share Documentation Tools
 * Each Share API has its own dedicated tool
 */

import {
  generateAPIDoc,
  searchDocumentation,
  generateOverview,
  generateSearchSuggestions,
  type ResourceSuggestion,
} from '../../core/utils/docHelpers.js';

import { SHARE_DOCUMENTATION } from './docs.js';

interface ToolArgs {
  query?: string;
}

// ============ Core API Tools (one for each Share API) ============

/**
 * Get documentation for tap.setShareboardHidden()
 */
async function setShareboardHidden(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_panel', 'tap.setShareboardHidden');
}

/**
 * Get documentation for tap.showShareboard()
 */
async function showShareboard(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_panel', 'tap.showShareboard');
}

/**
 * Get documentation for tap.onShareMessage()
 */
async function onShareMessage(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_events', 'tap.onShareMessage');
}

/**
 * Get documentation for tap.offShareMessage()
 */
async function offShareMessage(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_events', 'tap.offShareMessage');
}

/**
 * Get documentation for tap.onShow()
 */
async function onShow(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_scene_param', 'tap.onShow');
}

/**
 * Get documentation for tap.getLaunchOptionsSync()
 */
async function getLaunchOptionsSync(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_scene_param', 'tap.getLaunchOptionsSync');
}

/**
 * Get documentation for tap.getEnterOptionsSync()
 */
async function getEnterOptionsSync(): Promise<string> {
  return generateAPIDoc(SHARE_DOCUMENTATION, 'share_scene_param', 'tap.getEnterOptionsSync');
}

// ============ Helper Tools ============

/**
 * Resource suggestions for share
 */
const SHARE_SUGGESTIONS: ResourceSuggestion[] = [
  {
    keywords: ['show', 'display', 'panel', 'shareboard'],
    uri: 'docs://share/api/show-shareboard',
    description: '如何显示分享面板',
  },
  {
    keywords: ['hide', 'hidden', 'setShareboardHidden'],
    uri: 'docs://share/api/set-shareboard-hidden',
    description: '如何隐藏分享面板',
  },
  {
    keywords: ['listen', 'on', 'event', 'message'],
    uri: 'docs://share/api/on-share-message',
    description: '如何监听分享事件',
  },
  {
    keywords: ['off', 'cancel', 'remove', 'listener'],
    uri: 'docs://share/api/off-share-message',
    description: '如何取消分享监听',
  },
  {
    keywords: ['onshow', 'onShow', 'foreground', 'sceneParam', 'scene', 'param'],
    uri: 'docs://share/api/on-show',
    description: '如何接收分享场景参数（热启动）',
  },
  {
    keywords: ['getLaunchOptionsSync', 'launch', 'cold', 'start', 'sceneParam'],
    uri: 'docs://share/api/get-launch-options-sync',
    description: '如何接收分享场景参数（冷启动）',
  },
  {
    keywords: ['getEnterOptionsSync', 'enter', 'sceneParam'],
    uri: 'docs://share/api/get-enter-options-sync',
    description: '如何接收分享场景参数（冷启动和热启动）',
  },
];

/**
 * Search share documentation by keyword
 */
async function searchShareDocs(args: ToolArgs): Promise<string> {
  const query = args.query?.toLowerCase() || '';

  if (!query) {
    return 'Please provide a search keyword.';
  }

  const results = searchDocumentation(SHARE_DOCUMENTATION, query);

  if (results.length === 0) {
    return generateSearchSuggestions(query, SHARE_SUGGESTIONS, 'docs://share/overview');
  }

  return `**📤 Search Results for "${query}"**\n\n` + results.join('\n---\n\n');
}

/**
 * Get integration workflow guide
 */
async function getIntegrationWorkflow(): Promise<string> {
  const doc = SHARE_DOCUMENTATION;

  return `# ${doc.title} 完整接入工作流

${doc.description}

## ⚠️ 关键原则：客户端无需安装 SDK

客户端只需要使用全局 \`tap\` 对象，无需任何 npm 包或 SDK 安装。

## 📋 接入步骤

### 1️⃣ 服务端配置（使用 MCP 工具）

1. **创建分享模版**
   - 使用 \`create_share_template\` 工具创建分享模版
   - 填写描述内容（contents）和备注（remark）
   - 记录返回的 \`template_code\`（用于客户端调用）

2. **查询分享模版列表**
   - 使用 \`list_share_templates\` 工具查看所有模版
   - 查看模版状态（0-待审核，1-已通过，2-已拒绝，3-审核异常）

3. **查询指定模版信息**
   - 使用 \`get_share_template_info\` 工具查询模版详情
   - 确认模版状态为已通过（status = 1）后才能在客户端使用

### 2️⃣ 客户端实现

\`\`\`javascript
// ⚠️ IMPORTANT: 'tap' is a global object, NO imports needed!
// This works ONLY in TapTap minigame environment

// 1. 显示分享面板（使用服务端返回的 template_code）
// sceneParam 是可选的，需要根据业务需求自定义，也可以不传
tap.showShareboard({
  templateId: "your_template_code",  // 使用 create_share_template 返回的 template_code
  // sceneParam 可选：根据业务需求自定义，例如传递关卡、分数等信息
  // sceneParam: JSON.stringify({ level: 10, score: 1000 }),  // 示例：传递关卡和分数
  success: function (res) {
    console.log("分享面板已显示");
  },
  fail: function (res) {
    console.log("显示失败:", res.errMsg);
  }
});

// 2. 监听分享事件
tap.onShareMessage({
  success: function (res) {
    console.log("分享渠道:", res.channel);
    console.log("分享成功");
  },
  fail: function (res) {
    console.log("分享失败:", res.errMsg);
  }
});

// 3. 控制用户菜单中的分享面板显示/隐藏
tap.setShareboardHidden({
  hidden: false,  // false: 显示, true: 隐藏
  success: function (res) {
    console.log("设置成功");
  }
});

// 4. 取消分享监听（不再需要时）
tap.offShareMessage();

// 5. 接收分享场景参数（当用户通过分享卡片进入小游戏时）
// 注意：sceneParam 是用户在分享时自定义的参数，如果没有传 sceneParam，这里就不会有值
// 方式一：热启动时使用 tap.onShow()
tap.onShow((res) => {
  if (res.query && res.query.sceneParam) {
    console.log('分享场景参数:', res.query.sceneParam);
    // 处理通过分享进入的逻辑（sceneParam 是用户在分享时自定义的参数）
    handleShareSceneParam(res.query.sceneParam);
  }
});

// 方式二：冷启动时使用 tap.getLaunchOptionsSync()
const launchOptions = tap.getLaunchOptionsSync();
if (launchOptions.query && launchOptions.query.sceneParam) {
  console.log('分享场景参数:', launchOptions.query.sceneParam);
  // sceneParam 是用户在分享时自定义的参数
  handleShareSceneParam(launchOptions.query.sceneParam);
}

// 方式三：同时支持冷启动和热启动，使用 tap.getEnterOptionsSync()
const enterOptions = tap.getEnterOptionsSync();
if (enterOptions.query && enterOptions.query.sceneParam) {
  console.log('分享场景参数:', enterOptions.query.sceneParam);
  // sceneParam 是用户在分享时自定义的参数
  handleShareSceneParam(enterOptions.query.sceneParam);
}

function handleShareSceneParam(sceneParam) {
  // 根据分享场景参数执行相应逻辑
  // sceneParam 是用户在分享时通过 tap.showShareboard() 的 sceneParam 参数传递的自定义数据
  // 例如：跳转到特定页面、显示特定内容、恢复游戏状态等
  try {
    const params = JSON.parse(sceneParam);
    console.log('Level:', params.level);
    console.log('Score:', params.score);
    // 根据自定义参数处理业务逻辑
  } catch (e) {
    // 如果 sceneParam 是简单字符串，直接使用
    console.log('Scene param:', sceneParam);
  }
}
\`\`\`

### 3️⃣ 完整示例

\`\`\`javascript
// 完整的分享流程示例
function shareGame() {
  // 显示分享面板
  // sceneParam 是可选的，根据业务需求自定义，也可以不传
  tap.showShareboard({
    templateId: "your_template_code",
    // 示例：传递自定义参数（根据业务需求定义，也可以不传）
    sceneParam: JSON.stringify({ 
      level: 10, 
      score: 1000,
      userId: "user123"
    }),  // 用户自定义参数，可根据业务需求传递任何信息
    success: function (res) {
      console.log("分享面板已显示");
    },
    fail: function (res) {
      console.error("显示失败:", res.errMsg);
    }
  });
}

// 如果不需要传递参数，也可以不传 sceneParam
function shareGameSimple() {
  tap.showShareboard({
    templateId: "your_template_code",
    // sceneParam 可选，不传也可以
    success: function (res) {
      console.log("分享面板已显示");
    }
  });
}

// 监听分享行为
tap.onShareMessage({
  success: function (res) {
    console.log("用户通过", res.channel, "渠道分享了游戏");
    // 可以在这里处理分享成功后的逻辑，比如奖励
  },
  fail: function (res) {
    console.log("分享失败:", res.errMsg);
  }
});

// 接收分享场景参数（当用户通过分享卡片进入小游戏时）
// 注意：sceneParam 是用户在分享时通过 tap.showShareboard() 的 sceneParam 参数传递的自定义数据
// 如果分享时没有传 sceneParam，这里就不会有值
tap.onShow((res) => {
  if (res.query && res.query.sceneParam) {
    console.log("通过分享卡片进入，场景参数:", res.query.sceneParam);
    try {
      const params = JSON.parse(res.query.sceneParam);
      // 根据用户自定义的场景参数处理业务逻辑，比如跳转到特定关卡
      if (params.level) {
        jumpToLevel(params.level);
      }
      if (params.score) {
        showScore(params.score);
      }
    } catch (e) {
      // 如果 sceneParam 是简单字符串，直接使用
      console.log("场景参数（字符串）:", res.query.sceneParam);
    }
  } else {
    // 如果分享时没有传 sceneParam，这里不会有值，按正常流程处理
    console.log("通过分享卡片进入，但没有场景参数");
  }
});

// 调用分享
shareGame();
\`\`\`

### 4️⃣ 测试验证

1. 在 TapTap 开发者中心创建分享模版并等待审核通过
2. 在客户端调用 \`tap.showShareboard()\` 显示分享面板
3. 测试分享到不同渠道
4. 验证 \`tap.onShareMessage()\` 回调是否正常触发

## 📚 需要详细 API 文档？

- **docs://share/overview** - 完整概览
- **docs://share/api/show-shareboard** - tap.showShareboard() API
- **docs://share/api/set-shareboard-hidden** - tap.setShareboardHidden() API
- **docs://share/api/on-share-message** - tap.onShareMessage() API
- **docs://share/api/off-share-message** - tap.offShareMessage() API
- **docs://share/api/on-show** - tap.onShow() API（接收分享场景参数 - 热启动）
- **docs://share/api/get-launch-options-sync** - tap.getLaunchOptionsSync() API（接收分享场景参数 - 冷启动）
- **docs://share/api/get-enter-options-sync** - tap.getEnterOptionsSync() API（接收分享场景参数 - 通用）

## 🔧 可用的 MCP 工具

### 服务端管理工具
- \`create_share_template\` - 创建分享模版
- \`list_share_templates\` - 查询分享模版列表
- \`get_share_template_info\` - 查询指定分享模版信息

⚠️ **注意**：修改或删除分享模版需要在 TapTap 开发者中心操作，MCP 工具不支持修改/删除操作。
- 开发者中心地址：https://developer.taptap.cn
- 操作路径：登录后进入应用管理 → 分享模版管理

### 文档工具
- \`get_share_integration_guide\` - 本指引
- \`search_share_docs\` - 搜索分享文档

## 🔗 参考链接

- **官方 API 文档**: ${doc.apiReference}
- **TapTap 开发者中心**: https://developer.taptap.cn/

## ⚠️ 重要提示

1. **templateId 对应关系**: 客户端 \`tap.showShareboard()\` 的 \`templateId\` 参数对应服务端 API 返回的 \`template_code\`
2. **审核状态**: 只有状态为"已通过"（status = 1）的模版才能在客户端使用
3. **回调说明**: \`tap.showShareboard()\` 的回调是拉起面板的回调，不是分享成功/失败的回调。分享行为的回调需要使用 \`tap.onShareMessage()\`
4. **隐藏面板**: \`tap.setShareboardHidden()\` 只影响用户菜单中的分享面板，不影响通过 API 调用的分享面板
5. **sceneParam 参数说明**: 
   - \`sceneParam\` 是**可选的**，可以不传
   - \`sceneParam\` 需要**用户根据业务需求自定义**，例如传递关卡、分数、用户ID等信息
   - 当用户通过分享卡片进入小游戏时，可以通过生命周期接口接收这个参数
   - 常见使用场景：传递游戏状态、关卡信息、用户信息等，用于在用户打开分享卡片时恢复游戏状态
6. **接收 sceneParam**: 当用户通过分享卡片进入小游戏时，可以通过以下方式接收 \`sceneParam\`：
   - **热启动**：使用 \`tap.onShow()\` 监听回到前台事件，从 \`res.query.sceneParam\` 获取
   - **冷启动**：使用 \`tap.getLaunchOptionsSync()\` 获取启动参数，从返回值的 \`query.sceneParam\` 获取
   - **通用方式**：使用 \`tap.getEnterOptionsSync()\` 同时支持冷启动和热启动，从返回值的 \`query.sceneParam\` 获取
   - **版本要求**：从 1.7.0 版本开始支持获取分享场景参数

`;
}

export const shareTools = {
  // Core API documentation tools
  setShareboardHidden,
  showShareboard,
  onShareMessage,
  offShareMessage,
  onShow,
  getLaunchOptionsSync,
  getEnterOptionsSync,

  // Helper tools
  getOverview: () => generateOverview(SHARE_DOCUMENTATION),
  getIntegrationWorkflow,
  searchShareDocs,
};
