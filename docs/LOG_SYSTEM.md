# 日志系统设计文档

> 本文档描述 TapTap MCP Server 和 Proxy 的文件日志系统设计。

## 概述

日志系统支持将运行日志同步写入文件，便于问题排查和审计。Proxy 和 Server 的日志完全独立，各自有独立的配置和存储路径。

### 输出控制逻辑

| 配置             | 作用                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `logLevel`       | 控制哪些级别的日志被输出（到 stderr 和文件）                        |
| `verbose`        | 影响日志级别（`verbose=true` → `logLevel=debug`）+ 控制额外调试信息 |
| `logFileEnabled` | 单独控制是否写入文件                                                |

**输出策略：**

- **stderr**: 总是输出（MCP 标准行为），只受日志级别过滤
- **文件**: 由 `logFileEnabled` 控制，只受日志级别过滤
- **MCP notification**: 仅在 SSE/HTTP 模式下发送（不在 stdio 模式）

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        日志系统架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │   MCP Server     │              │     Proxy        │        │
│  │ (可能在云端/K8s)  │              │  (用户本地运行)   │        │
│  ├──────────────────┤              ├──────────────────┤        │
│  │  Logger 类       │              │  ProxyLogger     │        │
│  │  ↓               │              │  ↓               │        │
│  │  LogWriter       │              │  LogWriter       │        │
│  │  ↓               │              │  ↓               │        │
│  │  stderr + 文件    │              │  stderr + 文件    │        │
│  └──────────────────┘              └──────────────────┘        │
│          │                                  │                   │
│          ▼                                  ▼                   │
│  /tmp/taptap-mcp/logs/server/      /tmp/taptap-mcp/logs/proxy/ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
${log_root}/                              # 默认: /tmp/taptap-mcp/logs
├── proxy/
│   ├── ${user_id}/
│   │   └── ${project_id}/
│   │       ├── proxy-2025-01-01.log
│   │       └── proxy-2025-01-02.log
│   └── ${kid_hash}/                      # 无 user_id/project_id 时使用
│       └── proxy-2025-01-01.log
└── server/
    ├── ${workspace_hash}/                # stdio 模式
    │   └── server-2025-01-01.log
    └── server-2025-01-01.log             # SSE/HTTP 模式（统一日志）
