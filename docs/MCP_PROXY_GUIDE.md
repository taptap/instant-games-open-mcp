# MCP Proxy 开发指引

## 概述

本文档提供基于 TapTap Minigame MCP Server 的 **MCP Proxy 开发指引**。

如果你需要：
- 🔐 一个 MCP Server 实例支持多个用户/多个应用
- 🏢 每个用户使用自己的 MAC Token 认证
- 🚀 对 AI Agent 完全透明的认证注入

那么你需要开发一个 MCP Proxy。

## 工作原理

```
                        ┌─────────────────────────┐
                        │   Proxy Context         │
                        │  (你的业务系统)          │
                        │                         │
                        │  - User Session/JWT     │
                        │  - MAC Token Store      │
                        │  - Workspace Path       │
                        └───────────┬─────────────┘
                                    │ 获取上下文
                                    ↓
┌─────────────┐  stdio  ┌─────────────┐  HTTP   ┌─────────────┐
│   AI Agent  │────────▶│  MCP Proxy  │────────▶│ MCP Server  │
│  (Claude)   │ 推荐模式 │  (你开发)   │ 必须模式 │  (TapTap)   │
└─────────────┘         └─────────────┘  + 重连  └─────────────┘
                             │
                             │ 注入:
                             │ - _mac_token
                             │ - _user_id
                             │ - _tenant_id
                             │ - _project_path
                             └─────────────▶
```

**Proxy 的核心职责：**
1. 接收 AI Agent 的标准 MCP 请求
2. 从自身上下文识别用户（Session/JWT/Header）
3. 从自身系统获取用户的 MAC Token 和工作路径
4. 在请求参数中注入私有参数
5. 通过 HTTP 转发到 TapTap MCP Server（支持断线重连）
6. 返回结果给 AI Agent

**传输协议选择：**
- **AI Agent → Proxy**: 推荐使用 **stdio**（本地稳定连接）
- **Proxy → MCP Server**: 必须使用 **HTTP/SSE**（支持断线重连、多客户端）

## 快速开始

### 部署 TapTap MCP Server

#### 方式 1：独立打包（推荐，v1.5.0+）

```bash
# 克隆仓库
git clone https://github.com/your-org/taptap-minigame-mcp-server.git
cd taptap-minigame-mcp-server

# 构建独立打包
npm run build:bundle

# 部署（只需这一个文件）
cp dist/bundle/mcp-server-bundle.js /your/deployment/path/

# 启动 SSE 模式（推荐用于 Proxy）
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3001 \
TDS_MCP_CLIENT_TOKEN=your_secret \
node mcp-server-bundle.js
```

**优势：**
- ✅ 单文件部署，无需 node_modules
- ✅ 体积小（~400KB），启动快
- ✅ 适合容器化部署

#### 方式 2：使用 npm 包

```bash
npm install @mikoto_zero/minigame-open-mcp

# 启动
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3001 \
npx @mikoto_zero/minigame-open-mcp
```

### 开发 Proxy

你的 Proxy 需要做以下事情：

## 1. 参数注入

在 `tools/call` 请求中注入私有参数：

```typescript
// AI Agent 发送的原始请求
{
  "method": "tools/call",
  "params": {
    "name": "list_leaderboards",
    "arguments": {
      "page": 1
    }
  }
}

// Proxy 注入后转发给 TapTap Server
{
  "method": "tools/call",
  "params": {
    "name": "list_leaderboards",
    "arguments": {
      "page": 1,
      "_mac_token": {
        "kid": "xxx",
        "mac_key": "xxx",
        "token_type": "mac",
        "mac_algorithm": "hmac-sha-1"
      },
      "_user_id": "user_123",           // 必需（缓存隔离）
      "_tenant_id": "project_a",        // 可选（多租户隔离）
      "_project_path": "/workspace/project_a"  // 可选（文件操作路径）
    }
  }
}
```

### 私有参数说明

