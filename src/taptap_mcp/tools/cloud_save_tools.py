"""TapTap 云存档相关文档工具"""

from typing import Dict, Any, Sequence
from mcp.types import TextContent
from ..data.cloud_save_docs import CLOUD_SAVE_DOCUMENTATION, CLOUD_SAVE_SEARCH_INDEX
import structlog

logger = structlog.get_logger(__name__)


async def handle_search_cloud_save_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """搜索云存档相关文档"""
    query = arguments.get("query", "").lower()
    category = arguments.get("category")

    logger.info("搜索云存档文档", query=query, category=category)

    if not query and not category:
        return [TextContent(
            type="text",
            text="请提供搜索关键词或指定文档分类"
        )]

    # 如果指定了分类，直接返回该分类的文档
    if category and category in CLOUD_SAVE_DOCUMENTATION["categories"]:
        section = CLOUD_SAVE_DOCUMENTATION["categories"][category]
        content = format_cloud_save_section(category, section)
        return [TextContent(type="text", text=content)]

    # 关键词搜索
    matching_categories = set()

    # 在搜索索引中查找匹配的分类
    for keyword, categories in CLOUD_SAVE_SEARCH_INDEX["keywords"].items():
        if keyword in query or query in keyword:
            matching_categories.update(categories)

    if not matching_categories:
        return [TextContent(
            type="text",
            text=f"没有找到与 '{query}' 相关的云存档文档。\\n\\n可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in CLOUD_SAVE_DOCUMENTATION["categories"].items()])
        )]

    # 格式化搜索结果
    result_text = f"**☁️ TapTap 云存档文档搜索结果：'{query}'**\\n\\n"

    for category in matching_categories:
        if category in CLOUD_SAVE_DOCUMENTATION["categories"]:
            section = CLOUD_SAVE_DOCUMENTATION["categories"][category]
            result_text += format_cloud_save_section(category, section) + "\\n\\n"

    return [TextContent(type="text", text=result_text)]


async def handle_get_cloud_save_overview(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取云存档功能概览"""
    logger.info("获取云存档功能概览")

    content = f"**☁️ {CLOUD_SAVE_DOCUMENTATION['title']}**\\n\\n"
    content += f"{CLOUD_SAVE_DOCUMENTATION['description']}\\n\\n"

    content += "## 核心功能分类\\n\\n"

    for category_key, category_info in CLOUD_SAVE_DOCUMENTATION["categories"].items():
        content += f"### {category_info['title']}\\n"
        content += f"{category_info['description']}\\n\\n"

        # 显示主要功能点
        if "apis" in category_info:
            content += "**主要 API：**\\n"
            for api in category_info["apis"]:
                content += f"- `{api['name']}`: {api['description']}\\n"
        elif "features" in category_info:
            content += "**主要功能：**\\n"
            for feature in category_info["features"]:
                content += f"- `{feature['name']}`: {feature['description']}\\n"
        elif "practices" in category_info:
            content += "**实践分类：**\\n"
            for practice in category_info["practices"]:
                content += f"- `{practice['category']}`: {len(practice['items'])} 个建议\\n"

        content += f"\\n💡 使用 `get_cloud_save_category_docs(category=\"{category_key}\")` 获取详细文档\\n\\n"

    return [TextContent(type="text", text=content)]


async def handle_get_cloud_save_category_docs(arguments: Dict[str, Any]) -> Sequence[TextContent]:
    """获取指定云存档分类的详细文档"""
    category = arguments.get("category")

    logger.info("获取云存档分类文档", category=category)

    if not category:
        return [TextContent(
            type="text",
            text="请指定要查看的云存档分类，可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in CLOUD_SAVE_DOCUMENTATION["categories"].items()])
        )]

    if category not in CLOUD_SAVE_DOCUMENTATION["categories"]:
        return [TextContent(
            type="text",
            text=f"未找到分类 '{category}'。可用分类：\\n" +
                 "\\n".join([f"- {cat}: {info['title']}"
                           for cat, info in CLOUD_SAVE_DOCUMENTATION["categories"].items()])
        )]

    section = CLOUD_SAVE_DOCUMENTATION["categories"][category]
    content = format_cloud_save_section(category, section, detailed=True)

    return [TextContent(type="text", text=content)]


def format_cloud_save_section(category_key: str, section: dict, detailed: bool = False) -> str:
    """格式化云存档文档区块"""
    content = f"## ☁️ {section['title']}\\n\\n"
    content += f"{section['description']}\\n\\n"

    # 处理 API 列表
    if "apis" in section:
        content += "### API 接口\\n\\n"
        for api in section["apis"]:
            content += f"#### {api['name']}\\n"

            if "endpoint" in api:
                content += f"**接口**: `{api['endpoint']}`\\n\\n"

            content += f"{api['description']}\\n\\n"

            if "parameters" in api:
                content += "**参数：**\\n"
                for param, desc in api["parameters"].items():
                    content += f"- `{param}`: {desc}\\n"
                content += "\\n"

            if detailed and "example" in api:
                content += "**代码示例：**\\n"
                content += f"```javascript{api['example']}\\n```\\n\\n"

    # 处理高级功能
    if "features" in section:
        content += "### 高级功能\\n\\n"
        for feature in section["features"]:
            content += f"#### {feature['name']}\\n"
            content += f"{feature['description']}\\n\\n"

            if detailed and "example" in feature:
                content += "**实现示例：**\\n"
                content += f"```javascript{feature['example']}\\n```\\n\\n"

    # 处理最佳实践
    if "practices" in section:
        content += "### 最佳实践指南\\n\\n"
        for practice_group in section["practices"]:
            content += f"#### {practice_group['category']}\\n"
            for item in practice_group["items"]:
                content += f"- {item}\\n"
            content += "\\n"

    if not detailed:
        content += f"💡 使用 `get_cloud_save_category_docs(category=\"{category_key}\")` 获取完整代码示例\\n"

    return content