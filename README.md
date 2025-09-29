# TapTap 小游戏开发文档 MCP 服务器

> 基于 Model Context Protocol (MCP) 的 TapTap 小游戏开发文档服务器（Node.js 版本）
>
> 🚀 零配置部署 | 📚 完整文档 | 🔧 即开即用

## 🌟 功能特性

### ☁️ 云存档系统
- 跨设备存档同步方案
- 版本冲突智能处理
- 多槽位存档管理
- 数据安全和备份
- 完整的 API 调用示例

### 🏆 排行榜系统
- 分数提交和批量操作
- 排名查询和实时更新
- 排行榜界面集成
- 竞技系统设计模式
- 实时排名显示方案

### ✨ 核心优势
- **专注用户功能** - 云存档和排行榜等需要用户 token 的核心功能
- **完整代码示例** - 可直接复制使用的实现代码
- **零配置启动** - 无需 API 密钥或外部依赖
- **即开即用** - 通过 npx 一键启动

## 🚀 快速开始

### 通过 NPX 直接使用（推荐）
```bash
# 无需安装，直接运行
npx @taptap/minigame-docs-mcp
```

### 全局安装
```bash
# 全局安装
npm install -g @taptap/minigame-docs-mcp

# 运行
taptap-docs-mcp
```

### 本地开发
```bash
# 克隆项目
git clone <repository-url>
cd taptap-minigame-mcp-server

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 或使用启动脚本
./start-node-mcp.sh
```

## 🔗 AI Agent 集成

### Claude Desktop 集成
在 Claude Desktop 配置文件中添加：
```json
{
  "mcpServers": {
    "taptap-docs": {
      "command": "npx",
      "args": ["@taptap/minigame-docs-mcp"]
    }
  }
}
```

### OpenHands 集成
在 OpenHands 的 `config.toml` 中添加：
```toml
[mcp]
stdio_servers = [
    {
        name = "taptap-docs",
        command = "npx",
        args = ["@taptap/minigame-docs-mcp"]
    }
]
```

### 其他 AI Agent
使用标准 MCP 客户端库连接：
```javascript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
    command: 'npx',
    args: ['@taptap/minigame-docs-mcp']
});
```

## 📖 可用工具

### ☁️ 云存档功能工具
- `search_cloud_save_docs` - 搜索云存档相关文档（同步、备份、冲突处理）
- `get_cloud_save_overview` - 获取云存档功能概览
- `get_cloud_save_category_docs` - 获取指定云存档分类的详细文档和 API 示例

### 🏆 排行榜系统工具
- `search_leaderboard_docs` - 搜索排行榜相关文档（分数提交、排名查询、界面显示）
- `get_leaderboard_overview` - 获取排行榜功能概览
- `get_leaderboard_category_docs` - 获取指定排行榜分类的详细文档
- `get_leaderboard_patterns` - 获取排行榜集成模式和最佳实践

> **注意**: 这些功能都需要用户 token 来执行实际的 API 请求

## 💡 使用示例

### 云存档开发
```
开发者: 如何实现游戏的云存档同步功能？

MCP 工具: get_cloud_save_category_docs
参数: { "category": "advanced_features" }
→ 返回版本冲突处理、自动同步等高级功能的实现代码
```

### 排行榜系统
```
开发者: 我想在游戏中添加排行榜功能

MCP 工具: get_leaderboard_patterns
→ 返回完整的排行榜集成模式和游戏结束提交分数的完整代码示例
```

### 功能概览查询
```
开发者: TapTap 有哪些用户功能可以集成？

MCP 工具: get_cloud_save_overview
MCP 工具: get_leaderboard_overview
→ 返回云存档和排行榜功能的完整概览和使用方法
```

## 🔧 开发和构建

### 本地开发
```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查
npm run lint

# 格式化代码
npm run format
```

### 发布到 NPM
```bash
# 构建项目
npm run build

# 发布到 NPM
npm publish

# 发布到私有仓库
npm publish --registry https://npm.taptap.com/
```

## 📁 项目结构

```
├── src/                          # TypeScript 源码
│   ├── server.ts                 # 主服务器入口
│   ├── data/                     # 静态文档数据
│   │   ├── cloudSaveDocs.ts     # 云存档文档
│   │   └── leaderboardDocs.ts   # 排行榜文档
│   └── tools/                   # 工具处理函数
│       ├── cloudSaveTools.ts    # 云存档工具
│       └── leaderboardTools.ts  # 排行榜工具
├── bin/                         # 可执行文件
│   └── taptap-docs-mcp          # NPM 启动脚本
├── dist/                        # 编译输出（自动生成）
├── examples/                    # 集成配置示例
├── package.json                 # NPM 包配置
├── tsconfig.json               # TypeScript 配置
└── README.md                   # 项目文档
```

## 📄 许可证

MIT License

---

> **注意**: 本项目现在完全基于 Node.js，无需 Python 环境，通过 `npx` 即可零配置使用。