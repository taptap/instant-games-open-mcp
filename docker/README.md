# Docker 部署

提供两种 Docker 部署方式：

## 目录结构

```
docker/
├── local/              # 从本地代码构建
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── run.sh
├── npm/                # 从 npm 安装（测试线上版本）
│   ├── Dockerfile
│   ├── docker-compose.yml  # 正式服务
│   └── run.sh
└── README.md
```

## 快速开始

### 方式 1：docker-compose（推荐）

启动正式服务：

```bash
cd docker/npm

# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps

# 停止
docker-compose down
```

### 方式 2：单独运行脚本

```bash
cd docker/npm

# 正式服务（使用 Native Signer，无需配置）
./run.sh -p 5003

# 更新到最新 npm 版本
./run.sh --no-cache
```

### 方式 3：从本地代码构建

```bash
cd docker/local

# 先构建项目
npm run build

# 运行
./run.sh -p 5003

# 或一步完成
./run.sh -b
```

## 端口配置

| 服务       | 端口 | API Base         |
| ---------- | ---- | ---------------- |
| Production | 5003 | agent.tapapis.cn |

## 脚本参数

### npm/run.sh

| 参数            | 说明             | 默认值                    |
| --------------- | ---------------- | ------------------------- |
| `-v, --version` | npm 版本         | latest                    |
| `-p, --port`    | 端口             | 5003                      |
| `-n, --name`    | 容器名           | taptap-mcp-npm-production |
| `--no-cache`    | 强制重新构建镜像 | -                         |

### local/run.sh

| 参数          | 说明                 | 默认值                |
| ------------- | -------------------- | --------------------- |
| `-p, --port`  | 端口                 | 5003                  |
| `-n, --name`  | 容器名               | taptap-mcp-production |
| `-b, --build` | 先运行 npm run build | -                     |

## 容器管理

```bash
# 查看运行中的容器
docker ps | grep taptap-mcp

# 查看日志
docker logs -f taptap-mcp-npm-production  # Production

# 停止所有
docker-compose down  # 或
docker stop taptap-mcp-npm-production

# 清理镜像
docker rmi taptap-open-mcp:npm-latest
```

## 环境变量

| 变量                       | 说明          | 默认值        |
| -------------------------- | ------------- | ------------- |
| `TAPTAP_MCP_CLIENT_ID`     | Client ID     | 内置 (Signer) |
| `TAPTAP_MCP_CLIENT_SECRET` | Client Secret | 内置 (Signer) |
| `TAPTAP_MCP_VERBOSE`       | 详细日志      | true          |

## 健康检查

```bash
# Production
curl http://localhost:5003/health

```

## 更新镜像

当 npm 发布新版本后：

```bash
# 方式 1: docker-compose
cd docker/npm
docker-compose build --no-cache
docker-compose up -d

# 方式 2: 脚本
./run.sh --no-cache -p 5003
```
