# TapCode 平台快速接入指南

本文档面向 **TapCode 平台开发者**，说明如何在代码中配置 MCP Proxy 并启动 TapTap MCP Server。

---

## 架构说明

```
TapCode Platform (用户浏览器)
    ↓ WebSocket/HTTP
TapCode Backend (生成配置)
    ↓ 启动子进程
MCP Proxy (stdio)
    ├─ 读取: JSON 配置（从 TapCode 生成）
    ├─ 注入: MAC Token + project_path
    └─ 连接: TapTap MCP Server (HTTP/SSE)
        ↓
Docker Container (TapTap MCP Server)
    ├─ 读取: /workspace/{相对路径}
    └─ 返回: API 结果
```

---

## 第一步：启动 TapTap MCP Server（Docker）

### Docker Compose 配置

**文件位置**: `docker-compose.yml` 或由 TapCode 动态生成

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
      - TDS_MCP_TRANSPORT=sse
      - TDS_MCP_PORT=3000

      # TapTap 环境（必需）
      - TDS_MCP_ENV=rnd  # rnd=测试环境, production=生产环境

      # 客户端配置（必需）
      - TDS_MCP_CLIENT_ID=${TDS_MCP_CLIENT_ID}
      - TDS_MCP_CLIENT_TOKEN=${TDS_MCP_CLIENT_TOKEN}

      # 日志（可选，推荐开启）
      - TDS_MCP_VERBOSE=true

      # 缓存和临时目录（可选）
      - TDS_MCP_CACHE_DIR=/var/lib/taptap-mcp/cache
      - TDS_MCP_TEMP_DIR=/tmp/taptap-mcp/temp

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

### 环境变量说明

**必需环境变量:**

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `WORKSPACE_ROOT` | 用户代码根目录（宿主机路径） | `/Users/mikoto` 或 `/home/ubuntu` |
| `TDS_MCP_CLIENT_ID` | TapTap 客户端 ID（由 TapTap 提供） | `m2dnabebip3fpardnm` |
| `TDS_MCP_CLIENT_TOKEN` | TapTap 客户端密钥（由 TapTap 提供） | `QUmbMoTQm2qJ...` |

**可选环境变量:**

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TDS_MCP_ENV` | TapTap 环境 | `rnd` (测试环境) |
| `TDS_MCP_VERBOSE` | 详细日志 | `true` (推荐) |
| `TDS_MCP_TRANSPORT` | 传输协议 | `sse` |
| `TDS_MCP_PORT` | 容器内端口 | `3000` |

### 启动命令

```bash
# 设置环境变量
export WORKSPACE_ROOT=/Users/mikoto
export TDS_MCP_CLIENT_ID=m2dnabebip3fpardnm
export TDS_MCP_CLIENT_TOKEN=QUmbMoTQm2qJETi53vWnvaXuBiRL3VRkgcUWnBtb
export TDS_MCP_ENV=rnd

# 启动 Docker
docker-compose up -d

