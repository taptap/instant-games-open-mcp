#!/bin/bash

# TapTap MCP Server - Docker 部署脚本
# 用于 TapCode 平台自动化部署

set -e

VERSION=${1:-latest}
ENV=${2:-rnd}
PORT=${3:-5003}

echo "=========================================="
echo "🚀 TapTap MCP Server Docker Deployment"
echo "=========================================="
echo "Version: ${VERSION}"
echo "Environment: ${ENV}"
echo "Port: ${PORT}"
echo ""

# 1. 检查环境变量
if [ -z "$TDS_MCP_CLIENT_ID" ] || [ -z "$TDS_MCP_CLIENT_TOKEN" ]; then
    echo "❌ Error: Missing required environment variables"
    echo ""
    echo "Please set:"
    echo "  export TDS_MCP_CLIENT_ID=your_client_id"
    echo "  export TDS_MCP_CLIENT_TOKEN=your_client_token"
    echo ""
    exit 1
fi

# 2. 构建镜像
echo "📦 Building Docker image..."
docker build -t taptap-mcp-server:${VERSION} .

# 3. 停止旧容器（如果存在）
echo "🛑 Stopping old container..."
docker stop taptap-mcp-server 2>/dev/null || true
docker rm taptap-mcp-server 2>/dev/null || true

# 4. 启动新容器
echo "🎯 Starting new container..."
docker run -d \
  --name taptap-mcp-server \
  -p ${PORT}:3000 \
  -e TDS_MCP_TRANSPORT=sse \
  -e TDS_MCP_PORT=3000 \
  -e TDS_MCP_ENV=${ENV} \
  -e TDS_MCP_CLIENT_ID=${TDS_MCP_CLIENT_ID} \
  -e TDS_MCP_CLIENT_TOKEN=${TDS_MCP_CLIENT_TOKEN} \
  -e TDS_MCP_VERBOSE=false \
  -e TDS_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache \
  -e TDS_MCP_TEMP_DIR=/tmp/taptap-mcp/temp \
  -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
  -v taptap-mcp-temp:/tmp/taptap-mcp/temp \
  --restart unless-stopped \
  --health-cmd="wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1" \
  --health-interval=10s \
  --health-timeout=3s \
  --health-retries=3 \
  taptap-mcp-server:${VERSION}

# 5. 等待服务就绪
echo ""
echo "⏳ Waiting for service to be ready..."
for i in {1..30}; do
    if curl -f http://localhost:${PORT}/health 2>/dev/null; then
        echo ""
        echo "✅ TapTap MCP Server is ready!"
        echo ""
        echo "📊 Service Info:"
        curl -s http://localhost:${PORT}/health | jq . 2>/dev/null || curl -s http://localhost:${PORT}/health
        echo ""
        echo "🔗 Server URL: http://localhost:${PORT}"
        echo "📋 View logs: docker logs -f taptap-mcp-server"
        echo "🛑 Stop server: docker stop taptap-mcp-server"
        echo ""
        exit 0
    fi
    printf "."
    sleep 2
done

echo ""
echo "❌ Service failed to start in 60 seconds"
echo ""
echo "📋 Recent logs:"
docker logs --tail=50 taptap-mcp-server
exit 1
