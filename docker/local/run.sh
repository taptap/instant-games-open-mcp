#!/bin/bash
# 本地代码 Docker 部署脚本
# 需要先在项目根目录运行 npm run build 生成 dist/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 默认值
IMAGE_NAME="taptap-open-mcp"
VERSION="local"
ENV="production"
PORT="5003"
CONTAINER_NAME=""
USE_SIGNER=true

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --env|-e)
            ENV="$2"
            shift 2
            ;;
        --port|-p)
            PORT="$2"
            shift 2
            ;;
        --name|-n)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --rnd)
            ENV="rnd"
            USE_SIGNER=false
            shift
            ;;
        --build|-b)
            BUILD_FIRST=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "从本地代码构建并运行 Docker 容器"
            echo ""
            echo "Options:"
            echo "  -e, --env ENV       环境 (production/rnd, 默认: production)"
            echo "  -p, --port PORT     端口 (默认: 5003)"
            echo "  -n, --name NAME     容器名 (默认: taptap-mcp-{env})"
            echo "  --rnd               RND 环境快捷方式 (需设置 CLIENT_ID/SECRET)"
            echo "  -b, --build         先运行 npm run build"
            echo "  -h, --help          显示帮助"
            echo ""
            echo "Examples:"
            echo "  $0                          # Production 环境，端口 5003"
            echo "  $0 --rnd -p 5002            # RND 环境，端口 5002"
            echo "  $0 -b                       # 先构建再运行"
            echo ""
            echo "RND 环境需要设置环境变量:"
            echo "  export TAPTAP_MCP_CLIENT_ID=xxx"
            echo "  export TAPTAP_MCP_CLIENT_SECRET=xxx"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 默认容器名
CONTAINER_NAME="${CONTAINER_NAME:-taptap-mcp-${ENV}}"

echo "========================================"
echo "TapTap MCP Server - Local Build"
echo "========================================"
echo "Environment: $ENV"
echo "Port:        $PORT"
echo "Container:   $CONTAINER_NAME"
echo "========================================"

# 检查 RND 环境变量
if [ "$USE_SIGNER" = false ]; then
    if [ -z "$TAPTAP_MCP_CLIENT_ID" ] || [ -z "$TAPTAP_MCP_CLIENT_SECRET" ]; then
        echo ""
        echo "❌ RND 环境需要设置 CLIENT_ID 和 CLIENT_SECRET"
        echo ""
        echo "请运行:"
        echo "  export TAPTAP_MCP_CLIENT_ID=your_client_id"
        echo "  export TAPTAP_MCP_CLIENT_SECRET=your_client_secret"
        exit 1
    fi
fi

# 先构建项目
if [ "$BUILD_FIRST" = true ]; then
    echo ""
    echo "Building project..."
    cd "$PROJECT_ROOT"
    npm run build
fi

# 检查 dist 目录
if [ ! -d "$PROJECT_ROOT/dist" ]; then
    echo ""
    echo "❌ dist/ 目录不存在，请先运行: npm run build"
    exit 1
fi

# 构建 Docker 镜像
echo ""
echo "Building Docker image..."
docker build -t "$IMAGE_NAME:$VERSION" -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT"

# 停止旧容器
echo ""
echo "Stopping old container..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# 启动容器
echo ""
echo "Starting container..."

if [ "$USE_SIGNER" = true ]; then
    # Production: 使用 Native Signer
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$PORT:3000" \
        -e TAPTAP_MCP_VERBOSE=true \
        -e TAPTAP_MCP_ENV="$ENV" \
        -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
        --restart unless-stopped \
        "$IMAGE_NAME:$VERSION"
else
    # RND: 使用环境变量
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$PORT:3000" \
        -e TAPTAP_MCP_VERBOSE=true \
        -e TAPTAP_MCP_ENV="$ENV" \
        -e TAPTAP_MCP_CLIENT_ID="$TAPTAP_MCP_CLIENT_ID" \
        -e TAPTAP_MCP_CLIENT_SECRET="$TAPTAP_MCP_CLIENT_SECRET" \
        -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
        --restart unless-stopped \
        "$IMAGE_NAME:$VERSION"
fi

# 等待服务就绪
echo ""
echo "Waiting for service..."
for i in {1..15}; do
    if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
        echo ""
        echo "✅ Service is ready!"
        curl -s "http://localhost:$PORT/health" | jq . 2>/dev/null || curl -s "http://localhost:$PORT/health"
        echo ""
        echo "URL:  http://localhost:$PORT"
        echo "Logs: docker logs -f $CONTAINER_NAME"
        echo "Stop: docker stop $CONTAINER_NAME"
        exit 0
    fi
    printf "."
    sleep 1
done

echo ""
echo "❌ Service failed to start"
docker logs --tail=20 "$CONTAINER_NAME"
exit 1
