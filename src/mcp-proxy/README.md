# TapTap MCP Proxy

TapCode 的 MCP 代理实现，用于连接 AI Agent 和 TapTap MCP Server，自动注入 MAC Token 实现多租户隔离。

## 架构

```
User Space 容器内：
┌─────────────────────────────────┐
│ Claude Agent (主进程)            │
│   ↓ stdio (spawn 子进程)         │
│   ↓ 传递 JSON 配置               │
│ MCP Proxy (子进程)               │
│   - 读取: JSON 配置（内存）      │
│   - 注入: _mac_token             │
│   - 注入: _project_path          │
│   - 注入: _user_id               │
└──────────┬──────────────────────┘
           │ HTTP/SSE
           ↓
    TapTap MCP Server
    (独立服务)
```

## 核心功能

### 1. 透明代理

- **前端**：通过 stdio 暴露给 AI Agent
- **后端**：通过 HTTP/SSE 连接 TapTap MCP Server
- **转发**：tools/list, resources/list, resources/read, tools/call

### 2. 私有参数注入

在 `tools/call` 请求中自动注入：

```typescript
{
  ...originalArgs,
  _mac_token: {
    kid: "...",
    mac_key: "...",
    token_type: "mac",
    mac_algorithm: "hmac-sha-1"
  },
  _project_path: "/workspace/userId/projectId",  // 绝对路径
  _user_id: "userId"
}
```

### 3. 自动重连

- 初始化时直接连接 TapTap Server
- 连接失败时后台自动重连（可配置间隔）
- 重连成功后发送 `notifications/tools/list_changed` 通知 Agent

## 配置方式

### JSON 配置格式

配置通过 JSON 传递（由 TapCode 平台代码生成）：

```json
{
  "server": {
    "url": "http://host.docker.internal:5003",
    "env": "rnd"
  },
  "tenant": {
    "project_path": "project-123/workspace",
    "user_id": "user-456",
    "project_id": "project-123"
  },
  "auth": {
    "kid": "abc123...",
    "mac_key": "xyz789...",
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

### 配置传递方式

**方式 1：命令行参数（推荐）**

```bash
node index.js '{"server":{"url":"..."},"tenant":{...},"auth":{...}}'
```

**方式 2：标准输入**

```bash
echo '{"server":{...}}' | node index.js
```

**方式 3：环境变量**

```bash
PROXY_CONFIG='{"server":{...}}' node index.js
```

### 在 TapCode 平台中集成

```typescript
import { spawn } from 'child_process';

// 生成配置
const config = {
  server: {
    url: 'http://host.docker.internal:5003',
    env: process.env.NODE_ENV === 'production' ? 'production' : 'rnd',
  },
  tenant: {
    project_path: `${session.userId}/${session.projectId}/workspace`,
    user_id: session.userId,
    project_id: session.projectId,
  },
  auth: macToken, // 从数据库获取
  options: {
    verbose: false,
  },
};

