# TapTap MCP Server - Docker 部署指南

本文档说明如何使用 Docker 部署 TapTap MCP Server（SSE 模式）。

## 快速开始

### 方式 1：使用 docker-compose（推荐）

```bash
# 1. 配置环境变量
cp .env.docker .env
# 编辑 .env，填入你的 CLIENT_ID 和 CLIENT_TOKEN

# 2. 启动服务
./scripts/docker-start.sh

# 或手动启动
docker-compose up -d
```

### 方式 2：使用 Docker 命令

```bash
# 构建镜像
docker build -t taptap-mcp-server:1.4.1 .

# 启动容器
docker run -d \
  --name taptap-mcp-server \
  -p 5003:3000 \
  -e TDS_MCP_TRANSPORT=sse \
  -e TDS_MCP_PORT=3000 \
  -e TDS_MCP_ENV=rnd \
  -e TDS_MCP_CLIENT_ID=your_client_id \
  -e TDS_MCP_CLIENT_TOKEN=your_client_token \
  -e TDS_MCP_VERBOSE=false \
  -v taptap-mcp-cache:/var/lib/taptap-mcp/cache \
  -v taptap-mcp-temp:/tmp/taptap-mcp/temp \
  taptap-mcp-server:1.4.1
```

### 方式 3：直接使用 NPM 镜像（无需构建）

```bash
docker run -d \
  --name taptap-mcp-server \
  -p 5003:3000 \
  -e TDS_MCP_TRANSPORT=sse \
  -e TDS_MCP_PORT=3000 \
  -e TDS_MCP_CLIENT_ID=your_client_id \
  -e TDS_MCP_CLIENT_TOKEN=your_client_token \
  node:20-alpine \
  sh -c "npm install -g @mikoto_zero/minigame-open-mcp@latest && minigame-open-mcp"
```

---

## TapCode 平台集成

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│ TapCode 平台服务器                                       │
│                                                         │
│  docker-compose.yml                                     │
│    ├── taptap-mcp-server (独立容器)                    │
│    └── redis, postgres, etc.                            │
└─────────────────────────────────────────────────────────┘
           │
           │ Docker Network (host.docker.internal)
           ↓
┌─────────────────────────────────────────────────────────┐
│ TapTap MCP Server 容器                                   │
│  - Image: taptap-mcp-server:1.4.1                       │
│  - Port: 5003                                           │
│  - Mode: SSE Streaming                                  │
│  - Health: /health endpoint                             │
└─────────────────────────────────────────────────────────┘
           ↑
           │ HTTP/SSE (port 5003)
           │
┌─────────────────────────────────────────────────────────┐
│ 用户容器 1-N（动态创建）                                │
│                                                         │
│  MCP Proxy (子进程)                                     │
│    → 连接: http://host.docker.internal:5003            │
│    → 注入: MAC Token (per user)                         │
└─────────────────────────────────────────────────────────┘
```

### docker-compose 集成

```yaml
# TapCode 平台的 docker-compose.yml
version: '3.8'

services:
  # TapCode 主服务
  tapcode-app:
    image: tapcode:latest
    depends_on:
      taptap-mcp-server:
        condition: service_healthy
    environment:
      - TAPTAP_MCP_SERVER_URL=http://taptap-mcp-server:3000

  # TapTap MCP Server
  taptap-mcp-server:
    image: taptap-mcp-server:1.4.1
    environment:
      - TDS_MCP_TRANSPORT=sse
      - TDS_MCP_PORT=3000
      - TDS_MCP_ENV=rnd
      - TDS_MCP_CLIENT_ID=${TDS_MCP_CLIENT_ID}
      - TDS_MCP_CLIENT_TOKEN=${TDS_MCP_CLIENT_TOKEN}
      - TDS_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache
      - TDS_MCP_TEMP_DIR=/tmp/taptap-mcp/temp
    volumes:
      - taptap-mcp-cache:/var/lib/taptap-mcp/cache
      - taptap-mcp-temp:/tmp/taptap-mcp/temp
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3

  # 其他服务...
  redis:
    image: redis:7-alpine

