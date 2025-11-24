#!/bin/bash

# 快速创建新功能模块的脚手架脚本（v1.2.0-beta.11+ 模块化架构）
# 交互式版本 - 自动处理 Git 分支、询问配置选项
# 用法: ./scripts/create-feature.sh

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TapTap MCP 功能模块脚手架生成器  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================================
# 1. 询问功能信息
# ============================================================

echo -e "${GREEN}📝 请输入功能信息${NC}"
echo ""

# 询问 Feature Key
echo -e "${BLUE}Feature Key 说明：${NC}"
echo "  - 用于目录名和变量名（如 cloud-save）"
echo "  - 格式：小写字母 + 短横线分隔"
echo "  - 示例：cloud-save, user-profile, friend-system"
echo ""
read -p "Feature Key: " FEATURE_KEY
if [ -z "$FEATURE_KEY" ]; then
  echo -e "${RED}❌ Feature Key 不能为空${NC}"
  exit 1
fi

# 验证 Feature Key 格式
if ! echo "$FEATURE_KEY" | grep -qE '^[a-z]+(-[a-z]+)*$'; then
  echo -e "${RED}❌ Feature Key 格式错误！必须是小写字母和短横线（如 cloud-save）${NC}"
  exit 1
fi

echo ""

# 询问 Feature Name
echo -e "${BLUE}Feature Name 说明：${NC}"
echo "  - 用于代码注释和 API 文档（如 Cloud Save）"
echo "  - 格式：英文，首字母大写"
echo "  - 会出现在：工具描述、文档标题、代码注释"
echo "  - ⚠️  建议使用英文以保持 MCP 工具描述的专业性"
echo "  - 示例：Cloud Save, User Profile, Friend System"
echo ""
read -p "Feature Name (英文): " FEATURE_NAME
if [ -z "$FEATURE_NAME" ]; then
  echo -e "${RED}❌ Feature Name 不能为空${NC}"
  exit 1
fi

echo ""

# ============================================================
# 2. 询问是否需要 Resources
# ============================================================

echo -e "${GREEN}📚 是否需要创建 Resources（API 文档）？${NC}"
read -p "需要 Resources? (y/n, 默认 y): " NEED_RESOURCES
NEED_RESOURCES=${NEED_RESOURCES:-y}

# ============================================================
# 3. 询问是否需要 Prompts
# ============================================================

echo -e "${GREEN}💡 是否需要创建 Prompts？${NC}"
read -p "需要 Prompts? (y/n, 默认 n): " NEED_PROMPTS
NEED_PROMPTS=${NEED_PROMPTS:-n}

echo ""

# ============================================================
# 4. Git 分支处理
# ============================================================

CURRENT_BRANCH=$(git branch --show-current)
TARGET_BRANCH="feat/$FEATURE_KEY"

echo -e "${GREEN}🌿 Git 分支处理${NC}"
echo "当前分支: $CURRENT_BRANCH"
echo "目标分支: $TARGET_BRANCH"
echo ""

if [ "$CURRENT_BRANCH" = "$TARGET_BRANCH" ]; then
  echo -e "${YELLOW}⚠️  当前已在 $TARGET_BRANCH 分支${NC}"
  read -p "是否继续在当前分支创建? (y/n, 默认 y): " CONTINUE_CURRENT
  CONTINUE_CURRENT=${CONTINUE_CURRENT:-y}

  if [ "$CONTINUE_CURRENT" != "y" ]; then
    echo -e "${RED}❌ 已取消${NC}"
    exit 0
  fi
else
  # 检查目标分支是否已存在
  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    echo -e "${YELLOW}⚠️  分支 $TARGET_BRANCH 已存在${NC}"
    read -p "是否切换到该分支? (y/n, 默认 y): " SWITCH_EXISTING
    SWITCH_EXISTING=${SWITCH_EXISTING:-y}

    if [ "$SWITCH_EXISTING" = "y" ]; then
      git checkout "$TARGET_BRANCH"
      echo -e "${GREEN}✅ 已切换到分支 $TARGET_BRANCH${NC}"
    else
      echo -e "${YELLOW}⚠️  保持在当前分支 $CURRENT_BRANCH${NC}"
    fi
  else
    read -p "是否创建并切换到新分支 $TARGET_BRANCH? (y/n, 默认 y): " CREATE_BRANCH
    CREATE_BRANCH=${CREATE_BRANCH:-y}

    if [ "$CREATE_BRANCH" = "y" ]; then
      git checkout -b "$TARGET_BRANCH"
      echo -e "${GREEN}✅ 已创建并切换到分支 $TARGET_BRANCH${NC}"
    else
      echo -e "${YELLOW}⚠️  保持在当前分支 $CURRENT_BRANCH${NC}"
    fi
  fi
