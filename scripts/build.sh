#!/bin/bash

# TapTap MCP Server - Unified Build Script
#
# Usage:
#   ./scripts/build.sh              # Build all (server + proxy + native)
#   ./scripts/build.sh --skip-native    # Skip native signer compilation
#   ./scripts/build.sh --native-only    # Only compile native signer
#   ./scripts/build.sh --help           # Show help
#
# Environment Variables (or read from .env):
#   BUILD_CLIENT_ID      - Client ID for native signer (or TAPTAP_MCP_CLIENT_ID in .env)
#   BUILD_CLIENT_SECRET  - Client Secret for native signer (or TAPTAP_MCP_CLIENT_SECRET in .env)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root (relative to script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env file if exists (for BUILD_CLIENT_ID/BUILD_CLIENT_SECRET)
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Read CLIENT_ID from .env if not already set
    if [ -z "$BUILD_CLIENT_ID" ]; then
        export BUILD_CLIENT_ID=$(grep -E "^TAPTAP_MCP_CLIENT_ID=" "$PROJECT_ROOT/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    fi
    # Read CLIENT_SECRET from .env if not already set
    if [ -z "$BUILD_CLIENT_SECRET" ]; then
        export BUILD_CLIENT_SECRET=$(grep -E "^TAPTAP_MCP_CLIENT_SECRET=" "$PROJECT_ROOT/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    fi
fi

# Default flags
BUILD_SERVER=true
BUILD_PROXY=true
BUILD_NATIVE=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-native|-sn)
            BUILD_NATIVE=false
            shift
            ;;
        --skip-server|-ss)
            BUILD_SERVER=false
            shift
            ;;
        --skip-proxy|-sp)
            BUILD_PROXY=false
            shift
            ;;
        --native-only|-no)
            BUILD_SERVER=false
            BUILD_PROXY=false
            BUILD_NATIVE=true
            shift
            ;;
        --server-only|-so)
            BUILD_SERVER=true
            BUILD_PROXY=false
            BUILD_NATIVE=false
            shift
            ;;
        --js-only|-jo)
            BUILD_SERVER=true
            BUILD_PROXY=true
            BUILD_NATIVE=false
            shift
            ;;
        --help|-h)
            echo "TapTap MCP Server - Unified Build Script"
            echo ""
            echo "Usage: ./scripts/build.sh [options]"
            echo ""
            echo "Options:"
            echo "  --skip-native, -sn    Skip native signer compilation"
            echo "  --skip-server, -ss    Skip server.js compilation"
            echo "  --skip-proxy, -sp     Skip proxy.js compilation"
            echo "  --native-only, -no    Only compile native signer"
            echo "  --server-only, -so    Only compile server.js"
            echo "  --js-only, -jo        Compile server.js + proxy.js (skip native)"
            echo "  --help, -h            Show this help message"
            echo ""
            echo "Environment Variables (or read from .env):"
            echo "  BUILD_CLIENT_ID       Client ID (or TAPTAP_MCP_CLIENT_ID in .env)"
            echo "  BUILD_CLIENT_SECRET   Client Secret (or TAPTAP_MCP_CLIENT_SECRET in .env)"
            echo ""
            echo "Examples:"
            echo "  ./scripts/build.sh                    # Build all"
            echo "  ./scripts/build.sh --skip-native      # Quick JS build"
            echo "  ./scripts/build.sh --native-only      # Rebuild native only"
            echo ""
            echo "Output:"
            echo "  dist/server.js        Main MCP server bundle"
            echo "  dist/proxy.js         MCP Proxy bundle"
            echo "  dist/native/          Native signer binaries"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Print build plan
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  TapTap MCP Server - Build${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Build Plan:"
echo -e "  Server:  $([ "$BUILD_SERVER" = true ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}Skip${NC}")"
echo -e "  Proxy:   $([ "$BUILD_PROXY" = true ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}Skip${NC}")"
echo -e "  Native:  $([ "$BUILD_NATIVE" = true ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}Skip${NC}")"
echo ""

cd "$PROJECT_ROOT"

# Track timing
START_TIME=$(date +%s)

# Build native signer first (if enabled)
if [ "$BUILD_NATIVE" = true ]; then
    echo -e "${BLUE}[1/3] Building native signer...${NC}"

    # Check if credentials are available
    if [ -z "$BUILD_CLIENT_ID" ] || [ -z "$BUILD_CLIENT_SECRET" ]; then
        # Check if .node files already exist
        if ls native/*.node 1> /dev/null 2>&1; then
            echo -e "${YELLOW}  ⚠️  No BUILD_CLIENT_ID/BUILD_CLIENT_SECRET set${NC}"
            echo -e "${YELLOW}     Using existing .node files${NC}"
        else
            echo -e "${RED}  ❌ BUILD_CLIENT_ID and BUILD_CLIENT_SECRET required for native build${NC}"
            echo -e "${RED}     Set environment variables or use --skip-native${NC}"
            exit 1
        fi
    else
        echo "  Compiling for current architecture..."
        cd native
        npm run build
        cd "$PROJECT_ROOT"
        echo -e "${GREEN}  ✅ Native signer compiled${NC}"
    fi
else
    echo -e "${YELLOW}[1/3] Skipping native signer${NC}"
fi

# Build server.js
if [ "$BUILD_SERVER" = true ]; then
    echo -e "${BLUE}[2/3] Building server.js...${NC}"
    node scripts/bundle-server.js
    echo -e "${GREEN}  ✅ dist/server.js created${NC}"
else
    echo -e "${YELLOW}[2/3] Skipping server.js${NC}"
fi

# Build proxy.js
if [ "$BUILD_PROXY" = true ]; then
    echo -e "${BLUE}[3/3] Building proxy.js...${NC}"
    node scripts/bundle-proxy.js
    echo -e "${GREEN}  ✅ dist/proxy.js created${NC}"
else
    echo -e "${YELLOW}[3/3] Skipping proxy.js${NC}"
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Build completed in ${DURATION}s${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show output files
echo "Output files:"
[ "$BUILD_SERVER" = true ] && [ -f "dist/server.js" ] && echo "  📦 dist/server.js ($(du -h dist/server.js | cut -f1))"
[ "$BUILD_PROXY" = true ] && [ -f "dist/proxy.js" ] && echo "  📦 dist/proxy.js ($(du -h dist/proxy.js | cut -f1))"
if [ "$BUILD_NATIVE" = true ] || [ "$BUILD_SERVER" = true ]; then
    if [ -d "dist/native" ]; then
        NODE_COUNT=$(ls dist/native/*.node 2>/dev/null | wc -l | tr -d ' ')
        echo "  📦 dist/native/ ($NODE_COUNT .node binaries)"
    fi
fi
echo ""
