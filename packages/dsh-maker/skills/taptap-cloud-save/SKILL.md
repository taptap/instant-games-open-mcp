---
name: taptap-cloud-save
description: 接入或修改 TapTap 云存档/云存储时使用。触发词：云存档、存档、云存储、保存进度、读档、archive、CloudSaveManager、FileSystemManager、tapfile。
---

# TapTap 云存档接入（Maker）

## 硬规则（先读）

- **真相源 = 工程内 `engine-docs/recipes/sdk.md`**（及其中云存档/文件系统章节）。写代码前先读它。
- **禁止 web_search 查 TapTap 云存档 API**。Maker 引擎文档只在工程内，公网没有官方版；网上能搜到的是其它平台（微信小游戏等）的文档，属于错误信息源。
- **`tap` 是全局对象**，由 TapTap 运行时自动提供（类似 `window`）：**不要 `npm install @taptap/xxx`、不要改 package.json、不要 import/require 任何 TapTap 模块**。

## 核心概念

- 文件路径协议是 `tapfile://`，通过 `tap.env` 访问：
  - `tap.env.USER_DATA_PATH` → `tapfile://usr`（用户数据，持久化）
  - `tap.env.TEMP_DATA_PATH` → `tapfile://tmp`（临时）
  - `tap.env.STORE_DATA_PATH` → `tapfile://store`（存储）
- 云存档 = 本地文件 + 云端归档：先把数据写本地文件，再上传为 archive。

## 工作流

1. 获取管理器实例（无需安装/导入）：
   ```javascript
   const cloudSaveManager = tap.getCloudSaveManager();
   const fs = tap.getFileSystemManager();
   ```
2. **保存**：`fs.writeFile(...)` 写本地文件 → `cloudSaveManager.createArchive({ archiveMetaData, archiveFilePath, success, fail })` 上传。`archiveMetaData.name` 无空格、无中文；`summary` 是描述；`playtime` 是时长（秒）。已有存档用 `updateArchive`。
3. **读取**：`cloudSaveManager.getArchiveList(...)` 取列表 → `cloudSaveManager.getArchiveData(...)` 下载到本地 → `fs.readFile(...)` 读数据。
4. 其它：`getArchiveCover`（封面）、`deleteArchive`（删除）；文件系统还有 `mkdir`/`rmdir`/`unlink`。
5. 只信工程内文档，按其中的真实签名与回调形态实现，不凭记忆写参数。

## 常见错误

- `npm install`/`import` TapTap SDK——`tap` 是全局对象，无需安装。
- 用错平台 API（微信小游戏云存储）——以 `engine-docs` 为准。
- 存档名含空格/中文——`archiveMetaData.name` 有约束。
- 把 `maker://`、`docs://cloud-save/*` 当可读资源——DSH 读不了 resources，用本 skill + 工程文档。