```

### Hash 计算规则

- **kid_hash**: `SHA256(kid).substring(0, 8)` - 用于无 user_id/project_id 时标识 Proxy
- **workspace_hash**: `SHA256(path.resolve(workspace_root)).substring(0, 8)` - 用于 Server stdio 模式

Hash 计算是稳定的，同一输入总是产生相同输出。

## 配置

### Proxy 配置 (config.json)

```json
{
  "server": { ... },
  "tenant": {
    "project_path": "/path/to/project",
    "user_id": "12345",
    "project_id": "67890"
  },
  "auth": { ... },
  "options": {
    "verbose": false,
    "log": {
      "root": "/tmp/taptap-mcp/logs",
      "enabled": true,
      "level": "info",
      "max_days": 7
    }
  }
}
```

| 字段           | 类型     | 默认值                 | 说明                        |
| -------------- | -------- | ---------------------- | --------------------------- |
| `log.root`     | string   | `/tmp/taptap-mcp/logs` | 日志根目录                  |
| `log.enabled`  | boolean  | `false`                | 是否启用文件日志            |
| `log.level`    | LogLevel | `info`                 | RFC 5424 日志级别（见下表） |
| `log.max_days` | number   | `7`                    | 日志保留天数                |

**注意**: 当 `verbose=true` 时，`log.level` 自动变为 `debug`。

### Server 配置 (环境变量)

| 环境变量                  | 默认值                 | 说明             |
| ------------------------- | ---------------------- | ---------------- |
| `TAPTAP_MCP_LOG_ROOT`     | `/tmp/taptap-mcp/logs` | 日志根目录       |
| `TAPTAP_MCP_LOG_FILE`     | `false`                | 是否启用文件日志 |
| `TAPTAP_MCP_LOG_LEVEL`    | `info`                 | 日志级别         |
| `TAPTAP_MCP_LOG_MAX_DAYS` | `7`                    | 日志保留天数     |

**注意**: 当 `TAPTAP_MCP_VERBOSE=true` 时，日志级别自动变为 `debug`。

## 日志级别 (RFC 5424)

使用 RFC 5424 标准的 syslog 日志级别，Server 和 Proxy 共用统一定义：

| 级别        | 优先级 | 说明                   |
| ----------- | ------ | ---------------------- |
| `emergency` | 0      | 系统不可用             |
| `alert`     | 1      | 必须立即采取行动       |
| `critical`  | 2      | 临界条件               |
| `error`     | 3      | 错误条件               |
| `warning`   | 4      | 警告条件               |
| `notice`    | 5      | 正常但重要的条件       |
| `info`      | 6      | 信息性消息（默认）     |
| `debug`     | 7      | 调试级别消息（最详细） |

**优先级规则**: 数字越小优先级越高（越严重）。配置的级别表示"该级别及以上（优先级更高的）"会被写入文件。

例如 `level=warning` 会写入 warning、error、critical、alert、emergency，但不写入 notice、info、debug。

**常用配置**:

- 生产环境推荐: `info` 或 `warning`
- 开发调试: `debug`
- 仅错误: `error`

## 日志格式

```
[2025-01-01T10:30:00.123Z] [INFO] [server] Tool called: create_leaderboard
[2025-01-01T10:30:00.456Z] [ERROR] [proxy] Connection failed: ECONNREFUSED
[2025-01-01T10:30:01.789Z] [DEBUG] [http] HTTP GET https://api.example.com/...
```

格式: `[ISO时间戳] [级别] [模块] 消息`

## 日志轮转

- **按日期轮转**: 每天一个新文件，文件名格式 `{prefix}-YYYY-MM-DD.log`
- **自动清理**: 超过 `max_days` 的日志文件会被自动删除
- **清理时机**: 每次初始化 LogWriter 时执行

## Docker 部署注意事项

默认日志路径 `/tmp/taptap-mcp/logs` 在容器重启后会丢失。如需持久化：

```yaml
# docker-compose.yml
services:
  mcp-server:
    volumes:
      - ./logs:/tmp/taptap-mcp/logs
```

或自定义日志路径到持久化目录：

```bash
TAPTAP_MCP_LOG_ROOT=/data/logs
```

## 实现细节

### LogWriter 类

`src/core/utils/logWriter.ts` - Proxy 和 Server 共用的日志写入器。

主要功能：

- 同时输出到 stderr 和文件（Tee 模式）
- 按日期自动轮转
- 自动清理过期日志
- 异步写入，不阻塞主流程

### 路径计算

```typescript
// Proxy 路径
function getProxyLogDir(config: ProxyConfig, logRoot: string): string {
  const { user_id, project_id } = config.tenant;

  if (user_id && project_id) {
    return path.join(logRoot, 'proxy', user_id, project_id);
  }

  // 无 user_id/project_id 时使用 kid hash
  const kidHash = computeStableHash(config.auth.kid);
  return path.join(logRoot, 'proxy', kidHash);
}

// Server 路径
function getServerLogDir(logRoot: string, transport: string): string {
  if (transport === 'stdio') {
    const workspaceHash = computeStableHash(path.resolve(EnvConfig.workspaceRoot));
    return path.join(logRoot, 'server', workspaceHash);
  }

  // SSE/HTTP 模式使用统一目录
  return path.join(logRoot, 'server');
}
```

## 使用示例

### 启用 Proxy 文件日志

```json
{
  "options": {
    "log": {
      "enabled": true
    }
  }
}
```

日志将写入: `/tmp/taptap-mcp/logs/proxy/{user_id}/{project_id}/proxy-2025-01-01.log`

### 启用 Server 文件日志

```bash
TAPTAP_MCP_LOG_FILE=true node dist/server.js
```

日志将写入: `/tmp/taptap-mcp/logs/server/{workspace_hash}/server-2025-01-01.log`

### 自定义日志路径

```bash
# Server
TAPTAP_MCP_LOG_ROOT=/var/log/myapp TAPTAP_MCP_LOG_FILE=true node dist/server.js

# Proxy (config.json)
{
  "options": {
    "log": {
      "root": "/var/log/myapp",
      "enabled": true
    }
  }
}
```
