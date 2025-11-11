# MCP Proxy 开发指引

## 概述

本文档提供基于 TapTap Minigame MCP Server 的 MCP Proxy 开发指引。

MCP Proxy 作为中间层，负责管理多个用户的 MAC Token，并将认证信息注入到 MCP Server 的工具调用中，实现多账号、多租户支持。

## 架构设计

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   AI Agent  │────────▶│  MCP Proxy  │────────▶│ MCP Server  │
│  (Claude)   │  无感   │ (注入 Token)│  带Token │  (TapTap)   │
└─────────────┘         └─────────────┘         └─────────────┘
                             │
                             │ Token 管理
                             ↓
                        ┌─────────────┐
                        │   Token     │
                        │   Store     │
                        │ (Redis/DB)  │
                        └─────────────┘
```

## 核心功能

### 1. Token 管理

MCP Proxy 需要维护一个 Token Store，存储每个用户的 MAC Token：

```typescript
interface TokenStore {
  // 获取用户的 MAC Token
  getToken(userId: string): Promise<MacToken | null>;

  // 保存用户的 MAC Token
  setToken(userId: string, token: MacToken): Promise<void>;

  // 删除用户的 MAC Token
  deleteToken(userId: string): Promise<void>;
}

interface MacToken {
  kid: string;
  mac_key: string;
  token_type: "mac";
  mac_algorithm: "hmac-sha-1";
}
```

### 2. 工具调用拦截

拦截 AI Agent 的工具调用，注入 MAC Token：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

class MCPProxy {
  private mcpClient: Client;  // 连接到 TapTap MCP Server
  private mcpServer: Server;  // 暴露给 AI Agent
  private tokenStore: TokenStore;

  async handleToolCall(request: any, userId: string) {
    const { name, arguments: args } = request.params;

    // 从 Token Store 获取用户的 MAC Token
    const macToken = await this.tokenStore.getToken(userId);

    // 方式1: 参数注入（推荐）
    const enrichedArgs = {
      ...args,
      _mac_token: macToken
    };

    // 转发到 TapTap MCP Server
    return this.mcpClient.request({
      method: 'tools/call',
      params: {
        name,
        arguments: enrichedArgs
      }
    });
  }
}
```

### 3. 工具列表透传

直接透传 TapTap MCP Server 的工具定义（已经不包含私有参数）：

```typescript
async listTools() {
  // 从 TapTap MCP Server 获取工具列表
  const result = await this.mcpClient.request({
    method: 'tools/list'
  });

  // TapTap Server 的工具定义中不声明私有参数
  // Proxy 只需直接透传，无需任何处理
  return result;
}
```

**重要说明：**
- ✅ TapTap MCP Server v1.3.0 的工具定义中**不包含**私有参数
- ✅ AI Agent 看到的是干净的业务参数
- ✅ Proxy 只需负责在调用时注入 `_mac_token`

## 实现示例

### 基础 MCP Proxy

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class TapTapMCPProxy {
  private client: Client;
  private server: Server;
  private tokenStore: Map<string, MacToken>;

  constructor() {
    this.client = new Client(
      { name: 'taptap-proxy-client', version: '1.0.0' },
      { capabilities: {} }
    );

    this.server = new Server(
      { name: 'taptap-proxy-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.tokenStore = new Map();
  }

  async start() {
    // 连接到 TapTap MCP Server（后端）
    const clientTransport = new StdioClientTransport({
      command: 'npx',
      args: ['@mikoto_zero/minigame-open-mcp'],
      env: {
        TDS_MCP_TRANSPORT: 'stdio',
        // 不设置 TDS_MCP_MAC_TOKEN，让 Proxy 动态注入
      }
    });
    await this.client.connect(clientTransport);

    // 暴露给 AI Agent（前端）
    const serverTransport = new StdioServerTransport();
    await this.server.connect(serverTransport);

    // 设置处理器
    this.setupHandlers();
  }

  private setupHandlers() {
    // 转发 tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
    });

    // 拦截 tools/call 并注入 token
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // 从当前会话获取 userId（需要你实现）
      const userId = this.getCurrentUserId();

      // 获取用户的 MAC Token
      const macToken = this.tokenStore.get(userId);

      // 注入私有参数
      const enrichedArgs = macToken
        ? { ...args, _mac_token: macToken }
        : args;

      // 转发到 TapTap MCP Server
      return this.client.request({
        method: 'tools/call',
        params: {
          name,
          arguments: enrichedArgs
        }
      }, CallToolResultSchema);
    });
  }

  private getCurrentUserId(): string {
    // TODO: 实现用户识别逻辑
    // 可以从：
    // - HTTP Session
    // - JWT Token
    // - Request Header
    return 'default_user';
  }
}

