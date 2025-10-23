#!/bin/bash

# 快速创建新功能模块的脚手架脚本（v1.2.0-beta.11+ 模块化架构）
# 用法: ./scripts/create-feature.sh cloud-save "Cloud Save"

FEATURE_KEY=$1  # 例如: cloud-save
FEATURE_NAME=$2  # 例如: Cloud Save

if [ -z "$FEATURE_KEY" ] || [ -z "$FEATURE_NAME" ]; then
  echo "用法: ./scripts/create-feature.sh <feature-key> <feature-name>"
  echo "示例: ./scripts/create-feature.sh cloud-save \"Cloud Save\""
  exit 1
fi

# 转换命名格式
# cloud-save → cloudSave
CAMEL_CASE=$(echo $FEATURE_KEY | perl -pe 's/(^|-)(.)/\U$2/g')
# cloudSave → CloudSave
PASCAL_CASE="${CAMEL_CASE^}"

# 创建目标目录
FEATURE_DIR="src/features/$CAMEL_CASE"

echo "🚀 创建新功能模块: $FEATURE_NAME"
echo "   Key: $FEATURE_KEY"
echo "   Directory: $FEATURE_DIR"
echo ""

# 创建模块目录
mkdir -p "$FEATURE_DIR"

echo "📁 创建模块文件..."
echo ""

# ============================================================
# 1. 创建模块定义（index.ts）
# ============================================================
echo "📝 创建 $FEATURE_DIR/index.ts"
cat > "$FEATURE_DIR/index.ts" << EOF
/**
 * $FEATURE_NAME Feature Module
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../core/types/index.js';

import { ${CAMEL_CASE}ToolDefinitions, ${CAMEL_CASE}ToolHandlers } from './tools.js';
import { ${CAMEL_CASE}ResourceDefinitions, ${CAMEL_CASE}ResourceHandlers } from './resources.js';

export const ${CAMEL_CASE}Module = {
  name: '$CAMEL_CASE',
  description: 'TapTap $FEATURE_NAME 功能',

  tools: ${CAMEL_CASE}ToolDefinitions.map((definition, index) => ({
    definition,
    handler: ${CAMEL_CASE}ToolHandlers[index],
    requiresAuth: [
      // TODO: 列出需要认证的 tool names
      // 'save_cloud_data', 'load_cloud_data'
    ].includes(definition.name)
  })),

  resources: ${CAMEL_CASE}ResourceDefinitions.map((definition, index) => ({
    ...definition,
    handler: ${CAMEL_CASE}ResourceHandlers[index]
  }))
};
EOF

# ============================================================
# 2. 创建 Tools 定义（tools.ts）
# ============================================================
echo "🔧 创建 $FEATURE_DIR/tools.ts"
cat > "$FEATURE_DIR/tools.ts" << EOF
/**
 * $FEATURE_NAME Tools Definitions and Handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../core/types/index.js';

import * as handlers from './handlers.js';
import { ${CAMEL_CASE}Tools } from './docTools.js';

export const ${CAMEL_CASE}ToolDefinitions: Tool[] = [
  // 流程指引
  {
    name: 'get_${FEATURE_KEY}_guide',
    description: '⭐ $FEATURE_NAME 完整接入工作流指引',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
  // TODO: 添加更多 Tools
];

export const ${CAMEL_CASE}ToolHandlers = [
  // get_${FEATURE_KEY}_guide
  async (args: any, context: HandlerContext) => {
    return ${CAMEL_CASE}Tools.getIntegrationWorkflow();
  }
  // TODO: 添加更多 handlers
];
EOF

# ============================================================
# 3. 创建 Resources 定义（resources.ts）
# ============================================================
echo "📚 创建 $FEATURE_DIR/resources.ts"
cat > "$FEATURE_DIR/resources.ts" << EOF
/**
 * $FEATURE_NAME Resources Definitions and Handlers
 */

import { ${CAMEL_CASE}Tools } from './docTools.js';

export const ${CAMEL_CASE}ResourceDefinitions = [
  {
    uri: 'docs://$FEATURE_KEY/overview',
    name: '$FEATURE_NAME Complete Overview',
    description: 'Complete overview of $FEATURE_NAME APIs',
    mimeType: 'text/markdown'
  }
  // TODO: 添加更多 Resources
];

