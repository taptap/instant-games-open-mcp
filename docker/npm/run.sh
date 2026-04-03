#!/bin/bash
# 从 npm 安装并运行 MCP 服务
# 用于测试线上发布版本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认值
NPM_PACKAGE="@taptap/minigame-open-mcp"
NPM_VERSION="latest"
IMAGE_NAME="taptap-open-mcp"
ENV="production"
PORT="5003"
CONTAINER_NAME=""
USE_SIGNER=true

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --version|-v)
            NPM_VERSION="$2"
            shift 2
            ;;
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
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "从 npm 安装并运行 MCP 服务"
            echo ""
            echo "Options:"
            echo "  -v, --version VER   npm 版本 (默认: latest)"
            echo "  -e, --env ENV       环境 (production/rnd, 默认: production)"
            echo "  -p, --port PORT     端口 (默认: 5003)"
            echo "  -n, --name NAME     容器名 (默认: taptap-mcp-npm-{env})"
            echo "  --rnd               RND 环境快捷方式"
            echo "  --no-cache          强制重新构建镜像"
            echo "  -h, --help          显示帮助"
            echo ""
            echo "Examples:"
            echo "  $0                          # latest 版本，Production"
            echo "  $0 -v 1.9.2                 # 指定版本"
            echo "  $0 --rnd -p 5002            # RND 环境"
            echo "  $0 --no-cache               # 强制更新到最新版本"
            echo ""
            echo "更新镜像（npm 发布新版本后）:"
            echo "  $0 --no-cache"
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
CONTAINER_NAME="${CONTAINER_NAME:-taptap-mcp-npm-${ENV}}"
IMAGE_TAG="npm-$NPM_VERSION"

echo "========================================"
echo "TapTap MCP Server - NPM Version"
echo "========================================"
echo "Package:     $NPM_PACKAGE"
echo "Version:     $NPM_VERSION"
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

# 获取线上最新版本
if [ "$NPM_VERSION" = "latest" ]; then
    echo ""
    echo "Fetching latest version from npm..."
    ACTUAL_VERSION=$(npm view "$NPM_PACKAGE" version 2>/dev/null || echo "unknown")
    echo "Latest: $ACTUAL_VERSION"
fi

# 构建镜像
echo ""
echo "Building Docker image..."
docker build $NO_CACHE \
    --build-arg NPM_PACKAGE="$NPM_PACKAGE" \
    --build-arg NPM_VERSION="$NPM_VERSION" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    .

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
        --restart unless-stopped \
        "$IMAGE_NAME:$IMAGE_TAG"
else
    # RND: 使用环境变量
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "$PORT:3000" \
        -e TAPTAP_MCP_VERBOSE=true \
        -e TAPTAP_MCP_ENV="$ENV" \
        -e TAPTAP_MCP_CLIENT_ID="$TAPTAP_MCP_CLIENT_ID" \
        -e TAPTAP_MCP_CLIENT_SECRET="$TAPTAP_MCP_CLIENT_SECRET" \
        --restart unless-stopped \
        "$IMAGE_NAME:$IMAGE_TAG"
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
