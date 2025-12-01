/**
 * TapTap Vibrate Documentation Tools
 * Each Vibrate API has its own dedicated tool
 */

import {
  generateAPIDoc,
  generateCategoryDoc,
  searchDocumentation,
  generateOverview,
  generateSearchSuggestions,
  type ResourceSuggestion,
} from '../../core/utils/docHelpers.js';

import { VIBRATE_DOCUMENTATION } from './docs.js';

interface ToolArgs {
  query?: string;
}

// ============ Core API Tools (one for each Vibrate API) ============

/**
 * Get documentation for tap.vibrateShort()
 */
async function getVibrateShort(): Promise<string> {
  return generateAPIDoc(VIBRATE_DOCUMENTATION, 'short_vibration', 'tap.vibrateShort');
}

/**
 * Get documentation for tap.vibrateLong()
 */
async function getVibrateLong(): Promise<string> {
  return generateAPIDoc(VIBRATE_DOCUMENTATION, 'long_vibration', 'tap.vibrateLong');
}

// ============ Helper Tools ============

/**
 * Resource suggestions for vibrate
 */
const VIBRATE_SUGGESTIONS: ResourceSuggestion[] = [
  {
    keywords: ['short', 'vibrate', 'light', 'medium', 'heavy'],
    uri: 'docs://vibrate/api/vibrate-short',
    description: '短震动 API - tap.vibrateShort()',
  },
  {
    keywords: ['long', 'vibrate', 'duration'],
    uri: 'docs://vibrate/api/vibrate-long',
    description: '长震动 API - tap.vibrateLong()',
  },
  {
    keywords: ['pattern', 'usage', 'example', 'scenario'],
    uri: 'docs://vibrate/patterns',
    description: '常见使用场景和最佳实践',
  },
];

/**
 * Search vibrate documentation by keyword
 */
async function searchVibrateDocs(args: ToolArgs): Promise<string> {
  const query = args.query?.toLowerCase() || '';

  if (!query) {
    return 'Please provide a search keyword.';
  }

  const results = searchDocumentation(VIBRATE_DOCUMENTATION, query);

  if (results.length === 0) {
    return generateSearchSuggestions(query, VIBRATE_SUGGESTIONS, 'docs://vibrate/overview');
  }

  return `**📳 Search Results for "${query}"**\n\n` + results.join('\n---\n\n');
}

/**
 * Get complete vibrate system overview
 */
async function getVibrateOverview(): Promise<string> {
  return generateOverview(VIBRATE_DOCUMENTATION);
}

/**
 * Get integration patterns and best practices
 */
async function getVibratePatterns(): Promise<string> {
  return generateCategoryDoc(VIBRATE_DOCUMENTATION, 'common_scenarios');
}

/**
 * Get quick start guide - client-side integration tutorial
 */
