# MCP Proxy 开发指南

> 本文档面向需要开发 MCP Proxy 的开发者（如 TapCode 平台）

## 目录

1. [什么是 MCP Proxy](#1-什么是-mcp-proxy)
2. [工作原理](#2-工作原理)
3. [私有参数协议](#3-私有参数协议)
4. [开发 MCP Proxy](#4-开发-mcp-proxy)
5. [客户端配置](#5-客户端配置)
6. [Standalone Proxy](#6-standalone-proxy)
7. [TapCode 集成示例](#7-tapcode-集成示例)

---

## 1. 什么是 MCP Proxy

MCP Proxy 是一个中间层服务，用于解决**一个 MCP Server 实例支持多用户/多应用**的场景。

### 使用场景

如果你需要：
- 一个 MCP Server 实例支持多个用户/多个应用
- 每个用户使用自己的 MAC Token 认证
- 对 AI Agent 完全透明的认证注入

那么你需要开发一个 MCP Proxy。

### 核心优势

- **多租户支持** - 一个 Server，多个用户
- **认证注入** - 自动注入用户的 MAC Token
- **完全透明** - AI Agent 无需关心认证细节
- **会话隔离** - 每个用户的数据完全隔离

---

## 2. 工作原理

### 架构图

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

### Proxy 的核心职责

1. **接收请求** - 从 AI Agent 接收标准 MCP 请求
2. **识别用户** - 从自身上下文识别用户（Session/JWT/Header）
3. **获取认证** - 从自身系统获取用户的 MAC Token 和工作路径
4. **注入参数** - 在请求参数中注入私有参数
5. **转发请求** - 通过 HTTP 转发到 TapTap MCP Server（支持断线重连）
6. **返回结果** - 返回结果给 AI Agent

### 传输协议选择

| 连接 | 推荐协议 | 原因 |
|------|---------|------|
| **AI Agent → Proxy** | **stdio** | 本地稳定连接，配置简单，性能更好 |
| **Proxy → MCP Server** | **HTTP/SSE** | 支持断线重连、多客户端、跨网络部署 |

---

## 3. 私有参数协议

### 3.1 协议概述

私有参数协议允许 MCP Proxy 向工具调用注入额外的认证和元数据参数，而这些参数**不会出现在工具的公开定义中**，对 AI Agent 完全透明。

### 3.2 设计目标

1. **对 AI Agent 透明** - AI Agent 只看到业务参数，不需要关心认证细节
2. **多账号支持** - 不同的工具调用可以使用不同的 MAC Token
3. **灵活扩展** - 支持添加更多私有参数（用户ID、会话ID等）
4. **安全性** - 私有参数在日志中自动脱敏
5. **向后兼容** - 不影响现有的 OAuth 认证流程

### 3.3 支持的私有参数

所有私有参数使用**下划线前缀** (`_`) 来区分业务参数。

| 参数名 | 类型 | 描述 | 必需 |
|--------|------|------|-----|
| `_mac_token` | `MacToken` | 用户认证 Token | ✅ |
| `_user_id` | `string` | 用户唯一标识（用于缓存隔离） | ✅ |
| `_tenant_id` | `string` | 租户唯一标识（用于多项目隔离） | ❌ |
| `_project_path` | `string` | 用户工作空间路径（用于文件操作） | ❌ |
| `_developer_id` | `string` | 开发者 ID（性能优化，跳过 API 查询） | ❌ |
| `_app_id` | `string` | 应用 ID（性能优化，跳过 API 查询） | ❌ |

**MacToken 类型定义：**

```typescript
interface MacToken {
  kid: string;              // MAC key identifier
  mac_key: string;          // MAC key for signing
  token_type: "mac";        // Token type
  mac_algorithm: "hmac-sha-1"; // MAC algorithm
}
```

### 3.4 注入方式

#### 方式 1：直接参数注入（推荐）

MCP Proxy 直接在 `arguments` 中注入私有参数：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_leaderboards",
    "arguments": {
      "page": 1,
      "_mac_token": {
        "kid": "abc123",
        "mac_key": "secret_key",
        "token_type": "mac",
        "mac_algorithm": "hmac-sha-1"
      },
      "_user_id": "user_12345",
      "_tenant_id": "project_a",
      "_project_path": "/workspace/project_a"
    }
  }
}
```

#### 方式 2：HTTP Header 注入（仅 HTTP/SSE 模式）

在 HTTP/SSE 传输模式下，可以通过 HTTP Headers 注入 MAC Token：

```http
POST / HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Mcp-Session-Id: abc123xyz
X-TapTap-Mac-Token: eyJraWQiOiJhYmMxMjMiLCJtYWNfa2V5Ijoic2VjcmV0In0=

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_leaderboards",
    "arguments": {
      "page": 1
    }
  }
}
```

**Header 格式说明：**

- `Mcp-Session-Id`: MCP 会话 ID（必需）
- `X-TapTap-Mac-Token`: Base64 编码的 MAC Token JSON（也支持直接传 JSON 字符串）

**Base64 编码示例：**

```bash
# 原始 MAC Token
{
  "kid": "abc123",
  "mac_key": "secret",
  "token_type": "mac",
  "mac_algorithm": "hmac-sha-1"
}

# Base64 编码
echo -n '{"kid":"abc123","mac_key":"secret","token_type":"mac","mac_algorithm":"hmac-sha-1"}' | base64
```

### 3.5 认证优先级

当存在多个 MAC Token 来源时，按以下优先级选择：

```
1. arguments._mac_token       (最高优先级，来自 Proxy 参数注入)
   ↓
2. HTTP Header (X-TapTap-Mac-Token)  (仅 HTTP/SSE 模式)
   ↓
3. context.macToken           (来自环境变量或 OAuth)
   ↓
4. global ApiConfig           (全局配置)
```

### 3.6 安全性

#### 日志脱敏

所有私有参数在日志中自动脱敏：

```typescript
// 原始参数
{
  page: 1,
  _mac_token: { kid: "abc", mac_key: "secret" },
  _user_id: "user123"
}

// 日志中显示
{
  page: 1
  // 私有参数已被移除
}
```

#### Server 层统一处理

```typescript
// Server 层（唯一处理私有参数的地方）
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { arguments: args } = request.params;

  // 1. 提取私有参数（从 arguments 或 HTTP Header）
  const effectiveContext = getEffectiveContext(enrichedArgs, baseContext);

  // 2. 移除私有参数
  const businessArgs = stripPrivateParams(enrichedArgs);

  // 3. 调用业务层（完全干净）
  await toolReg.handler(businessArgs, effectiveContext);
});
```

### 3.7 工作流程

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   AI Agent  │────────▶│  MCP Proxy  │────────▶│ MCP Server  │
│  (Claude)   │ Call A  │ (Injector)  │ Call B  │  (TapTap)   │
└─────────────┘         └─────────────┘         └─────────────┘
                             │
                             │ 注入 _mac_token
                             ▼
                        ┌─────────────┐
                        │ MAC Token   │
                        │   Store     │
                        └─────────────┘

Call A (Agent → Proxy):
{
  "name": "list_leaderboards",
  "arguments": {
    "page": 1
  }
}

Call B (Proxy → Server):
{
  "name": "list_leaderboards",
  "arguments": {
    "page": 1,
    "_mac_token": {
      "kid": "abc123",
      "mac_key": "secret",
      "token_type": "mac",
      "mac_algorithm": "hmac-sha-1"
    }
  }
}
```

### 3.8 测试验证

#### 测试 1：直接参数注入

```bash
# 启动服务器（SSE 模式）
export TAPTAP_MCP_TRANSPORT=sse
export TAPTAP_MCP_PORT=3000
export TAPTAP_MCP_VERBOSE=true
npm start

# 使用 curl 测试参数注入
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_leaderboards",
      "arguments": {
        "page": 1,
        "_mac_token": {
          "kid": "test_kid",
          "mac_key": "test_key",
          "token_type": "mac",
          "mac_algorithm": "hmac-sha-1"
        },
        "_user_id": "test_user",
        "_session_id": "test_session"
      }
    }
  }'
```

#### 测试 2：HTTP Header 注入

```bash
# 启动服务器
export TAPTAP_MCP_TRANSPORT=sse
export TAPTAP_MCP_PORT=3000
export TAPTAP_MCP_VERBOSE=true
npm start

# Base64 编码 MAC Token
TOKEN=$(echo -n '{"kid":"test_kid","mac_key":"test_key","token_type":"mac","mac_algorithm":"hmac-sha-1"}' | base64)

# 测试：第一次请求（初始化会话，获取 session-id）
RESPONSE=$(curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "X-TapTap-Mac-Token: $TOKEN" \
  -D /tmp/headers.txt \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

# 从响应 header 提取 session-id
SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers.txt | cut -d: -f2 | tr -d ' \r\n')

# 测试：后续请求（使用 session-id）
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "X-TapTap-Mac-Token: $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_leaderboards",
      "arguments": {
        "page": 1
      }
    }
  }'
```

**验证要点：**

1. ✅ 工具调用成功（使用了注入的 `_mac_token`）
2. ✅ 日志中不显示私有参数（`_mac_token`, `_user_id` 被自动移除）
3. ✅ Handler 能够访问 `context.macToken`
4. ✅ HTTP Header 方式在 arguments 中没有 `_mac_token` 时生效
5. ✅ 优先级正确：arguments > header > context > global

---

## 4. 开发 MCP Proxy

### 4.1 部署 TapTap MCP Server

#### 方式 1：独立打包（推荐，v1.5.0+）

```bash
# 克隆仓库
git clone https://github.com/taptap/taptap-minigame-mcp-server.git
cd taptap-minigame-mcp-server

# 构建独立打包
npm run build:bundle

# 部署（只需这一个文件）
cp dist/bundle/mcp-server-bundle.js /your/deployment/path/

# 启动 SSE 模式（推荐用于 Proxy）
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3001 \
TAPTAP_MCP_CLIENT_SECRET=your_secret \
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
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3001 \
npx @mikoto_zero/minigame-open-mcp
```

### 4.2 基础实现示例

#### 最小可行 Proxy

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

### 4.3 断线重连机制

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

### 4.4 部署

#### 推荐架构（stdio 模式）

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
      - TAPTAP_MCP_TRANSPORT=sse
      - TAPTAP_MCP_PORT=3001
      - TAPTAP_MCP_CLIENT_SECRET=${CLIENT_TOKEN}
    restart: unless-stopped
```

### 4.5 错误处理

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

### 4.6 测试

```bash
# 1. 启动 TapTap Server
TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3001 node mcp-server-bundle.js

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
TAPTAP_MCP_VERBOSE=true TAPTAP_MCP_TRANSPORT=sse TAPTAP_MCP_PORT=3001 node mcp-server-bundle.js
```

### 4.7 常见问题

#### Q1: 私有参数会暴露给 AI Agent 吗？

**不会。** 私有参数只在 Proxy 和 Server 之间传递，`tools/list` 返回的工具定义中不包含这些参数。

#### Q2: 多租户是如何隔离的？

TapTap MCP Server 根据 `_user_id` 和 `_tenant_id` 自动隔离缓存和临时文件：
```
/tmp/taptap-mcp/cache/user_123/project_a/app.json
/tmp/taptap-mcp/cache/user_456/project_b/app.json
```

#### Q3: 必须传 `_tenant_id` 吗？

不是必需的。如果不传，会使用 `global` 目录：
```
/tmp/taptap-mcp/cache/user_123/global/app.json
```

#### Q4: Proxy 如何获取用户的 MAC Token？

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

#### Q5: 为什么 Proxy → Server 必须用 HTTP？

因为需要支持：
- ✅ **断线重连** - HTTP 客户端可以自动重连
- ✅ **多客户端** - 一个 Server 实例支持多个 Proxy
- ✅ **跨网络部署** - Proxy 和 Server 可以在不同机器

#### Q6: 为什么 Agent → Proxy 推荐用 stdio？

因为：
- ✅ **本地连接** - Agent 和 Proxy 通常在同一机器
- ✅ **配置简单** - 不需要网络配置
- ✅ **性能更好** - 无网络开销

---

## 5. 客户端配置

### 5.1 配置原理

#### 架构说明

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

#### 配置要点

1. **命令**：`node` 或 `npx`
2. **参数**：
   - Proxy 入口文件路径
   - JSON 配置字符串
3. **配置格式**：单行 JSON（必须转义引号）

### 5.2 VS Code 配置

#### 方式 1：使用全局安装的 Proxy

**安装 Proxy**：
```bash
npm install -g @mikoto_zero/minigame-open-mcp@latest
```

**配置 `.vscode/settings.json`**：
```json
{
  "mcp.servers": {
    "taptap": {
      "command": "taptap-mcp-proxy",
      "args": [
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\",\"project_path\":\"/Users/you/workspace\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"},\"options\":{\"verbose\":false}}"
      ]
    }
  }
}
```

#### 方式 2：使用 npx（无需安装）

```json
{
  "mcp.servers": {
    "taptap": {
      "command": "npx",
      "args": [
        "-y",
        "@mikoto_zero/minigame-open-mcp@latest",
        "taptap-mcp-proxy",
        "{\"server\":{\"url\":\"http://localhost:5003\",\"env\":\"rnd\"},\"tenant\":{\"user_id\":\"your-user-id\",\"project_id\":\"your-project-id\"},\"auth\":{\"kid\":\"your_kid\",\"mac_key\":\"your_mac_key\",\"token_type\":\"mac\",\"mac_algorithm\":\"hmac-sha-1\"}}"
      ]
    }
  }
}
```

#### 方式 3：使用本地编译的 Proxy（开发）

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

### 5.3 Claude Desktop 配置

#### macOS

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

#### Windows

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

### 5.4 Cursor 配置

#### 项目级配置

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

### 5.5 配置生成器

#### 手动生成配置

**步骤 1：准备你的信息**
```javascript
const config = {
  server: {
    url: "http://localhost:5003",  // MCP Server 地址
    env: "rnd"                     // rnd | production
  },
  tenant: {
    user_id: "your-user-id",       // 你的用户 ID（用于标识租户）
    project_id: "your-project-id", // 你的项目 ID（用于标识租户）
    project_path: "/workspace",  // Docker 中的工作空间挂载点（默认 /workspace）
    project_path: "Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"  // 项目相对于 workspace 的路径（可选）
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

### 5.6 路径配置说明

#### `_project_path` 计算逻辑

Proxy 会自动计算 `_project_path` 并注入到请求中，供 MCP Server 使用（例如读取用户代码、压缩上传 H5 游戏等）。

**计算规则：**

1. **优先使用 `project_path`**（推荐）：
   ```javascript
   // 配置
   {
     tenant: {
       project_path: "/workspace",
       project_path: "Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"
     }
   }

   // 结果
   _project_path = "/workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"
   ```

2. **回退到 `userId/projectId`**（兼容旧配置）：
   ```javascript
   // 配置
   {
     tenant: {
       project_path: "/workspace",
       user_id: "mikoto",
       project_id: "minigame_h5_demo"
     }
   }

   // 结果
   _project_path = "/workspace/mikoto/minigame_h5_demo"
   ```

**最佳实践：**

- **在 Docker 部署时**：使用 `project_path`
  - workspace 挂载：`/Users/mikoto` → `/workspace`
  - 项目路径：`/Users/mikoto/Documents/.../minigame_h5_demo`
  - 配置：`project_path: "Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"`

- **在本地开发时**：可以省略 `project_path`
  - 使用默认的 `userId/projectId` 拼接即可

### 5.7 获取 MAC Token

#### 方式 1：通过 MCP Server OAuth（推荐）

```bash
# 1. 本地启动 MCP Server
TAPTAP_MCP_TRANSPORT=stdio npx @mikoto_zero/minigame-open-mcp

# 2. 在客户端调用需要认证的工具
# 3. 扫描二维码授权
# 4. Token 自动保存到 ~/.config/taptap-minigame/token.json

# 5. 读取 Token
cat ~/.config/taptap-minigame/token.json
```

#### 方式 2：通过 TapCode 平台

如果你在 TapCode 平台已授权：
```bash
# 从数据库或 API 获取你的 MAC Token
# 包含 kid, mac_key, token_type, mac_algorithm
```

### 5.8 配置验证

#### 检查 Proxy 是否正常工作

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

### 5.9 故障排查

#### 问题 1：Proxy 无法启动

**症状**：
```
Error: No configuration provided
```

**解决**：
检查 JSON 配置是否正确：
- ✅ 必须是单行字符串
- ✅ 双引号必须转义（`\"`）
- ✅ 不能有换行符

#### 问题 2：无法连接 MCP Server

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

#### 问题 3：Token 无效

**症状**：
```
HTTP 403 - Authorization failed
```

**解决**：
1. 检查 `auth.kid` 和 `auth.mac_key` 是否正确
2. 确认 Token 未过期
3. 验证 `token_type` 和 `mac_algorithm` 是否正确

---

## 6. Standalone Proxy

### 6.1 概述

`dist/proxy.js` 是一个**完全独立的单文件**，可以在没有 `node_modules` 的环境中直接运行。

**特性：**
- ✅ 无依赖（所有依赖已内联）
- ✅ 单文件（约 520KB）
- ✅ 直接运行：`node proxy.js`
- ✅ 跨平台（Node.js 16+）

### 6.2 获取文件

#### 方式 1：从 npm 包中提取

```bash
# 安装 npm 包
npm install @mikoto_zero/minigame-open-mcp

# 文件位置
node_modules/@mikoto_zero/minigame-open-mcp/dist/proxy.js
```

#### 方式 2：从本地构建

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

### 6.3 使用方式

#### 方式 1：命令行参数

```bash
node proxy.js '{"server":{"url":"http://localhost:3000"},"tenant":{"project_path":"."},"auth":{"kid":"your_kid","mac_key":"your_key","token_type":"mac","mac_algorithm":"hmac-sha-1"}}'
```

#### 方式 2：标准输入（推荐）

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

#### 方式 3：环境变量

```bash
export PROXY_CONFIG='{"server":{"url":"http://localhost:3000"},"auth":{...}}'
node proxy.js
```

### 6.4 配置说明

#### 必需字段

- `server.url` - TapTap MCP Server 地址
- `auth.kid` - MAC Token kid
- `auth.mac_key` - MAC Token key

#### 可选字段

- `server.env` - 环境选择（`rnd` 或 `production`，默认 `rnd`）
- `tenant.project_path` - 项目路径（相对路径，默认 `.`）
- `tenant.user_id` - 用户标识符（可选，仅用于日志）
- `tenant.project_id` - 项目标识符（可选，仅用于日志）
- `options.verbose` - 详细日志模式（默认 `false`）
- `options.reconnect_interval` - 重连间隔（毫秒，默认 `5000`）
- `options.request_timeout` - 请求超时（毫秒，默认 `30000`）

### 6.5 部署场景

#### 场景 1：OpenHands / Claude Code

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

#### 场景 2：Docker 容器

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

#### 场景 3：无 npm 环境

在只有 Node.js 而没有 npm 的环境中：

```bash
# 1. 复制 proxy.js 到目标机器
scp dist/proxy.js user@server:/opt/proxy.js

# 2. SSH 登录后直接运行
cat config.json | node /opt/proxy.js
```

### 6.6 验证安装

```bash
# 测试配置加载（应显示配置错误）
echo 'invalid' | node proxy.js

# 预期输出：
# [Proxy] Loading config from stdin
# [Proxy] Fatal error: Failed to parse configuration JSON: ...
```

### 6.7 常见问题

#### Q1：如何更新到新版本？

只需替换 `proxy.js` 文件：

```bash
npm install @mikoto_zero/minigame-open-mcp@latest
cp node_modules/@mikoto_zero/minigame-open-mcp/dist/proxy.js ./proxy.js
```

#### Q2：可以压缩文件吗？

可以，但不推荐。文件已经通过 tree-shaking 优化，压缩后体积减少不多，但可读性变差：

```bash
# 使用压缩版本
npm run build:proxy -- --minify
```

#### Q3：如何调试？

启用详细日志：

```json
{
  "options": {
    "verbose": true
  }
}
```

日志输出到 `stderr`，不影响 MCP 通信（stdin/stdout）。

#### Q4：文件太大怎么办？

520KB 的文件对于现代网络和存储来说非常小。如果确实需要减小：

1. **使用原始方式**（需要 `node_modules`）：`npx @mikoto_zero/minigame-open-mcp`
2. **压缩传输**：`gzip proxy.js`（可减小到约 120KB）

---

## 7. TapCode 集成示例

### 7.1 架构概览

```
┌─────────────────────────────────────────────────────────┐
│ TapCode 平台服务器                                       │
│                                                         │
│  1. npm install @mikoto_zero/minigame-open-mcp         │
│  2. 生成 JSON 配置 + MAC Token                         │
│  3. 挂载 dist/mcp-proxy/ 到用户容器                    │
└─────────────────────────────────────────────────────────┘
           │
           │ Docker Volume Mount
           ↓
┌─────────────────────────────────────────────────────────┐
│ 用户容器（Runtime Container）                           │
│                                                         │
│  /workspace/user-123/project-456/  ← 用户代码（只读）   │
│  /srv/mcp-proxy/                   ← Proxy 代码（只读）  │
│    ├── index.js                                         │
│    ├── config.js                                        │
│    ├── proxy.js                                         │
│    └── types.js                                         │
│                                                         │
│  Claude Agent 启动 Proxy:                               │
│    node /srv/mcp-proxy/index.js '{"server":{...}}'     │
└─────────────────────────────────────────────────────────┘
           │
           │ HTTP/SSE
           ↓
┌─────────────────────────────────────────────────────────┐
│ TapTap MCP Server（独立部署）                           │
│  - 地址: http://host.docker.internal:5003              │
│  - 模式: SSE Streaming                                  │
└─────────────────────────────────────────────────────────┘
```

### 7.2 部署步骤

#### 第一步：启动 TapTap MCP Server（Docker）

**Docker Compose 配置**：

```yaml
version: '3.8'

services:
  taptap-mcp-server:
    image: taptap-mcp-server:latest
    container_name: taptap-mcp-server
    restart: unless-stopped

    ports:
      - "5003:3000"  # 主机端口:容器端口

    environment:
      # 传输模式（必需）
      - TAPTAP_MCP_TRANSPORT=sse
      - TAPTAP_MCP_PORT=3000

      # TapTap 环境（必需）
      - TAPTAP_MCP_ENV=rnd  # rnd=测试环境, production=生产环境

      # 客户端配置（必需）
      - TAPTAP_MCP_CLIENT_ID=${TAPTAP_MCP_CLIENT_ID}
      - TAPTAP_MCP_CLIENT_SECRET=${TAPTAP_MCP_CLIENT_SECRET}

      # 日志（可选，推荐开启）
      - TAPTAP_MCP_VERBOSE=true

      # 缓存和临时目录（可选）
      - TAPTAP_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache
      - TAPTAP_MCP_TEMP_DIR=/tmp/taptap-mcp/temp

    volumes:
      # Workspace 根目录（必需，只读）
      - ${WORKSPACE_ROOT}:/workspace:ro

      # 缓存和临时文件（必需，可写）
      - taptap-mcp-cache:/var/lib/taptap-mcp/cache
      - taptap-mcp-temp:/tmp/taptap-mcp/temp

volumes:
  taptap-mcp-cache:
  taptap-mcp-temp:
```

**启动命令**：

```bash
# 设置环境变量
export WORKSPACE_ROOT=/Users/mikoto
export TAPTAP_MCP_CLIENT_ID=m2dnabebip3fpardnm
export TAPTAP_MCP_CLIENT_SECRET=QUmbMoTQm2qJETi53vWnvaXuBiRL3VRkgcUWnBtb
export TAPTAP_MCP_ENV=rnd

# 启动 Docker
docker-compose up -d

# 验证启动
curl http://localhost:5003/health
```

#### 第二步：配置 MCP Proxy（TapCode 代码生成）

**Proxy 配置 JSON 结构**：

```typescript
interface ProxyConfig {
  server: {
    url: string;              // TapTap MCP Server 地址
    env?: 'rnd' | 'production';  // 环境选择
  };
  tenant: {
    user_id: string;          // 用户 ID（TapCode 用户标识）
    project_id: string;       // 项目 ID（TapCode 项目标识）
    project_path?: string;  // Docker 中的挂载点（默认 /workspace）
    project_path?: string;  // 项目相对于 workspace 的路径（推荐）
  };
  auth: {
    kid: string;              // MAC Token kid（从用户授权获取）
    mac_key: string;          // MAC Token mac_key（从用户授权获取）
    token_type: 'mac';
    mac_algorithm: 'hmac-sha-1';
  };
  options?: {
    verbose?: boolean;        // 详细日志（可选）
    reconnect_interval?: number;  // 重连间隔（默认 5000ms）
    monitor_interval?: number;    // 监控间隔（默认 10000ms）
  };
}
```

**配置生成示例（TapCode 后端代码）**：

```typescript
// 在 TapCode 后端生成 Proxy 配置
function generateProxyConfig(user: User, project: Project, macToken: MacToken): string {
  const config = {
    server: {
      url: "http://localhost:5003",  // TapTap MCP Server 地址
      env: "rnd"  // 或 "production"
    },
    tenant: {
      user_id: user.id,                    // TapCode 用户 ID
      project_id: project.id,              // TapCode 项目 ID
      project_path: "/workspace",        // Docker 挂载点（固定）

      // 关键：项目相对于 WORKSPACE_ROOT 的路径
      // 示例：/Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
      //       相对于 /Users/mikoto 的路径是：
      //       Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
      project_path: calculateRelativePath(project.path, WORKSPACE_ROOT)
    },
    auth: {
      kid: macToken.kid,
      mac_key: macToken.mac_key,
      token_type: "mac",
      mac_algorithm: "hmac-sha-1"
    },
    options: {
      verbose: true  // 推荐开启详细日志
    }
  };

  return JSON.stringify(config);
}

// 计算相对路径
function calculateRelativePath(projectPath: string, workspaceRoot: string): string {
  // 示例：
  // projectPath = /Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
  // workspaceRoot = /Users/mikoto
  // 返回：Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo

  return path.relative(workspaceRoot, projectPath);
}
```

**启动 Proxy 子进程（TapCode 后端代码）**：

```typescript
import { spawn } from 'child_process';

function startMCPProxy(user: User, project: Project, macToken: MacToken) {
  const configJson = generateProxyConfig(user, project, macToken);

  // 方式 1：使用 npx（推荐，自动下载最新版本）
  const proxy = spawn('npx', [
    '-y', '-p', '@mikoto_zero/minigame-open-mcp@latest',
    'taptap-mcp-proxy',
    configJson
  ], {
    stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
  });

  // 方式 2：使用本地安装的包
  // const proxy = spawn('taptap-mcp-proxy', [configJson], { stdio: ['pipe', 'pipe', 'pipe'] });

  // 监听 Proxy 日志（stderr）
  proxy.stderr.on('data', (data) => {
    console.log('[Proxy]', data.toString());
  });

  // 与 Proxy 通信（stdin/stdout）
  return proxy;
}
```

### 7.3 路径映射配置

#### 关键概念

**宿主机路径 → Docker 路径映射**

```
宿主机: /Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
         ↓ (Docker 挂载)
Docker:  /workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
```

**配置规则:**

1. **WORKSPACE_ROOT** (环境变量) = 宿主机根路径
   - 示例: `/Users/mikoto`

2. **project_path** (Proxy 配置) = Docker 挂载点
   - 固定值: `/workspace`

3. **project_path** (Proxy 配置) = 项目相对路径
   - 计算: `相对路径 = 项目绝对路径 - WORKSPACE_ROOT`
   - 示例: `Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo`

4. **_project_path** (自动注入) = Docker 中的项目路径
   - 计算: `project_path + project_path`
   - 结果: `/workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo`

### 7.4 完整的 TapCode 集成示例

```typescript
import { spawn } from 'child_process';
import path from 'path';

class TapTapMCPService {
  private dockerProcess: any;
  private proxyProcess: any;

  /**
   * 启动 TapTap MCP Server (Docker)
   */
  async startMCPServer(workspaceRoot: string) {
    const env = {
      WORKSPACE_ROOT: workspaceRoot,
      TAPTAP_MCP_CLIENT_ID: process.env.TAPTAP_CLIENT_ID!,
      TAPTAP_MCP_CLIENT_SECRET: process.env.TAPTAP_CLIENT_SECRET!,
      TAPTAP_MCP_ENV: 'rnd',
      TAPTAP_MCP_VERBOSE: 'true'
    };

    // 启动 Docker Compose
    this.dockerProcess = spawn('docker-compose', ['up', '-d'], {
      env: { ...process.env, ...env },
      cwd: '/path/to/taptap-mcp-docker'
    });

    // 等待服务启动
    await this.waitForHealthCheck('http://localhost:5003/health');
  }

  /**
   * 启动 MCP Proxy（为每个用户/项目）
   */
  async startProxy(user: User, project: Project, macToken: MacToken) {
    // 1. 计算项目相对路径
    const workspaceRoot = '/Users/mikoto';  // 从配置读取
    const projectRelativePath = path.relative(workspaceRoot, project.absolutePath);

    // 2. 生成配置
    const config = {
      server: {
        url: "http://localhost:5003",
        env: "rnd"
      },
      tenant: {
        user_id: user.id,
        project_id: project.id,
        project_path: "/workspace",
        project_path: projectRelativePath  // 关键字段
      },
      auth: macToken,
      options: { verbose: true }
    };

    const configJson = JSON.stringify(config);

    // 3. 启动 Proxy 子进程
    this.proxyProcess = spawn('npx', [
      '-y', '-p', '@mikoto_zero/minigame-open-mcp@latest',
      'taptap-mcp-proxy',
      configJson
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 4. 监听 Proxy 日志
    this.proxyProcess.stderr.on('data', (data) => {
      console.log('[Proxy]', data.toString());
    });

    return this.proxyProcess;
  }

  /**
   * 健康检查
   */
  private async waitForHealthCheck(url: string, maxRetries = 10) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('MCP Server failed to start');
  }
}
```

### 7.5 验证和调试

#### 验证 MCP Server 启动

```bash
# 检查容器状态
docker ps | grep taptap-mcp-server

# 查看容器日志
docker logs taptap-mcp-server

# 健康检查
curl http://localhost:5003/health
```

**正常启动日志示例:**
```
🚀 TapTap Open API MCP Server v1.5.0 (Minigame & H5)
🔌 Transport: Streamable HTTP (SSE Streaming)
📁 Workspace: /workspace ✅
🔍 Verbose logging enabled (TAPTAP_MCP_VERBOSE=true)
```

#### 验证 Proxy 配置

**Proxy 启动日志应显示:**

```
[Proxy] Configuration loaded successfully
[Proxy] Server: http://localhost:5003
[Proxy] Environment: rnd
[Proxy] Project: minigame_h5_demo
[Proxy] User: mikoto
[Proxy] Workspace: /workspace
[Proxy] Project Relative Path: Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo  ← 关键
[Proxy] Verbose: true
[Proxy] ✅ Connected to TapTap MCP Server
```

**如果缺少 `Project Relative Path` 这一行**，说明配置 JSON 中没有 `project_path` 字段。

#### 验证工具调用

**Proxy 注入日志:**
```
[Proxy] Tool call: h5_game_uploader
[Proxy] Injected: _mac_token (kid: 1/L5cZb7oqwK...)
[Proxy] Injected: _project_path = /workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
```

**MCP Server 日志:**
```
🔐 Private Params:
{
  "_mac_token": { ... },
  "_project_path": "/workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo",
  "_user_id": "mikoto"
}
```

### 7.6 常见问题

#### Q1: 项目路径不存在错误

**错误信息:**
```
目录不存在：/workspace/mikoto/minigame_h5_demo
```

**原因:** 缺少 `project_path` 配置

**解决:** 在 Proxy 配置中添加 `project_path` 字段

#### Q2: MAC Token 认证失败

**错误信息:**
```
invalid self-contained access token
```

**原因:** MAC Token 已过期或无效

**解决:** 从 TapCode 数据库获取用户最新的 MAC Token

#### Q3: Workspace 未挂载

**错误信息:**
```
📁 Workspace: /workspace ❌
```

**原因:** Docker 环境变量 `WORKSPACE_ROOT` 未设置

**解决:** 启动 Docker 时设置 `WORKSPACE_ROOT` 环境变量

#### Q4: 私有参数未注入

**症状:** MCP Server 触发 OAuth 授权流程

**原因:** Proxy 配置中缺少 `auth` 字段或 token 格式错误

**解决:** 检查 Proxy 配置 JSON 的 `auth` 字段是否完整

---

## 8. 相关文档

- [README.md](../README.md) - TapTap MCP Server 完整文档
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署指南
- [PATH_RESOLUTION.md](./PATH_RESOLUTION.md) - 路径解析说明
- [GitHub Issues](https://github.com/taptap/taptap-minigame-mcp-server/issues) - 技术支持

---

**需要帮助？** 提交 Issue：https://github.com/taptap/taptap-minigame-mcp-server/issues
