#!/usr/bin/env python3
"""测试重构后的文档服务器"""

import asyncio
import json
import sys
import os

# 添加 src 目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

async def test_server_import():
    """测试服务器导入"""
    try:
        from taptap_mcp.server import app, TOOL_HANDLERS
        print("✅ 服务器模块导入成功")

        # 检查工具数量
        print(f"📋 已注册工具数量: {len(TOOL_HANDLERS)}")

        # 列出所有工具
        print("🛠️  可用工具:")
        for tool_name in TOOL_HANDLERS.keys():
            print(f"   - {tool_name}")

        return True
    except Exception as e:
        print(f"❌ 服务器导入失败: {e}")
        return False

async def test_auth_docs():
    """测试认证文档工具"""
    try:
        from taptap_mcp.tools.auth_tools import handle_search_auth_docs

        result = await handle_search_auth_docs({"query": "认证"})
        print("✅ 认证文档工具测试成功")
        print(f"📄 返回内容长度: {len(result[0].text)} 字符")
        return True
    except Exception as e:
        print(f"❌ 认证文档工具测试失败: {e}")
        return False

async def test_cloud_save_docs():
    """测试云存档文档工具"""
    try:
        from taptap_mcp.tools.cloud_save_tools import handle_get_cloud_save_overview

        result = await handle_get_cloud_save_overview({})
        print("✅ 云存档文档工具测试成功")
        print(f"📄 返回内容长度: {len(result[0].text)} 字符")
        return True
    except Exception as e:
        print(f"❌ 云存档文档工具测试失败: {e}")
        return False

async def test_leaderboard_docs():
    """测试排行榜文档工具"""
    try:
        from taptap_mcp.tools.leaderboard_tools import handle_get_leaderboard_overview

        result = await handle_get_leaderboard_overview({})
        print("✅ 排行榜文档工具测试成功")
        print(f"📄 返回内容长度: {len(result[0].text)} 字符")
        return True
    except Exception as e:
        print(f"❌ 排行榜文档工具测试失败: {e}")
        return False

async def test_sdk_docs():
    """测试 SDK 文档工具"""
    try:
        from taptap_mcp.tools.sdk_tools import handle_get_sdk_platforms

        result = await handle_get_sdk_platforms({})
        print("✅ SDK 文档工具测试成功")
        print(f"📄 返回内容长度: {len(result[0].text)} 字符")
        return True
    except Exception as e:
        print(f"❌ SDK 文档工具测试失败: {e}")
        return False

async def main():
    """主测试函数"""
    print("🧪 开始测试 TapTap 文档 MCP 服务器")
    print("=" * 50)

    tests = [
        ("服务器导入", test_server_import),
        ("认证文档", test_auth_docs),
        ("云存档文档", test_cloud_save_docs),
        ("排行榜文档", test_leaderboard_docs),
        ("SDK 文档", test_sdk_docs)
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        print(f"\n🔍 测试: {test_name}")
        if await test_func():
            passed += 1

    print("\n" + "=" * 50)
    print(f"📊 测试结果: {passed}/{total} 通过")

    if passed == total:
        print("🎉 所有测试通过！服务器重构成功！")
        return True
    else:
        print("❌ 部分测试失败，需要检查代码")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)