fi

echo ""

# ============================================================
# 5. 转换命名格式
# ============================================================

# cloud-save → cloudSave (小驼峰)
# 使用 perl 确保跨平台兼容性
CAMEL_CASE=$(echo "$FEATURE_KEY" | perl -pe 's/-([a-z])/\U$1/g')
# cloudSave → CloudSave (大驼峰)
PASCAL_CASE=$(echo "$CAMEL_CASE" | perl -pe 's/^([a-z])/\U$1/')
# cloud-save → CLOUD_SAVE (大写下划线)
UPPER_SNAKE_CASE=$(echo "$FEATURE_KEY" | tr '[:lower:]' '[:upper:]' | tr '-' '_')

# 创建目标目录（使用小驼峰命名）
FEATURE_DIR="src/features/$CAMEL_CASE"

echo -e "${BLUE}🚀 创建新功能模块: $FEATURE_NAME${NC}"
echo "   Key: $FEATURE_KEY"
echo "   Camel Case: $CAMEL_CASE"
echo "   Pascal Case: $PASCAL_CASE"
echo "   Directory: $FEATURE_DIR"
echo ""

# 检查目录是否已存在
if [ -d "$FEATURE_DIR" ]; then
  echo -e "${YELLOW}⚠️  目录 $FEATURE_DIR 已存在${NC}"
  read -p "是否覆盖? (y/n, 默认 n): " OVERWRITE
  OVERWRITE=${OVERWRITE:-n}

  if [ "$OVERWRITE" != "y" ]; then
    echo -e "${RED}❌ 已取消${NC}"
    exit 0
  fi

  rm -rf "$FEATURE_DIR"
fi

# 创建模块目录
mkdir -p "$FEATURE_DIR"

echo -e "${GREEN}📁 创建模块文件...${NC}"
echo ""

# ============================================================
# 6. 创建模块定义（index.ts）
# ============================================================
echo "📝 创建 $FEATURE_DIR/index.ts"
cat > "$FEATURE_DIR/index.ts" << EOF
/**
 * $FEATURE_NAME Feature Module
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedContext } from '../../core/types/index.js';

import { ${CAMEL_CASE}ToolDefinitions, ${CAMEL_CASE}ToolHandlers } from './tools.js';
EOF

if [ "$NEED_RESOURCES" = "y" ]; then
cat >> "$FEATURE_DIR/index.ts" << EOF
import { ${CAMEL_CASE}ResourceDefinitions, ${CAMEL_CASE}ResourceHandlers } from './resources.js';
EOF
fi

if [ "$NEED_PROMPTS" = "y" ]; then
cat >> "$FEATURE_DIR/index.ts" << EOF
import { ${CAMEL_CASE}PromptDefinitions, ${CAMEL_CASE}PromptHandlers } from './prompts.js';
EOF
fi

cat >> "$FEATURE_DIR/index.ts" << EOF

export const ${CAMEL_CASE}Module = {
  name: '$CAMEL_CASE',
  description: 'TapTap $FEATURE_NAME 功能',

  tools: ${CAMEL_CASE}ToolDefinitions.map((definition, index) => ({
    definition,
    handler: ${CAMEL_CASE}ToolHandlers[index],
    requiresAuth: [
      // TODO: 列出需要认证的 tool names
      // 示例: 'save_${FEATURE_KEY}_data', 'load_${FEATURE_KEY}_data'
    ].includes(definition.name)
  })),
EOF

if [ "$NEED_RESOURCES" = "y" ]; then
cat >> "$FEATURE_DIR/index.ts" << EOF

  resources: ${CAMEL_CASE}ResourceDefinitions.map((definition, index) => ({
    ...definition,
    handler: ${CAMEL_CASE}ResourceHandlers[index]
  }))
EOF
fi

if [ "$NEED_PROMPTS" = "y" ]; then
cat >> "$FEATURE_DIR/index.ts" << EOF
,

  prompts: ${CAMEL_CASE}PromptDefinitions.map((definition, index) => ({
    ...definition,
    handler: ${CAMEL_CASE}PromptHandlers[index]
  }))
EOF
fi

cat >> "$FEATURE_DIR/index.ts" << EOF
};
EOF

# ============================================================
# 7. 创建 Tools 定义（tools.ts）
# ============================================================
echo "🔧 创建 $FEATURE_DIR/tools.ts"
cat > "$FEATURE_DIR/tools.ts" << EOF
/**
 * $FEATURE_NAME Tools Definitions and Handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedContext } from '../../core/types/context.js';

import * as handlers from './handlers.js';
import { ${CAMEL_CASE}Tools } from './docTools.js';

/**
 * Tool 定义数组
 */