export const ${CAMEL_CASE}ResourceHandlers = [
  // docs://$FEATURE_KEY/overview
  async () => ${CAMEL_CASE}Tools.getOverview()
  // TODO: 添加更多 handlers
];
EOF

# ============================================================
# 4. 创建文档数据（docs.ts）
# ============================================================
echo "📖 创建 $FEATURE_DIR/docs.ts"
cat > "$FEATURE_DIR/docs.ts" << EOF
/**
 * TapTap $FEATURE_NAME API Documentation
 */

export interface ${PASCAL_CASE}API {
  name: string;
  method: string;
  description: string;
  parameters?: Record<string, string>;
  returnValue?: string;
  example: string;
}

export const ${CAMEL_CASE.toUpperCase()}_DOCUMENTATION = {
  title: "TapTap $FEATURE_NAME API (Minigame & H5)",
  description: \`Complete $FEATURE_NAME functionality...

⚠️ IMPORTANT:
- NO npm packages or SDK installation required
- Use global 'tap' object
- Works in TapTap Minigame AND H5 environments\`,

  apis: [
    // TODO: 添加 API 定义
  ]
};
EOF

# ============================================================
# 5. 创建文档工具（docTools.ts）
# ============================================================
echo "🛠️  创建 $FEATURE_DIR/docTools.ts"
cat > "$FEATURE_DIR/docTools.ts" << EOF
/**
 * $FEATURE_NAME Documentation Tools
 */

import { ${CAMEL_CASE.toUpperCase()}_DOCUMENTATION } from './docs.js';

export async function getOverview(): Promise<string> {
  return \`# \${${CAMEL_CASE.toUpperCase()}_DOCUMENTATION.title}

\${${CAMEL_CASE.toUpperCase()}_DOCUMENTATION.description}

// TODO: 添加完整概览内容
  \`;
}

export async function getIntegrationWorkflow(): Promise<string> {
  return \`# $FEATURE_NAME 完整接入工作流

## ⚠️ 关键原则：客户端无需安装 SDK

// TODO: 添加完整工作流步骤

## 📚 需要详细 API 文档？

- **docs://$FEATURE_KEY/overview** - 完整概览
  \`;
}

export const ${CAMEL_CASE}Tools = {
  getOverview,
  getIntegrationWorkflow
  // TODO: 添加更多工具函数
};
EOF

# ============================================================
# 6. 创建业务处理器（handlers.ts）
# ============================================================
echo "⚙️  创建 $FEATURE_DIR/handlers.ts"
cat > "$FEATURE_DIR/handlers.ts" << EOF
/**
 * $FEATURE_NAME Handlers
 */

import type { HandlerContext } from '../../core/types/index.js';

// TODO: 实现业务逻辑处理器
EOF

# ============================================================
# 7. 创建 API 调用层（api.ts）
# ============================================================
echo "🌐 创建 $FEATURE_DIR/api.ts"
cat > "$FEATURE_DIR/api.ts" << EOF
/**
 * $FEATURE_NAME API Calls
 */

import { HttpClient } from '../../core/network/httpClient.js';

// TODO: 定义接口和实现 API 调用
EOF

echo ""
echo "✅ 模块文件创建完成！"
echo ""
echo "📂 创建的文件："
echo "   - $FEATURE_DIR/index.ts"
echo "   - $FEATURE_DIR/tools.ts"
echo "   - $FEATURE_DIR/resources.ts"
echo "   - $FEATURE_DIR/docs.ts"
echo "   - $FEATURE_DIR/docTools.ts"
echo "   - $FEATURE_DIR/handlers.ts"
echo "   - $FEATURE_DIR/api.ts"
echo ""
echo "📋 下一步："
echo "1. 实现各个文件中的 TODO 标记内容"
echo "2. 在 src/server.ts 中注册模块："
echo "   import { ${CAMEL_CASE}Module } from './features/$CAMEL_CASE/index.js';"
echo "   const allModules = [leaderboardModule, ${CAMEL_CASE}Module];"
echo "3. 编译测试: npm run build"
echo "4. 启动测试: node dist/server.js"
echo ""
echo "📖 参考: src/features/leaderboard/ 模块"
echo "📚 详细文档: CONTRIBUTING.md"
