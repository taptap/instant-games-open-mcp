/**
 * TapTap Cloud Save Documentation Tools
 * Each CloudSaveManager and FileSystemManager API has its own dedicated tool
 */

import {
  generateAPIDoc,
  generateOverview,
  type ResourceSuggestion,
  generateSearchSuggestions,
  searchDocumentation,
} from '../../core/utils/docHelpers.js';

import { CLOUD_SAVE_DOCUMENTATION } from './docs.js';

interface ToolArgs {
  query?: string;
}

// ============ CloudSaveManager API Tools ============

/**
 * Get documentation for tap.getCloudSaveManager()
 */
async function getCloudSaveManager(): Promise<string> {
  return generateAPIDoc(
    CLOUD_SAVE_DOCUMENTATION,
    'cloud_save_initialization',
    'tap.getCloudSaveManager'
  );
}

/**
 * Get documentation for createArchive()
 */
async function createArchive(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_create', 'createArchive');
}

/**
 * Get documentation for updateArchive()
 */
async function updateArchive(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_update', 'updateArchive');
}

/**
 * Get documentation for getArchiveList()
 */
async function getArchiveList(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_list', 'getArchiveList');
}

/**
 * Get documentation for getArchiveData()
 */
async function getArchiveData(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_download', 'getArchiveData');
}

/**
 * Get documentation for getArchiveCover()
 */
async function getArchiveCover(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_download', 'getArchiveCover');
}

/**
 * Get documentation for deleteArchive()
 */
async function deleteArchive(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'cloud_save_delete', 'deleteArchive');
}

// ============ FileSystemManager API Tools ============

/**
 * Get documentation for tap.getFileSystemManager()
 */
async function getFileSystemManager(): Promise<string> {
  return generateAPIDoc(
    CLOUD_SAVE_DOCUMENTATION,
    'file_system_initialization',
    'tap.getFileSystemManager'
  );
}

/**
 * Get documentation for writeFile()
 */
async function writeFile(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'file_system_write', 'writeFile');
}

/**
 * Get documentation for readFile()
 */
async function readFile(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'file_system_read', 'readFile');
}

/**
 * Get documentation for mkdir()
 */
async function mkdir(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'file_system_directory', 'mkdir');
}

/**
 * Get documentation for rmdir()
 */
async function rmdir(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'file_system_directory', 'rmdir');
}

/**
 * Get documentation for unlink()
 */
async function unlink(): Promise<string> {
  return generateAPIDoc(CLOUD_SAVE_DOCUMENTATION, 'file_system_delete', 'unlink');
}

// ============ Helper Tools ============

/**
 * Resource suggestions for cloud save
 */
const CLOUD_SAVE_SUGGESTIONS: ResourceSuggestion[] = [
  {
    keywords: ['init', 'start', 'get', 'manager', 'cloud'],
    uri: 'docs://cloud-save/api/get-cloud-save-manager',
    description: '如何获取 CloudSaveManager 实例',
  },
  {
    keywords: ['create', 'new', 'save', 'upload', 'archive'],
    uri: 'docs://cloud-save/api/cloud-save-manager/create-archive',
    description: '如何创建云存档',
  },
  {
    keywords: ['update', 'modify', 'change', 'edit'],
    uri: 'docs://cloud-save/api/cloud-save-manager/update-archive',
    description: '如何更新云存档',
  },
  {
    keywords: ['list', 'all', 'archives', 'saves'],
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-list',
    description: '如何获取所有云存档列表',
  },
  {
    keywords: ['download', 'load', 'get', 'data', 'file'],
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-data',
    description: '如何下载云存档文件',
  },
  {
    keywords: ['cover', 'image', 'thumbnail'],
    uri: 'docs://cloud-save/api/cloud-save-manager/get-archive-cover',
    description: '如何下载云存档封面',
  },
  {
    keywords: ['delete', 'remove', 'archive'],
    uri: 'docs://cloud-save/api/cloud-save-manager/delete-archive',
    description: '如何删除云存档',
  },
  {
    keywords: ['file', 'system', 'fs', 'local'],
    uri: 'docs://cloud-save/api/get-file-system-manager',
    description: '如何获取 FileSystemManager 实例',
  },
  {
    keywords: ['write', 'save', 'file', 'local'],
    uri: 'docs://cloud-save/api/file-system-manager/write-file',
    description: '如何写入本地文件',
  },
  {
    keywords: ['read', 'load', 'file', 'local'],
    uri: 'docs://cloud-save/api/file-system-manager/read-file',
    description: '如何读取本地文件',
  },
];