export const ${CAMEL_CASE}ToolDefinitions: Tool[] = [
  // 流程指引工具
  {
    name: 'get_${FEATURE_KEY}_integration_guide',
    description: '⭐ Get complete $FEATURE_NAME integration workflow guide',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // TODO: 添加更多 Tools
  // 示例 - 数据保存工具:
  /*
  {
    name: 'save_${FEATURE_KEY}_data',
    description: 'Save data to $FEATURE_NAME',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Data key'
        },
        value: {
          type: 'string',
          description: 'Data value'
        }
      },
      required: ['key', 'value']
    }
  },
  */

  // 示例 - 数据加载工具:
  /*
  {
    name: 'load_${FEATURE_KEY}_data',
    description: 'Load data from $FEATURE_NAME',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Data key'
        }
      },
      required: ['key']
    }
  }
  */
];

/**
 * Tool 处理器数组（顺序必须与定义数组一致）
 */
export const ${CAMEL_CASE}ToolHandlers = [
  // get_${FEATURE_KEY}_integration_guide
  async (args: any, context: ResolvedContext) => {
    return ${CAMEL_CASE}Tools.getIntegrationWorkflow();
  },

  // TODO: 添加更多 handlers
  // 示例 - save_${FEATURE_KEY}_data handler:
  /*
  async (args: { key: string; value: string }, context: ResolvedContext) => {
    return handlers.saveData(args, context);
  },
  */

  // 示例 - load_${FEATURE_KEY}_data handler:
  /*
  async (args: { key: string }, context: ResolvedContext) => {
    return handlers.loadData(args, context);
  }
  */
];
EOF

# ============================================================
# 8. 创建 Resources 定义（resources.ts）
# ============================================================
if [ "$NEED_RESOURCES" = "y" ]; then
echo "📚 创建 $FEATURE_DIR/resources.ts"
cat > "$FEATURE_DIR/resources.ts" << EOF
/**
 * $FEATURE_NAME Resources Definitions and Handlers
 */

import { ${CAMEL_CASE}Tools } from './docTools.js';

/**
 * Resource 定义数组
 */
export const ${CAMEL_CASE}ResourceDefinitions = [
  {
    uri: 'docs://$FEATURE_KEY/overview',
    name: '$FEATURE_NAME Complete Overview',
    description: 'Complete overview of all $FEATURE_NAME APIs',
    mimeType: 'text/markdown'
  },

  // TODO: 添加更多 Resources
  // 示例 - 单个 API 文档:
  /*
  {
    uri: 'docs://$FEATURE_KEY/api/save-data',
    name: 'saveData() API Documentation',
    description: 'Complete documentation for saveData() API',
    mimeType: 'text/markdown'
  },
  {
    uri: 'docs://$FEATURE_KEY/api/load-data',
    name: 'loadData() API Documentation',
    description: 'Complete documentation for loadData() API',
    mimeType: 'text/markdown'
  }
  */
];

/**
 * Resource 处理器数组（顺序必须与定义数组一致）
 */
export const ${CAMEL_CASE}ResourceHandlers = [
  // docs://$FEATURE_KEY/overview
  async () => ${CAMEL_CASE}Tools.getOverview(),

  // TODO: 添加更多 handlers
  // 示例 - API 文档 handlers:
  /*
  async () => ${CAMEL_CASE}Tools.getSaveDataDoc(),
  async () => ${CAMEL_CASE}Tools.getLoadDataDoc()
  */
];
EOF
fi

# ============================================================
# 9. 创建 Prompts 定义（prompts.ts）
# ============================================================
if [ "$NEED_PROMPTS" = "y" ]; then
echo "💡 创建 $FEATURE_DIR/prompts.ts"
cat > "$FEATURE_DIR/prompts.ts" << EOF
/**
 * $FEATURE_NAME Prompts Definitions and Handlers
 */

/**
 * Prompt 定义数组
 */
export const ${CAMEL_CASE}PromptDefinitions = [
  // TODO: 添加 Prompts
  // 示例:
  /*
  {
    name: '${FEATURE_KEY}_quick_start',
    description: 'Quick start guide for $FEATURE_NAME',
    arguments: []
  }
  */
];

/**
 * Prompt 处理器数组（顺序必须与定义数组一致）
 */
export const ${CAMEL_CASE}PromptHandlers = [
  // TODO: 添加 handlers
  // 示例:
  /*
  async () => {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Quick start guide for $FEATURE_NAME...'
          }
        }
      ]
    };
  }
  */
];
EOF
fi

# ============================================================
# 10. 创建文档数据（docs.ts）
# ============================================================
echo "📖 创建 $FEATURE_DIR/docs.ts"
cat > "$FEATURE_DIR/docs.ts" << EOF
/**
 * TapTap $FEATURE_NAME API Documentation
 */

/**
 * API 定义接口
 */
export interface ${PASCAL_CASE}API {
  name: string;
  method: string;
  description: string;
  parameters?: Record<string, string>;
  returnValue?: string;
  example: string;
}

/**
 * $FEATURE_NAME 文档数据
 */
export const ${UPPER_SNAKE_CASE}_DOCUMENTATION = {
  title: "TapTap $FEATURE_NAME API (Minigame & H5)",
  description: \`Complete $FEATURE_NAME functionality...

⚠️ IMPORTANT:
- NO npm packages or SDK installation required
- Use global 'tap' object
- Works in TapTap Minigame AND H5 environments\`,

  apis: [
    // TODO: 添加 API 定义
    // 示例:
    /*
    {
      name: 'saveData',
      method: 'tap.${CAMEL_CASE}.saveData(key, value)',
      description: 'Save data to cloud storage',
      parameters: {
        key: 'string - Data key',
        value: 'string - Data value to save'
      },
      returnValue: 'Promise<void>',
      example: \`
// Save player progress
await tap.${CAMEL_CASE}.saveData('player_level', '10');
      \`.trim()
    },
    {
      name: 'loadData',
      method: 'tap.${CAMEL_CASE}.loadData(key)',
      description: 'Load data from cloud storage',
      parameters: {
        key: 'string - Data key'
      },
      returnValue: 'Promise<string>',
      example: \`
// Load player progress
const level = await tap.${CAMEL_CASE}.loadData('player_level');
console.log('Player level:', level);
      \`.trim()
    }
    */
  ] as ${PASCAL_CASE}API[]
};
EOF

# ============================================================
# 11. 创建文档工具（docTools.ts）
# ============================================================
echo "🛠️  创建 $FEATURE_DIR/docTools.ts"
cat > "$FEATURE_DIR/docTools.ts" << EOF
/**
 * $FEATURE_NAME Documentation Tools
 */

import { ${UPPER_SNAKE_CASE}_DOCUMENTATION } from './docs.js';

/**
 * 获取完整概览
 */
export async function getOverview(): Promise<string> {
  const doc = ${UPPER_SNAKE_CASE}_DOCUMENTATION;

  let content = \`# \${doc.title}

\${doc.description}

## 📚 API 列表

\`;

  // TODO: 添加 API 列表
  // 示例:
  /*
  doc.apis.forEach(api => {
    content += \`### \${api.name}

**方法:** \\\`\${api.method}\\\`

**描述:** \${api.description}

**示例:**
\\\`\\\`\\\`javascript
\${api.example}
\\\`\\\`\\\`

---

\`;
  });
  */

  return content;
}

/**
 * 获取集成工作流指引
 */
export async function getIntegrationWorkflow(): Promise<string> {
  return \`# $FEATURE_NAME 完整接入工作流

## ⚠️ 关键原则：客户端无需安装 SDK

客户端只需要使用全局 \\\`tap\\\` 对象，无需任何 npm 包或 SDK 安装。

## 📋 接入步骤

### 1️⃣ 服务端配置

TODO: 添加服务端配置步骤
示例:
\\\`\\\`\\\`
1. 在 TapTap 开发者中心启用 $FEATURE_NAME 功能
2. 使用此 MCP 服务器的工具创建配置
   - 调用 create_${FEATURE_KEY}_config 工具
3. 记录返回的配置 ID
\\\`\\\`\\\`

### 2️⃣ 客户端实现

TODO: 添加客户端实现步骤
示例:
\\\`\\\`\\\`javascript
// 保存数据
await tap.${CAMEL_CASE}.saveData('player_level', '10');

// 加载数据
const level = await tap.${CAMEL_CASE}.loadData('player_level');
\\\`\\\`\\\`

### 3️⃣ 测试验证

TODO: 添加测试步骤

## 📚 需要详细 API 文档？

- **docs://$FEATURE_KEY/overview** - 完整概览
EOF

if [ "$NEED_RESOURCES" = "y" ]; then
cat >> "$FEATURE_DIR/docTools.ts" << EOF
- **docs://$FEATURE_KEY/api/save-data** - saveData() API
- **docs://$FEATURE_KEY/api/load-data** - loadData() API
EOF
fi

cat >> "$FEATURE_DIR/docTools.ts" << EOF

## 🔧 可用的 MCP 工具

- \\\`get_${FEATURE_KEY}_integration_guide\\\` - 本指引
- TODO: 列出其他工具

\`;
}

// TODO: 添加更多文档工具函数
// 示例:
/*
export async function getSaveDataDoc(): Promise<string> {
  const api = ${UPPER_SNAKE_CASE}_DOCUMENTATION.apis.find(a => a.name === 'saveData');
  if (!api) return 'API not found';

  return \`# \${api.name} API

**方法:** \\\`\${api.method}\\\`

**描述:** \${api.description}

## 参数

\${Object.entries(api.parameters || {}).map(([key, desc]) => \`- **\${key}**: \${desc}\`).join('\\n')}

## 返回值

\${api.returnValue}

## 示例

\\\`\\\`\\\`javascript
\${api.example}
\\\`\\\`\\\`
\`;
}

export async function getLoadDataDoc(): Promise<string> {
  const api = ${UPPER_SNAKE_CASE}_DOCUMENTATION.apis.find(a => a.name === 'loadData');
  if (!api) return 'API not found';

  return \`# \${api.name} API

**方法:** \\\`\${api.method}\\\`

**描述:** \${api.description}

## 参数

\${Object.entries(api.parameters || {}).map(([key, desc]) => \`- **\${key}**: \${desc}\`).join('\\n')}

## 返回值

\${api.returnValue}

## 示例

\\\`\\\`\\\`javascript
\${api.example}
\\\`\\\`\\\`
\`;
}
*/

export const ${CAMEL_CASE}Tools = {
  getOverview,
  getIntegrationWorkflow
  // TODO: 导出更多工具函数
  // getSaveDataDoc,
  // getLoadDataDoc
};
EOF

# ============================================================
# 12. 创建业务处理器（handlers.ts）
# ============================================================
echo "⚙️  创建 $FEATURE_DIR/handlers.ts"
cat > "$FEATURE_DIR/handlers.ts" << EOF
/**
 * $FEATURE_NAME Handlers
 */

import type { ResolvedContext } from '../../core/types/index.js';
import * as api from './api.js';

// TODO: 实现业务逻辑处理器
// 示例:
/*
export async function saveData(
  args: { key: string; value: string },
  context: ResolvedContext
): Promise<string> {
  const { key, value } = args;

  // 调用 API
  await api.saveDataToCloud(context, key, value);

  return \`Successfully saved data:
Key: \${key}
Value: \${value}\`;
}

export async function loadData(
  args: { key: string },
  context: ResolvedContext
): Promise<string> {
  const { key } = args;

  // 调用 API
  const value = await api.loadDataFromCloud(context, key);

  return \`Loaded data:
Key: \${key}
Value: \${value}\`;
}
*/
EOF

# ============================================================
# 13. 创建 API 调用层（api.ts）
# ============================================================
echo "🌐 创建 $FEATURE_DIR/api.ts"
cat > "$FEATURE_DIR/api.ts" << EOF
/**
 * $FEATURE_NAME API Calls
 */

import { HttpClient } from '../../core/network/httpClient.js';
import { ensureAppInfo } from '../app/api.js';  // 导入应用信息函数
import type { ResolvedContext } from '../../core/types/context.js';

// TODO: 定义接口
// 示例:
/*
export interface SaveDataRequest {
  developer_id: number;
  app_id: number;
  key: string;
  value: string;
}

export interface LoadDataRequest {
  developer_id: number;
  app_id: number;
  key: string;
}

export interface SaveDataResponse {
  success: boolean;
}

export interface LoadDataResponse {
  value: string;
}
*/

// TODO: 实现 API 调用
// 示例（需要应用信息）:
/*
export async function saveDataToCloud(
  args: { key: string; value: string },
  context: ResolvedContext
): Promise<SaveDataResponse> {
  const client = new HttpClient();

  // 获取应用信息（developer_id, app_id 等）
  // 注意：ensureAppInfo 现在接受 projectPath 字符串，从 context.projectPath 获取
  const appInfo = await ensureAppInfo(context.projectPath);

  const response = await client.post<SaveDataResponse>(
    '/${FEATURE_KEY}/v1/save',
    {
      body: {
        developer_id: appInfo.developer_id,
        app_id: appInfo.app_id,
        key: args.key,
        value: args.value
      }
    }
  );

  return response;
}

export async function loadDataFromCloud(
  args: { key: string },
  context: ResolvedContext
): Promise<string> {
  const client = new HttpClient();

  // 获取应用信息
  const appInfo = await ensureAppInfo(context.projectPath);

  const response = await client.post<LoadDataResponse>(
    '/${FEATURE_KEY}/v1/load',
    {
      body: {
        developer_id: appInfo.developer_id,
        app_id: appInfo.app_id,
        key: args.key
      }
    }
  );

  return response.value;
}
*/
EOF

echo ""
echo -e "${GREEN}✅ 模块文件创建完成！${NC}"
echo ""
echo -e "${BLUE}📂 创建的文件：${NC}"
echo "   - $FEATURE_DIR/index.ts"
echo "   - $FEATURE_DIR/tools.ts"
if [ "$NEED_RESOURCES" = "y" ]; then
  echo "   - $FEATURE_DIR/resources.ts"
fi
if [ "$NEED_PROMPTS" = "y" ]; then
  echo "   - $FEATURE_DIR/prompts.ts"
fi
echo "   - $FEATURE_DIR/docs.ts"
echo "   - $FEATURE_DIR/docTools.ts"
echo "   - $FEATURE_DIR/handlers.ts"
echo "   - $FEATURE_DIR/api.ts"
echo ""
echo -e "${YELLOW}📋 下一步：${NC}"
echo "1. 实现各个文件中的 TODO 标记内容"
echo "2. 在 src/server.ts 中注册模块："
echo -e "   ${BLUE}import { ${CAMEL_CASE}Module } from './features/$CAMEL_CASE/index.js';${NC}"
echo -e "   ${BLUE}const allModules = [leaderboardModule, ${CAMEL_CASE}Module];${NC}"
echo "3. 编译测试: npm run build"
echo "4. 启动测试: node dist/server.js"
echo ""
echo -e "${BLUE}📖 参考: src/features/leaderboard/ 模块${NC}"
echo -e "${BLUE}📚 详细文档: CONTRIBUTING.md${NC}"
echo ""
echo -e "${GREEN}🎉 祝开发顺利！${NC}"
