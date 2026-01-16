# TapTap Minigame MCP Server Backend API Documentation

本文档记录了 MCP Server 内部调用的 TapTap 后端 API 接口。这些接口用于实现 MCP 的各项管理功能（如排行榜管理、应用信息更新等）。

> **注意**：这些 API 主要供 MCP Server 内部使用，依赖 TapTap 的 MAC Token 鉴权机制。

## 🔐 鉴权与公共参数

所有请求均包含以下公共参数和请求头：

### Query Parameters

- `client_id`: 客户端 ID

### Request Headers

- `Authorization`: MAC Token 认证头。格式：`MAC id="{kid}", ts="{timestamp}", nonce="{nonce}", mac="{signature}"`
- `X-Tap-Ts`: 时间戳 (Unix Timestamp, 秒)
- `X-Tap-Nonce`: 随机字符串
- `X-Tap-Sign`: 请求签名 (HMAC-SHA1)
- `Content-Type`: `application/json` (除特殊说明外)

---

## 👤 账号信息 (Account)

### 1. 获取基础信息

获取当前登录用户的 Account ID。

- **Endpoint**: `/account/basic-info/v1`
- **Method**: `GET`

### 2. 获取个人信息

获取当前登录用户的详细个人资料。

- **Endpoint**: `/account/profile/v1`
- **Method**: `GET`

---

## 📱 应用管理 (App Management)

### 1. 获取开发者和应用列表

获取当前用户关联的所有开发者账号及其下的应用列表。

- **Endpoint**: `/level/v1/list`
- **Method**: `GET`
- **Params**: 无
- **Response**:
  ```json
  {
    "list": [
      {
        "developer_id": 12345,
        "developer_name": "My Studio",
        "levels": [{ "app_id": 1001, "app_title": "Game A", "is_published": true }]
      }
    ]
  }
  ```

### 2. 获取应用详细信息

获取指定应用的详细配置信息（包括已发布和未发布的草稿）。

- **Endpoint**: `/level/v1/latest`
- **Method**: `GET`
- **Params**:
  - `app_id`: 应用 ID
- **Response**: 包含 `level` (线上版) 和 `upload_level` (草稿版) 的详细信息。

### 3. 获取应用状态

查询应用的审核状态。

- **Endpoint**: `/level/v1/status`
- **Method**: `GET`
- **Params**:
  - `app_id`: 应用 ID
- **Response**:
  ```json
  {
    "app_status": 1, // 0:未上线, 1:已上线
    "review_status": 1 // 0:未发布, 1:审核中, 2:失败, 4:已上线
  }
  ```

### 4. 创建应用

为指定开发者创建新应用。

- **Endpoint**: `/level/v1/create`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "developer_id": 12345,
    "title": "New Game",
    "category": "casual"
  }
  ```

### 5. 更新应用信息

更新应用的基本信息（名称、简介、素材等）。

- **Endpoint**: `/level/v1/submit`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "app_id": 1001,
    "developer_id": 12345,
    "title": "Updated Title",
    "description": "...",
    "icon": "https://...",
    "screenshots": ["..."]
  }
  ```

### 6. 创建开发者

注册新的开发者身份。

- **Endpoint**: `/v1/developer/create-register`
- **Method**: `POST`
- **Body**: 无（使用当前登录用户身份创建）

### 7. 上传图片

上传图片资源（图标、截图等）。

- **Endpoint**: `/v1/upload-image`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Body**: `image` (File)

---

## 🏆 排行榜 (Leaderboard)

### 1. 创建排行榜

- **Endpoint**: `/open/leaderboard/v1/create`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `title`: 标题
  - `period_type`: 周期类型 (1:永久, 2:每天, 3:每周, 4:每月)
  - `score_type`: 分数类型 (1:数值, 2:时间)
  - `score_order`: 排序方式 (1:降序, 2:升序)
  - `calc_type`: 统计方式 (1:累加, 2:最佳, 3:最新)
  - `display_limit`: 显示数量
  - `period_time`: 重置时间 (如 "08:00:00")

### 2. 获取排行榜列表

- **Endpoint**: `/open/leaderboard/v1/list`
- **Method**: `GET`
- **Params**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `page`: 页码
  - `page_size`: 每页数量

### 3. 发布/设置白名单

发布排行榜或设置为仅白名单可见。

- **Endpoint**: `/open/leaderboard/v1/set-whitelist-only`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `id`: 排行榜 ID
  - `whitelist_only`: `true` (白名单), `false` (公开)

---

## 🎮 H5 游戏 (H5 Game)

### 1. 获取上传参数

获取 H5 游戏包上传所需的签名 URL 和参数。

- **Endpoint**: `/level/v1/upload`
- **Method**: `GET`
- **Params**:
  - `app_id`: 应用 ID
- **Response**: 包含上传 URL、Method 以及所需的 Headers。

---

## 📤 分享 (Share)

### 1. 创建分享模板

- **Endpoint**: `/open/miniapp/share/v1/create-share-template`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `contents`: 描述文案 (max 21 chars)
  - `remark`: 备注

### 2. 获取分享模板列表

- **Endpoint**: `/open/miniapp/share/v1/list-share-template`
- **Method**: `GET`
- **Params**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `page`: 页码
  - `page_size`: 每页数量

### 3. 获取模板详情

- **Endpoint**: `/open/miniapp/share/v1/share-template-info`
- **Method**: `GET`
- **Params**:
  - `developer_id`: 开发者 ID
  - `app_id`: 应用 ID
  - `template_code`: 模板代码
