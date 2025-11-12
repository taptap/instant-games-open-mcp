#!/bin/bash

# TapTap MCP Server - Docker 快速启动脚本

set -e

echo "🚀 Starting TapTap MCP Server in Docker..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.docker..."
    cp .env.docker .env
    echo "📝 Please edit .env with your credentials:"
    echo "   - TDS_MCP_CLIENT_ID"
    echo "   - TDS_MCP_CLIENT_TOKEN"
    exit 1
fi

# 构建镜像
echo "📦 Building Docker image..."
docker build -t taptap-mcp-server:latest .

# 启动服务
echo "🎯 Starting service..."
docker-compose up -d

# 等待服务启动
echo "⏳ Waiting for service to be ready..."
sleep 3

# 健康检查
echo "🏥 Checking health..."
if curl -f http://localhost:5003/health 2>/dev/null; then
    echo "✅ TapTap MCP Server is running!"
    echo ""
    echo "📊 Service Info:"
    curl -s http://localhost:5003/health | jq . 2>/dev/null || curl -s http://localhost:5003/health
    echo ""
    echo "🔗 Server URL: http://localhost:5003"
    echo "📋 View logs: docker-compose logs -f"
    echo "🛑 Stop server: docker-compose down"
else
    echo "❌ Service health check failed"
    echo "📋 View logs: docker-compose logs"
    exit 1
fi
