FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装 MCP Server
RUN npm install -g @mikoto_zero/minigame-open-mcp@latest

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${TDS_MCP_PORT:-3000}/health || exit 1

# 暴露端口（默认 3000）
EXPOSE 3000

# 环境变量（可在 docker run 时覆盖）
ENV TDS_MCP_TRANSPORT=sse
ENV TDS_MCP_PORT=3000
ENV TDS_MCP_ENV=rnd
ENV TDS_MCP_VERBOSE=false
ENV TDS_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache
ENV TDS_MCP_TEMP_DIR=/tmp/taptap-mcp/temp

# 创建缓存和临时目录
RUN mkdir -p /var/lib/taptap-mcp/cache /tmp/taptap-mcp/temp

# 启动命令
CMD ["sh", "-c", "minigame-open-mcp"]
