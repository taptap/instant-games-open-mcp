# MCP Server Private Parameter Protocol

## 概述

本文档描述 TapTap Minigame MCP Server 与 MCP Proxy 之间的**私有参数协议**（Private Parameter Protocol）。

这个协议允许 MCP Proxy 向工具调用注入额外的认证和元数据参数，而这些参数**不会出现在工具的公开定义中**，对 AI Agent 完全透明。

## 🎯 设计目标

1. **对 AI Agent 透明**：AI Agent 只看到业务参数，不需要关心认证细节
2. **多账号支持**：不同的工具调用可以使用不同的 MAC Token
3. **灵活扩展**：支持添加更多私有参数（用户ID、会话ID等）
4. **安全性**：私有参数在日志中自动脱敏
5. **向后兼容**：不影响现有的 OAuth 认证流程

## 📝 私有参数规范

所有私有参数使用**下划线前缀** (`_`) 来区分业务参数。

### 支持的私有参数

| 参数名 | 类型 | 描述 | 优先级 |
|--------|------|------|--------|
| `_mac_token` | `MacToken` | 用户认证 Token | 高（覆盖 context 和全局） |
| `_user_id` | `string` | 多租户用户标识 | - |
| `_session_id` | `string` | 请求追踪和调试 | - |

### MacToken 类型定义

```typescript
interface MacToken {
  kid: string;          // MAC key identifier
  mac_key: string;      // MAC key for signing
  token_type: "mac";    // Token type
  mac_algorithm: "hmac-sha-1"; // MAC algorithm
}
```

## 🔄 工作流程

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

## 💉 注入方式

### 方式 1：直接参数注入（推荐）

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
      "_session_id": "session_xyz"
    }
  }
}
```

### 方式 2：HTTP Header 注入（仅 HTTP/SSE 模式）

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
# 输出: eyJraWQiOiJhYmMxMjMiLCJtYWNfa2V5Ijoic2VjcmV0IiwidG9rZW5fdHlwZSI6Im1hYyIsIm1hY19hbGdvcml0aG0iOiJobWFjLXNoYTEifQ==
```

**重要说明：**

- **优先级**：`arguments._mac_token` > HTTP Header > context/global token
- **仅 HTTP/SSE 模式**：stdio 模式不支持 HTTP Header 注入
- **会话绑定**：Header 中的 token 绑定到 `Mcp-Session-Id`，整个会话期间有效

## 🔐 认证优先级

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

**示例：**

```typescript
// 场景1: Proxy 注入 Token
const args = {
  page: 1,
  _mac_token: { kid: "proxy_token", ... }
};
// 使用: proxy_token

// 场景2: 仅 Context Token
const args = { page: 1 };
const context = { macToken: { kid: "context_token", ... } };
// 使用: context_token

// 场景3: 仅全局 Token
const args = { page: 1 };
const context = {};
// 使用: ApiConfig.getInstance().macToken
```

## 🛡️ 安全性

### 1. 日志脱敏

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

### 2. JSON Schema 验证

- 私有参数**不在** `inputSchema.properties` 中声明
- 默认 `additionalProperties` 为 `true`，允许额外参数通过
- AI Agent 看到的工具定义不包含私有参数

### 3. TypeScript 类型安全

```typescript
import type { PrivateToolParams } from '../../core/types/privateParams.js';

// Handler 类型定义
handler: async (
  args: { page: number } & PrivateToolParams,  // TypeScript 知道私有参数存在
  context
) => {
  // args._mac_token 可以安全访问
}
```

## 📚 实现示例

### Tool Definition（对外）

```typescript
{
  definition: {
    name: 'list_leaderboards',
    description: 'List all leaderboards',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' }
        // 不声明 _mac_token
      }
    }
  },
  handler: async (
    args: { page: number } & PrivateToolParams,
    context
  ) => {
    // 使用 getEffectiveContext 自动处理优先级
    return leaderboardHandlers.listLeaderboards(
      args,
      getEffectiveContext(args, context)
    );
  }
}
```

### MCP Proxy 示例代码

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

class MCPProxy {
  private tokenStore: Map<string, MacToken>;

