#!/bin/bash

echo "🧪 测试 OAuth 懒加载流程"
echo "================================"
echo ""

cd "$(dirname "$0")"

# 确保已编译
if [ ! -f "dist/server.js" ]; then
  echo "❌ dist/server.js not found, compiling..."
  npm run build
fi

# 删除已保存的 token（模拟首次使用）
rm -f ~/.config/taptap-minigame/token.json

echo "Step 1: 启动 Server（应该秒级启动，不阻塞）"
echo "---"

(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 1
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 1
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_environment","arguments":{}}}'
  sleep 1
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_developers_and_apps","arguments":{}}}'
  sleep 5
) | TDS_MCP_CLIENT_ID=cadxxoz247zw0ug5i2 \
    TDS_MCP_CLIENT_TOKEN=hwB0nGqevz6aS3EhmausovQyZd3ARhQZJHFN1Gl1 \
    TDS_MCP_ENV=production \
    TAPTAP_MINIGAME_MCP_VERBOSE=true \
    node dist/server.js 2>&1 | tee /tmp/mcp-test.log

echo ""
echo "================================"
echo "✅ 测试完成！"
echo ""
echo "📝 关键检查点："
echo "   1. Server 是否秒级启动？"
echo "   2. check_environment 是否立即返回？"
echo "   3. list_developers_and_apps 是否立即返回授权链接？"
echo "   4. 授权链接是否清晰显示？"
echo ""
echo "📄 完整日志已保存到: /tmp/mcp-test.log"
echo "   查看: cat /tmp/mcp-test.log"
