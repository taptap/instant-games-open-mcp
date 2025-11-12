# MCP Proxy 客户端配置指南

本文档说明如何在 VS Code、Claude Desktop、Cursor 等客户端中配置 TapTap MCP Proxy（stdio 模式）。

## 配置原理

### 架构说明

```
┌─────────────────────────────────┐
│ VS Code / Claude Desktop        │
│   ↓ stdio (spawn 子进程)        │
│ MCP Proxy (本地进程)             │
│   - 读取 JSON 配置               │
│   - 注入 MAC Token               │
└──────────┬──────────────────────┘
           │ HTTP/SSE
           ↓
    TapTap MCP Server
    (http://localhost:5003)
```

### 配置要点

1. **命令**：`node` 或 `npx`
2. **参数**：
   - Proxy 入口文件路径
   - JSON 配置字符串
3. **配置格式**：单行 JSON（必须转义引号）

---

## VS Code 配置

### 方式 1：使用全局安装的 Proxy

**安装 Proxy**：
```bash
npm install -g @mikoto_zero/minigame-open-mcp@1.4.2
```

**配置 `.vscode/settings.json`**：
```json
{
  "mcp.servers": {
    "taptap": {
      "command": "taptap-mcp-proxy",
      "args": [
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\",\"workspace_path\":\"/Users/you/workspace\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"},\"options\":{\"verbose\":false}}"
      ]
    }
  }
}
```

### 方式 2：使用 npx（无需安装）

