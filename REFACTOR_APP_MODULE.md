# App Module 抽象重构

## 概述

将应用管理相关的操作从 `leaderboard` 模块中抽象出来，创建了独立的 `app` 功能模块。这是继 Tools/Resources 统一化和文档工具泛化之后的第三次架构优化。

## 重构动机

### 问题
- `leaderboard/api.ts` 包含了应用操作相关的 API（与排行榜无关）
- `core/handlers/appHandlers.ts` 是共享处理器，但不属于任何功能模块
- 应用选择功能被错误地归类为排行榜的一部分
- 其他功能模块（如未来的 cloudSave、share）也需要应用选择功能

### 解决方案
创建独立的 `app` 功能模块，将应用管理功能统一管理：
- 开发者和应用列表查询
- 应用选择和缓存
- 环境配置检查
- OAuth 授权完成

## 架构变更

### 新增文件

#### `src/features/app/`
```
app/
├── index.ts      - 模块定义和注册
├── tools.ts      - 5个工具定义（统一格式）
├── handlers.ts   - 处理器实现
└── api.ts        - API 调用层
```

#### 工具列表（5个）
1. **`get_current_app_info`** - 获取当前选择的应用信息
2. **`check_environment`** - 检查环境配置和认证状态
3. **`complete_oauth_authorization`** - 完成 OAuth 授权
4. **`list_developers_and_apps`** - 列出所有开发者和应用
5. **`select_app`** - 选择特定的开发者和应用

### 修改的文件

#### `src/features/leaderboard/api.ts`
**变更**：
- 移除 `CraftItem`, `DeveloperCraftList`, `LevelListResponse`, `SelectionRequiredError` 接口定义
- 移除 `getAppInfo()`, `ensureAppInfo()`, `selectApp()`, `getAllDevelopersAndApps()` 函数
- 改为从 `../app/api.js` 导入 `ensureAppInfo`
- 文件从 493 行减少到 293 行（减少 200 行）

#### `src/features/leaderboard/tools.ts`
**变更**：
- 移除 5 个应用管理工具定义
- 移除对 `appHandlers` 和 `environmentHandlers` 的导入
- 文件从 251 行减少到 172 行（减少 79 行）

#### `src/features/leaderboard/handlers.ts`
**变更**：
- 改为从 `../app/api.js` 导入 `ensureAppInfo` 和 `SelectionRequiredError`
- 不再从 `./api.js` 导入这些函数

#### `src/features/leaderboard/index.ts`
**变更**：
- 从 `requiresAuth` 列表中移除 `list_developers_and_apps` 和 `select_app`

#### `src/core/handlers/appHandlers.ts`
**变更**：
- 简化为仅导出 `../../features/app/handlers.js` 的函数
- 添加 `@deprecated` 标记，保留用于向后兼容
- 文件从 94 行减少到 9 行（减少 85 行）

#### `src/server.ts`
**变更**：
- 导入 `appModule`
- 在 `allModules` 数组中添加 `appModule`
- 启动日志显示：
  ```
  📦 app: 5 tools, 0 resources
  📦 leaderboard: 5 tools, 7 resources
  ```

## 技术细节

### 模块结构
```typescript
export const appModule = {
  name: 'app',
  description: 'TapTap Application Management - 开发者和应用选择',
  tools: appTools as ToolRegistration[],
  resources: [] as ResourceRegistration[]
};
```

### API 分离
```typescript
// Before (in leaderboard/api.ts):
export async function getAppInfo(...) { ... }
export async function ensureAppInfo(...) { ... }
export async function selectApp(...) { ... }
export async function getAllDevelopersAndApps(...) { ... }

// After (in app/api.ts):
export async function getAppInfo(...) { ... }
export async function ensureAppInfo(...) { ... }
export async function selectApp(...) { ... }
export async function getAllDevelopersAndApps(...) { ... }
```

### 依赖关系
```
app 模块 (独立)
  ↓ ensureAppInfo()
leaderboard 模块 (依赖 app 模块)
```

## 影响范围

### 代码行数变化
- **新增**: `src/features/app/` (~430 行)
- **减少**:
  - `leaderboard/api.ts`: -200 行
  - `leaderboard/tools.ts`: -79 行
  - `core/handlers/appHandlers.ts`: -85 行
- **净增加**: ~66 行（新增模块结构）

### 向后兼容性
✅ **完全兼容**
- `core/handlers/appHandlers.ts` 保留为兼容层
- 所有现有导入路径继续有效
- API 签名未改变

### 测试结果
```bash
npm run build
✅ TypeScript 编译成功

node dist/server.js
✅ 服务器启动成功
📦 app: 5 tools, 0 resources
📦 leaderboard: 5 tools, 7 resources
```

## 优势

### 1. **清晰的模块边界**
- 应用管理功能独立为一个模块
- 排行榜模块专注于排行榜功能
- 每个模块的职责明确

### 2. **可复用性**
- 未来的 `cloudSave`、`share` 等模块可以复用 app 模块
- 应用选择功能成为公共基础能力

### 3. **易于维护**
- 应用相关的所有代码在 `src/features/app/` 目录
- 修改应用管理功能不会影响排行榜模块
- 减少了跨模块的代码耦合

### 4. **符合设计原则**
- **单一职责原则（SRP）**: 每个模块只负责一个功能领域
- **开闭原则（OCP）**: 扩展新功能不需要修改现有模块
- **依赖倒置原则（DIP）**: leaderboard 依赖 app 的接口，而非实现

## 未来扩展

### 添加新功能模块（如 cloudSave）
```typescript
// src/features/cloudSave/handlers.ts
import { ensureAppInfo } from '../app/api.js';

export async function saveData(args, context) {
  const appInfo = await ensureAppInfo(context.projectPath);
  // Use appInfo.app_id and appInfo.developer_id
  // ...
}
```

### 添加更多应用管理工具
只需在 `src/features/app/tools.ts` 添加新工具即可：
```typescript
export const appTools: ToolRegistration[] = [
  // ... existing tools
  {
    definition: {
      name: 'switch_app',
      description: '快速切换应用...'
    },
    handler: async (args, context) => { ... }
  }
];
```

## 总结

这次重构完成了应用管理功能的完全模块化：
- ✅ 从排行榜模块中分离应用操作
- ✅ 创建独立的 app 功能模块
- ✅ 保持向后兼容性
- ✅ 为未来功能扩展奠定基础

**核心原则**：功能内聚、模块独立、接口清晰。

---

**相关文档**：
- [REFACTOR_PROPOSAL.md](./REFACTOR_PROPOSAL.md) - Tools/Resources 统一化重构
- [CHANGELOG.md](./CHANGELOG.md) - 版本变更记录