| 参数 | 作用 | 必需 |
|-----|------|-----|
| `_mac_token` | 用户 MAC Token（从你的系统获取） | ✅ |
| `_user_id` | 用户唯一标识（用于缓存隔离） | ✅ |
| `_tenant_id` | 租户唯一标识（用于多项目隔离） | ❌ |
| `_project_path` | 用户工作空间路径（用于文件操作） | ❌ |
| `_developer_id` | 开发者 ID（性能优化，跳过 API 查询） | ❌ |
| `_app_id` | 应用 ID（性能优化，跳过 API 查询） | ❌ |

**重要：** 这些参数对 AI Agent 完全不可见，只在 Proxy 和 Server 之间传递。

详见：[PRIVATE_PROTOCOL.md](PRIVATE_PROTOCOL.md)

## 2. 基础实现示例

### 最小可行 Proxy

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class TapTapMCPProxy {
  private client: Client;
  private server: Server;

  async start() {
    // 初始化 MCP Client 和 Server
    this.client = new Client(
      { name: 'taptap-proxy-client', version: '1.0.0' },
      { capabilities: {} }
    );
    this.server = new Server(
      { name: 'taptap-proxy-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // 连接到 TapTap MCP Server（HTTP 模式，支持重连）
    await this.connectToServer();

    // 暴露给 AI Agent（stdio 模式，推荐）
    const serverTransport = new StdioServerTransport();
    await this.server.connect(serverTransport);

    this.setupHandlers();
  }

  private async connectToServer() {
    const clientTransport = new HttpClientTransport('http://localhost:3001');
    await this.client.connect(clientTransport);
  }

  private setupHandlers() {
    // 透传工具列表
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
    });

    // 拦截工具调用，注入 Token
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // 1. 识别用户（你需要实现）
      const userId = this.getUserId(request);
      const tenantId = this.getTenantId(request);
      const projectPath = this.getProjectPath(request);

      // 2. 获取 MAC Token（从你的存储系统）
      const macToken = await this.getMacToken(userId);
      if (!macToken) {
        throw new Error(`User ${userId} not authenticated`);
      }

      // 3. 注入私有参数
      const enrichedArgs = {
        ...args,
        _mac_token: macToken,
        _user_id: userId,
        _tenant_id: tenantId,
        _project_path: projectPath
      };

      // 4. 转发到 TapTap Server
      return this.client.request({
        method: 'tools/call',
        params: { name, arguments: enrichedArgs }
      }, CallToolResultSchema);
    });
  }

  // ===== 你需要实现的部分 =====

  private getUserId(request: any): string {
    // TODO: 从 JWT/Session/Header 提取用户ID
    // 示例：
    // const jwt = request.headers.authorization;
    // return parseJWT(jwt).sub;
    return 'user_123';
  }

  private getTenantId(request: any): string {
    // TODO: 从请求上下文提取租户ID（可选）
    return 'project_a';
  }

  private getProjectPath(request: any): string {
    // TODO: 从请求上下文提取工作空间路径（可选）
    // 示例：
    // const tenantId = this.getTenantId(request);
    // return `/workspace/${tenantId}`;
    return '/workspace/project_a';
  }

  private async getMacToken(userId: string): Promise<MacToken | null> {
    // TODO: 从环境变量或配置获取 MAC Token
    // 示例：
    // return JSON.parse(process.env.MAC_TOKEN);
    return {
      kid: 'xxx',
      mac_key: 'xxx',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1'
    };
  }
}

interface MacToken {
  kid: string;
  mac_key: string;
  token_type: 'mac';
  mac_algorithm: 'hmac-sha-1';
}
```

## 3. 断线重连机制

Proxy → Server 使用 HTTP 连接，需要处理断线重连：

**重连策略：**
- 🔄 **启动时重连** - 最多尝试 10 次，间隔 5 秒
- 🔄 **运行时重连** - 监听错误事件，自动重连
- 🔄 **请求重试** - 失败后最多重试 3 次
- 💓 **健康检查** - 定期 ping（可选）

**核心实现：**

```typescript
class TapTapMCPProxy {
  private serverUrl = 'http://localhost:3001';

