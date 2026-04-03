# 从线上 npm 安装并运行 MCP 服务的调试镜像
FROM node:20-alpine

# 安装必要工具
RUN apk add --no-cache curl jq

# 创建工作目录
WORKDIR /app

# 获取并安装最新版本的 npm 包
ARG NPM_PACKAGE=@taptap/minigame-open-mcp
ARG NPM_VERSION=latest

# 安装指定版本
RUN npm install ${NPM_PACKAGE}@${NPM_VERSION} && \
    echo "Installed version:" && \
    npm list ${NPM_PACKAGE}

# 设置环境变量
ENV TAPTAP_MCP_TRANSPORT=sse
ENV TAPTAP_MCP_PORT=3000
ENV TAPTAP_MCP_VERBOSE=true

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npx", "minigame-open-mcp"]
