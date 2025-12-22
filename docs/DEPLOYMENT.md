# TapTap MCP Server 部署指南

本文档说明如何部署 TapTap MCP Server，涵盖本地开发、Docker 部署和开发者测试场景。

## 目录

1. [本地开发部署](#1-本地开发部署)
2. [Docker 部署](#2-docker-部署)
3. [生产环境配置](#3-生产环境配置)
4. [开发者测试指南](#4-开发者测试指南)

---

## 1. 本地开发部署

### 1.1 stdio 模式（Claude Desktop / VS Code / Cursor）

**适用场景**：本地开发、单客户端集成

#### 安装

```bash
# 方式 1：全局安装
npm install -g @mikoto_zero/minigame-open-mcp

# 方式 2：使用 npx（推荐，无需安装）
npx @mikoto_zero/minigame-open-mcp
```

#### 配置

**Claude Code / VS Code / Cursor**：在项目根目录创建 `.mcp.json`

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

**Claude Desktop**：编辑 `~/.config/claude-desktop/config.json`（macOS）或 `%APPDATA%\Claude\config.json`（Windows）

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MCP_WORKSPACE_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

#### 重要说明

- **零配置 OAuth**：首次使用会提示扫码授权，token 自动保存到 `~/.config/taptap-minigame/token.json`
- **路径处理**：
  - 推荐设置 `TAPTAP_MCP_WORKSPACE_ROOT` 环境变量以正确解析相对路径
  - 如果不设置，相对路径会基于用户 HOME 目录（可能不符合预期）
  - 建议使用绝对路径，或配置 `TAPTAP_MCP_WORKSPACE_ROOT`
  - 详见：[PATH_RESOLUTION.md](PATH_RESOLUTION.md)

---

### 1.2 SSE 模式（OpenHands / 远程部署）

**适用场景**：远程部署、多客户端并发、实时进度推送

#### 启动服务器

```bash
# 基础启动（端口 3000）
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3000 \
npx @mikoto_zero/minigame-open-mcp

# 启用详细日志
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3000 TAPTAP_MCP_VERBOSE=true \
npx @mikoto_zero/minigame-open-mcp

# 使用 npm scripts（推荐）
npm run serve:sse          # 基础模式
npm run serve:sse:dev      # 开发模式（详细日志）

# 自定义端口
TAPTAP_MCP_PORT=8080 npm run serve:sse
```

#### 客户端配置

**OpenHands**：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "url": "http://your-server:3000",
      "transport": "sse"
    }
  }
}
```

**Claude Code / VS Code / Cursor**：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "url": "http://localhost:3000",
      "transport": "sse"
    }
  }
}
```

#### SSE 模式特性

- ✅ 实时进度推送（压缩、上传、授权等）
- ✅ 多客户端并发支持
- ✅ 客户端连接日志
- ✅ 健康检查：`GET http://localhost:3000/health`

---

### 1.3 HTTP JSON 模式（兼容客户端）

**适用场景**：不支持 SSE 的客户端、测试场景

```bash
# 启动 HTTP 模式
TAPTAP_MCP_TRANSPORT=http TAPTAP_MCP_PORT=3000 \
npx @mikoto_zero/minigame-open-mcp

# 使用 npm scripts
npm run serve:http
```

**特性**：

- ✅ 返回 JSON 响应（Content-Type: application/json）
- ❌ 无实时进度（但功能完整）
- ✅ 两步式授权（避免长时间阻塞）
- ✅ 多客户端并发支持

---

### 1.4 环境变量说明

#### 认证相关（可选）

| 变量                       | 说明                        | 是否必需 | 默认值     |
| -------------------------- | --------------------------- | -------- | ---------- |
| `TAPTAP_MCP_MAC_TOKEN`     | 用户 MAC Token（JSON 格式） | 否       | 使用 OAuth |
| `TAPTAP_MCP_CLIENT_ID`     | 客户端 ID                   | 否\*     | 无         |
| `TAPTAP_MCP_CLIENT_SECRET` | 请求签名密钥                | 否\*     | 无         |

**注意**：`TAPTAP_MCP_CLIENT_ID` 和 `TAPTAP_MCP_CLIENT_SECRET` 不是必需的，但不配置会导致部分工具无法使用。

**OAuth Token 格式**：

```bash
export TAPTAP_MCP_MAC_TOKEN='{"kid":"your_kid","token_type":"mac","mac_key":"your_mac_key","mac_algorithm":"hmac-sha-1"}'
```

#### 环境和传输（可选）

| 变量                   | 说明          | 默认值       |
| ---------------------- | ------------- | ------------ |
| `TAPTAP_MCP_ENV`       | 环境选择      | `production` |
| `TAPTAP_MCP_TRANSPORT` | 传输协议      | `stdio`      |
| `TAPTAP_MCP_PORT`      | HTTP/SSE 端口 | `3000`       |
| `TAPTAP_MCP_VERBOSE`   | 详细日志模式  | `false`      |

**环境选项**：

- `production`：https://agent.tapapis.cn
- `rnd`：https://agent.api.xdrnd.cn（测试环境）

#### 缓存和临时文件（可选）

| 变量                        | 说明           | 默认值                  |
| --------------------------- | -------------- | ----------------------- |
| `TAPTAP_MCP_CACHE_DIR`      | 缓存根目录     | `/tmp/taptap-mcp/cache` |
| `TAPTAP_MCP_TEMP_DIR`       | 临时文件根目录 | `/tmp/taptap-mcp/temp`  |
| `TAPTAP_MCP_WORKSPACE_ROOT` | 工作空间根路径 | `process.cwd()`         |

**缓存目录结构**：

```
/tmp/taptap-mcp/
├── cache/
│   ├── global/app.json          # 全局缓存
│   └── {userId}/{projectId}/    # 租户缓存
└── temp/
    └── {userId}/{projectId}/    # 临时文件
```

---

## 2. Docker 部署

Docker 部署文件已整理到 `docker/` 目录下，提供两种部署方式：

| 方式         | 目录            | 用途                              |
| ------------ | --------------- | --------------------------------- |
| **npm 部署** | `docker/npm/`   | 从 npm 安装，测试线上版本（推荐） |
| **本地构建** | `docker/local/` | 从本地代码构建，开发调试          |

### 2.1 快速开始

#### 方式 1：使用 docker-compose（推荐）

```bash
cd docker/npm

# RND 环境变量从项目根目录 .env 读取
# 确保 .env 中配置了 TAPTAP_MCP_CLIENT_ID 和 TAPTAP_MCP_CLIENT_SECRET

# 同时启动 Production (端口 5003) 和 RND (端口 5002) 两个环境
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

#### 方式 2：使用单独运行脚本

```bash
cd docker/npm

# Production 环境（使用 Native Signer，无需配置）
./run.sh -p 5003

# RND 环境（需要配置环境变量）
export TAPTAP_MCP_CLIENT_ID=your_client_id
export TAPTAP_MCP_CLIENT_SECRET=your_client_secret
./run.sh --rnd -p 5002

# 更新到最新 npm 版本
./run.sh --no-cache
```

#### 方式 3：从本地代码构建

```bash
cd docker/local

# 先构建项目
npm run build

# 运行
./run.sh -p 5003

# 或一步完成
./run.sh -b
```

#### 方式 4：直接使用 NPM（npx）

```bash
# 无需 Docker，直接使用 npx（推荐用于本地测试）
npx -y @mikoto_zero/minigame-open-mcp
```

---

### 2.2 端口配置

| 服务       | 端口 | 环境       | API Base           |
| ---------- | ---- | ---------- | ------------------ |
| Production | 5003 | production | agent.tapapis.cn   |
| RND        | 5002 | rnd        | agent.api.xdrnd.cn |

### 2.3 环境变量

| 变量                       | 说明          | Production    | RND    |
| -------------------------- | ------------- | ------------- | ------ |
| `TAPTAP_MCP_ENV`           | 环境          | production    | rnd    |
| `TAPTAP_MCP_CLIENT_ID`     | Client ID     | 内置 (Signer) | 需配置 |
| `TAPTAP_MCP_CLIENT_SECRET` | Client Secret | 内置 (Signer) | 需配置 |
| `TAPTAP_MCP_VERBOSE`       | 详细日志      | true          | true   |

### 2.4 使用方式

#### 查看日志

```bash
# docker-compose 方式
cd docker/npm
docker-compose logs -f

# 单独容器方式
docker logs -f taptap-mcp-npm-production  # Production
docker logs -f taptap-mcp-npm-rnd         # RND
```

#### 健康检查

```bash
# Production
curl http://localhost:5003/health

# RND
curl http://localhost:5002/health

# 示例响应：
# {
#   "status": "healthy",
#   "version": "1.10.0",
#   "transport": "sse",
#   "sessions": 0,
#   "tools": 19,
#   "resources": 11
# }
```

#### 停止服务

```bash
# docker-compose 方式
cd docker/npm
docker-compose down

# 单独容器方式
docker stop taptap-mcp-npm-production taptap-mcp-npm-rnd
```

#### 更新镜像

当 npm 发布新版本后：

```bash
cd docker/npm

# 方式 1: docker-compose
docker-compose build --no-cache
docker-compose up -d

# 方式 2: 脚本
./run.sh --no-cache -p 5003
```

详细 Docker 文档请参考: [docker/README.md](../docker/README.md)

---

## 3. 生产环境配置

### 3.1 资源限制

```yaml
services:
  taptap-mcp-server:
    deploy:
      resources:
        limits:
          cpus: '2.0' # 最多使用 2 核
          memory: 1G # 最多使用 1GB 内存
        reservations:
          cpus: '0.5' # 保证 0.5 核
          memory: 256M # 保证 256MB
```

### 3.2 日志管理

```yaml
services:
  taptap-mcp-server:
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
```

### 3.3 多环境支持

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
      - TAPTAP_MCP_ENV=rnd
      - TAPTAP_MCP_VERBOSE=true
```

**docker-compose.prod.yml**：

```yaml
version: '3.8'
services:
  taptap-mcp-server:
    environment:
      - TAPTAP_MCP_ENV=production
      - TAPTAP_MCP_VERBOSE=false
    deploy:
      replicas: 2 # 多实例
```

### 3.4 使用 Secrets

```yaml
services:
  taptap-mcp-server:
    environment:
      - TAPTAP_MCP_CLIENT_ID_FILE=/run/secrets/client_id
      - TAPTAP_MCP_CLIENT_SECRET_FILE=/run/secrets/client_token
    secrets:
      - client_id
      - client_token

secrets:
  client_id:
    file: ./secrets/client_id.txt
  client_token:
    file: ./secrets/client_token.txt
```

---

## 4. 开发者测试指南

> 面向 MCP Server 贡献者：如何在本地测试你开发的新功能

### 4.1 快速验证（stdio 模式）

**适用场景**：快速验证代码编译和工具定义

```bash
# 1. 编译
npm run build

# 2. 启动 stdio 模式（使用测试 Token）
TAPTAP_MCP_MAC_TOKEN='{"kid":"test","token_type":"mac","mac_key":"test","mac_algorithm":"hmac-sha-1"}' \
TAPTAP_MCP_CLIENT_ID=test \
TAPTAP_MCP_CLIENT_SECRET=test \
node dist/server.js

# 3. 检查输出
# 应该看到工具列表，包括你新增的工具
```

---

### 4.2 使用 MCP Inspector 测试

**MCP Inspector**：官方提供的 MCP 协议调试工具

```bash
# 1. 安装 MCP Inspector
npm install -g @modelcontextprotocol/inspector

# 2. 启动 MCP Server（stdio 模式）
npx @modelcontextprotocol/inspector node dist/server.js

# 3. 浏览器打开 http://localhost:5173
# 4. 测试工具调用、查看请求/响应
```

**特性**：

- ✅ 可视化工具列表
- ✅ 交互式测试工具调用
- ✅ 查看完整的请求/响应
- ✅ 支持 OAuth 认证流程

---

### 4.3 使用客户端测试（Claude Desktop / VS Code）

**创建测试配置**：

```json
// .mcp.json（项目根目录）
{
  "mcpServers": {
    "taptap-minigame-dev": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "TAPTAP_MCP_MAC_TOKEN": "{\"kid\":\"test\",\"token_type\":\"mac\",\"mac_key\":\"test\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TAPTAP_MCP_CLIENT_ID": "test",
        "TAPTAP_MCP_CLIENT_SECRET": "test",
        "TAPTAP_MCP_VERBOSE": "true",
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

**测试步骤**：

1. 重启客户端（重新加载 MCP Server）
2. 调用你新增的工具
3. 检查日志（启用 `TAPTAP_MCP_VERBOSE=true`）

**提示**：使用绝对路径指向 `dist/server.js`，避免路径解析问题。

---

### 4.4 测试 SSE 模式（模拟远程部署）

**适用场景**：测试实时进度推送、多客户端并发

```bash
# 1. 启动 SSE 模式
TAPTAP_MCP_TRANSPORT=sse \
TAPTAP_MCP_PORT=3000 \
TAPTAP_MCP_VERBOSE=true \
node dist/server.js

# 2. 健康检查
curl http://localhost:3000/health

# 3. 使用客户端连接
# 配置 .mcp.json:
{
  "mcpServers": {
    "taptap-minigame-sse": {
      "url": "http://localhost:3000",
      "transport": "sse"
    }
  }
}
```

---

### 4.5 测试 Docker 部署

**适用场景**：确保代码在容器环境正常运行

```bash
# 1. 构建镜像
docker build -t taptap-mcp-server:dev .

# 2. 启动容器
docker run -d \
  --name taptap-mcp-test \
  -p 3000:3000 \
  -e TAPTAP_MCP_TRANSPORT=sse \
  -e TAPTAP_MCP_PORT=3000 \
  -e TAPTAP_MCP_VERBOSE=true \
  -e TAPTAP_MCP_CLIENT_ID=test \
  -e TAPTAP_MCP_CLIENT_SECRET=test \
  -v $(pwd)/test-workspace:/workspace:ro \
  taptap-mcp-server:dev

# 3. 查看日志
docker logs -f taptap-mcp-test

# 4. 测试健康检查
curl http://localhost:3000/health

# 5. 清理
docker stop taptap-mcp-test && docker rm taptap-mcp-test
```

---

### 4.6 测试 Proxy 模式（高级）

**适用场景**：测试私有参数协议、多租户功能

详见：[PROXY.md#测试指南](PROXY.md#测试指南)

---

### 4.7 常见问题排查

#### 工具未出现在列表中

```bash
# 检查编译是否成功
npm run build

# 检查模块是否注册（src/server.ts）
grep "yourModule" src/server.ts

# 启用详细日志
TAPTAP_MCP_VERBOSE=true node dist/server.js
```

#### OAuth 授权失败

```bash
# 使用测试 Token（跳过 OAuth）
export TAPTAP_MCP_MAC_TOKEN='{"kid":"test","token_type":"mac","mac_key":"test","mac_algorithm":"hmac-sha-1"}'
```

#### 路径解析错误

```bash
# 设置 TAPTAP_MCP_WORKSPACE_ROOT
export TAPTAP_MCP_WORKSPACE_ROOT=$(pwd)

# 或使用绝对路径
```

#### 端口被占用

```bash
# 检查端口占用
lsof -i :3000

# 使用其他端口
TAPTAP_MCP_PORT=8080 npm run serve:sse
```

---

### 4.8 测试检查清单

提交 PR 前，确保：

- [ ] stdio 模式启动成功，工具列表正确
- [ ] MCP Inspector 可以调用新工具
- [ ] 客户端（Claude Desktop / VS Code）可以正常使用
- [ ] SSE 模式启动成功（如果相关）
- [ ] Docker 镜像构建成功（如果相关）
- [ ] 所有 lint 和 build 检查通过：`npm run lint && npm run build`
- [ ] 更新了相关文档（README.md、CHANGELOG.md）

---

## 故障排查

### 问题 1：容器启动失败

```bash
# 查看日志
docker-compose logs taptap-mcp-server

# 常见原因：
# - 环境变量缺失（TAPTAP_MCP_CLIENT_ID、TAPTAP_MCP_CLIENT_SECRET）
# - 端口冲突（5003 被占用）
# - 镜像构建失败
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

### 问题 4：路径解析错误

详见：[PATH_RESOLUTION.md](PATH_RESOLUTION.md)

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

## 相关文档

- [PROXY.md](PROXY.md) - MCP Proxy 开发指南
- [PATH_RESOLUTION.md](PATH_RESOLUTION.md) - 路径解析系统
- [ARCHITECTURE.md](ARCHITECTURE.md) - 架构文档
- [CI_CD.md](CI_CD.md) - CI/CD 流程
- [docker/README.md](../docker/README.md) - Docker 部署文档
- [docker/npm/](../docker/npm/) - npm 版本 Docker 部署
- [docker/local/](../docker/local/) - 本地代码 Docker 部署

---

**需要帮助？** 提交 Issue：https://github.com/taptap/minigame-open-mcp/issues
