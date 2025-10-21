#!/bin/bash

echo "🔍 验证本地 MCP Server 部署"
echo ""

# 1. 检查编译输出
echo "Step 1: 检查编译后的文件..."
if [ -f "dist/server.js" ]; then
  echo "✅ dist/server.js exists"
  echo "   文件大小: $(ls -lh dist/server.js | awk '{print $5}')"
  echo "   修改时间: $(ls -l dist/server.js | awk '{print $6, $7, $8}')"
else
  echo "❌ dist/server.js not found! Run 'npm run build' first"
  exit 1
fi

# 2. 检查版本号
echo ""
echo "Step 2: 检查版本号..."
VERSION=$(grep "version:" dist/server.js | head -1)
echo "   $VERSION"

# 3. 测试启动
echo ""
echo "Step 3: 测试启动（3秒）..."
TDS_MCP_CLIENT_ID=test TDS_MCP_CLIENT_TOKEN=test node dist/server.js &
PID=$!
sleep 3
kill $PID 2>/dev/null

echo ""
echo "✅ 验证完成！"
echo ""
echo "📝 下一步："
echo "   1. 在 Claude Code 中重启 MCP: Cmd+Shift+P → 'MCP: Restart Servers'"
echo "   2. 查看日志: Cmd+Shift+P → 'MCP: Show Server Logs' → 'taptap-minigame'"
echo "   3. 调用工具测试"
