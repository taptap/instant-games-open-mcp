# TapTap MCP Proxy

通用的 TapTap MCP 代理组件，用于连接 MCP 客户端和远端 MCP Server，自动注入 MAC Token 实现多租户隔离。

## 重要：共享组件与兼容性边界

> **本目录不是本地 Maker MCP 的专属实现。服务端调用方和本地 Maker MCP 共用这里的代码，
> 修改默认行为会影响不同场景的使用方，必须按公共组件维护。**

- **服务端使用场景：** Maker 的服务端调用方会使用此 Proxy 与 `maker-tools` 进行业务交互。
  该场景不等同于本地 Maker 开发，不能默认将这些请求标记为 `local`。
- **本地 Maker MCP 场景：** `src/maker/index.ts` 直接复用 `TapTapMCPProxy`，构建时内置到
  Maker npm 包的 `dist/maker.js` 中。Maker 的业务需求不代表其它 Proxy 使用方的需求。
- **发布边界：** 独立 Proxy 随 `@taptap/instant-games-open-mcp` 发布，Maker 内置 Proxy 随
  `@taptap/maker` 发布。两者发布独立，但共享源码的修改会进入各自后续构建，不能只验证 Maker。
- **修改约束：** 来源标记（例如 `tag=local`）、默认超时、错误返回格式、会话与重连、
  请求重放和工具过滤都属于兼容性契约。场景专属行为必须由对应入口或显式配置启用，
  不得为了单个 Maker 场景直接改变通用默认行为。
- **验证要求：** 修改共享逻辑前先检查两类调用方及既有配置；修改后必须覆盖服务端独立 Proxy
  的兼容性测试和实际构建产物；本地 Maker MCP 必须在其后续发布前单独验证。
  提交名称带有 `maker` 不代表影响仅限 Maker。

### 通用默认行为与 Maker 专属行为

- 通用 Proxy 默认不注入来源标记，原样保留上游协议错误的 `code`、`message` 和 `data`，
  工具调用超时默认为 5 分钟，重连使用配置的固定间隔（默认 5 秒）。
- 会话失效（包括明确返回 session 失效的 HTTP 400/404）会触发重连；普通 HTTP 4xx
  不触发重连。新增识别的 HTTP 5xx、SDK 连接关闭和请求超时会恢复连接，但不会自动重放当前调用。
- 保留历史网络错误和会话失效时的一次自动重放；重放再次失败就返回错误，不循环重放同一调用。
  这不是“恰好执行一次”的保证：有副作用的工具应显式配置 `replayable_tools`。
- 本地 Maker 通过 `src/maker/proxyPolicy.ts` 显式启用 `sourceTag: 'local'`、
  `remoteErrorMode: 'tool-result'`、`recoveryMode: 'resilient'`，并在自己的配置中设置
  1 小时工具超时。诊断转换、退避重连与持续重放是该入口的策略，不是通用默认行为。
- 这些构造函数运行时选项不属于 JSON 配置，不能依据上游 URL 自动启用。

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
- **进度透传**：当客户端携带 `progressToken` 时，自动转发 `notifications/progress`

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

| 字段            | 类型                     | 必需 | 说明                                                   | 示例                                |
| --------------- | ------------------------ | ---- | ------------------------------------------------------ | ----------------------------------- |
| `project_path`  | string                   | ⚪   | 项目路径（相对于 MCP Server WORKSPACE_ROOT，默认 '.'） | `project-123/workspace`             |
| `user_id`       | string                   | ⚪   | 用户标识符（仅用于日志和追踪）                         | `user-456`                          |
| `project_id`    | string                   | ⚪   | 项目标识符（仅用于日志和追踪）                         | `project-123`                       |
| `custom_fields` | `Record<string, string>` | ⚪   | 业务自定义字段，`session_id` 表示业务/编辑器会话标识符 | `{"session_id":"client-session-1"}` |

**说明：**