async function getQuickStartGuide(): Promise<string> {
  return `# 震动功能客户端集成快速指南

本指南教你如何在游戏中集成震动功能。

**适用场景**: 需要在游戏中添加触觉反馈，提升用户体验。

---

## 📋 前置条件

✅ 游戏运行在 TapTap 小游戏或 H5 环境中
✅ 设备支持震动（iPhone 7/7 Plus 及以上，Android 设备）

## 📱 客户端集成三步走

### Step 1: 短震动（15ms）- 用于按钮点击等轻量反馈

\`\`\`javascript
// 按钮点击反馈
function onButtonClick() {
  tap.vibrateShort({ type: 'light' });
}

// 使用 Promise 风格（推荐）
async function onButtonClickAsync() {
  try {
    await tap.vibrateShort({ type: 'light' });
  } catch (error) {
    console.warn('Vibration not supported:', error);
  }
}
\`\`\`

### Step 2: 长震动（400ms）- 用于成就解锁等重要事件

\`\`\`javascript
// 成就解锁
function onAchievementUnlocked() {
  tap.vibrateLong();
}

// 使用 Promise 风格（推荐）
async function onAchievementUnlockedAsync() {
  try {
    await tap.vibrateLong();
  } catch (error) {
    console.warn('Vibration not supported:', error);
  }
}
\`\`\`

### Step 3: 不同强度的震动 - 根据场景选择

\`\`\`javascript
// 错误反馈 - 强震动
function onError() {
  tap.vibrateShort({ type: 'heavy' });
}

// 成功反馈 - 中等震动
function onSuccess() {
  tap.vibrateShort({ type: 'medium' });
}

// 普通反馈 - 轻震动
function onNormalAction() {
  tap.vibrateShort({ type: 'light' });
}
\`\`\`

## 🎯 常见使用场景

### 场景 1: 按钮点击反馈

\`\`\`javascript
// 所有按钮点击时触发轻震动
document.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => {
    tap.vibrateShort({ type: 'light' });
  });
});
\`\`\`

### 场景 2: 游戏事件反馈

\`\`\`javascript
// 得分时中等震动
function onScore() {
  tap.vibrateShort({ type: 'medium' });
}

// 连击时根据连击数调整震动
let comboCount = 0;
function onCombo() {
  comboCount++;
  if (comboCount >= 5) {
    tap.vibrateLong();  // 高连击长震动
  } else {
    tap.vibrateShort({ type: 'light' });  // 普通连击短震动
  }
}
\`\`\`

### 场景 3: 错误处理

\`\`\`javascript
// 优雅的错误处理
async function triggerVibration(type = 'medium') {
  try {
    await tap.vibrateShort({ type });
  } catch (error) {
    // 设备可能不支持震动或震动强度设置
    console.warn('Vibration not available:', error);
    // 继续游戏流程，不影响用户体验
  }
}
\`\`\`

## ⚠️ 常见问题

### Q: 震动没有反应
**原因**: 
- 设备不支持震动（iPhone 6 及以下不支持）
- 设备震动功能被关闭
- 在非 TapTap 环境中运行

**解决**: 
- 检查设备是否支持震动
- 确保在 TapTap 小游戏或 H5 环境中运行
- 添加错误处理，优雅降级

### Q: 错误 "style is not support"
**原因**: 当前设备不支持设置震动强度（type 参数）

**解决**: 
- 使用 try-catch 捕获错误
- 降级为不指定 type（如果 API 支持）
- 或者直接使用 tap.vibrateLong() 代替

### Q: 在浏览器中测试没有震动
**原因**: 震动 API 只在 TapTap 运行环境中可用

**解决**: 
- 必须在 TapTap 小游戏或 H5 环境中测试
- 浏览器中无法测试震动功能

## 📚 需要更多帮助？

### 查看详细 API 文档
- 短震动：\`docs://vibrate/api/vibrate-short\`
- 长震动：\`docs://vibrate/api/vibrate-long\`

### 查看其他文档
- 最佳实践：\`docs://vibrate/patterns\`
- 完整概览：\`docs://vibrate/overview\`

## 💡 最佳实践

1. **总是实现错误处理** - 处理设备不支持震动的情况
2. **根据场景选择强度** - 轻量操作用 light，重要事件用 heavy 或 long
3. **不要过度使用** - 频繁震动会影响用户体验
4. **测试不同设备** - 在不同设备上测试震动效果
5. **优雅降级** - 震动失败时不影响游戏流程

---

🎉 恭喜！你已经完成了震动功能的基础接入。现在可以开始测试了！
`;
}

/**
 * Generate code example for vibrateShort with type parameter recommendation
 */
