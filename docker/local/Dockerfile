FROM node:20-alpine

# 单文件 Bundle 部署 + Native Signer
# 所有产物都在 dist/ 目录中，方便发布和部署

WORKDIR /app

# 复制 dist 目录（包含 server.js 和 native/）
COPY dist/ /app/

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${TAPTAP_MCP_PORT:-3000}/health || exit 1

# 暴露端口（默认 3000）
EXPOSE 3000

# 环境变量（可在 docker run 时覆盖）
ENV TAPTAP_MCP_TRANSPORT=sse
ENV TAPTAP_MCP_PORT=3000
ENV TAPTAP_MCP_ENV=production
ENV TAPTAP_MCP_VERBOSE=false
ENV TAPTAP_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache
ENV TAPTAP_MCP_TEMP_DIR=/tmp/taptap-mcp/temp

# 创建缓存和临时目录
RUN mkdir -p /var/lib/taptap-mcp/cache /tmp/taptap-mcp/temp

# 启动命令（直接运行单文件）
CMD ["node", "/app/server.js"]
