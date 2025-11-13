# 统一路径解析系统

## 📋 概述

从 v1.5.0 开始，所有与目录相关的工具都使用**统一路径解析系统**。

### 核心原则

```
最终路径 = WORKSPACE_ROOT + _project_path（可选）+ 用户相对路径
```

- **WORKSPACE_ROOT**: 工作空间根路径（环境变量或 `process.cwd()`）
- **_project_path**: Proxy 注入的项目相对路径（可选）
- **用户相对路径**: 用户传入的相对路径参数

---

## 🎯 三种使用场景

### 场景 1：生产环境（有 Proxy）

**环境：**
```bash
WORKSPACE_ROOT=/data/tapcode/userspaces
MCP Server Root=/data/tapcode/userspaces
Proxy 运行目录=/data/tapcode/userspaces/project-123/workspace/dist
```

**MCP Server 环境变量：**
```bash
WORKSPACE_ROOT=/data/tapcode/userspaces
```

**Proxy 配置：**
```json
{
  "tenant": {
    "project_path": "project-123/workspace",
    "user_id": "user-456",
    "project_id": "project-123"
  }
}
```

**用户调用工具：**
```typescript
// 用户传入相对路径
h5_game_uploader({ gamePath: "dist" })

// 路径解析过程
WORKSPACE_ROOT = "/data/tapcode/userspaces"
_project_path = "project-123/workspace"  // Proxy 注入
gamePath = "dist"                         // 用户传入

最终路径 = "/data/tapcode/userspaces/project-123/workspace/dist"
```

---

### 场景 2：容器部署（无 Proxy）

**环境：**
```bash
WORKSPACE_ROOT=/workspace
容器内挂载=/workspace（用户代码）
```

**用户调用工具：**
```typescript
// 用户传入完整相对路径
h5_game_uploader({ gamePath: "my-game/dist" })

// 路径解析过程
WORKSPACE_ROOT = "/workspace"
_project_path = undefined  // 无 Proxy
gamePath = "my-game/dist"  // 用户传入

最终路径 = "/workspace/my-game/dist"
```

---

### 场景 3：本地开发（Cursor/Claude Desktop）

**环境：**
```bash
WORKSPACE_ROOT=process.cwd()  // /Users/username/projects/my-game
```

**用户调用工具：**
```typescript
// 用户传入相对路径（或默认当前目录）
h5_game_uploader({ gamePath: "dist" })

// 路径解析过程
WORKSPACE_ROOT = "/Users/username/projects/my-game"  // process.cwd()
_project_path = undefined  // 无 Proxy
gamePath = "dist"          // 用户传入

最终路径 = "/Users/username/projects/my-game/dist"
```

---

## 🛠️ 环境变量配置

### `WORKSPACE_ROOT`

工作空间根路径，决定所有相对路径的起始点。

```bash
# 生产环境
export WORKSPACE_ROOT=/data/tapcode/userspaces

# 容器环境
export WORKSPACE_ROOT=/workspace

# 本地开发（可不设置，自动使用 process.cwd()）
# export WORKSPACE_ROOT=/Users/username/projects
```

**优先级：**
```
环境变量 WORKSPACE_ROOT > process.cwd()
```

---

## 📝 工具参数说明

### H5 Game Tools

所有 H5 游戏工具现在使用 `gamePath` 参数（相对路径）：

```typescript
// ✅ 正确：传入相对路径
h5_game_info_gatherer({
  gamePath: "dist",        // 相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
  genre: "casual"
})

h5_game_uploader({
  gamePath: "build"        // 相对于 WORKSPACE_ROOT（或 WORKSPACE_ROOT/_project_path）
})

// ⚪ 默认：不传参数，使用当前目录
h5_game_uploader()  // gamePath 默认为 undefined，解析为 WORKSPACE_ROOT 或 WORKSPACE_ROOT/_project_path
```

---

## 🔧 开发者指南

### 如何使用路径解析器

```typescript
import { resolveWorkPath } from '../../core/utils/pathResolver.js';

export async function handleMyTool(
  args: { myPath?: string },
  context?: HandlerContext
): Promise<string> {
  // 统一路径解析
  const resolvedPath = resolveWorkPath(args.myPath, context);

  // 现在可以安全使用绝对路径
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${resolvedPath}`);
  }

  // ...
}
```

### API 说明

```typescript
/**
 * 解析工具的工作路径
 *
 * @param relativePath - 用户传入的相对路径（可选）
 * @param context - 处理器上下文（可能包含 Proxy 注入的 _project_path）
 * @returns 解析后的绝对路径
 */
export function resolveWorkPath(
  relativePath?: string,
  context?: HandlerContext
): string

/**
 * 获取工作空间根路径
 */
export function getWorkspaceRoot(): string

/**
 * 检查路径是否在工作空间内（安全检查）
 */
export function isPathInWorkspace(targetPath: string): boolean

/**
 * 获取路径相对于工作空间的相对路径
 */
export function getRelativeToWorkspace(absolutePath: string): string
```

---

## ✅ 优点

1. **统一逻辑** - 所有工具使用相同的路径解析方式
2. **灵活适配** - 自动适配 Proxy、容器、本地三种场景
3. **用户友好** - 用户只需传递相对路径，无需关心绝对路径
4. **租户隔离** - 通过 `_project_path` 自动实现租户隔离
5. **安全性** - 可通过 `isPathInWorkspace` 检查路径安全性

---

## 🔍 调试和验证

### 查看路径解析日志

启用详细日志查看路径解析过程：

```bash
# 启动时启用详细日志
TDS_MCP_VERBOSE=true npm start
```

### 验证路径配置

```typescript
// 在工具 handler 中添加日志
import { logger } from '../../core/utils/logger.js';
import { resolveWorkPath, getWorkspaceRoot } from '../../core/utils/pathResolver.js';

const resolvedPath = resolveWorkPath(args.gamePath, context);
await logger.info(`WORKSPACE_ROOT: ${getWorkspaceRoot()}`);
await logger.info(`_project_path: ${context?.projectPath || 'undefined'}`);
await logger.info(`user gamePath: ${args.gamePath || 'undefined'}`);
await logger.info(`resolved path: ${resolvedPath}`);
```

---

## 📚 相关文档

- [MCP Proxy 配置](../src/mcp-proxy/README.md)
- [缓存系统说明](../src/core/utils/cache.ts)
- [私有参数协议](./PRIVATE_PROTOCOL.md)