async function generateVibrateShortCode(args: {
  scenario?: string;
  type?: 'heavy' | 'medium' | 'light';
  style?: 'promise' | 'callback';
}): Promise<string> {
  const { scenario, type, style = 'promise' } = args;

  // Type recommendation based on scenario
  let recommendedType: 'heavy' | 'medium' | 'light' = type || 'medium';
  let scenarioDescription = '';

  if (scenario) {
    const scenarioLower = scenario.toLowerCase();
    if (
      scenarioLower.includes('error') ||
      scenarioLower.includes('失败') ||
      scenarioLower.includes('错误')
    ) {
      recommendedType = 'heavy';
      scenarioDescription = '错误反馈场景 - 使用强震动';
    } else if (
      scenarioLower.includes('success') ||
      scenarioLower.includes('成功') ||
      scenarioLower.includes('完成')
    ) {
      recommendedType = 'medium';
      scenarioDescription = '成功反馈场景 - 使用中等震动';
    } else if (
      scenarioLower.includes('button') ||
      scenarioLower.includes('按钮') ||
      scenarioLower.includes('点击')
    ) {
      recommendedType = 'light';
      scenarioDescription = '按钮点击场景 - 使用轻震动';
    } else if (
      scenarioLower.includes('achievement') ||
      scenarioLower.includes('成就') ||
      scenarioLower.includes('重要')
    ) {
      // For important events, recommend vibrateLong instead
      return `# 震动代码生成

**场景**: ${scenario}

💡 **建议**: 对于重要事件（如成就解锁），建议使用 \`tap.vibrateLong()\` 而不是 \`vibrateShort\`

\`\`\`javascript
// 重要事件 - 使用长震动（400ms）
async function onImportantEvent() {
  try {
    await tap.vibrateLong();
    console.log('重要事件震动触发成功');
  } catch (error) {
    console.warn('震动不支持:', error);
  }
}
\`\`\`

如果确实需要使用短震动，可以使用：
\`\`\`javascript
tap.vibrateShort({ type: 'heavy' });  // 强震动
\`\`\`

📚 更多信息：
- 查看 \`get_vibrate_long_doc\` 了解长震动 API
- 查看 \`get_vibrate_short_doc\` 了解短震动 API`;
    }
  }

  if (type) {
    recommendedType = type;
  }

  const typeDescriptions = {
    heavy: '强震动 - 适用于错误、警告等需要强烈反馈的场景',
    medium: '中等震动 - 适用于成功、完成等普通重要事件',
    light: '轻震动 - 适用于按钮点击、普通交互等轻量反馈',
  };

  let codeExample = '';

  if (style === 'promise') {
    codeExample = `// ${scenarioDescription || typeDescriptions[recommendedType]}

async function triggerVibration() {
  try {
    await tap.vibrateShort({ 
      type: '${recommendedType}'  // 'heavy' | 'medium' | 'light'
    });
    console.log('震动触发成功');
  } catch (error) {
    console.warn('震动不支持或失败:', error);
    // 设备可能不支持震动，继续游戏流程
  }
}

// 调用
triggerVibration();`;
  } else {
    codeExample = `// ${scenarioDescription || typeDescriptions[recommendedType]}

function triggerVibration() {
  tap.vibrateShort({
    type: '${recommendedType}',  // 'heavy' | 'medium' | 'light'
    success: function() {
      console.log('震动触发成功');
    },
    fail: function(res) {
      console.warn('震动失败:', res.errMsg);
      // 错误信息可能是: "style is not support" - 设备不支持震动强度设置
    },
    complete: function() {
      console.log('震动完成');
    }
  });
}

// 调用
triggerVibration();`;
  }

  return `# 震动代码生成 - vibrateShort

## 参数说明

**type 参数**（必填）：
- \`'heavy'\` - 强震动，适用于错误、警告等需要强烈反馈的场景
- \`'medium'\` - 中等震动，适用于成功、完成等普通重要事件
- \`'light'\` - 轻震动，适用于按钮点击、普通交互等轻量反馈

## 生成的代码

${codeExample}

## 使用建议

${scenario ? `**场景**: ${scenario}\n\n` : ''}**推荐类型**: \`'${recommendedType}'\`

${typeDescriptions[recommendedType]}

## 其他强度示例

\`\`\`javascript
// 强震动 - 错误反馈
tap.vibrateShort({ type: 'heavy' });

// 中等震动 - 成功反馈
tap.vibrateShort({ type: 'medium' });

// 轻震动 - 按钮点击
tap.vibrateShort({ type: 'light' });
\`\`\`

## 注意事项

1. **设备兼容性**: 仅在 iPhone 7/7 Plus 及以上和 Android 设备生效
2. **错误处理**: 某些设备可能不支持震动强度设置，会返回 "style is not support" 错误
3. **优雅降级**: 震动失败时不应影响游戏流程
4. **测试**: 建议在不同设备上测试震动效果

📚 更多信息：
- 查看 \`get_vibrate_short_doc\` 获取完整 API 文档
- 查看 \`get_vibrate_patterns\` 了解最佳实践`;
}

