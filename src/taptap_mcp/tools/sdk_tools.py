"""TapTap SDK 集成相关文档工具"""

from typing import Dict, Any, Sequence
from mcp.types import TextContent
from ..data.sdk_docs import SDK_DOCUMENTATION, SDK_SEARCH_INDEX
import structlog

logger = structlog.get_logger(__name__)


async def handle_search_sdk_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """搜索 SDK 集成相关文档"""
    query = arguments.get("query", "").lower()
    platform = arguments.get("platform")

    logger.info("搜索SDK文档", query=query, platform=platform)

    if not query and not platform:
        return [TextContent(
            type="text",
            text="请提供搜索关键词或指定平台名称"
        )]

    # 如果指定了平台，直接返回该平台的文档
    if platform and platform in SDK_DOCUMENTATION["categories"]:
        section = SDK_DOCUMENTATION["categories"][platform]
        content = format_sdk_section(platform, section)
        return [TextContent(type="text", text=content)]

    # 关键词搜索
    matching_platforms = set()

    # 在搜索索引中查找匹配的平台
    for keyword, platforms in SDK_SEARCH_INDEX["keywords"].items():
        if keyword.lower() in query or query in keyword.lower():
            matching_platforms.update(platforms)

    if not matching_platforms:
        return [TextContent(
            type="text",
            text=f"没有找到与 '{query}' 相关的 SDK 文档。\\n\\n支持的平台：\\n" +
                 "\\n".join([f"- {platform}: {info['title']}"
                           for platform, info in SDK_DOCUMENTATION["categories"].items()
                           if platform != "best_practices"])
        )]

    # 格式化搜索结果
    result_text = f"**🔧 TapTap SDK 集成文档搜索结果：'{query}'**\\n\\n"

    for platform in matching_platforms:
        if platform in SDK_DOCUMENTATION["categories"]:
            section = SDK_DOCUMENTATION["categories"][platform]
            result_text += format_sdk_section(platform, section) + "\\n\\n"

    return [TextContent(type="text", text=result_text)]


async def handle_get_sdk_platforms(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取支持的 SDK 平台列表"""
    logger.info("获取SDK平台列表")

    content = f"**🔧 {SDK_DOCUMENTATION['title']}**\\n\\n"
    content += f"{SDK_DOCUMENTATION['description']}\\n\\n"

    content += "## 支持的平台\\n\\n"

    for platform_key, platform_info in SDK_DOCUMENTATION["categories"].items():
        if platform_key == "best_practices":
            continue

        content += f"### {platform_info['title']}\\n"
        content += f"{platform_info['description']}\\n\\n"

        if "setup" in platform_info:
            content += "**集成步骤：**\\n"
            for i, step in enumerate(platform_info["setup"]["steps"], 1):
                content += f"{i}. {step}\\n"

        content += f"\\n💡 使用 `get_sdk_platform_docs(platform=\"{platform_key}\")` 获取详细集成指南\\n\\n"

    # 最佳实践
    content += "## 开发最佳实践\\n\\n"
    content += "💡 使用 `get_sdk_best_practices()` 获取 SDK 集成的最佳实践和建议\\n\\n"

    return [TextContent(type="text", text=content)]


async def handle_get_sdk_platform_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取指定平台的详细 SDK 集成文档"""
    platform = arguments.get("platform")

    logger.info("获取SDK平台文档", platform=platform)

    if not platform:
        return [TextContent(
            type="text",
            text="请指定要查看的平台，支持的平台：\\n" +
                 "\\n".join([f"- {p}: {info['title']}"
                           for p, info in SDK_DOCUMENTATION["categories"].items()
                           if p != "best_practices"])
        )]

    if platform not in SDK_DOCUMENTATION["categories"] or platform == "best_practices":
        return [TextContent(
            type="text",
            text=f"未找到平台 '{platform}'。支持的平台：\\n" +
                 "\\n".join([f"- {p}: {info['title']}"
                           for p, info in SDK_DOCUMENTATION["categories"].items()
                           if p != "best_practices"])
        )]

    section = SDK_DOCUMENTATION["categories"][platform]
    content = format_sdk_section(platform, section, detailed=True)

    return [TextContent(type="text", text=content)]


async def handle_get_sdk_best_practices(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取 SDK 集成的最佳实践"""
    logger.info("获取SDK最佳实践")

    if "best_practices" not in SDK_DOCUMENTATION:
        return [TextContent(
            type="text",
            text="最佳实践文档暂时不可用"
        )]

    best_practices = SDK_DOCUMENTATION["best_practices"]

    content = f"**🔧 {best_practices['title']}**\\n\\n"
    content += f"{best_practices['description']}\\n\\n"

    for practice_group in best_practices["practices"]:
        content += f"## {practice_group['category']}\\n\\n"
        for item in practice_group["items"]:
            content += f"- {item}\\n"
        content += "\\n"

    return [TextContent(type="text", text=content)]


def format_sdk_section(platform_key: str, section: dict, detailed: bool = False) -> str:
    """格式化 SDK 文档区块"""
    content = f"## 🔧 {section['title']}\\n\\n"
    content += f"{section['description']}\\n\\n"

    # 安装和配置
    if "setup" in section:
        content += "### 安装和配置\\n\\n"

        setup_info = section["setup"]
        if "steps" in setup_info:
            content += "**集成步骤：**\\n"
            for i, step in enumerate(setup_info["steps"], 1):
                content += f"{i}. {step}\\n"
            content += "\\n"

        if detailed and "example" in setup_info:
            content += "**初始化代码：**\\n"
            content += f"```javascript{setup_info['example']}\\n```\\n\\n"

    # 功能特性
    if "features" in section and detailed:
        content += "### 功能特性\\n\\n"

        for feature_key, feature_info in section["features"].items():
            content += f"#### {feature_info['title']}\\n"
            content += f"{feature_info['description']}\\n\\n"

            if "example" in feature_info:
                content += "**代码示例：**\\n"
                content += f"```javascript{feature_info['example']}\\n```\\n\\n"

    if not detailed:
        content += f"💡 使用 `get_sdk_platform_docs(platform=\"{platform_key}\")` 获取完整集成指南和代码示例\\n"

    return content