volumes:
  taptap-mcp-cache:
  taptap-mcp-temp:
```

---

## 环境变量配置

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `TDS_MCP_CLIENT_ID` | 客户端 ID | `your_client_id` |
| `TDS_MCP_CLIENT_TOKEN` | 签名密钥 | `your_client_token` |

### 可选配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TDS_MCP_ENV` | `rnd` | 环境选择 |
| `TDS_MCP_TRANSPORT` | `sse` | 传输模式（固定 SSE） |
| `TDS_MCP_PORT` | `3000` | 容器内端口 |
| `TDS_MCP_VERBOSE` | `false` | 详细日志 |
| `TDS_MCP_CACHE_DIR` | `/var/lib/taptap-mcp/cache` | 缓存目录 |
| `TDS_MCP_TEMP_DIR` | `/tmp/taptap-mcp/temp` | 临时目录 |

---

## 使用方式

### 启动服务

```bash
# 使用快速启动脚本
./scripts/docker-start.sh

# 或使用 docker-compose
docker-compose up -d
```

### 查看日志

```bash
# 实时日志
docker-compose logs -f taptap-mcp-server

# 最近 100 行
docker-compose logs --tail=100 taptap-mcp-server
```

### 健康检查

```bash
# 检查服务状态
docker-compose ps

# 手动健康检查
curl http://localhost:5003/health

# 示例响应：
# {
#   "status": "healthy",
#   "version": "1.4.1",
#   "transport": "sse",
#   "sessions": 0,
#   "tools": 17,
#   "resources": 7
# }
```

### 停止服务

```bash
# 停止服务
docker-compose down

# 停止并删除数据
docker-compose down -v
```

---

## TapCode 平台代码集成

### 方式 1：通过 Docker Network（推荐）

```typescript
// TapCode 平台配置
const TAPTAP_MCP_SERVER_URL = process.env.TAPTAP_MCP_SERVER_URL || 'http://taptap-mcp-server:3000';

// 用户容器中的 Proxy 配置
const config = {
  server: {
    url: TAPTAP_MCP_SERVER_URL,  // 通过 Docker network 访问
    env: 'rnd',
  },
  tenant: {
    user_id: session.userId,
    project_id: session.projectId,
    workspace_path: '/workspace',
  },
  auth: macToken,
};

// 启动 Proxy
const proxy = spawn('node', ['/srv/mcp-proxy/index.js', JSON.stringify(config)]);
```

### 方式 2：通过 host.docker.internal

```typescript
// 用户容器访问主机上的 MCP Server
const config = {
  server: {
    url: 'http://host.docker.internal:5003',  // 主机端口
    env: 'rnd',
  },
  // ... 其他配置
};
```

### 启动检查

```typescript
// 在启动用户 Agent 前检查 MCP Server 状态
async function ensureMCPServerReady(): Promise<void> {
  const serverUrl = process.env.TAPTAP_MCP_SERVER_URL || 'http://taptap-mcp-server:3000';

  try {
    const response = await fetch(`${serverUrl}/health`);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const health = await response.json();
    console.log(`✅ MCP Server ready: ${health.version}, sessions: ${health.sessions}`);
  } catch (error) {
    console.error('❌ MCP Server not ready:', error);
    throw new Error('TapTap MCP Server is not available. Please check deployment.');
  }
}

// 使用
await ensureMCPServerReady();
const session = await createAgentSession(...);
```

---

## 监控和维护

### 日志收集

```bash
# 导出日志
docker-compose logs taptap-mcp-server > mcp-server.log

# 实时监控
docker-compose logs -f --tail=50 taptap-mcp-server
```

### 性能监控

```bash
# 容器资源使用
docker stats taptap-mcp-server

# 示例输出：
# CONTAINER           CPU %   MEM USAGE / LIMIT     MEM %
# taptap-mcp-server   0.5%    45MiB / 512MiB        8.8%
```

### 数据清理

