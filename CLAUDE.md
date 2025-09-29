# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Model Context Protocol (MCP) 的 TapTap 小游戏开发文档服务器。该项目专注为 AI 助手提供完整的 TapTap 小游戏开发文档和代码示例，包括认证、云存档、排行榜、SDK 集成等核心功能的详细指南。

## 架构概览

项目采用分层架构设计：

### 核心服务器层
- **`src/taptap_mcp/server.py`** - 主 MCP 服务器，使用标准 MCP 协议（stdio 模式）
- **`server.py`** - 项目入口点，负责启动主服务器

### 文档工具层
- **`src/taptap_mcp/tools/`** - 按功能分离的文档工具集
  - `auth_tools.py` - 认证和授权相关文档工具
  - `cloud_save_tools.py` - 云存档功能文档工具
  - `leaderboard_tools.py` - 排行榜系统文档工具
  - `sdk_tools.py` - SDK 集成指南工具

### 配置和数据层
- **`src/taptap_mcp/config/settings.py`** - 基于 Pydantic 的配置管理
- **`src/taptap_mcp/data/`** - 按功能分离的静态文档数据
  - `auth_docs.py` - 认证系统完整文档和代码示例
  - `cloud_save_docs.py` - 云存档功能文档和最佳实践
  - `leaderboard_docs.py` - 排行榜系统文档和集成模式
  - `sdk_docs.py` - 多平台 SDK 集成指南

## 常用命令

### 开发环境设置
```bash
# 创建并激活虚拟环境
python -m venv .python-env
source .python-env/bin/activate  # Linux/Mac
# 或 .python-env\Scripts\activate  # Windows

# 安装核心依赖（推荐使用 pyproject.toml）
pip install -e .

# 或安装所有依赖（包含可选依赖）
pip install -r requirements.txt

# 安装开发依赖
pip install -e .[dev]

# 安装缓存支持（可选）
pip install -e .[cache]

# 安装监控支持（可选）
pip install -e .[monitoring]
```

### 启动服务器
```bash
# 使用启动脚本（推荐）
./start_server.sh

# 直接启动服务器
python server.py

# 使用运行脚本（MCP stdio 模式）
./run_mcp.sh
```

### 环境配置
```bash
# 无需特殊配置，直接启动即可使用
# 所有功能都基于静态文档数据，无需外部 API
```

### 测试
```bash
# 运行所有测试
python -m pytest tests/

# 运行特定测试文件
python -m pytest tests/test_minigame_tools.py

# 运行测试并显示覆盖率
python -m pytest --cov=taptap_mcp --cov-report=html

# 测试 MCP 连接
python test_mcp.py
```

### 代码质量检查
```bash
# 代码格式化
black src/ tests/ --line-length=100

# 导入排序
isort src/ tests/ --profile=black

# 类型检查
mypy src/

# 组合命令（开发时使用）
black src/ tests/ --line-length=100 && isort src/ tests/ --profile=black && mypy src/
```

## MCP 集成配置

### Claude Desktop 集成
在 `~/.config/claude-desktop/config.json` 中添加：
```json
{
  "mcpServers": {
    "taptap-docs": {
      "command": "python",
      "args": ["/path/to/taptap-minigame-mcp-server/server.py"]
    }
  }
}
```

**注意**: 无需任何环境变量配置，开箱即用！

### 文档工具分类

#### 🔐 认证和授权工具
- **`search_auth_docs`** - 搜索认证相关文档（OAuth、API Key、令牌管理）
- **`get_auth_methods`** - 获取所有认证方式概览
- **`get_auth_category_docs`** - 获取指定认证分类的详细文档和代码示例

#### ☁️ 云存档功能工具
- **`search_cloud_save_docs`** - 搜索云存档相关文档（同步、备份、冲突处理）
- **`get_cloud_save_overview`** - 获取云存档功能概览
- **`get_cloud_save_category_docs`** - 获取指定云存档分类的详细文档和 API 示例

