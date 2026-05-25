# 应用缓存系统架构 (App Cache System)

本文档详细说明了 TapTap Minigame MCP Server 的应用缓存机制，该机制用于优化 API 调用频率，提升响应速度，并确保数据的一致性。

## 1. 核心目标

- **减少冗余请求**：避免频繁调用不常变更的接口（如应用基础信息）。
- **保证数据时效**：针对不同类型的数据（基础信息 vs 审核状态）实施差异化的缓存时效策略。
- **即时一致性**：在执行写操作（如上传游戏、修改信息）后立即更新缓存，确保用户看到最新状态。
- **用户可控**：允许通过参数强制忽略缓存，获取实时数据。

## 2. 缓存结构设计

缓存文件存储在独立于 Workspace 的临时目录中（由 `TAPTAP_MCP_CACHE_DIR` 环境变量控制），针对每个租户（projectPath）隔离。

### 数据结构 (`AppCacheInfo`)

```typescript
export interface AppCacheInfo {
  // --- 基础标识信息 (向后兼容) ---
  developer_id?: number;
  developer_name?: string;
  app_id?: number;
  app_title?: string;
  miniapp_id?: string;

  // --- 详细版本信息 ---
  level?: any; // 线上版本完整详情 (对应 /level/v1/latest 的 level 字段)
  upload_level?: any; // 审核版本完整详情 (对应 /level/v1/latest 的 upload_level 字段)

  // --- 时效控制 ---
  updated_at?: number; // 基础信息最后更新时间戳
  status_updated_at?: number; // 状态/审核进度最后更新时间戳

  cached_at?: number; // (Legacy) 旧版时间戳
}
```

- **`level`**: 代表已上线的版本信息。
- **`upload_level`**: 代表正在审核或编辑中的草稿版本信息。
- **优先级策略**：读取详情时，优先使用 `level`，如果不存在（纯新应用）则回退使用 `upload_level`。

## 3. TTL (Time-To-Live) 与刷新策略

系统针对不同敏感度的数据采用了差异化的 TTL 策略：

| 数据类型      | 涉及接口                                 | TTL 时长    | 策略描述                                                                 |
| :------------ | :--------------------------------------- | :---------- | :----------------------------------------------------------------------- |
| **基础信息**  | `get_current_app_info` <br> `select_app` | **24 小时** | 包含应用名称、ID、简介等低频变更数据。过期后自动触发 `refreshAppCache`。 |
| **状态/审核** | `get_app_status`                         | **5 分钟**  | 包含上线状态、审核进度等高频关注数据。过期后自动重新获取状态。           |

### 自动刷新逻辑 (`ensureAppInfo`)

在获取应用信息时，系统会检查 `updated_at`：

1. **未过期**：直接返回缓存数据。
2. **已过期**：尝试发起网络请求刷新缓存。
   - **成功**：更新缓存文件并返回新数据。
   - **失败**：如果本地有旧缓存，返回旧数据（并在日志/响应中标记为陈旧）；如果无缓存则报错。

## 4. 主动更新机制 (Write-Through)

为了保证“写后读”的一致性，系统在执行关键写操作成功后，会**强制刷新**缓存，忽略 TTL。

- **H5 游戏上传** (`upload_h5_game`)：
  - 上传成功 -> 调用 `refreshAppCache` -> 更新 `upload_level` 信息（包含最新版本号）。
- **应用信息修改** (`update_app_info`)：
  - 修改成功 -> 调用 `refreshAppCache` -> 更新应用名称、简介等。

## 5. 工具集成与控制

### `ignore_cache` 参数

为了应对缓存可能导致的数据滞后（例如在 TapTap 开发者后台手动修改了信息，但本地缓存未过期），相关工具新增了 `ignore_cache` 参数：

- **`get_current_app_info`**
- **`get_app_status`**

**用法示例**：