/**
 * Search cloud save documentation by keyword
 */
async function searchCloudSaveDocs(args: ToolArgs): Promise<string> {
  const query = args.query?.toLowerCase() || '';

  if (!query) {
    return 'Please provide a search keyword.';
  }

  const results = searchDocumentation(CLOUD_SAVE_DOCUMENTATION, query);

  if (results.length === 0) {
    return generateSearchSuggestions(query, CLOUD_SAVE_SUGGESTIONS, 'docs://cloud-save/overview');
  }

  return `**Cloud Save Search Results for "${query}"**\n\n` + results.join('\n---\n\n');
}

/**
 * Get complete cloud save system overview
 */
async function getOverview(): Promise<string> {
  return generateOverview(CLOUD_SAVE_DOCUMENTATION);
}

/**
 * Get complete integration workflow guide
 */
async function getIntegrationWorkflow(): Promise<string> {
  return `# TapTap 云存档完整接入工作流

## 关键原则：客户端无需安装 SDK

**请勿执行以下操作**：
- npm install @taptap/xxx
- 修改 package.json 添加依赖
- import 或 require 任何 TapTap 模块

**原因**：tap 是全局对象，由 TapTap 运行时自动提供（类似 window、document）

---

## 文件路径协议

云存档使用 \`tapfile://\` 协议，通过 \`tap.env\` 访问：

| 路径 | 协议 | 用途 |
|------|------|------|
| \`tap.env.USER_DATA_PATH\` | \`tapfile://usr\` | 用户数据目录（持久化） |
| \`tap.env.TEMP_DATA_PATH\` | \`tapfile://tmp\` | 临时文件目录 |
| \`tap.env.STORE_DATA_PATH\` | \`tapfile://store\` | 存储目录 |

---

## 工作流程图

### 创建/保存存档
\`\`\`
游戏数据 → FileSystemManager.writeFile() → 本地文件
                                              ↓
                              CloudSaveManager.createArchive()
                                              ↓
                                           云端存储
\`\`\`

### 读取/加载存档
\`\`\`
CloudSaveManager.getArchiveList() → 获取存档列表
                                              ↓
           CloudSaveManager.getArchiveData() → 下载到本地
                                              ↓
                   FileSystemManager.readFile() → 游戏数据
\`\`\`

---

## 完整步骤

### 步骤 1: 获取管理器实例

\`\`\`javascript
const cloudSaveManager = tap.getCloudSaveManager();
const fs = tap.getFileSystemManager();
\`\`\`

### 步骤 2: 保存游戏到云端

\`\`\`javascript
// 2.1 准备存档数据
const saveData = {
  level: 10,
  gold: 5000,
  inventory: ['sword', 'shield'],
  playTime: 3600
};

// 2.2 写入本地文件
fs.writeFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/slot_1.json\`,
  data: JSON.stringify(saveData),
  encoding: 'utf8',
  success: () => {
    // 2.3 上传到云端
    cloudSaveManager.createArchive({
      archiveMetaData: {
        name: "slot_1",           // 存档名（无空格、无中文）
        summary: "Level 10",       // 描述
        playtime: 3600             // 游戏时长（秒）
      },
      archiveFilePath: \`\${tap.env.USER_DATA_PATH}/slot_1.json\`,
      success: (res) => {
        console.log("保存成功! UUID:", res.uuid);
      },
      fail: (err) => {
        console.error("保存失败:", err.errno, err.errMsg);
      }
    });
  }
});
\`\`\`

### 步骤 3: 从云端加载游戏

\`\`\`javascript
// 3.1 获取存档列表
cloudSaveManager.getArchiveList({
  success: (res) => {
    const archive = res.saves.find(s => s.name === "slot_1");
    if (!archive) {
      console.log("存档不存在");
      return;
    }

    // 3.2 下载存档文件
    cloudSaveManager.getArchiveData({
      archiveUUID: archive.uuid,
      archiveFileId: archive.fileId,
      targetFilePath: \`\${tap.env.USER_DATA_PATH}/slot_1_download.json\`,
      success: (downloadRes) => {
        // 3.3 读取文件内容
        fs.readFile({
          filePath: downloadRes.filePath,
          encoding: 'utf8',
          success: (fileRes) => {
            const saveData = JSON.parse(fileRes.data);
            console.log("加载成功:", saveData);
            // 恢复游戏状态...
          }
        });
      }
    });
  }
});
\`\`\`

### 步骤 4: 更新已有存档（可选）

\`\`\`javascript
cloudSaveManager.updateArchive({
  archiveUUID: "existing_uuid",  // 从 createArchive 或 getArchiveList 获取
  archiveMetaData: {
    name: "slot_1",
    summary: "Level 20 - Updated",
    playtime: 7200
  },
  archiveFilePath: \`\${tap.env.USER_DATA_PATH}/slot_1.json\`,
  success: (res) => console.log("更新成功"),
  fail: (err) => console.error("更新失败:", err)
});
\`\`\`

### 步骤 5: 删除存档（可选）

\`\`\`javascript
cloudSaveManager.deleteArchive({
  archiveUUID: "archive_uuid_to_delete",
  success: () => console.log("删除成功"),
  fail: (err) => console.error("删除失败:", err)
});
\`\`\`

---

## 常见错误码

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| 400000 | 文件或封面超过大小限制 | 存档文件 ≤ 10MB，封面 ≤ 512KB |
| 400001 | 上传频率超限 | 每分钟只能上传 1 次 |
| 400002 | 存档不存在 | 检查 archiveUUID 是否正确 |
| 400003 | 存档数量超限 | 删除旧存档后再创建 |
| 400007 | 不允许并发调用 | 等待上一个请求完成 |
| 400009 | 存档名无效 | 不能包含空格或中文 |
| 400100 | SDK 初始化失败 | 检查运行环境 |
| 400101 | 文件不存在 | 检查 archiveFilePath |
| 400200 | 文件路径无效 | 使用 tap.env 路径 |
| 400201 | archiveUUID 为空 | 提供有效的 UUID |
| 400202 | archiveFileId 为空 | 提供有效的 fileId |

---

## API 文档索引

### CloudSaveManager
- \`docs://cloud-save/api/get-cloud-save-manager\` - 获取实例
- \`docs://cloud-save/api/cloud-save-manager/create-archive\` - 创建存档
- \`docs://cloud-save/api/cloud-save-manager/update-archive\` - 更新存档
- \`docs://cloud-save/api/cloud-save-manager/get-archive-list\` - 获取列表
- \`docs://cloud-save/api/cloud-save-manager/get-archive-data\` - 下载存档
- \`docs://cloud-save/api/cloud-save-manager/get-archive-cover\` - 下载封面
- \`docs://cloud-save/api/cloud-save-manager/delete-archive\` - 删除存档

### FileSystemManager
- \`docs://cloud-save/api/get-file-system-manager\` - 获取实例
- \`docs://cloud-save/api/file-system-manager/write-file\` - 写入文件
- \`docs://cloud-save/api/file-system-manager/read-file\` - 读取文件
- \`docs://cloud-save/api/file-system-manager/mkdir\` - 创建目录
- \`docs://cloud-save/api/file-system-manager/rmdir\` - 删除目录
- \`docs://cloud-save/api/file-system-manager/unlink\` - 删除文件

### 概览
- \`docs://cloud-save/overview\` - 完整概览

---

完成！你已经掌握了云存档的完整接入流程。
`;
}

export const cloudSaveTools = {
  // CloudSaveManager API tools
  getCloudSaveManager,
  createArchive,
  updateArchive,
  getArchiveList,
  getArchiveData,
  getArchiveCover,
  deleteArchive,

  // FileSystemManager API tools
  getFileSystemManager,
  writeFile,
  readFile,
  mkdir,
  rmdir,
  unlink,

  // Helper tools
  searchCloudSaveDocs,
  getOverview,
  getIntegrationWorkflow,
};