#### 🏆 排行榜系统工具
- **`search_leaderboard_docs`** - 搜索排行榜相关文档（分数提交、排名查询、界面显示）
- **`get_leaderboard_overview`** - 获取排行榜功能概览
- **`get_leaderboard_category_docs`** - 获取指定排行榜分类的详细文档
- **`get_leaderboard_patterns`** - 获取排行榜集成模式和最佳实践

#### 🔧 SDK 集成工具
- **`search_sdk_docs`** - 搜索 SDK 集成相关文档（Unity、Cocos、Web）
- **`get_sdk_platforms`** - 获取支持的 SDK 平台列表
- **`get_sdk_platform_docs`** - 获取指定平台的 SDK 集成指南
- **`get_sdk_best_practices`** - 获取 SDK 集成的最佳实践

## 核心技术栈

- **MCP Framework**: 基于 Model Context Protocol 的工具服务
- **HTTP 客户端**: httpx>=0.24.0 (异步 HTTP 客户端)
- **数据验证**: Pydantic v2 + pydantic-settings
- **日志系统**: structlog>=23.0.0 (结构化日志)
- **配置管理**: python-dotenv (环境变量管理)
- **测试框架**: pytest + pytest-asyncio + pytest-cov
- **代码质量**: black (格式化) + isort (导入排序) + mypy (类型检查)

## 配置说明

### 基本配置
本项目是纯文档服务，无需任何外部 API 或数据库配置即可使用。

### 可选配置
如需自定义服务器行为，可设置以下环境变量：
- `TAPTAP_LOG_LEVEL`: 日志级别 (默认: INFO)
- `TAPTAP_DEBUG`: 调试模式 (默认: false)
- `TAPTAP_SERVER_NAME`: MCP 服务器名称 (默认: taptap-minigame)

## 开发注意事项

### 代码规范
- 所有异步函数需要使用 `async/await` 语法
- 使用 Pydantic v2 进行数据验证和设置管理
- 遵循 Python 类型提示规范，所有函数都应有类型注解
- 使用 structlog 进行结构化日志记录

### MCP 工具开发
- 工具处理函数必须返回 `Sequence[TextContent]` 类型
- 新增工具需要在 `src/taptap_mcp/server.py` 中注册工具定义和处理函数
- 工具定义需要包含完整的 JSON Schema 输入验证
- 服务器使用 stdio 通信模式，适配 Claude Desktop 等 MCP 客户端

### 文档数据管理
- 所有文档内容使用静态数据，无需外部 API 调用
- 按功能模块分离文档数据（认证、云存档、排行榜、SDK）
- 支持关键词搜索和分类浏览
- 包含完整的代码示例和最佳实践指南

### 配置管理
- 使用 `pydantic-settings` 管理环境变量
- 配置项应添加到 `TapTapSettings` 类中
- 支持 `.env` 文件和环境变量两种配置方式
- 所有环境变量以 `TAPTAP_` 为前缀

### 测试指南
- 使用 pytest 进行单元测试
- 测试文件位于 `tests/` 目录
- 使用 `pytest-asyncio` 测试异步代码
- 使用 `pytest-cov` 生成覆盖率报告

## 项目特色功能

### 纯文档服务设计
项目专注于提供高质量的开发文档和代码示例，所有内容都是静态数据，无需外部 API 依赖。

### 按功能模块化组织
- **🔐 认证授权** - OAuth 2.0、API Key、令牌管理的完整指南
- **☁️ 云存档** - 跨设备存档同步、冲突处理、最佳实践
- **🏆 排行榜** - 分数提交、排名查询、界面集成的完整方案
- **🔧 SDK 集成** - Unity、Cocos Creator、Web 的详细集成指南

### 即开即用特性
- **零配置启动** - 无需任何 API 密钥或外部依赖
- **完整代码示例** - 每个功能都包含可直接使用的代码示例
- **最佳实践指南** - 包含性能优化、错误处理、用户体验的建议
- **搜索友好** - 支持关键词搜索和分类浏览，快速定位所需文档

这种设计让开发者能够快速获取准确的开发指南，无需担心网络连接或 API 配置问题。