// 启动 Proxy（方式 1：命令行参数）
const proxy = spawn('node', ['/srv/mcp-proxy/index.js', JSON.stringify(config)], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

// 或使用 MCP SDK
const sessionResult = await connection.newSession({
  cwd: '/workspace',
  mcpServers: [
    {
      name: 'taptap',
      command: 'node',
      args: ['/srv/mcp-proxy/index.js', JSON.stringify(config)],
    },
  ],
});
```

## 配置字段说明

### server（必需）

| 字段  | 类型   | 必需 | 说明                   | 示例                               |
| ----- | ------ | ---- | ---------------------- | ---------------------------------- |
| `url` | string | ✅   | TapTap MCP Server 地址 | `http://host.docker.internal:5003` |
| `env` | string | ⚪   | 环境选择（默认 rnd）   | `rnd` 或 `production`              |

### tenant（必需）

| 字段           | 类型   | 必需 | 说明                                                   | 示例                    |
| -------------- | ------ | ---- | ------------------------------------------------------ | ----------------------- |
| `project_path` | string | ⚪   | 项目路径（相对于 MCP Server WORKSPACE_ROOT，默认 '.'） | `project-123/workspace` |
| `user_id`      | string | ⚪   | 用户标识符（仅用于日志和追踪）                         | `user-456`              |
| `project_id`   | string | ⚪   | 项目标识符（仅用于日志和追踪）                         | `project-123`           |

**说明：**

- `project_path` 由 TapCode 平台生成，Proxy 直接传递给 MCP Server
- `user_id` 和 `project_id` 仅用于日志标识，不参与路径逻辑
- Proxy 不再处理路径拼接，全部交给 MCP Server 的 `pathResolver` 统一处理

### auth（必需）

| 字段            | 类型   | 必需 | 说明                | 示例         |
| --------------- | ------ | ---- | ------------------- | ------------ |
| `kid`           | string | ✅   | Token ID            | `abc123...`  |
| `mac_key`       | string | ✅   | Token Key           | `xyz789...`  |
| `token_type`    | string | ✅   | 固定为 "mac"        | `mac`        |
| `mac_algorithm` | string | ✅   | 固定为 "hmac-sha-1" | `hmac-sha-1` |

### options（可选）

| 字段                 | 类型    | 必需 | 说明             | 默认值  |
| -------------------- | ------- | ---- | ---------------- | ------- |
| `verbose`            | boolean | ⚪   | 详细日志模式     | `false` |
| `reconnect_interval` | number  | ⚪   | 重连间隔（毫秒） | `5000`  |
| `monitor_interval`   | number  | ⚪   | 监控间隔（毫秒） | `10000` |
| `log`                | object  | ⚪   | 日志配置         | 见下表  |

### options.log（日志配置）

| 字段       | 类型    | 必需 | 说明                                 | 默认值                 |
| ---------- | ------- | ---- | ------------------------------------ | ---------------------- |
| `root`     | string  | ⚪   | 日志根目录                           | `/tmp/taptap-mcp/logs` |
| `enabled`  | boolean | ⚪   | 启用文件日志                         | `false`                |
| `level`    | string  | ⚪   | 日志级别（debug/info/warning/error） | `info`                 |
| `max_days` | number  | ⚪   | 日志保留天数                         | `7`                    |

**日志路径说明：**

- 有 `user_id` 和 `project_id`：`{root}/proxy/{user_id}/{project_id}/proxy-YYYY-MM-DD.log`
- 无 `user_id`/`project_id`：`{root}/proxy/{kid_hash}/proxy-YYYY-MM-DD.log`

**示例配置：**

```json
{
  "options": {
    "verbose": false,
    "log": {
      "root": "/var/log/taptap",
      "enabled": true,
      "level": "info",
      "max_days": 7
    }
  }
}
```

**注意：** 当 `verbose=true` 时，`log.level` 自动变为 `debug`。

## 租户隔离

Proxy 直接传递 `project_path` 给 MCP Server，无需在 Proxy 中做路径拼接：

```typescript
// Proxy 配置（由 TapCode 平台生成）
config.tenant.project_path = 'project-123/workspace';

// Proxy 直接注入
_project_path = 'project-123/workspace'; // 相对路径，不做任何拼接

// MCP Server 接收后使用 pathResolver 解析
// WORKSPACE_ROOT = "/data/tapcode/userspaces"  // MCP Server 环境变量
// 最终路径 = WORKSPACE_ROOT + _project_path
//         = "/data/tapcode/userspaces/project-123/workspace"
```

**示例：**

```typescript
// 平台生成配置
{
  "tenant": {
    "project_path": "project-123/workspace",  // 由平台计算好
    "user_id": "user-456",
    "project_id": "project-123"
  }
}

// 用户调用工具
upload_h5_game({ gamePath: "dist" })

// MCP Server 解析
WORKSPACE_ROOT = "/data/tapcode/userspaces"
_project_path = "project-123/workspace"
gamePath = "dist"
最终路径 = "/data/tapcode/userspaces/project-123/workspace/dist"
```

TapTap MCP Server 会：

1. 使用 `pathResolver` 拼接完整路径
2. 提取租户标识符（最后两层：`project-123/workspace`）
3. 缓存文件：`/tmp/taptap-mcp/cache/project-123/workspace/app.json`
4. 临时文件：`/tmp/taptap-mcp/temp/project-123/workspace/game-xxx.zip`

**优点：**

- ✅ Proxy 配置更简单（无需 workspace_path）
- ✅ 路径拼接逻辑统一在 MCP Server pathResolver 中
- ✅ 租户隔离清晰（通过相对路径实现）
- ✅ 灵活性更强（平台可生成任意路径结构）

## 错误处理

### 连接失败

如果无法连接 TapTap Server：

```
Error: TapTap MCP Server is currently unavailable.
The proxy is attempting to reconnect.
Please try again in a few moments.
```

Proxy 会在后台自动重连。

### 配置错误

如果配置格式错误：

```
Error: Invalid configuration:
- Missing required field: server.url
- Missing required field: tenant.user_id
```

需要检查传递的 JSON 配置。

## 日志

Proxy 的日志输出到 stderr：

```
[Proxy] Configuration loaded successfully
[Proxy] Server: http://host.docker.internal:5003
[Proxy] Environment: rnd
[Proxy] Project: my-project
[Proxy] User: user123
[Proxy] Workspace: /workspace
[Proxy] Verbose: false
[Proxy] Connecting to http://host.docker.internal:5003...
[Proxy] ✅ Connected to TapTap MCP Server
[Proxy] Started (stdio mode)
```

**启用详细日志**：

```json
{
  "options": {
    "verbose": true
  }
}
```

详细日志会输出每次工具调用和参数注入：

```
[Proxy] Tool call: list_developers_and_apps
[Proxy] Injected: _mac_token (kid: abc123...)
[Proxy] Injected: _project_path = /workspace/user123/my-project
```

## 编译

Proxy 代码会随主项目编译：

```bash
npm run build
# 输出: dist/mcp-proxy/index.js
```

## 部署

Proxy 文件需要挂载到用户空间容器：

```typescript
// 在 TapCode 平台代码中
const volumes = [
  `${distPath}/mcp-proxy:/srv/mcp-proxy:ro`, // Proxy 代码
];
```

## 工作流程

### 初始化流程

1. Agent 启动
2. TapCode 平台生成 JSON 配置
3. spawn Proxy 子进程，传递 JSON 配置
4. Proxy 验证配置，连接 TapTap Server
5. Agent 调用 `tools/list` 获取工具列表
6. 初始化完成

### 工具调用流程

1. Agent 调用工具（如 `list_developers_and_apps`）
2. Agent 通过 stdio 发送请求给 Proxy
3. Proxy 从配置中读取 MAC Token（内存）
4. Proxy 注入私有参数：
   - `_mac_token`（从配置）
   - `_project_path`（计算绝对路径）
   - `_user_id`（从配置）
5. Proxy 转发到 TapTap Server（HTTP/SSE）
6. TapTap Server 处理并返回结果
7. Proxy 透传响应给 Agent

### 重连流程

1. Proxy 检测到连接断开
2. 后台自动尝试重连（间隔可配置）
3. 重连成功
4. 发送 `notifications/tools/list_changed` 给 Agent
5. Agent 自动重新获取工具列表

## 注意事项

1. **配置管理**：配置由 TapCode 平台代码生成，不需要手动编辑
2. **Token 安全**：Token 在进程内存中，不落盘（更安全）
3. **错误透传**：Proxy 不处理业务错误，直接返回给 Agent
4. **进程生命周期**：Proxy 随 Agent 启动和结束
5. **一对一绑定**：每个 Agent 对应一个 Proxy 进程

## 相关文档

- [PRIVATE_PROTOCOL.md](../../docs/PRIVATE_PROTOCOL.md) - 私有参数协议
- [MCP_PROXY_GUIDE.md](../../docs/MCP_PROXY_GUIDE.md) - Proxy 开发指引
- [config.example.json](config.example.json) - 配置示例