/**
 * Get complete integration workflow guide
 */
async function getIntegrationWorkflow(): Promise<string> {
  return `# TapTap 震动功能完整接入工作流

## ⚠️ 关键原则：客户端无需安装 SDK

**请勿执行以下操作**：
- ❌ npm install @taptap/xxx
- ❌ 修改 package.json 添加依赖
- ❌ import 或 require 任何 TapTap 模块

**原因**：tap 是全局对象，由 TapTap 运行时自动提供（类似 window、document）

---

## 📋 完整步骤

### 步骤 1: 了解震动 API

TapTap 提供两个震动 API：

1. **tap.vibrateShort()** - 短震动（15ms）
   - 支持强度设置：'heavy'、'medium'、'light'
   - 适用于按钮点击、普通反馈等

2. **tap.vibrateLong()** - 长震动（400ms）
   - 无参数
   - 适用于成就解锁、重要事件等

### 步骤 2: 客户端代码集成

**2.1 短震动示例**

\`\`\`javascript
// 按钮点击反馈
function onButtonClick() {
  tap.vibrateShort({ type: 'light' });
}

// 使用 Promise 风格（推荐）
async function onButtonClickAsync() {
  try {
    await tap.vibrateShort({ type: 'light' });
  } catch (error) {
    console.warn('Vibration not supported');
  }
}
\`\`\`

**2.2 长震动示例**

\`\`\`javascript
// 成就解锁
function onAchievementUnlocked() {
  tap.vibrateLong();
}

// 使用 Promise 风格（推荐）
async function onAchievementUnlockedAsync() {
  try {
    await tap.vibrateLong();
  } catch (error) {
    console.warn('Vibration not supported');
  }
}
\`\`\`

**2.3 不同场景的震动强度**

\`\`\`javascript
// 错误反馈 - 强震动
tap.vibrateShort({ type: 'heavy' });

// 成功反馈 - 中等震动
tap.vibrateShort({ type: 'medium' });

// 普通反馈 - 轻震动
tap.vibrateShort({ type: 'light' });

// 重要事件 - 长震动
tap.vibrateLong();
\`\`\`

### 步骤 3: 测试验证

1. 在 TapTap 小游戏或 H5 环境中运行
2. 测试不同强度的震动效果
3. 测试错误处理（在不支持震动的设备上）
4. 确保震动失败时不影响游戏流程

---

## ✅ 完成！

总共 3 个步骤，5-10 分钟即可完成接入。

## 📚 需要详细文档？

- **docs://vibrate/overview** - 完整概览
- **docs://vibrate/api/vibrate-short** - vibrateShort() API
- **docs://vibrate/api/vibrate-long** - vibrateLong() API
- **docs://vibrate/patterns** - 最佳实践和常见场景
`;
}

export const vibrateTools = {
  // Core API tools
  getVibrateShort,
  getVibrateLong,

  // Helper tools
  searchVibrateDocs,
  getVibrateOverview,
  getVibratePatterns,
  getQuickStartGuide,
  getIntegrationWorkflow,

  // Code generation
  generateVibrateShortCode,
};