// 启动 Proxy
const proxy = new TapTapMCPProxy();
proxy.start();
```

### HTTP/SSE 模式 Proxy

```typescript
import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import http from 'node:http';

class TapTapHTTPProxy {
  async start() {
    // 连接到 TapTap MCP Server（HTTP 模式）
    const clientTransport = new HttpClientTransport(
      'http://localhost:3001'  // TapTap Server 地址
    );
    await this.client.connect(clientTransport);

    // 创建 HTTP Server（暴露给 AI Agent）
    const httpServer = http.createServer(async (req, res) => {
      // 从请求中提取用户信息
      const userId = this.extractUserId(req);
      const macToken = await this.tokenStore.getToken(userId);

      // 方式1: 通过 Header 注入（推荐）
      req.headers['x-taptap-mac-token'] = Buffer.from(
        JSON.stringify(macToken)
      ).toString('base64');

      // 转发请求到 TapTap Server
      // ... (使用 proxy 或直接调用 client)
    });

    httpServer.listen(3000);
  }

  private extractUserId(req: http.IncomingMessage): string {
    // 从 JWT、Session、Header 等提取用户ID
    const auth = req.headers.authorization;
    // ... 解析逻辑
    return 'user_123';
  }
}
```

## 注入方式选择

### 方式 1：直接参数注入（推荐）

**适用场景：**
- 每次调用使用不同 Token
- 需要精确控制每个请求的认证

**优点：**
- ✅ 灵活性最高
- ✅ 适用所有传输模式（stdio/SSE/HTTP）
- ✅ 不依赖 Session

**实现：**
```typescript
const enrichedArgs = {
  ...originalArgs,
  _mac_token: await tokenStore.getToken(userId)
};
```

### 方式 2：HTTP Header 注入

**适用场景：**
- 会话级认证（整个会话使用同一Token）
- API Gateway 场景

**优点：**
- ✅ 减少重复传递
- ✅ 会话级管理

**限制：**
- ⚠️ 仅 HTTP/SSE 模式
- ⚠️ 需要 Mcp-Session-Id

**实现：**
```typescript
req.headers['x-taptap-mac-token'] = base64Token;
req.headers['mcp-session-id'] = sessionId;
```

## Token Store 实现

### 内存存储（开发/测试）

```typescript
class InMemoryTokenStore implements TokenStore {
  private tokens = new Map<string, MacToken>();

  async getToken(userId: string): Promise<MacToken | null> {
    return this.tokens.get(userId) || null;
  }

  async setToken(userId: string, token: MacToken): Promise<void> {
    this.tokens.set(userId, token);
  }

  async deleteToken(userId: string): Promise<void> {
    this.tokens.delete(userId);
  }
}
```

### Redis 存储（生产环境）

```typescript
import { createClient } from 'redis';

class RedisTokenStore implements TokenStore {
  private redis: ReturnType<typeof createClient>;

  constructor(redisUrl: string) {
    this.redis = createClient({ url: redisUrl });
  }