  async handleToolCall(request: any) {
    const { name, arguments: args } = request.params;

    // 从 token store 获取用户的 MAC Token
    const userId = extractUserId(request); // 从 session/auth 提取
    const macToken = this.tokenStore.get(userId);

    // 注入私有参数
    const enrichedArgs = {
      ...args,
      _mac_token: macToken,
      _user_id: userId,
      _session_id: request.sessionId
    };

    // 转发到真实的 MCP Server
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

## 🧪 测试验证

### 测试 1：直接参数注入（推荐）

```bash
# 启动服务器（SSE 模式）
export TDS_MCP_TRANSPORT=sse
export TDS_MCP_PORT=3000
export TDS_MCP_VERBOSE=true
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

### 测试 2：HTTP Header 注入（仅 HTTP/SSE 模式）

```bash
# 启动服务器
export TDS_MCP_TRANSPORT=sse
export TDS_MCP_PORT=3000
export TDS_MCP_VERBOSE=true
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

### 测试 3：验证优先级

```bash
# 测试：arguments 中的 token 优先于 header
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "X-TapTap-Mac-Token: $TOKEN_FROM_HEADER" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "list_leaderboards",
      "arguments": {
        "page": 1,
        "_mac_token": {
          "kid": "from_arguments",
          "mac_key": "xxx",
          "token_type": "mac",
          "mac_algorithm": "hmac-sha-1"
        }
      }
    }
  }'
# 应该使用 "from_arguments" 这个 token
```

**验证要点：**

1. ✅ 工具调用成功（使用了注入的 `_mac_token`）
2. ✅ 日志中不显示私有参数（`_mac_token`, `_user_id`, `_session_id` 被自动移除）
3. ✅ Handler 能够访问 `args._mac_token`（通过 `getEffectiveContext`）
4. ✅ HTTP Header 方式在 arguments 中没有 `_mac_token` 时生效
5. ✅ 优先级正确：arguments > header > context > global

## 🔧 故障排查

### 问题 1：私有参数未生效

**症状：** `_mac_token` 注入后仍使用全局 Token

**排查步骤：**
1. 检查参数格式是否正确（必须包含 `kid`, `mac_key` 等字段）
2. 检查 TypeScript 类型定义是否包含 `& PrivateToolParams`
3. 检查 handler 是否使用 `getEffectiveContext(args, context)`

### 问题 2：日志中显示敏感信息

**症状：** 日志中看到完整的 `_mac_token`

**排查步骤：**
1. 确认使用的是 `logger.logToolCall()` 而不是 `console.log()`
2. 检查 `stripPrivateParams()` 是否正确导入
3. 验证 `logToolCall` 调用顺序（应在 `mergePrivateParams` 之后）

### 问题 3：Proxy 注入参数格式错误

**症状：** Proxy 注入的私有参数未被识别

**排查步骤：**
1. 确认私有参数在 `arguments` 对象的顶层（不是嵌套对象）
2. 验证 `_mac_token` 包含所有必需字段（`kid`, `mac_key`, `token_type`, `mac_algorithm`）
3. 检查参数名称前缀是否正确（必须是 `_` 下划线开头）

### 问题 4：HTTP Header 注入不生效

**症状：** 通过 `X-TapTap-Mac-Token` header 注入的 token 未被使用

**排查步骤：**
1. 确认使用的是 HTTP/SSE 模式（`TDS_MCP_TRANSPORT=sse` 或 `http`）
2. 检查是否提供了 `Mcp-Session-Id` header（HTTP Header 注入需要 session ID）
3. 验证 Base64 编码是否正确，或直接传 JSON 字符串
4. 检查 CORS 配置是否允许 `X-TapTap-Mac-Token` header
5. 确认 `arguments` 中没有 `_mac_token`（header 的优先级较低）

## 📖 相关文档

- [README.md](../README.md) - 用户文档和使用说明
- [CLAUDE.md](../CLAUDE.md) - 开发指南和架构说明
- [src/core/types/privateParams.ts](src/core/types/privateParams.ts) - 类型定义
- [src/core/utils/handlerHelpers.ts](src/core/utils/handlerHelpers.ts) - Helper 函数

## 🤝 贡献

如果需要添加新的私有参数：

1. 在 `PrivateToolParams` 接口中添加类型定义
2. 更新 `extractPrivateParams()` 和 `stripPrivateParams()` 函数
3. 在 `server.ts` 的 `extractPrivateParamsFromHeaders()` 中添加 header 支持
4. 更新本文档

## ⚠️ 重要提醒

- **私有参数协议是内部约定**：不是 MCP 标准的一部分
- **仅用于受信任的 Proxy**：不应在不受信任的环境中使用
- **定期更新 Token**：建议 MAC Token 有过期时间并定期轮换
- **监控异常**：记录所有私有参数注入行为，便于审计