  // 启动时带重连
  private async connectWithRetry() {
    for (let i = 0; i < 10; i++) {
      try {
        const transport = new HttpClientTransport(this.serverUrl);
        await this.client.connect(transport);
        return;
      } catch (error) {
        await this.sleep(5000);  // 5秒后重试
      }
    }
    throw new Error('Max reconnection attempts reached');
  }

  // 请求失败时重试
  private async callWithRetry(request: any, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.client.request(request);
      } catch (error) {
        if (this.isConnectionError(error) && i < maxRetries - 1) {
          await this.connectWithRetry();
        } else {
          throw error;
        }
      }
    }
  }

  private isConnectionError(error: any): boolean {
    return error.code === 'ECONNREFUSED' ||
           error.code === 'ECONNRESET' ||
           error.message?.includes('fetch failed');
  }
}
```

## 4. 备选方案：HTTP Header 注入

如果使用 HTTP/SSE 模式，也可以通过 Header 注入：

```typescript
// Proxy 端设置 Header
req.headers['x-taptap-mac-token'] = Buffer.from(
  JSON.stringify(macToken)
).toString('base64');
req.headers['x-taptap-user-id'] = userId;
req.headers['x-taptap-tenant-id'] = tenantId;
req.headers['x-taptap-project-path'] = Buffer.from(projectPath).toString('base64');
req.headers['mcp-session-id'] = sessionId;  // 必需
```

**注意：**
- ⚠️ Header 注入仅适用于 HTTP/SSE 模式（不支持 stdio）
- ⚠️ 不推荐用于 AI Agent → Proxy 连接（建议使用 stdio）
- ✅ 参数注入适用于所有模式（推荐）

## 5. 部署

### 推荐架构（stdio 模式）

Proxy 以 stdio 模式与 Agent 通信，配置在 Agent 的 MCP 配置中：

**Claude Desktop 配置示例（`~/claude_desktop_config.json`）：**

```json
{
  "mcpServers": {
    "taptap-proxy": {
      "command": "node",
      "args": ["/path/to/your/proxy/dist/index.js"],
      "env": {
        "TAPTAP_SERVER_URL": "http://localhost:3001",
        "USER_ID": "user_123",
        "TENANT_ID": "project_a",
        "PROJECT_PATH": "/workspace/project_a",
        "MAC_TOKEN": "{\"kid\":\"xxx\",\"mac_key\":\"xxx\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}"
      }
    }
  }
}
```

**独立部署 TapTap MCP Server（Docker）：**

```yaml
# docker-compose.yml
version: '3.8'

services:
  # TapTap MCP Server（独立打包）
  taptap-server:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./mcp-server-bundle.js:/app/mcp-server-bundle.js
    command: node mcp-server-bundle.js
    ports:
      - "3001:3001"
    environment:
      - TDS_MCP_TRANSPORT=sse
      - TDS_MCP_PORT=3001
      - TDS_MCP_CLIENT_TOKEN=${CLIENT_TOKEN}
    restart: unless-stopped
```

**Proxy 本地运行：**

```bash
# 安装依赖
npm install

# 启动 Proxy（通过 Agent 启动，不需要单独运行）
# Agent 会根据配置文件自动启动 Proxy
```

### 备选架构（HTTP/SSE 模式）

如果 Agent 也需要远程连接 Proxy（不推荐），可以使用 HTTP/SSE：

```yaml
version: '3.8'

services:
  # 你的 MCP Proxy（支持多用户）
  proxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TAPTAP_SERVER_URL=http://taptap-server:3001
      # 你的业务环境变量（如何获取用户 Token 等）
    depends_on:
      - taptap-server

  # TapTap MCP Server
  taptap-server:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./mcp-server-bundle.js:/app/mcp-server-bundle.js
    command: node mcp-server-bundle.js
    ports:
      - "3001:3001"
    environment:
      - TDS_MCP_TRANSPORT=sse
      - TDS_MCP_PORT=3001
      - TDS_MCP_CLIENT_TOKEN=${CLIENT_TOKEN}
