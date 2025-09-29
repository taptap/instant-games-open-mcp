"""TapTap 认证相关文档工具"""

from typing import Dict, Any, Sequence
from mcp.types import TextContent
from ..data.auth_docs import AUTH_DOCUMENTATION, AUTH_SEARCH_INDEX
import structlog

logger = structlog.get_logger(__name__)


async def handle_search_auth_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """搜索认证相关文档"""
    query = arguments.get("query", "").lower()
    category = arguments.get("category")

    logger.info("搜索认证文档", query=query, category=category)

    if not query and not category:
        return [TextContent(
            type="text",
            text="请提供搜索关键词或指定文档分类"
        )]

    # 如果指定了分类，直接返回该分类的文档
    if category and category in AUTH_DOCUMENTATION["categories"]:
        section = AUTH_DOCUMENTATION["categories"][category]
        content = format_auth_section(category, section)
        return [TextContent(type="text", text=content)]

    # 关键词搜索
    matching_categories = set()

    # 在搜索索引中查找匹配的分类
    for keyword, categories in AUTH_SEARCH_INDEX["keywords"].items():
        if keyword in query or query in keyword:
            matching_categories.update(categories)

    if not matching_categories:
        return [TextContent(
            type="text",
            text=f"没有找到与 '{query}' 相关的认证文档。\\n\\n可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in AUTH_DOCUMENTATION["categories"].items()])
        )]

    # 格式化搜索结果
    result_text = f"**🔐 TapTap 认证文档搜索结果：'{query}'**\\n\\n"

    for category in matching_categories:
        if category in AUTH_DOCUMENTATION["categories"]:
            section = AUTH_DOCUMENTATION["categories"][category]
            result_text += format_auth_section(category, section) + "\\n\\n"

    return [TextContent(type="text", text=result_text)]


async def handle_get_auth_methods(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取所有认证方式"""
    logger.info("获取认证方式列表")

    content = f"**🔐 {AUTH_DOCUMENTATION['title']}**\\n\\n"
    content += f"{AUTH_DOCUMENTATION['description']}\\n\\n"

    content += "## 可用认证方式\\n\\n"

    for category_key, category_info in AUTH_DOCUMENTATION["categories"].items():
        content += f"### {category_info['title']}\\n"
        content += f"{category_info['description']}\\n\\n"

        if "methods" in category_info:
            for method in category_info["methods"]:
                content += f"**{method['name']}**: {method['description']}\\n"

        content += f"💡 使用 `get_auth_category_docs(category=\"{category_key}\")` 获取详细文档\\n\\n"

    return [TextContent(type="text", text=content)]


async def handle_get_auth_category_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取指定认证分类的详细文档"""
    category = arguments.get("category")

    logger.info("获取认证分类文档", category=category)

    if not category:
        return [TextContent(
            type="text",
            text="请指定要查看的认证分类，可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in AUTH_DOCUMENTATION["categories"].items()])
        )]

    if category not in AUTH_DOCUMENTATION["categories"]:
        return [TextContent(
            type="text",
            text=f"未找到分类 '{category}'。可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in AUTH_DOCUMENTATION["categories"].items()])
        )]

    section = AUTH_DOCUMENTATION["categories"][category]
    content = format_auth_section(category, section, detailed=True)

    return [TextContent(type="text", text=content)]


def format_auth_section(category_key: str, section: dict, detailed: bool = False) -> str:
    """格式化认证文档区块"""
    content = f"## 🔐 {section['title']}\\n\\n"
    content += f"{section['description']}\\n\\n"

    if "methods" in section:
        content += "### 认证方法\\n\\n"
        for method in section["methods"]:
            content += f"**{method['name']}**\\n"
            content += f"{method['description']}\\n\\n"

            if detailed and "example" in method:
                content += "**代码示例：**\\n"
                content += f"```javascript{method['example']}\\n```\\n\\n"

    if "best_practices" in section:
        content += "### 最佳实践\\n\\n"
        for practice in section["best_practices"]:
            content += f"- {practice}\\n"
        content += "\\n"

        if detailed and "example" in section:
            content += "**实现示例：**\\n"
            content += f"```javascript{section['example']}\\n```\\n\\n"

    if not detailed:
        content += f"💡 使用 `get_auth_category_docs(category=\"{category_key}\")` 获取完整代码示例\\n"

    return content