```bash
# 清理缓存（保留数据卷）
docker exec taptap-mcp-server rm -rf /var/lib/taptap-mcp/cache/*

# 清理临时文件
docker exec taptap-mcp-server rm -rf /tmp/taptap-mcp/temp/*

# 完全重置（删除数据卷）
docker-compose down -v
```

---

## 故障排查

### 问题 1：容器启动失败

```bash
# 查看日志
docker-compose logs taptap-mcp-server

# 常见原因：
# - 环境变量缺失（TDS_MCP_CLIENT_ID、TDS_MCP_CLIENT_TOKEN）
# - 端口冲突
```

### 问题 2：健康检查失败

```bash
# 手动检查
curl http://localhost:5003/health

# 进入容器检查
docker exec -it taptap-mcp-server sh
wget -O- http://localhost:3000/health
```

### 问题 3：Proxy 无法连接

```bash
# 检查网络连通性
docker exec <user-container> ping taptap-mcp-server

# 检查端口
docker exec <user-container> nc -zv taptap-mcp-server 3000

# 检查 Proxy 配置
echo $TAPTAP_MCP_SERVER_URL
```

---

## 高级配置

### 1. 生产环境优化

```yaml
# docker-compose.yml
services:
  taptap-mcp-server:
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

    # 重启策略
    restart: unless-stopped

    # 日志限制
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 2. 多环境支持

```bash
# 开发环境
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**docker-compose.dev.yml**：
```yaml
version: '3.8'
services:
  taptap-mcp-server:
    environment:
      - TDS_MCP_ENV=rnd
      - TDS_MCP_VERBOSE=true
```

**docker-compose.prod.yml**：
```yaml
version: '3.8'
services:
  taptap-mcp-server:
    environment:
      - TDS_MCP_ENV=production
      - TDS_MCP_VERBOSE=false
    deploy:
      replicas: 2  # 多实例
```

### 3. 反向代理（可选）

```nginx
# nginx.conf
upstream taptap_mcp {
    server taptap-mcp-server:3000;
}

server {
    listen 443 ssl;
    server_name mcp.tapcode.com;

    location / {
        proxy_pass http://taptap_mcp;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;  # SSE 需要禁用缓冲
        proxy_cache off;
    }
}
```

---

## 在 TapCode 平台中使用

### Kubernetes 部署（大规模）

```yaml
# k8s/taptap-mcp-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taptap-mcp-server
spec:
  replicas: 3  # 多副本
  selector:
    matchLabels:
      app: taptap-mcp-server
  template:
    metadata:
      labels:
        app: taptap-mcp-server
    spec:
      containers:
      - name: mcp-server
        image: taptap-mcp-server:1.4.1
        ports:
        - containerPort: 3000
        env:
        - name: TDS_MCP_TRANSPORT
          value: "sse"
        - name: TDS_MCP_PORT
          value: "3000"
        - name: TDS_MCP_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: taptap-mcp-secret
              key: client-id
        - name: TDS_MCP_CLIENT_TOKEN
          valueFrom:
            secretKeyRef:
              name: taptap-mcp-secret
              key: client-token
        volumeMounts:
        - name: cache
          mountPath: /var/lib/taptap-mcp/cache
        - name: temp
          mountPath: /tmp/taptap-mcp/temp
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 3
          periodSeconds: 5
      volumes:
      - name: cache
        persistentVolumeClaim:
          claimName: taptap-mcp-cache
      - name: temp
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: taptap-mcp-server
spec:
  selector:
    app: taptap-mcp-server
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

### 服务发现

```typescript
// TapCode 平台代码
class MCPServerManager {
  private serverUrl: string;

