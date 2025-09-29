"""TapTap 小游戏 MCP 服务器主程序"""

import asyncio
import sys
from typing import Any, Dict, List, Sequence
import structlog
from mcp.server import Server
from mcp.types import Tool, TextContent

from .config import settings
# 导入新的文档工具
from .tools.auth_tools import (
    handle_search_auth_docs,
    handle_get_auth_methods,
    handle_get_auth_category_docs
)
from .tools.cloud_save_tools import (
    handle_search_cloud_save_docs,
    handle_get_cloud_save_overview,
    handle_get_cloud_save_category_docs
)
from .tools.leaderboard_tools import (
    handle_search_leaderboard_docs,
    handle_get_leaderboard_overview,
    handle_get_leaderboard_category_docs,
    handle_get_leaderboard_patterns
)
from .tools.sdk_tools import (
    handle_search_sdk_docs,
    handle_get_sdk_platforms,
    handle_get_sdk_platform_docs,
    handle_get_sdk_best_practices
)

# 配置日志
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)

# 创建 MCP 服务器实例
app = Server(name=settings.server_name)

# 认证文档工具
AUTH_TOOLS = [
    Tool(
        name="search_auth_docs",
        description="搜索 TapTap 认证相关文档",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，如：认证、登录、授权、令牌等"
                },
                "category": {
                    "type": "string",
                    "description": "认证分类",
                    "enum": ["oauth", "api_key", "token_management"]
                }
            }
        }
    ),
    Tool(
        name="get_auth_methods",
        description="获取所有 TapTap 认证方式概览",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    ),
    Tool(
        name="get_auth_category_docs",
        description="获取指定认证分类的详细文档",
        inputSchema={
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "认证分类名称",
                    "enum": ["oauth", "api_key", "token_management"]
                }
            },
            "required": ["category"]
        }
    )
]

# 云存档文档工具
CLOUD_SAVE_TOOLS = [
    Tool(
        name="search_cloud_save_docs",
        description="搜索 TapTap 云存档相关文档",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，如：云存档、同步、备份等"
                },
                "category": {
                    "type": "string",
                    "description": "云存档功能分类",
                    "enum": ["basic_operations", "advanced_features", "best_practices"]
                }
            }
        }
    ),
    Tool(
        name="get_cloud_save_overview",
        description="获取 TapTap 云存档功能概览",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    ),
    Tool(
        name="get_cloud_save_category_docs",
        description="获取指定云存档分类的详细文档",
        inputSchema={
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "云存档分类名称",
                    "enum": ["basic_operations", "advanced_features", "best_practices"]
                }
            },
            "required": ["category"]
        }
    )
]

# 排行榜文档工具
LEADERBOARD_TOOLS = [
    Tool(
        name="search_leaderboard_docs",
        description="搜索 TapTap 排行榜相关文档",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，如：排行榜、分数、排名等"
                },
                "category": {
                    "type": "string",
                    "description": "排行榜功能分类",
                    "enum": ["score_submission", "ranking_query", "leaderboard_ui"]
                }
            }
        }
    ),
    Tool(
        name="get_leaderboard_overview",
        description="获取 TapTap 排行榜功能概览",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    ),
    Tool(
        name="get_leaderboard_category_docs",
        description="获取指定排行榜分类的详细文档",
        inputSchema={
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "排行榜分类名称",
                    "enum": ["score_submission", "ranking_query", "leaderboard_ui"]
                }
            },
            "required": ["category"]
        }
    ),
    Tool(
        name="get_leaderboard_patterns",
        description="获取排行榜集成模式和最佳实践",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    )
]