```

## 6. 错误处理

```typescript
async handleToolCall(request: any, userId: string) {
  try {
    return await this.callWithToken(request, userId);
  } catch (error) {
    // 检查是否是认证错误
    if (error.message?.includes('授权已失效') ||
        error.message?.includes('access_denied') ||
        error.code === 401) {
      // 清除过期 token（从你的存储系统）
      await this.deleteToken(userId);
      throw new Error(`认证已过期，请重新授权（用户: ${userId}）`);
    }
    throw error;
  }
}
```

## 7. 测试

```bash
# 1. 启动 TapTap Server
TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3001 node mcp-server-bundle.js

# 2. 启动你的 Proxy
npm start

# 3. 测试工具调用
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_leaderboards",
      "arguments": { "page": 1 }
    }
  }'

# 4. 验证：检查 TapTap Server 日志
# 启用详细日志查看 Token 注入情况
TDS_MCP_VERBOSE=true TDS_MCP_TRANSPORT=sse TDS_MCP_PORT=3001 node mcp-server-bundle.js
```

## 常见问题

### Q1: 私有参数会暴露给 AI Agent 吗？

**不会。** 私有参数只在 Proxy 和 Server 之间传递，`tools/list` 返回的工具定义中不包含这些参数。

### Q2: 多租户是如何隔离的？

TapTap MCP Server 根据 `_user_id` 和 `_tenant_id` 自动隔离缓存和临时文件：
```
/tmp/taptap-mcp/cache/user_123/project_a/app.json
/tmp/taptap-mcp/cache/user_456/project_b/app.json
```

### Q3: 必须传 `_tenant_id` 吗？

不是必需的。如果不传，会使用 `global` 目录：
```
/tmp/taptap-mcp/cache/user_123/global/app.json
```

### Q4: Proxy 如何获取用户的 MAC Token？

**推荐方式（stdio 模式）：** 通过环境变量传递

```json
{
  "mcpServers": {
    "taptap-proxy": {
      "env": {
        "MAC_TOKEN": "{\"kid\":\"xxx\",\"mac_key\":\"xxx\",...}"
      }
    }
  }
}
```

**多用户场景：** 需要你自己实现用户识别和 Token 管理逻辑
- 从 JWT/Session/Header 识别用户
- 从你的业务系统获取对应用户的 Token
- 注入到请求中

### Q5: 为什么 Proxy → Server 必须用 HTTP？

因为需要支持：
- ✅ **断线重连** - HTTP 客户端可以自动重连
- ✅ **多客户端** - 一个 Server 实例支持多个 Proxy
- ✅ **跨网络部署** - Proxy 和 Server 可以在不同机器

### Q6: 为什么 Agent → Proxy 推荐用 stdio？

因为：
- ✅ **本地连接** - Agent 和 Proxy 通常在同一机器
- ✅ **配置简单** - 不需要网络配置
- ✅ **性能更好** - 无网络开销

### Q7: 断线重连会影响正在执行的请求吗？

会。正在执行的请求会失败，但 Proxy 会自动重试（最多 3 次）。建议：
- 增加请求超时时间
- 在业务层实现幂等性
- 对长时间任务使用状态轮询

## 相关文档

- [PRIVATE_PROTOCOL.md](PRIVATE_PROTOCOL.md) - 私有参数协议详细规范
- [README.md](../README.md) - TapTap MCP Server 完整文档
- [CLAUDE.md](../CLAUDE.md) - 开发指南

## 示例代码

完整的 MCP Proxy 示例代码即将开源，敬请期待！

---

**需要帮助？** 提交 Issue：https://github.com/taptap/taptap-minigame-mcp-server/issues
