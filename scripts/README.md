# 部署脚本

快速部署 TapTap MCP Server 的便捷脚本。

## 快速开始

### SSE 模式（推荐用于 OpenHands）

```bash
# 方式 1: 使用 npm scripts（最简单）
npm run serve:sse          # 基础模式
npm run serve:sse:dev      # 开发模式（详细日志）

# 方式 2: 使用部署脚本
./scripts/serve-sse.sh                  # 默认端口 3000
./scripts/serve-sse.sh 8080             # 自定义端口
./scripts/serve-sse.sh 3000 true        # 启用详细日志
```

### HTTP JSON 模式

```bash
# 方式 1: 使用 npm scripts
npm run serve:http         # 基础模式

# 方式 2: 使用部署脚本
./scripts/serve-http.sh                 # 默认端口 3000
./scripts/serve-http.sh 8080            # 自定义端口
./scripts/serve-http.sh 3000 true       # 启用详细日志
```

## 使用场景

### 场景 1: 开发测试

```bash
# 快速启动 SSE 模式 + 详细日志
npm run serve:sse:dev

# 或使用脚本
./scripts/serve-sse.sh 3000 true
```

### 场景 2: 生产部署

```bash
# 1. 全局安装
npm install -g @mikoto_zero/minigame-open-mcp

# 2. 使用 PM2 管理进程
pm2 start "npm run serve:sse" --name taptap-mcp

# 3. 或使用脚本
pm2 start ./scripts/serve-sse.sh --name taptap-mcp
```

### 场景 3: Docker 部署

```bash
# 构建镜像
docker build -t taptap-mcp .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -e TDS_MCP_TRANSPORT=sse \
  -e TDS_MCP_VERBOSE=true \
  --name taptap-mcp \
  taptap-mcp
```

## 端口说明

- **默认端口**: 3000
- **自定义端口**: 通过参数或环境变量指定
- **端口检查**: 脚本会自动检查端口是否被占用（TODO）

## 健康检查

```bash
# 检查服务器状态
curl http://localhost:3000/health

# 预期响应
{
  "status": "ok",
  "version": "1.2.0",
  "transport": "streamable-http",
  "tools": 17,
  "resources": 7,
  "activeSessions": 0
}
```

## npm Scripts 完整列表

```bash
npm run build          # 编译 TypeScript
npm run start          # 启动（stdio 模式）
npm run dev            # 开发模式（tsx）
npm run serve:sse      # SSE 流式模式
npm run serve:sse:dev  # SSE + 详细日志
npm run serve:http     # HTTP JSON 模式
npm run lint           # 代码检查
npm run format         # 代码格式化
```

## 环境变量

所有脚本都支持通过环境变量覆盖默认配置：

```bash
# 环境变量优先级高于脚本参数
export TDS_MCP_PORT=8080
export TDS_MCP_VERBOSE=true
export TDS_MCP_ENV=rnd

npm run serve:sse
# 或
./scripts/serve-sse.sh
```

## 进程管理

### 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start npm --name "taptap-mcp" -- run serve:sse

# 查看日志
pm2 logs taptap-mcp

# 重启
pm2 restart taptap-mcp

# 停止
pm2 stop taptap-mcp

# 开机自启
pm2 startup
pm2 save
```

### 使用 systemd

创建 `/etc/systemd/system/taptap-mcp.service`:

```ini
[Unit]
Description=TapTap MCP Server (SSE Mode)
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/taptap-minigame-mcp-server
ExecStart=/usr/bin/npm run serve:sse
Restart=always
Environment="TDS_MCP_PORT=3000"
Environment="TDS_MCP_VERBOSE=false"

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl enable taptap-mcp
sudo systemctl start taptap-mcp
sudo systemctl status taptap-mcp
```

## 故障排查

### 端口被占用

```bash
# 检查端口占用
lsof -i :3000

# 使用其他端口
./scripts/serve-sse.sh 8080
```

### 查看详细日志

```bash
# 启用详细日志
npm run serve:sse:dev

# 或
./scripts/serve-sse.sh 3000 true
```

### 健康检查失败

```bash
# 检查服务器是否启动
curl -v http://localhost:3000/health

# 检查防火墙
sudo ufw status
```

## 使用 .env 文件（推荐）

为了更方便地管理配置，可以使用 `.env` 文件：

### 设置步骤

```bash
# 1. 复制示例文件
cp .env.example .env

# 2. 编辑 .env 文件
# 根据需要修改配置项，例如：
#   TDS_MCP_TRANSPORT=sse
#   TDS_MCP_PORT=3000
#   TDS_MCP_VERBOSE=true

# 3. 启动服务器
npm run serve:sse
# .env 中的配置会自动加载
```

### 配置优先级

```
命令行环境变量 > .env 文件 > 默认值
```

示例：
```bash
# .env 文件中设置
TDS_MCP_PORT=3000

# 命令行覆盖
TDS_MCP_PORT=8080 npm run serve:sse
# 实际使用端口 8080（命令行优先）
```

### .env 文件模板

参考 `.env.example` 文件，包含所有可用配置项和详细说明。

### 安全提示

- ✅ `.env` 文件已自动添加到 `.gitignore`
- ⚠️ 不要将 `.env` 文件提交到 git
- ⚠️ 不要在 `.env` 中存储敏感的生产环境密钥
- ✅ 生产环境建议使用环境变量或密钥管理服务