# SDK 文档工具
SDK_TOOLS = [
    Tool(
        name="search_sdk_docs",
        description="搜索 TapTap SDK 集成相关文档",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，如：SDK、集成、Unity、Cocos等"
                },
                "platform": {
                    "type": "string",
                    "description": "开发平台",
                    "enum": ["unity", "cocos", "web"]
                }
            }
        }
    ),
    Tool(
        name="get_sdk_platforms",
        description="获取支持的 SDK 平台列表",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    ),
    Tool(
        name="get_sdk_platform_docs",
        description="获取指定平台的 SDK 集成文档",
        inputSchema={
            "type": "object",
            "properties": {
                "platform": {
                    "type": "string",
                    "description": "开发平台名称",
                    "enum": ["unity", "cocos", "web"]
                }
            },
            "required": ["platform"]
        }
    ),
    Tool(
        name="get_sdk_best_practices",
        description="获取 SDK 集成的最佳实践",
        inputSchema={
            "type": "object",
            "properties": {}
        }
    )
]

# 工具处理函数映射
TOOL_HANDLERS = {
    # 认证文档工具
    "search_auth_docs": handle_search_auth_docs,
    "get_auth_methods": handle_get_auth_methods,
    "get_auth_category_docs": handle_get_auth_category_docs,

    # 云存档文档工具
    "search_cloud_save_docs": handle_search_cloud_save_docs,
    "get_cloud_save_overview": handle_get_cloud_save_overview,
    "get_cloud_save_category_docs": handle_get_cloud_save_category_docs,

    # 排行榜文档工具
    "search_leaderboard_docs": handle_search_leaderboard_docs,
    "get_leaderboard_overview": handle_get_leaderboard_overview,
    "get_leaderboard_category_docs": handle_get_leaderboard_category_docs,
    "get_leaderboard_patterns": handle_get_leaderboard_patterns,

    # SDK 文档工具
    "search_sdk_docs": handle_search_sdk_docs,
    "get_sdk_platforms": handle_get_sdk_platforms,
    "get_sdk_platform_docs": handle_get_sdk_platform_docs,
    "get_sdk_best_practices": handle_get_sdk_best_practices,
}


@app.list_tools()
async def list_tools() -> List[Tool]:
    """列出所有可用的工具"""

    # 合并所有文档工具
    all_tools = []
    all_tools.extend(AUTH_TOOLS)
    all_tools.extend(CLOUD_SAVE_TOOLS)
    all_tools.extend(LEADERBOARD_TOOLS)
    all_tools.extend(SDK_TOOLS)

    logger.info("列出可用工具", tool_count=len(all_tools))
    return all_tools


@app.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """处理工具调用"""
    logger.info("工具调用", tool_name=name, arguments=arguments)

    try:
        # 检查工具是否存在
        if name not in TOOL_HANDLERS:
            logger.error("未知工具", tool_name=name)
            return [TextContent(
                type="text",
                text=f"错误: 未知的工具 '{name}'"
            )]

        # 调用对应的处理函数
        handler = TOOL_HANDLERS[name]
        result = await handler(arguments)

        logger.info("工具调用成功", tool_name=name)
        return result

    except Exception as e:
        logger.error("工具调用失败", tool_name=name, error=str(e), exc_info=True)
        return [TextContent(
            type="text",
            text=f"工具调用失败: {str(e)}"
        )]


async def main():
    """主程序入口"""
    logger.info(
        "启动 TapTap 小游戏 MCP 服务器",
        server_name=settings.server_name,
        version=settings.server_version,
        environment=settings.environment
    )

    try:
        # 从标准输入输出运行 MCP 服务器
        from mcp.server.stdio import stdio_server

        async with stdio_server() as streams:
            await app.run(
                streams[0],  # stdin
                streams[1],  # stdout
                app.create_initialization_options()
            )

    except KeyboardInterrupt:
        logger.info("收到中断信号，关闭服务器")
    except Exception as e:
        logger.error("服务器运行失败", error=str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    # 检查配置并给出提示
    if not settings.api_key:
        logger.warning("未设置 TAPTAP_API_KEY，小游戏搜索功能将不可用，但文档查询功能仍然可用")

    # 运行服务器
    asyncio.run(main())