# 验证启动
curl http://localhost:5003/health
```

**健康检查响应示例:**
```json
{
  "status": "ok",
  "version": "1.4.7",
  "transport": "streamable-http",
  "tools": 17,
  "resources": 7,
  "activeSessions": 0
}
```

---

## 第二步：配置 MCP Proxy（TapCode 代码生成）

### Proxy 配置 JSON 结构

```typescript
interface ProxyConfig {
  server: {
    url: string;              // TapTap MCP Server 地址
    env?: 'rnd' | 'production';  // 环境选择
  };
  tenant: {
    user_id: string;          // 用户 ID（TapCode 用户标识）
    project_id: string;       // 项目 ID（TapCode 项目标识）
    workspace_path?: string;  // Docker 中的挂载点（默认 /workspace）
    project_relative_path?: string;  // 项目相对于 workspace 的路径（推荐）
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

### 配置生成示例（TapCode 后端代码）

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
      workspace_path: "/workspace",        // Docker 挂载点（固定）

      // 关键：项目相对于 WORKSPACE_ROOT 的路径
      // 示例：/Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
      //       相对于 /Users/mikoto 的路径是：
      //       Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
      project_relative_path: calculateRelativePath(project.path, WORKSPACE_ROOT)
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

### 启动 Proxy 子进程（TapCode 后端代码）

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

---

## 第三步：路径映射配置

### 关键概念

**宿主机路径 → Docker 路径映射**

```
宿主机: /Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
         ↓ (Docker 挂载)
Docker:  /workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
```

**配置规则:**

1. **WORKSPACE_ROOT** (环境变量) = 宿主机根路径
   - 示例: `/Users/mikoto`

2. **workspace_path** (Proxy 配置) = Docker 挂载点
   - 固定值: `/workspace`

3. **project_relative_path** (Proxy 配置) = 项目相对路径
   - 计算: `相对路径 = 项目绝对路径 - WORKSPACE_ROOT`
   - 示例: `Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo`

4. **_project_path** (自动注入) = Docker 中的项目路径
   - 计算: `workspace_path + project_relative_path`
   - 结果: `/workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo`

---

## 完整示例

### 场景：用户在 TapCode 平台上传 H5 游戏

**用户信息:**
- 用户 ID: `mikoto`
- 项目路径: `/Users/mikoto/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo`
- MAC Token: (从 TapCode 数据库获取)

**TapCode 后端配置生成:**

```typescript
// 1. 环境变量（启动 Docker 时设置）
const dockerEnv = {
  WORKSPACE_ROOT: '/Users/mikoto',
  TDS_MCP_CLIENT_ID: 'm2dnabebip3fpardnm',
  TDS_MCP_CLIENT_TOKEN: 'QUmbMoTQm2qJETi53vWnvaXuBiRL3VRkgcUWnBtb',
  TDS_MCP_ENV: 'rnd',
  TDS_MCP_VERBOSE: 'true'
};

// 2. Proxy 配置 JSON
const proxyConfig = {
  "server": {
    "url": "http://localhost:5003",
    "env": "rnd"
  },
  "tenant": {
    "user_id": "mikoto",
    "project_id": "minigame_h5_demo",
    "workspace_path": "/workspace",
    "project_relative_path": "Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"
  },
  "auth": {
    "kid": "1/L5cZb7oqwK8fFzybUIte8iaDD2FYUThCO2DvmwWPXaSHLvSMhs-z12gdGPXw4gCTeSKoQUgzwfWbPPkJgtzu5zXiJvv-HGL9keEFz5moAtlFQWBQiFRs0UGUQ5mOzuYj4J2xee4WrrTTIlkCm6-9aSPvM3IgGe-Jx_EERjpFS0Py6cHYBPe0Kh3Azmt2Wa5Rtm_qmGWsmabSGLngS7kqca4iQLxL8qmvI0B6-zPuZmiEmE3QiO8xuYUxI1Nmu-gdAgVCO-a-aVOV8uuk0dA7Yx-a8tCyV_kzjySf7Lh6QZ9lXdi1pIB8QTlk39FhM1ItjblZ4bdRhQ9nn8ln3FfDyg",
    "mac_key": "ch6A285yuEH09HOitnkMm3vdt0rRAmFFuU4eog6T",
    "token_type": "mac",
    "mac_algorithm": "hmac-sha-1"
  },
  "options": {
    "verbose": true
  }
};

// 3. 启动 Proxy
const configJson = JSON.stringify(proxyConfig);
const proxy = spawn('npx', [
  '-y', '-p', '@mikoto_zero/minigame-open-mcp@latest',
  'taptap-mcp-proxy',
  configJson
], {
  stdio: ['pipe', 'pipe', 'pipe']
});
```

---

## 环境变量详细说明

### Docker 启动环境变量

**必需变量:**

```bash
# Workspace 根目录（宿主机路径，必需）
# 说明：Docker 会将此目录挂载到容器内的 /workspace
# 示例：用户所有项目的根目录
WORKSPACE_ROOT=/Users/mikoto

# TapTap 客户端 ID（必需）
# 说明：由 TapTap 提供的应用客户端 ID
TDS_MCP_CLIENT_ID=m2dnabebip3fpardnm

# TapTap 客户端密钥（必需）
# 说明：由 TapTap 提供的应用密钥，用于请求签名
TDS_MCP_CLIENT_TOKEN=QUmbMoTQm2qJETi53vWnvaXuBiRL3VRkgcUWnBtb
```

**可选变量（有默认值）:**

```bash
# TapTap 环境（可选，默认 rnd）
# rnd: 测试环境 (https://agent.api.xdrnd.cn)
# production: 生产环境 (https://agent.tapapis.cn)
TDS_MCP_ENV=rnd

# 详细日志（可选，默认 true）
# true: 显示工具调用、HTTP 请求、私有参数等详细日志
# false: 只显示关键事件
TDS_MCP_VERBOSE=true

# 传输协议（可选，默认 sse）
TDS_MCP_TRANSPORT=sse

# 容器内端口（可选，默认 3000）
TDS_MCP_PORT=3000
```

---

## Proxy 配置字段说明

### server（服务器配置）

```typescript
{
  "server": {
    "url": "http://localhost:5003",  // TapTap MCP Server 地址（必需）
    "env": "rnd"                     // 环境：rnd | production（可选）
  }
}
```

### tenant（租户配置）

```typescript
{
  "tenant": {
    // 用户标识（必需）
    "user_id": "mikoto",

    // 项目标识（必需）
    "project_id": "minigame_h5_demo",

    // Docker 挂载点（可选，默认 /workspace）
    "workspace_path": "/workspace",

    // 项目相对路径（推荐，用于路径映射）
    // 计算方式：path.relative(WORKSPACE_ROOT, projectPath)
    // 示例：/Users/mikoto/Documents/.../minigame_h5_demo
    //       相对于 /Users/mikoto
    //       = Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
    "project_relative_path": "Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo"
  }
}
```

**路径计算逻辑:**

```typescript
// 如果提供了 project_relative_path（推荐）
_project_path = workspace_path + project_relative_path
             = /workspace + Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo
             = /workspace/Documents/xindong/Repos/InstantGameRepos/minigame_h5_demo

// 如果没提供（回退逻辑，不推荐）
_project_path = workspace_path + user_id + project_id
             = /workspace + mikoto + minigame_h5_demo
             = /workspace/mikoto/minigame_h5_demo
```

### auth（认证配置）

```typescript
{
  "auth": {
    "kid": "1/L5cZb7oqwK...",         // MAC Token kid（必需）
    "mac_key": "ch6A285yuEH0...",     // MAC Token mac_key（必需）
    "token_type": "mac",              // 固定值（必需）
    "mac_algorithm": "hmac-sha-1"     // 固定值（必需）
  }
}
```

**MAC Token 获取方式:**
1. 从 TapCode 数据库读取用户的 MAC Token
2. 或者调用 TapTap OAuth API 获取

### options（可选配置）

```typescript
{
  "options": {
    "verbose": true,              // 详细日志（推荐）
    "reconnect_interval": 5000,   // 重连间隔（毫秒）
    "monitor_interval": 10000     // 监控间隔（毫秒）
  }
}
```

---

## TapCode 代码集成示例

### 完整的启动流程

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
      TDS_MCP_CLIENT_ID: process.env.TAPTAP_CLIENT_ID!,
      TDS_MCP_CLIENT_TOKEN: process.env.TAPTAP_CLIENT_SECRET!,
      TDS_MCP_ENV: 'rnd',
      TDS_MCP_VERBOSE: 'true'
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
        workspace_path: "/workspace",
        project_relative_path: projectRelativePath  // 关键字段
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

---

## 验证和调试

### 验证 MCP Server 启动

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
🚀 TapTap Open API MCP Server v1.4.7 (Minigame & H5)
🔌 Transport: Streamable HTTP (SSE Streaming)
📁 Workspace: /workspace ✅
🔍 Verbose logging enabled (TDS_MCP_VERBOSE=true)
```

### 验证 Proxy 配置

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

**如果缺少 `Project Relative Path` 这一行**，说明配置 JSON 中没有 `project_relative_path` 字段。

### 验证工具调用

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

---

## 常见问题

### Q1: 项目路径不存在错误

**错误信息:**
```
目录不存在：/workspace/mikoto/minigame_h5_demo
```

**原因:** 缺少 `project_relative_path` 配置

**解决:** 在 Proxy 配置中添加 `project_relative_path` 字段

### Q2: MAC Token 认证失败

**错误信息:**
```
invalid self-contained access token
```

**原因:** MAC Token 已过期或无效

**解决:** 从 TapCode 数据库获取用户最新的 MAC Token

### Q3: Workspace 未挂载

**错误信息:**
```
📁 Workspace: /workspace ❌
```

**原因:** Docker 环境变量 `WORKSPACE_ROOT` 未设置

**解决:** 启动 Docker 时设置 `WORKSPACE_ROOT` 环境变量

### Q4: 私有参数未注入

**症状:** MCP Server 触发 OAuth 授权流程

**原因:** Proxy 配置中缺少 `auth` 字段或 token 格式错误

**解决:** 检查 Proxy 配置 JSON 的 `auth` 字段是否完整

---

## NPM 包版本

**当前版本:** `@mikoto_zero/minigame-open-mcp@1.4.7`

**安装方式:**

```bash
# 全局安装
npm install -g @mikoto_zero/minigame-open-mcp@latest

# 或使用 npx（推荐，无需安装）
npx @mikoto_zero/minigame-open-mcp@latest
```

**包含命令:**
- `minigame-open-mcp` - MCP Server 主程序
- `taptap-mcp-proxy` - MCP Proxy 程序

---

## 总结

**TapCode 平台需要做的事:**

1. ✅ **启动 Docker**
   - 设置环境变量（WORKSPACE_ROOT, CLIENT_ID, CLIENT_TOKEN）
   - 运行 `docker-compose up -d`

2. ✅ **为每个用户生成 Proxy 配置**
   - 计算 `project_relative_path` = `path.relative(WORKSPACE_ROOT, projectPath)`
   - 从数据库获取用户的 MAC Token
   - 生成完整的 JSON 配置

3. ✅ **启动 Proxy 子进程**
   - 使用 `npx` 或 `taptap-mcp-proxy` 命令
   - 传递 JSON 配置字符串作为参数
   - 通过 stdio 与 AI Agent 通信

**关键点:**
- 🔑 `project_relative_path` 字段是路径映射的关键
- 🔑 MAC Token 需要从 TapCode 数据库获取
- 🔑 每个用户/项目需要独立的 Proxy 进程
- 🔑 所有用户共享同一个 Docker MCP Server

---

## 技术支持

如有问题，请参考：
- **完整文档**: `docs/PROXY_CLIENT_CONFIG.md`
- **Docker 部署**: `docs/DOCKER_DEPLOYMENT.md`
- **私有参数协议**: `docs/PRIVATE_PROTOCOL.md`
- **GitHub Issues**: https://github.com/taptap/taptap_minigame_open_mcp/issues