  async getToken(userId: string): Promise<MacToken | null> {
    const data = await this.redis.get(`token:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async setToken(userId: string, token: MacToken): Promise<void> {
    await this.redis.set(
      `token:${userId}`,
      JSON.stringify(token),
      { EX: 86400 * 30 }  // 30 天过期
    );
  }

  async deleteToken(userId: string): Promise<void> {
    await this.redis.del(`token:${userId}`);
  }
}
```

## 用户识别

### JWT Token 识别

```typescript
import jwt from 'jsonwebtoken';

function extractUserFromJWT(req: http.IncomingMessage): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    throw new Error('Missing authorization');
  }

  const token = auth.substring(7);
  const payload = jwt.verify(token, SECRET_KEY) as { sub: string };
  return payload.sub;  // 用户ID
}
```

### Session Cookie 识别

```typescript
import session from 'express-session';

app.use(session({
  secret: SECRET_KEY,
  resave: false,
  saveUninitialized: false
}));

function extractUserFromSession(req: any): string {
  if (!req.session?.userId) {
    throw new Error('Not authenticated');
  }
  return req.session.userId;
}
```

## 完整示例项目

### 目录结构

```
mcp-proxy/
├── src/
│   ├── proxy.ts          # Proxy 主逻辑
│   ├── tokenStore.ts     # Token 存储
│   ├── auth.ts           # 用户认证
│   └── types.ts          # 类型定义
├── package.json
└── tsconfig.json
```

### package.json

```json
{
  "name": "taptap-mcp-proxy",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "@mikoto_zero/minigame-open-mcp": "^1.3.0",
    "redis": "^4.0.0",
    "express": "^4.18.0",
    "express-session": "^1.17.0"
  }
}
```

### 启动 Proxy

```bash
# 开发模式
npm run dev

# 生产模式
export REDIS_URL=redis://localhost:6379
export SECRET_KEY=your_secret
npm start
```

## 测试

### 测试 Token 注入

```bash
# 1. 设置测试 Token
curl -X POST http://localhost:3000/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "token": {
      "kid": "xxx",
      "mac_key": "xxx",
      "token_type": "mac",
      "mac_algorithm": "hmac-sha-1"
    }
  }'

# 2. 调用工具（Proxy 自动注入）
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer user_jwt_token" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_leaderboards",
      "arguments": { "page": 1 }
    }
  }'

# 3. 验证：检查 TapTap Server 日志，确认使用了正确的 Token
```

## 安全考虑

### 1. Token 加密存储

```typescript
import crypto from 'crypto';

class EncryptedTokenStore {
  private encryptionKey: Buffer;

  constructor(key: string) {
    this.encryptionKey = Buffer.from(key, 'hex');
  }

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  private decrypt(encrypted: string): string {
    const buffer = Buffer.from(encrypted, 'base64');
    const iv = buffer.slice(0, 16);
    const tag = buffer.slice(16, 32);
    const data = buffer.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  }

  async setToken(userId: string, token: MacToken): Promise<void> {
    const encrypted = this.encrypt(JSON.stringify(token));
    await this.redis.set(`token:${userId}`, encrypted);
  }

  async getToken(userId: string): Promise<MacToken | null> {
    const encrypted = await this.redis.get(`token:${userId}`);
    if (!encrypted) return null;
    const decrypted = this.decrypt(encrypted);
    return JSON.parse(decrypted);
  }
}
```

### 2. Token 过期管理

```typescript
interface StoredToken {
  token: MacToken;
  expiresAt: number;  // Unix timestamp
}

class ExpiringTokenStore {
  async setToken(userId: string, token: MacToken, ttl: number = 2592000): Promise<void> {
    const stored: StoredToken = {
      token,
      expiresAt: Date.now() + ttl * 1000
    };
    await this.redis.set(`token:${userId}`, JSON.stringify(stored), { EX: ttl });
  }

  async getToken(userId: string): Promise<MacToken | null> {
    const data = await this.redis.get(`token:${userId}`);
    if (!data) return null;

    const stored: StoredToken = JSON.parse(data);

    // 检查是否过期
    if (Date.now() > stored.expiresAt) {
      await this.deleteToken(userId);
      return null;
    }

    return stored.token;
  }
}
```

### 3. 审计日志

```typescript
class AuditLogger {
  async logTokenInjection(userId: string, toolName: string, tokenKid: string) {
    console.log({
      event: 'token_injection',
      timestamp: new Date().toISOString(),
      userId,
      toolName,
      tokenKid: tokenKid.substring(0, 8) + '...',  // 脱敏
    });
  }

  async logToolCall(userId: string, toolName: string, success: boolean) {
    console.log({
      event: 'tool_call',
      timestamp: new Date().toISOString(),
      userId,
      toolName,
      success
    });
  }
}
```

## 部署

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist

ENV TAPTAP_SERVER_URL=http://taptap-mcp:3001
ENV REDIS_URL=redis://redis:6379

CMD ["node", "dist/proxy.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  # MCP Proxy
  proxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TAPTAP_SERVER_URL=http://taptap-server:3001
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - taptap-server

  # TapTap MCP Server
  taptap-server:
    image: node:18-alpine
    command: npx @mikoto_zero/minigame-open-mcp
    ports:
      - "3001:3001"
    environment:
      - TDS_MCP_TRANSPORT=sse
      - TDS_MCP_PORT=3001
      - TDS_MCP_CLIENT_TOKEN=${CLIENT_TOKEN}

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## 最佳实践

### 1. Token 刷新机制

```typescript
class TokenRefreshProxy extends MCPProxy {
  async handleToolCall(request: any, userId: string) {
    let token = await this.tokenStore.getToken(userId);

    // 如果 token 即将过期，提前刷新
    if (token && this.isTokenExpiringSoon(token)) {
      token = await this.refreshToken(userId);
    }

    // 注入并转发
    return super.handleToolCall(request, userId);
  }

  private isTokenExpiringSoon(token: MacToken): boolean {
    // 实现过期检测逻辑
    return false;
  }

  private async refreshToken(userId: string): Promise<MacToken> {
    // 实现 token 刷新逻辑
    throw new Error('Not implemented');
  }
}
```

### 2. 错误处理

```typescript
async handleToolCall(request: any, userId: string) {
  try {
    const result = await this.callWithToken(request, userId);
    return result;
  } catch (error) {
    // 检查是否是认证错误
    if (this.isAuthError(error)) {
      // 清除过期 token
      await this.tokenStore.deleteToken(userId);

      // 返回友好错误
      throw new McpError(
        ErrorCode.InternalError,
        `认证已过期，请重新授权\n\n` +
        `用户: ${userId}\n` +
        `建议：调用 OAuth 授权流程获取新 token`
      );
    }
    throw error;
  }
}

private isAuthError(error: any): boolean {
  return error.message?.includes('授权已失效') ||
         error.message?.includes('access_denied') ||
         error.code === 401;
}
```

### 3. 监控和指标

```typescript
class ProxyMetrics {
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    tokenInjections: 0,
    activeUsers: new Set<string>()
  };

  trackRequest(success: boolean) {
    this.metrics.totalRequests++;
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
  }

  trackTokenInjection(userId: string) {
    this.metrics.tokenInjections++;
    this.metrics.activeUsers.add(userId);
  }

  getStats() {
    return {
      ...this.metrics,
      activeUsers: this.metrics.activeUsers.size,
      successRate: this.metrics.successfulRequests / this.metrics.totalRequests
    };
  }
}
```

## 故障排查

### 问题 1：Token 未注入

**检查清单：**
- ✅ Token Store 中有该用户的 token？
- ✅ 用户ID 识别正确？
- ✅ 私有参数格式正确？
- ✅ Proxy 正确连接到 TapTap Server？

### 问题 2：认证失败

**检查清单：**
- ✅ Token 是否有效（kid, mac_key 正确）？
- ✅ Token 是否过期？
- ✅ TapTap Server 是否正常运行？

### 问题 3：性能问题

**优化建议：**
- ✅ 使用连接池（Redis, HTTP）
- ✅ 缓存工具列表（避免重复请求）
- ✅ 使用 HTTP/2（如果可能）

## 相关文档

- [PRIVATE_PROTOCOL.md](PRIVATE_PROTOCOL.md) - 私有参数协议详细规范
- [README.md](README.md) - TapTap MCP Server 用户文档
- [CLAUDE.md](CLAUDE.md) - 开发指南

## 示例代码仓库

完整的 MCP Proxy 示例代码即将开源，敬请期待！

---

**需要帮助？** 提交 Issue：https://github.com/你的仓库/issues