```json
{
  "name": "get_current_app_info",
  "arguments": {
    "ignore_cache": true
  }
}
```

当 `ignore_cache: true` 时，系统会跳过 TTL 检查，强制发起网络请求并更新本地缓存。

### 反馈信息增强

`get_current_app_info` 的返回结果中增加了缓存状态说明：

```markdown
## 💾 缓存状态

- **最后更新**: 2024/01/20 10:00:00
- **数据来源**: 本地缓存 (或 实时服务器)
```

## 6. 代码实现索引

- **缓存定义**: `src/core/utils/cache.ts`
- **刷新逻辑**: `src/features/app/api.ts` -> `ensureAppInfo`, `refreshAppCache`
- **工具处理**: `src/features/app/handlers.ts` -> `getCurrentAppInfo`
- **写操作集成**: `src/features/h5Game/handlers.ts`, `src/features/app/handlers.ts`

---

## 7. Code Review 与修复记录

### 7.1 初审意见 (2025-01-05)

> 由 Claude Code 审核 Gemini 提交的缓存重构代码

**整体评价**：设计方向正确，但实现存在问题。

### 7.2 已修复的问题 ✅

以下问题已在同一次会话中修复：

#### 7.2.1 `is_stale` 字段 → ✅ 已修复

- 在 `AppCacheInfo` 接口添加了 `is_stale?: boolean` 字段
- 在 `ensureAppInfo` 刷新失败时设置 `is_stale: true`

#### 7.2.2 `getAppStatus` 死代码 → ✅ 已修复

- 删除了无效的 TTL 检查逻辑
- 简化为总是实时获取状态数据

#### 7.2.3 `any` 类型 → ✅ 已修复

- 定义了 `CachedLevelInfo` 接口
- `level` 和 `upload_level` 现在使用具体类型

#### 7.2.4 `getAppInfo` 自动选择逻辑 → ✅ 已修复

- 删除了 `getAppInfo` 函数（废弃自动选择行为）
- 简化 `ensureAppInfo`：无缓存时返回 `null`
- `getCurrentAppInfo` 正确引导用户手动选择应用

#### 7.2.5 函数重命名 → ✅ 已完成

- `getAppDetail` → `fetchAppDetail`（明确表示纯 API 调用）

### 7.3 设计决策记录

| 问题                  | 决策               | 理由                                 |
| :-------------------- | :----------------- | :----------------------------------- |
| `selectApp` 权限验证  | 保持现状（不验证） | 服务端 `/level/v1/latest` 有权限校验 |
| 状态数据 TTL          | 总是实时获取       | 审核状态是用户最关心的实时信息       |
| `getAppInfo` 两次请求 | 已删除该函数       | 改为显式选择流程                     |

### 7.4 API 函数职责（修复后）

```
┌─────────────────────────────────────────────────────────────┐
│                    对外暴露（handlers 使用）                  │
├─────────────────────────────────────────────────────────────┤
│  ensureAppInfo()          - 获取缓存（带 TTL 检查）           │
│                             无缓存返回 null，不自动选择        │
│  selectApp()              - 选择应用并缓存                    │
│  refreshAppCache()        - 强制刷新当前应用缓存              │
│  getAllDevelopersAndApps() - 获取列表供用户选择               │
│  fetchAppDetail()         - 通过 ID 获取应用详情（纯 API）    │
└─────────────────────────────────────────────────────────────┘
```

### 7.5 测试建议

1. **验证缓存过期刷新**: 设置 `updated_at` 为 25 小时前，确认调用 `ensureAppInfo` 会触发刷新
2. **验证 Write-Through**: 上传 H5 游戏后，确认 `get_current_app_info` 返回最新版本号
3. **验证 `ignore_cache`**: 传入 `ignore_cache: true`，确认返回结果中显示 "实时服务器"
4. **验证未选择应用提示**: 清除缓存后调用 `get_current_app_info`，确认返回引导信息
