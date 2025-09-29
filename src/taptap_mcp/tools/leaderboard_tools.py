"""TapTap 排行榜相关文档工具"""

from typing import Dict, Any, Sequence
from mcp.types import TextContent
from ..data.leaderboard_docs import LEADERBOARD_DOCUMENTATION, LEADERBOARD_SEARCH_INDEX
import structlog

logger = structlog.get_logger(__name__)


async def handle_search_leaderboard_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """搜索排行榜相关文档"""
    query = arguments.get("query", "").lower()
    category = arguments.get("category")

    logger.info("搜索排行榜文档", query=query, category=category)

    if not query and not category:
        return [TextContent(
            type="text",
            text="请提供搜索关键词或指定文档分类"
        )]

    # 如果指定了分类，直接返回该分类的文档
    if category and category in LEADERBOARD_DOCUMENTATION["categories"]:
        section = LEADERBOARD_DOCUMENTATION["categories"][category]
        content = format_leaderboard_section(category, section)
        return [TextContent(type="text", text=content)]

    # 关键词搜索
    matching_categories = set()

    # 在搜索索引中查找匹配的分类
    for keyword, categories in LEADERBOARD_SEARCH_INDEX["keywords"].items():
        if keyword in query or query in keyword:
            matching_categories.update(categories)

    if not matching_categories:
        return [TextContent(
            type="text",
            text=f"没有找到与 '{query}' 相关的排行榜文档。\\n\\n可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in LEADERBOARD_DOCUMENTATION["categories"].items()])
        )]

    # 格式化搜索结果
    result_text = f"**🏆 TapTap 排行榜文档搜索结果：'{query}'**\\n\\n"

    for category in matching_categories:
        if category in LEADERBOARD_DOCUMENTATION["categories"]:
            section = LEADERBOARD_DOCUMENTATION["categories"][category]
            result_text += format_leaderboard_section(category, section) + "\\n\\n"

    return [TextContent(type="text", text=result_text)]


async def handle_get_leaderboard_overview(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取排行榜功能概览"""
    logger.info("获取排行榜功能概览")

    content = f"**🏆 {LEADERBOARD_DOCUMENTATION['title']}**\\n\\n"
    content += f"{LEADERBOARD_DOCUMENTATION['description']}\\n\\n"

    content += "## 核心功能分类\\n\\n"

    for category_key, category_info in LEADERBOARD_DOCUMENTATION["categories"].items():
        content += f"### {category_info['title']}\\n"
        content += f"{category_info['description']}\\n\\n"

        if "apis" in category_info:
            content += "**主要 API：**\\n"
            for api in category_info["apis"]:
                content += f"- `{api.get('method', api['name'])}()`: {api['description']}\\n"

        content += f"\\n💡 使用 `get_leaderboard_category_docs(category=\"{category_key}\")` 获取详细文档\\n\\n"

    # 添加集成模式
    if "integration_patterns" in LEADERBOARD_DOCUMENTATION:
        content += "## 常用集成模式\\n\\n"
        patterns = LEADERBOARD_DOCUMENTATION["integration_patterns"]["patterns"]
        for pattern in patterns:
            content += f"- **{pattern['name']}**: {pattern['description']}\\n"
        content += "\\n💡 使用 `get_leaderboard_patterns()` 获取集成模式的完整代码示例\\n\\n"

    return [TextContent(type="text", text=content)]


async def handle_get_leaderboard_category_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取指定排行榜分类的详细文档"""
    category = arguments.get("category")

    logger.info("获取排行榜分类文档", category=category)

    if not category:
        return [TextContent(
            type="text",
            text="请指定要查看的排行榜分类，可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in LEADERBOARD_DOCUMENTATION["categories"].items()])
        )]

    if category not in LEADERBOARD_DOCUMENTATION["categories"]:
        return [TextContent(
            type="text",
            text=f"未找到分类 '{category}'。可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in LEADERBOARD_DOCUMENTATION["categories"].items()])
        )]

    section = LEADERBOARD_DOCUMENTATION["categories"][category]
    content = format_leaderboard_section(category, section, detailed=True)

    return [TextContent(type="text", text=content)]


async def handle_get_leaderboard_patterns(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取排行榜集成模式和最佳实践"""
    logger.info("获取排行榜集成模式")

    content = f"**🏆 {LEADERBOARD_DOCUMENTATION['integration_patterns']['title']}**\\n\\n"
    content += f"{LEADERBOARD_DOCUMENTATION['integration_patterns']['description']}\\n\\n"

    # 集成模式
    patterns = LEADERBOARD_DOCUMENTATION["integration_patterns"]["patterns"]
    for pattern in patterns:
        content += f"## {pattern['name']}\\n\\n"
        content += f"{pattern['description']}\\n\\n"
        content += f"```javascript{pattern['example']}\\n```\\n\\n"

    # 最佳实践
    if "best_practices" in LEADERBOARD_DOCUMENTATION:
        content += f"## {LEADERBOARD_DOCUMENTATION['best_practices']['title']}\\n\\n"
        content += f"{LEADERBOARD_DOCUMENTATION['best_practices']['description']}\\n\\n"

        for practice_group in LEADERBOARD_DOCUMENTATION["best_practices"]["practices"]:
            content += f"### {practice_group['category']}\\n"
            for item in practice_group["items"]:
                content += f"- {item}\\n"
            content += "\\n"

    return [TextContent(type="text", text=content)]


def format_leaderboard_section(category_key: str, section: dict, detailed: bool = False) -> str:
    """格式化排行榜文档区块"""
    content = f"## 🏆 {section['title']}\\n\\n"
    content += f"{section['description']}\\n\\n"

    if "apis" in section:
        content += "### API 方法\\n\\n"
        for api in section["apis"]:
            method_name = api.get("method", api["name"])
            content += f"#### {api['name']}\\n"
            content += f"**方法**: `{method_name}()`\\n\\n"
            content += f"{api['description']}\\n\\n"

            if "parameters" in api:
                content += "**参数：**\\n"
                for param, desc in api["parameters"].items():
                    content += f"- `{param}`: {desc}\\n"
                content += "\\n"

            if detailed and "example" in api:
                content += "**代码示例：**\\n"
                content += f"```javascript{api['example']}\\n```\\n\\n"

    if not detailed:
        content += f"💡 使用 `get_leaderboard_category_docs(category=\"{category_key}\")` 获取完整代码示例\\n"

    return content