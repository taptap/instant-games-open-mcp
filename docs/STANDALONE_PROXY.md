# Standalone Proxy 使用指南

## 概述

`dist/proxy.js` 是一个**完全独立的单文件**，可以在没有 `node_modules` 的环境中直接运行。

**特性：**
- ✅ 无依赖（所有依赖已内联）
- ✅ 单文件（约 520KB）
- ✅ 直接运行：`node proxy.js`
- ✅ 跨平台（Node.js 16+）

## 获取文件

### 方式 1：从 npm 包中提取

```bash
# 安装 npm 包
npm install @mikoto_zero/minigame-open-mcp

# 文件位置
node_modules/@mikoto_zero/minigame-open-mcp/dist/proxy.js
```

### 方式 2：从本地构建

```bash
# 克隆仓库
git clone https://github.com/taptap/taptap_minigame_open_mcp.git
cd taptap_minigame_open_mcp

# 构建
npm install
npm run build:proxy

# 文件位置
dist/proxy.js
```

## 使用方式

### 方式 1：命令行参数

```bash
node proxy.js '{"server":{"url":"http://localhost:3000"},"tenant":{"project_path":"."},"auth":{"kid":"your_kid","mac_key":"your_key","token_type":"mac","mac_algorithm":"hmac-sha-1"}}'
```

### 方式 2：标准输入（推荐）

```bash
cat config.json | node proxy.js
```

**config.json 示例：**
```json
{
  "server": {
    "url": "http://localhost:3000",
    "env": "rnd"
  },
  "tenant": {
    "project_path": ".",
    "user_id": "user123",
    "project_id": "project456"
  },
  "auth": {
    "kid": "your_kid",
    "mac_key": "your_mac_key",
    "token_type": "mac",
    "mac_algorithm": "hmac-sha-1"
  },
  "options": {
    "verbose": false,
    "reconnect_interval": 5000,
    "request_timeout": 30000
  }
}
```

### 方式 3：环境变量

```bash
export PROXY_CONFIG='{"server":{"url":"http://localhost:3000"},"auth":{...}}'
node proxy.js
```

## 配置说明

### 必需字段

- `server.url` - TapTap MCP Server 地址
- `auth.kid` - MAC Token kid
- `auth.mac_key` - MAC Token key

### 可选字段

- `server.env` - 环境选择（`rnd` 或 `production`，默认 `rnd`）
- `tenant.project_path` - 项目路径（相对路径，默认 `.`）
- `tenant.user_id` - 用户标识符（可选，仅用于日志）
- `tenant.project_id` - 项目标识符（可选，仅用于日志）
- `options.verbose` - 详细日志模式（默认 `false`）
- `options.reconnect_interval` - 重连间隔（毫秒，默认 `5000`）
- `options.request_timeout` - 请求超时（毫秒，默认 `30000`）

## 部署场景

### 场景 1：OpenHands / Claude Code

在 AI Agent 平台中，通过 MCP 配置使用：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "node",
      "args": ["/path/to/proxy.js"],
      "stdin": {
        "server": {
          "url": "https://your-server.com"
        },
        "auth": {
          "kid": "...",
          "mac_key": "..."
        }
      }
    }
  }
}
```

### 场景 2：Docker 容器

```dockerfile
FROM node:16-alpine

# 只需复制单文件
COPY proxy.js /app/proxy.js

# 运行
CMD ["node", "/app/proxy.js"]
```

**docker-compose.yml：**
```yaml
version: '3'
services:
  mcp-proxy:
    image: node:16-alpine
    volumes:
      - ./proxy.js:/app/proxy.js
      - ./config.json:/app/config.json
    command: sh -c "cat /app/config.json | node /app/proxy.js"
```

### 场景 3：无 npm 环境

在只有 Node.js 而没有 npm 的环境中：

```bash
# 1. 复制 proxy.js 到目标机器
scp dist/proxy.js user@server:/opt/proxy.js

# 2. SSH 登录后直接运行
cat config.json | node /opt/proxy.js
```

## 验证安装

```bash
# 测试配置加载（应显示配置错误）
echo 'invalid' | node proxy.js

# 预期输出：
# [Proxy] Loading config from stdin
# [Proxy] Fatal error: Failed to parse configuration JSON: ...
```

## 常见问题

### Q1：如何更新到新版本？

只需替换 `proxy.js` 文件：

```bash
npm install @mikoto_zero/minigame-open-mcp@latest
cp node_modules/@mikoto_zero/minigame-open-mcp/dist/proxy.js ./proxy.js
```

### Q2：可以压缩文件吗？

可以，但不推荐。文件已经通过 tree-shaking 优化，压缩后体积减少不多，但可读性变差：

```bash
# 使用压缩版本
npm run build:proxy -- --minify
```

### Q3：如何调试？

启用详细日志：

```json
{
  "options": {
    "verbose": true
  }
}
```

日志输出到 `stderr`，不影响 MCP 通信（stdin/stdout）。

### Q4：文件太大怎么办？

520KB 的文件对于现代网络和存储来说非常小。如果确实需要减小：

1. **使用原始方式**（需要 `node_modules`）：`npx @mikoto_zero/minigame-open-mcp`
2. **压缩传输**：`gzip proxy.js`（可减小到约 120KB）

## 技术细节

**打包工具：** esbuild

**包含的依赖：**
- `@modelcontextprotocol/sdk` (1.20.2)
- 所有 proxy 相关代码

**不包含（使用 Node.js 内置）：**
- `node:path`
- `node:url`
- `node:fs`

## 开发指引

### 重新构建

```bash
npm run build:proxy
```

### 修改打包配置

编辑 `scripts/bundle-proxy.js`：

```javascript
await esbuild.build({
  minify: false,      // 改为 true 启用压缩
  sourcemap: false,   // 改为 true 启用 source map
  // ...
});
```

### 集成到 CI/CD

`prepublishOnly` 脚本会自动构建 proxy.js：

```bash
npm publish  # 自动执行 build:all -> build:proxy
```

## 更多信息

- [MCP Proxy 设计文档](./MCP_PROXY.md)
- [私有参数协议](./PRIVATE_PROTOCOL.md)
- [项目主页](https://github.com/taptap/taptap_minigame_open_mcp)