  constructor() {
    // 根据环境自动发现 MCP Server
    if (process.env.KUBERNETES_SERVICE_HOST) {
      // K8s 环境
      this.serverUrl = 'http://taptap-mcp-server.default.svc.cluster.local:3000';
    } else if (process.env.DOCKER_COMPOSE) {
      // Docker Compose 环境
      this.serverUrl = 'http://taptap-mcp-server:3000';
    } else {
      // 本地开发
      this.serverUrl = 'http://localhost:5003';
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  getServerUrl(): string {
    return this.serverUrl;
  }
}

// 使用
const mcpManager = new MCPServerManager();
await mcpManager.isReady();

const proxyConfig = {
  server: {
    url: mcpManager.getServerUrl(),
    env: 'rnd',
  },
  // ...
};
```

---

## 自动化部署脚本

### deploy.sh（TapCode 平台使用）

```bash
#!/bin/bash

# TapCode 平台 - 自动部署 TapTap MCP Server

set -e

VERSION=${1:-latest}
ENV=${2:-rnd}

echo "🚀 Deploying TapTap MCP Server v${VERSION}"

# 1. 拉取最新镜像或构建
if [ "$VERSION" = "latest" ]; then
    echo "📦 Building latest image..."
    docker build -t taptap-mcp-server:latest .
else
    echo "📦 Using version: ${VERSION}"
    docker build -t taptap-mcp-server:${VERSION} .
fi

# 2. 停止旧容器
echo "🛑 Stopping old container..."
docker-compose down || true

# 3. 启动新容器
echo "🎯 Starting new container..."
TDS_MCP_ENV=$ENV docker-compose up -d

# 4. 等待服务就绪
echo "⏳ Waiting for service to be ready..."
for i in {1..30}; do
    if curl -f http://localhost:5003/health 2>/dev/null; then
        echo "✅ Service is ready!"

        # 显示健康信息
        curl -s http://localhost:5003/health | jq .

        exit 0
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

echo "❌ Service failed to start in 60 seconds"
docker-compose logs taptap-mcp-server
exit 1
```

**使用**：
```bash
# 部署最新版本（rnd 环境）
./deploy.sh latest rnd

# 部署指定版本（production 环境）
./deploy.sh 1.4.1 production
```

---

## 性能优化

### 1. 启用缓存持久化

```yaml
volumes:
  taptap-mcp-cache:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/taptap-mcp/cache  # 持久化到主机
```

### 2. 资源限制

```yaml
services:
  taptap-mcp-server:
    deploy:
      resources:
        limits:
          cpus: '2.0'      # 最多使用 2 核
          memory: 1G       # 最多使用 1GB 内存
        reservations:
          cpus: '0.5'      # 保证 0.5 核
          memory: 256M     # 保证 256MB
```

### 3. 多副本部署

```yaml
services:
  taptap-mcp-server:
    deploy:
      replicas: 3  # 3 个副本

# 需要配合负载均衡
```

---

## 安全配置

### 1. 使用 Secrets

```yaml
services:
  taptap-mcp-server:
    environment:
      - TDS_MCP_CLIENT_ID_FILE=/run/secrets/client_id
      - TDS_MCP_CLIENT_TOKEN_FILE=/run/secrets/client_token
    secrets:
      - client_id
      - client_token

secrets:
  client_id:
    file: ./secrets/client_id.txt
  client_token:
    file: ./secrets/client_token.txt
```

### 2. 网络隔离

```yaml
networks:
  mcp-network:
    driver: bridge
    internal: false  # 允许外网访问（MCP Server 需要）

services:
  taptap-mcp-server:
    networks:
      - mcp-network
```

---

## 常见问题

### Q: 如何更新到新版本？

```bash
# 1. 拉取新镜像
docker pull node:20-alpine

# 2. 重新构建
docker build -t taptap-mcp-server:1.4.1 .

# 3. 滚动更新
docker-compose up -d
```

### Q: 如何备份数据？

```bash
# 备份缓存数据
docker run --rm \
  -v taptap-mcp-cache:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/cache-$(date +%Y%m%d).tar.gz /data
```

### Q: 如何查看活跃会话数？

```bash
curl http://localhost:5003/health | jq .sessions
```

---

## 相关文档

- [Dockerfile](../Dockerfile) - Docker 镜像定义
- [docker-compose.yml](../docker-compose.yml) - 编排配置
- [TAPCODE_INTEGRATION.md](TAPCODE_INTEGRATION.md) - TapCode 集成指南
- [../README.md](../README.md) - 主文档

---

**需要帮助？** 提交 Issue：https://github.com/taptap/minigame-open-mcp/issues