```json
{
  "mcp.servers": {
    "taptap": {
      "command": "npx",
      "args": [
        "-y",
        "@mikoto_zero/minigame-open-mcp@1.4.2",
        "taptap-mcp-proxy",
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

### 方式 3：使用本地编译的 Proxy（开发）

```json
{
  "mcp.servers": {
    "taptap": {
      "command": "node",
      "args": [
        "/path/to/taptap-minigame-mcp-server/dist/mcp-proxy/index.js",
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"test-user\",\"project_id\":\"test-project\"},\"auth\":{\"kid\":\"test_kid\",\"mac_key\":\"test_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

---

## Claude Desktop 配置

### macOS

配置文件位置：`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "taptap": {
      "command": "taptap-mcp-proxy",
      "args": [
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

### Windows

配置文件位置：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "taptap": {
      "command": "taptap-mcp-proxy.cmd",
      "args": [
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

---

## Cursor 配置

### 项目级配置

**文件位置**：`.cursor/mcp.json`

```json
{
  "mcpServers": {
    "taptap": {
      "command": "taptap-mcp-proxy",
      "args": [
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

---

## 配置生成器

### 手动生成配置

**步骤 1：准备你的信息**
```javascript
const config = {
  server: {
    url: "http://localhost:5003",  // MCP Server 地址
    env: "rnd"                     // rnd | production
  },
  tenant: {
    user_id: "your-user-id",       // 你的用户 ID
    project_id: "your-project-id", // 你的项目 ID
    workspace_path: "/Users/you/workspace"  // 可选，默认 /workspace
  },
  auth: {
    kid: "your_kid_here",          // 从 TapTap OAuth 获取
    mac_key: "your_mac_key_here",
    token_type: "mac",
    mac_algorithm: "hmac-sha-1"
  },
  options: {
    verbose: false                 // true: 详细日志
  }
};
```

**步骤 2：转换为单行 JSON**
```javascript
const configString = JSON.stringify(config);
console.log(configString);
```

**步骤 3：粘贴到配置文件的 `args` 数组**

---

## 获取 MAC Token

### 方式 1：通过 MCP Server OAuth（推荐）

```bash
# 1. 本地启动 MCP Server
TDS_MCP_TRANSPORT=stdio npx @mikoto_zero/minigame-open-mcp

# 2. 在客户端调用需要认证的工具
# 3. 扫描二维码授权
# 4. Token 自动保存到 ~/.config/taptap-minigame/token.json

# 5. 读取 Token
cat ~/.config/taptap-minigame/token.json
```

### 方式 2：通过 TapCode 平台

如果你在 TapCode 平台已授权：
```bash
# 从数据库或 API 获取你的 MAC Token
# 包含 kid, mac_key, token_type, mac_algorithm
```

---

## 配置示例（完整）

### 示例 1：开发环境（本地 MCP Server）

```json
{
  "mcpServers": {
    "taptap": {
      "command": "node",
      "args": [
        "/Users/you/repos/taptap-minigame-mcp-server/dist/mcp-proxy/index.js",
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"dev-user\",\"project_id\":\"dev-project\"},\"auth\":{\"kid\":\"abc123\",\"mac_key\":\"xyz789\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"},\"options\":{\"verbose\":true}}"
      ]
    }
  }
}
```

### 示例 2：生产环境（远程 MCP Server）

```json
{
  "mcpServers": {
    "taptap": {
      "command": "taptap-mcp-proxy",
      "args": [
        "{\"server\":{\"url\":\"https://mcp.tapcode.com\",\"env\":\"production\"},\"tenant\":{\"user_id\":\"user-123\",\"project_id\":\"project-456\"},\"auth\":{\"kid\":\"real_kid\",\"mac_key\":\"real_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

---

## 配置验证

### 检查 Proxy 是否正常工作

1. **启动客户端**（VS Code / Claude Desktop）

2. **查看 Proxy 日志**（stderr）：
   ```
   [Proxy] Configuration loaded successfully
   [Proxy] Server: http://localhost:5003
   [Proxy] Environment: rnd
   [Proxy] Project: your-project-id
   [Proxy] User: your-user-id
   [Proxy] Connecting to http://localhost:5003...
   [Proxy] ✅ Connected to TapTap MCP Server
   [Proxy] Started (stdio mode)
   ```

3. **测试工具调用**：
   - 调用任意工具（如 `list_developers_and_apps`）
   - 检查是否正常返回结果

---

## 故障排查

### 问题 1：Proxy 无法启动

**症状**：
```
Error: No configuration provided
```

**解决**：
检查 JSON 配置是否正确：
- ✅ 必须是单行字符串
- ✅ 双引号必须转义（`\"`）
- ✅ 不能有换行符

### 问题 2：无法连接 MCP Server

**症状**：
```
[Proxy] Fatal error: Connection failed
```

**解决**：
1. 确认 MCP Server 正在运行：
   ```bash
   curl http://localhost:5003/health
   ```

2. 检查 `server.url` 配置是否正确

### 问题 3：Token 无效

**症状**：
```
HTTP 403 - Authorization failed
```

**解决**：
1. 检查 `auth.kid` 和 `auth.mac_key` 是否正确
2. 确认 Token 未过期
3. 验证 `token_type` 和 `mac_algorithm` 是否正确

---

## 高级配置

### 启用详细日志

```json
{
  "options": {
    "verbose": true
  }
}
```

启用后，Proxy 会输出：
- 每次工具调用的名称
- 注入的私有参数（脱敏）
- 连接状态变化

### 自定义重连间隔

```json
{
  "options": {
    "verbose": false,
    "reconnect_interval": 3000,   // 3 秒
    "monitor_interval": 8000      // 8 秒
  }
}
```

---

## 完整配置模板

### 最小配置（必需字段）

```json
{
  "server": {
    "url": "http://localhost:5003",
    "env": "rnd"
  },
  "tenant": {
    "user_id": "your-user-id",
    "project_id": "your-project-id"
  },
  "auth": {
    "kid": "your_kid",
    "mac_key": "your_mac_key",
    "token_type": "mac",
    "mac_algorithm": "hmac-sha-1"
  }
}
```

### 完整配置（所有字段）

```json
{
  "server": {
    "url": "http://localhost:5003",
    "env": "rnd"
  },
  "tenant": {
    "user_id": "your-user-id",
    "project_id": "your-project-id",
    "workspace_path": "/workspace"
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
    "monitor_interval": 10000
  }
}
```

---

## 快速配置脚本

### 生成配置的 Node.js 脚本

```javascript
#!/usr/bin/env node

// generate-proxy-config.js
const config = {
  server: {
    url: process.env.SERVER_URL || "http://localhost:5003",
    env: process.env.ENV || "rnd"
  },
  tenant: {
    user_id: process.env.USER_ID || "test-user",
    project_id: process.env.PROJECT_ID || "test-project"
  },
  auth: {
    kid: process.env.KID,
    mac_key: process.env.MAC_KEY,
    token_type: "mac",
    mac_algorithm: "hmac-sha-1"
  },
  options: {
    verbose: process.env.VERBOSE === "true"
  }
};

// 验证必需字段
if (!config.auth.kid || !config.auth.mac_key) {
  console.error("Error: KID and MAC_KEY are required");
  console.error("Usage: KID=xxx MAC_KEY=xxx node generate-proxy-config.js");
  process.exit(1);
}

// 输出单行 JSON
console.log(JSON.stringify(config));
```

**使用**：
```bash
# 设置环境变量
export USER_ID=user-123
export PROJECT_ID=project-456
export KID=your_kid
export MAC_KEY=your_mac_key

# 生成配置
node generate-proxy-config.js

# 输出：
# {"server":{"url":"http://localhost:5003","env":"rnd"},...}
```

---

## 真实配置示例

### 示例 1：本地开发（你的机器）

```json
{
  "mcpServers": {
    "taptap": {
      "command": "node",
      "args": [
        "/Users/mikoto/Documents/xindong/Repos/TapCode/taptap-minigame-mcp-server/dist/mcp-proxy/index.js",
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"mikoto\",\"project_id\":\"test-h5-game\"},\"auth\":{\"kid\":\"your_real_kid\",\"mac_key\":\"your_real_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"},\"options\":{\"verbose\":true}}"
      ]
    }
  }
}
```

### 示例 2：团队共享（使用 npx）

```json
{
  "mcpServers": {
    "taptap": {
      "command": "npx",
      "args": [
        "-y",
        "@mikoto_zero/minigame-open-mcp",
        "taptap-mcp-proxy",
        "{\"server\":{\"url\":\"http://mcp-server.company.com:5003\",\"env\":\"production\"},\"tenant\":{\"user_id\":\"team-member-001\",\"project_id\":\"game-project-001\"},\"auth\":{\"kid\":\"team_kid\",\"mac_key\":\"team_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

---

## 安全注意事项

### 1. 不要提交配置文件到 Git

```gitignore
# .gitignore
.vscode/settings.json
.cursor/mcp.json
```

### 2. 使用环境变量

```json
{
  "mcpServers": {
    "taptap": {
      "command": "sh",
      "args": [
        "-c",
        "taptap-mcp-proxy \"{\\\"server\\\":{\\\"url\\\":\\\"http://localhost:5003\\\"},\\\"tenant\\\":{\\\"user_id\\\":\\\"$USER_ID\\\",\\\"project_id\\\":\\\"$PROJECT_ID\\\"},\\\"auth\\\":{\\\"kid\\\":\\\"$KID\\\",\\\"mac_key\\\":\\\"$MAC_KEY\\\",\\\"token_type\\\":\\\"mac\\\",\\\"mac_algorithm\\\":\\\"hmac-sha-1\\\"}}\""
      ],
      "env": {
        "USER_ID": "your-user-id",
        "PROJECT_ID": "your-project-id",
        "KID": "your_kid",
        "MAC_KEY": "your_mac_key"
      }
    }
  }
}
```

### 3. 使用配置文件

创建 `proxy-config.json`（不提交到 Git）：
```json
{
  "server": {"url": "http://localhost:5003", "env": "rnd"},
  "tenant": {"user_id": "your-user-id", "project_id": "your-project-id"},
  "auth": {"kid": "your_kid", "mac_key": "your_mac_key", "token_type": "mac", "mac_algorithm": "hmac-sha-1"}
}
```

配置客户端：
```json
{
  "mcpServers": {
    "taptap": {
      "command": "sh",
      "args": [
        "-c",
        "taptap-mcp-proxy \"$(cat /path/to/proxy-config.json)\""
      ]
    }
  }
}
```

---

## 常见问题

### Q: JSON 配置太长，有没有更简单的方式？

A: 可以使用配置文件：
```bash
# 创建配置文件
cat > ~/.taptap-mcp-proxy.json << 'EOF'
{
  "server": {"url": "http://localhost:5003", "env": "rnd"},
  "tenant": {"user_id": "user-123", "project_id": "project-456"},
  "auth": {"kid": "xxx", "mac_key": "yyy", "token_type": "mac", "mac_algorithm": "hmac-sha-1"}
}
EOF

# 客户端配置
{
  "command": "sh",
  "args": ["-c", "taptap-mcp-proxy \"$(cat ~/.taptap-mcp-proxy.json)\""]
}
```

### Q: 如何切换不同的项目？

A: 更新 `tenant.project_id` 即可：
```json
{
  "tenant": {
    "user_id": "your-user-id",
    "project_id": "new-project-id"  // 切换项目
  }
}
```

### Q: 可以不填 workspace_path 吗？

A: 可以。默认值是 `/workspace`。只有在 Proxy 和 Server 不在同一台机器时才需要自定义。

---

## 相关文档

- [src/mcp-proxy/README.md](../src/mcp-proxy/README.md) - Proxy 详细说明
- [src/mcp-proxy/config.example.json](../src/mcp-proxy/config.example.json) - 配置示例
- [TAPCODE_INTEGRATION.md](TAPCODE_INTEGRATION.md) - TapCode 平台集成

---

**需要帮助？** 提交 Issue：https://github.com/taptap/minigame-open-mcp/issues