- `project_path` 由 TapCode 平台生成，Proxy 直接传递给 MCP Server
- `user_id` 和 `project_id` 仅用于日志标识，不参与路径逻辑
- 业务/编辑器 client session id 统一放在 `custom_fields.session_id`
- Proxy 不再处理路径拼接，全部交给 MCP Server 的 `pathResolver` 统一处理
- 通用 Proxy 默认不发送 `X-TapTap-Tag`，不新增或覆盖调用方的 `_tag`。只有本地 Maker
  嵌入入口显式传入运行时选项 `sourceTag: 'local'` 时，才发送 `X-TapTap-Tag: local`，
  并在启用 `inject_params_per_call` 时注入 `_tag: "local"`。该运行时选项不属于
  `PROXY_CONFIG`，不根据服务端地址推断，也不用于普通 Open API HTTP 请求。

### auth（必需）

| 字段            | 类型   | 必需 | 说明                | 示例         |
| --------------- | ------ | ---- | ------------------- | ------------ |
| `kid`           | string | ✅   | Token ID            | `abc123...`  |
| `mac_key`       | string | ✅   | Token Key           | `xyz789...`  |
| `token_type`    | string | ✅   | 固定为 "mac"        | `mac`        |
| `mac_algorithm` | string | ✅   | 固定为 "hmac-sha-1" | `hmac-sha-1` |

### options（可选）

| 字段                     | 类型    | 必需 | 说明                                              | 默认值   |
| ------------------------ | ------- | ---- | ------------------------------------------------- | -------- |
| `verbose`                | boolean | ⚪   | 详细日志模式                                      | `false`  |
| `reconnect_interval`     | number  | ⚪   | 重连间隔（毫秒）                                  | `5000`   |
| `monitor_interval`       | number  | ⚪   | 监控间隔（毫秒）                                  | `10000`  |
| `tool_call_timeout`      | number  | ⚪   | 工具调用超时（毫秒，5 分钟）                      | `300000` |
| `disable_standalone_sse` | boolean | ⚪   | 对可选 standalone SSE GET 返回 405，改用 POST SSE | `false`  |
| `exposed_tools`          | array   | ⚪   | 对客户端暴露的 tool 名称白名单                    | 不限制   |
| `replayable_tools`       | array   | ⚪   | 允许断线等待或自动重放的 tool 名称白名单          | 不限制   |
| `log`                    | object  | ⚪   | 日志配置                                          | 见下表   |

`disable_standalone_sse` 只影响用于接收服务端主动消息的可选 GET 长连接。MCP 请求、响应和 progress
仍通过 POST SSE 传输。默认关闭该选项以保持通用 Proxy 的历史行为；Maker 内嵌代理会显式开启。

### options.replayable_tools（断线重放白名单）

`replayable_tools` 限制哪些 tool 可以在连接恢复后继续等待或自动重放：

- 未配置时保持通用 Proxy 的历史行为：所有 tool 都可能等待重连或在传输失败后重放。
- 配置后，只有白名单内的 tool 可以等待重连或自动重放。
- 配置为空数组时，所有 tool 都只调用一次。
- 不在白名单内的调用若在派发前失败，返回 `execution_state: not_executed`；若请求派发后响应中断，
  返回 `execution_state: unknown`。两种情况都返回 `automatic_retry: false`。

只应把具备幂等性或有明确去重保障的 tool 加入白名单。会产生费用、消耗配额或改变远端状态的 tool
通常不应自动重放；收到 `unknown` 时，应先核对远端结果、状态和用量，再决定是否显式重试。

Maker 内嵌代理只允许 `build` 自动重放：

```json
{
  "options": {
    "replayable_tools": ["build"]
  }
}
```

### options.exposed_tools（Proxy tool 白名单）

`exposed_tools` 用于控制客户端能看到和调用哪些上游 tools：

- 未配置时保持历史行为：`tools/list` 全量转发上游 MCP Server 的 tools。
- 配置后，`tools/list` 只返回白名单内的 tool 定义。
- 配置后，`tools/call` 会在 proxy 层拒绝白名单外的 tool，避免隐藏 tool 被直接调用。
- Proxy 不重新封装 tool；白名单内 tool 的 description、input schema、参数和返回值都保持上游原样。

示例：只试用图片、视频和音乐生成相关 tools。

```json
{
  "options": {
    "exposed_tools": [
      "generate_image",
      "batch_generate_images",
      "edit_image",
      "create_video_task",
      "text_to_music",
      "create_3d_asset"
    ]
  }
}
```

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
   - `_custom_fields`（从配置，可选，业务/编辑器会话 ID 使用 `session_id` 字段）
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
