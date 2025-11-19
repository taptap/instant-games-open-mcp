# Docker 单文件 Bundle 部署指南

## 概述

使用单文件 `server-bundle.js` 进行 Docker 部署，相比传统 npm 安装方式有以下优势：

| 特性 | 传统部署 (Dockerfile) | 单文件 Bundle (Dockerfile.bundle) |
|------|----------------------|-----------------------------------|
| 镜像大小 | ~150 MB | **~90 MB** |
| 构建时间 | ~2 分钟 (npm install) | **~10 秒** |
| node_modules | 需要 (~60 MB) | **不需要 (0 MB)** |
| 启动速度 | 正常 | **更快** |
| 依赖风险 | 可能有依赖冲突 | **零依赖风险** |

---

## 🚀 快速开始

### 1. 构建 Docker 镜像

```bash
# 确保已构建 server-bundle.js
npm run build:all

# 构建 Docker 镜像
docker build -f Dockerfile.bundle -t taptap-mcp-server:bundle .
```

### 2. 运行容器（单容器）

```bash
docker run -d \
  --name taptap-mcp-server \
  -p 3000:3000 \
  -e TAPTAP_MCP_TRANSPORT=sse \
  -e TAPTAP_MCP_CLIENT_ID=your_client_id \
  -e TAPTAP_MCP_CLIENT_SECRET=your_client_secret \
  -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
  taptap-mcp-server:bundle
```

### 3. 使用 Docker Compose（推荐）

```bash
# 创建 .env 文件
cat > .env << 'EOF'
TAPTAP_MCP_CLIENT_ID=your_client_id
TAPTAP_MCP_CLIENT_SECRET=your_client_secret
EOF

# 启动服务
docker-compose -f docker-compose.bundle.yml up -d

# 查看日志
docker-compose -f docker-compose.bundle.yml logs -f

# 停止服务
docker-compose -f docker-compose.bundle.yml down
```

---

## 📋 环境变量配置

### 必填环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `TAPTAP_MCP_CLIENT_ID` | TapTap API Client ID | `cadxxoz247zw0ug5i1` |
| `TAPTAP_MCP_CLIENT_SECRET` | TapTap API Client Secret | `your_secret_key` |

### 可选环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TAPTAP_MCP_TRANSPORT` | `sse` | 传输协议（stdio/sse/http） |
| `TAPTAP_MCP_PORT` | `3000` | HTTP/SSE 端口 |
| `TAPTAP_MCP_ENV` | `production` | API 环境（production/rnd） |
| `TAPTAP_MCP_VERBOSE` | `false` | 详细日志模式 |
| `TAPTAP_MCP_CACHE_DIR` | `/var/lib/taptap-mcp/cache` | 缓存目录 |
| `TAPTAP_MCP_TEMP_DIR` | `/tmp/taptap-mcp/temp` | 临时文件目录 |
| `TAPTAP_MCP_MAC_TOKEN` | - | 预设 MAC Token（可选） |

---

## 🔧 高级配置

### 1. 多环境部署

**生产环境**：
```bash
docker run -d \
  --name taptap-mcp-prod \
  -p 3000:3000 \
  -e TAPTAP_MCP_ENV=production \
  -e TAPTAP_MCP_CLIENT_ID=prod_client_id \
  -e TAPTAP_MCP_CLIENT_SECRET=prod_secret \
  -v taptap-mcp-prod-cache:/var/lib/taptap-mcp/cache \
  taptap-mcp-server:bundle
```

**测试环境（RND）**：
```bash
docker run -d \
  --name taptap-mcp-rnd \
  -p 3001:3000 \
  -e TAPTAP_MCP_ENV=rnd \
  -e TAPTAP_MCP_CLIENT_ID=rnd_client_id \
  -e TAPTAP_MCP_CLIENT_SECRET=rnd_secret \
  -e TAPTAP_MCP_VERBOSE=true \
  -v taptap-mcp-rnd-cache:/var/lib/taptap-mcp/cache \
  taptap-mcp-server:bundle
```

### 2. 使用预设 MAC Token

如果已有 MAC Token，可以直接设置环境变量，跳过 OAuth 流程：

```bash
docker run -d \
  --name taptap-mcp-server \
  -p 3000:3000 \
  -e TAPTAP_MCP_CLIENT_ID=your_client_id \
  -e TAPTAP_MCP_CLIENT_SECRET=your_client_secret \
  -e TAPTAP_MCP_MAC_TOKEN='{"kid":"xxx","mac_key":"yyy","access_token":"zzz"}' \
  taptap-mcp-server:bundle
```

### 3. 挂载工作区（H5 游戏上传）

如果需要上传本地 H5 游戏，挂载工作区目录：

```bash
docker run -d \
  --name taptap-mcp-server \
  -p 3000:3000 \
  -e TAPTAP_MCP_CLIENT_ID=your_client_id \
  -e TAPTAP_MCP_CLIENT_SECRET=your_client_secret \
  -v /path/to/workspace:/workspace:ro \
  -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
  taptap-mcp-server:bundle
```

---

## 📊 镜像对比

### Dockerfile (传统 npm 安装)

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g @mikoto_zero/minigame-open-mcp@latest  # 下载 ~60MB node_modules
CMD ["minigame-open-mcp"]
```

**镜像大小**: ~150 MB  
**构建时间**: ~2 分钟

### Dockerfile.bundle (单文件 Bundle)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY dist/server-bundle.js /app/server.js  # 仅 2 MB
CMD ["node", "/app/server.js"]
```

**镜像大小**: **~90 MB** (节省 60 MB)  
**构建时间**: **~10 秒** (快 12 倍)

---

## 🛠️ 常见问题

### Q1: 如何查看容器日志？

```bash
docker logs -f taptap-mcp-server
```

### Q2: 如何进入容器调试？

```bash
docker exec -it taptap-mcp-server sh
```

### Q3: 如何重启容器？

```bash
docker restart taptap-mcp-server
```

### Q4: 如何更新到新版本？

```bash
# 重新构建镜像
npm run build:all
docker build -f Dockerfile.bundle -t taptap-mcp-server:bundle .

# 重启容器
docker-compose -f docker-compose.bundle.yml up -d --force-recreate
```

### Q5: 健康检查失败怎么办？

检查端口和环境变量配置：

```bash
# 检查容器状态
docker ps -a | grep taptap-mcp

# 检查健康状态
docker inspect taptap-mcp-server | grep -A 10 Health

# 手动测试健康检查
docker exec taptap-mcp-server wget -O- http://localhost:3000/health
```

---

## 🚀 性能优化建议

### 1. 使用多阶段构建（生产环境）

```dockerfile
# 阶段 1: 构建
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tsconfig.json ./
RUN npm install && npm run build:all

# 阶段 2: 运行
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /build/dist/server-bundle.js /app/server.js
CMD ["node", "/app/server.js"]
```

### 2. 减小基础镜像

使用 `node:20-alpine` 而不是 `node:20`，节省 ~900 MB。

### 3. 启用缓存持久化

挂载 volume 保存 OAuth token 和应用选择缓存，避免重复认证：

```bash
-v taptap-mcp-cache:/var/lib/taptap-mcp/cache
```

---

## 📚 相关文档

- [主文档](../README.md)
- [部署指南](./DEPLOYMENT.md)
- [Docker 传统部署](./DEPLOYMENT.md#docker-部署)
- [架构文档](./ARCHITECTURE.md)

