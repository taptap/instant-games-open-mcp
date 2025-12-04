/**
 * TapTap Cloud Save API Documentation
 * Based on: https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/
 */

import type { Documentation } from '../../core/utils/docHelpers.js';

/**
 * Cloud Save documentation data
 */
export const CLOUD_SAVE_DOCUMENTATION: Documentation = {
  title: 'TapTap Cloud Save API (Minigame & H5)',
  description: `Complete cloud save functionality for TapTap Minigame and H5 Games, including archive creation, update, deletion, and file system operations.

⚠️ IMPORTANT:
- NO npm packages or SDK installation required
- NO imports needed
- The 'tap' object is a GLOBAL object provided by TapTap runtime environment
- Cloud save APIs are accessed via: tap.getCloudSaveManager()
- File system APIs are accessed via: tap.getFileSystemManager()
- Works in TapTap Minigame AND H5 game environments (not in regular web browsers)

📁 File Path Protocols (tap.env):
- tap.env.USER_DATA_PATH = 'tapfile://usr' - User data directory (persistent)
- tap.env.TEMP_DATA_PATH = 'tapfile://tmp' - Temporary files directory
- tap.env.STORE_DATA_PATH = 'tapfile://store' - Store data directory`,
  apiReference: 'https://developer.taptap.cn/minigameapidoc/dev/api/open-api/cloudsave/',

  categories: {
    cloud_save_initialization: {
      title: 'Cloud Save Initialization',
      description:
        "Get the CloudSaveManager instance from the global 'tap' object (provided by TapTap runtime)",
      apis: [
        {
          name: 'tap.getCloudSaveManager',
          method: 'tap.getCloudSaveManager()',
          description:
            "Get the CloudSaveManager instance to access cloud save functionality. ⚠️ IMPORTANT: 'tap' is a GLOBAL object provided by TapTap runtime, NO imports or installations needed. The manager is a singleton - multiple calls return the same instance.",
          returnValue: 'CloudSaveManager - The cloud save manager instance',
          example: `// ⚠️ IMPORTANT: 'tap' is a global object, NO imports needed!
// This works ONLY in TapTap minigame/H5 environment

// Get CloudSaveManager instance
const cloudSaveManager = tap.getCloudSaveManager();

// Now you can use cloudSaveManager to call various methods
// All methods support both callback and Promise styles`,
        },
      ],
    },

    cloud_save_create: {
      title: 'Create Archive',
      description: 'Create new cloud save archives with file and cover image upload',
      apis: [
        {
          name: 'createArchive',
          method:
            'cloudSaveManager.createArchive({ archiveMetaData, archiveFilePath, archiveCoverPath?, success?, fail?, complete? })',
          description:
            'Create a new cloud archive. Uploads archive file and optional cover image to cloud storage. Supports both callback and Promise styles.',
          parameters: {
            archiveMetaData:
              'ArchiveMetaData (required) - Archive metadata object containing name, summary, extra, playtime',
            'archiveMetaData.name':
              'string (required) - Archive name, max 60 bytes, no spaces or Chinese characters',
            'archiveMetaData.summary': 'string (required) - Archive description, max 500 bytes',
            'archiveMetaData.extra': 'string (optional) - Custom data for game use, max 1000 bytes',
            'archiveMetaData.playtime': 'number (optional) - Game play duration in seconds',
            archiveFilePath:
              'string (required) - Path to archive file, max 10MB per file. Use tap.env paths.',
            archiveCoverPath:
              'string (optional) - Path to cover image, max 512KB. Supports png/jpg.',
            success: 'function (optional) - Success callback with { uuid, fileId }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue:
            'Promise<{ uuid: string, fileId: string }> - Returns archive UUID and file ID on success',
          example: `const cloudSaveManager = tap.getCloudSaveManager();
const fs = tap.getFileSystemManager();

// Step 1: Write save data to local file first
const saveData = JSON.stringify({
  level: 10,
  score: 99999,
  inventory: ['sword', 'shield'],
  timestamp: Date.now()
});

fs.writeFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/mysave.json\`,
  data: saveData,
  encoding: 'utf8',
  success: () => {
    // Step 2: Create cloud archive after file is written
    cloudSaveManager.createArchive({
      archiveMetaData: {
        name: "save_slot_1",  // No spaces or Chinese!
        summary: "Level 10 progress",
        extra: JSON.stringify({ slot: 1 }),
        playtime: 3600  // 1 hour in seconds
      },
      archiveFilePath: \`\${tap.env.USER_DATA_PATH}/mysave.json\`,
      archiveCoverPath: \`\${tap.env.USER_DATA_PATH}/screenshot.png\`,  // Optional
      success: (res) => {
        console.log("Archive created!");
        console.log("UUID:", res.uuid);      // Unique archive identifier
        console.log("FileId:", res.fileId);  // File identifier
      },
      fail: ({ errMsg, errno }) => {
        console.error(\`Failed: \${errno} - \${errMsg}\`);
        // Common errors:
        // 400000: File or cover exceeds size limit
        // 400001: Upload frequency exceeded (1x per minute)
        // 400003: Archive count exceeded
        // 400009: Invalid archive name
        // 400101: File not found
      }
    });
  }
});

// Promise style
async function createSave() {
  try {
    const result = await cloudSaveManager.createArchive({
      archiveMetaData: {
        name: "save_slot_1",
        summary: "My save",
        playtime: 3600
      },
      archiveFilePath: \`\${tap.env.USER_DATA_PATH}/mysave.json\`
    });
    console.log("Created:", result.uuid);
  } catch (error) {
    console.error("Failed:", error.errno, error.errMsg);
  }
}`,
        },
      ],
    },

    cloud_save_update: {
      title: 'Update Archive',
      description: 'Update existing cloud save archives',
      apis: [
        {
          name: 'updateArchive',
          method:
            'cloudSaveManager.updateArchive({ archiveUUID, archiveMetaData, archiveFilePath, archiveCoverPath?, success?, fail?, complete? })',
          description:
            'Update an existing cloud archive. Can update file content, cover image, and metadata. The UUID remains unchanged but fileId will be updated.',
          parameters: {
            archiveUUID: 'string (required) - Unique identifier of the archive to update',
            archiveMetaData: 'ArchiveMetaData (required) - Updated metadata',
            'archiveMetaData.name':
              'string (required) - Archive name, max 60 bytes, no spaces or Chinese characters',
            'archiveMetaData.summary': 'string (required) - Archive description, max 500 bytes',
            'archiveMetaData.extra': 'string (optional) - Custom data for game use, max 1000 bytes',
            'archiveMetaData.playtime': 'number (optional) - Game play duration in seconds',
            archiveFilePath: 'string (required) - Path to new archive file, max 10MB',
            archiveCoverPath: 'string (optional) - Path to new cover image, max 512KB',
            success: 'function (optional) - Success callback with { uuid, fileId }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue:
            'Promise<{ uuid: string, fileId: string }> - Returns same UUID but new fileId',
          example: `const cloudSaveManager = tap.getCloudSaveManager();

// Update existing archive
cloudSaveManager.updateArchive({
  archiveUUID: "existing_archive_uuid",  // From createArchive or getArchiveList
  archiveMetaData: {
    name: "save_slot_1",
    summary: "Level 20 progress - updated",
    extra: JSON.stringify({ slot: 1, updated: true }),
    playtime: 7200  // 2 hours now
  },
  archiveFilePath: \`\${tap.env.USER_DATA_PATH}/mysave.json\`,
  archiveCoverPath: \`\${tap.env.USER_DATA_PATH}/new_screenshot.png\`,
  success: (res) => {
    console.log("Archive updated!");
    console.log("UUID:", res.uuid);      // Same as before
    console.log("FileId:", res.fileId);  // New file ID
  },
  fail: ({ errMsg, errno }) => {
    console.error(\`Update failed: \${errno} - \${errMsg}\`);
    // 400002: Archive does not exist
  }
});`,
        },
      ],
    },

    cloud_save_list: {
      title: 'Get Archive List',
      description: 'Retrieve all cloud save archives for current user',
      apis: [
        {
          name: 'getArchiveList',
          method: 'cloudSaveManager.getArchiveList({ success?, fail?, complete? })',
          description:
            'Get all cloud archives for the current user. Returns detailed metadata for each archive including UUID, fileId, name, summary, sizes, and timestamps.',
          parameters: {
            success: 'function (optional) - Success callback with { saves: ArchiveDetailData[] }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: `Promise<{ saves: ArchiveDetailData[] }> where ArchiveDetailData contains:
- uuid: string - Unique archive identifier
- fileId: string - Archive file identifier (changes on update)
- name: string - Archive name
- summary: string - Archive description
- extra: string - Custom data
- playtime: number - Play duration in seconds
- saveSize: number - Archive file size in bytes
- coverSize: number - Cover image size in bytes
- createdTime: number - Creation timestamp in seconds
- modifiedTime: number - Last modified timestamp in seconds`,
          example: `const cloudSaveManager = tap.getCloudSaveManager();

// Get all archives
cloudSaveManager.getArchiveList({
  success: (res) => {
    console.log(\`Found \${res.saves.length} archives\`);

    res.saves.forEach((archive, index) => {
      console.log(\`--- Archive \${index + 1} ---\`);
      console.log("UUID:", archive.uuid);
      console.log("Name:", archive.name);
      console.log("Summary:", archive.summary);
      console.log("File Size:", (archive.saveSize / 1024).toFixed(2), "KB");
      console.log("Play Time:", Math.floor(archive.playtime / 60), "minutes");
      console.log("Created:", new Date(archive.createdTime * 1000).toLocaleString());
      console.log("Modified:", new Date(archive.modifiedTime * 1000).toLocaleString());
    });
  },
  fail: ({ errMsg, errno }) => {
    console.error(\`Failed to get list: \${errno} - \${errMsg}\`);
    // 400007: Concurrent calls not permitted
    // 400100: Cloud save SDK initialization failed
  }
});

// Promise style
async function listArchives() {
  try {
    const { saves } = await cloudSaveManager.getArchiveList({});
    return saves;
  } catch (error) {
    console.error("Failed:", error);
    return [];
  }
}`,
        },
      ],
    },

    cloud_save_download: {
      title: 'Download Archive Data',
      description: 'Download cloud save files and cover images to local storage',
      apis: [
        {
          name: 'getArchiveData',
          method:
            'cloudSaveManager.getArchiveData({ archiveUUID, archiveFileId, targetFilePath?, success?, fail?, complete? })',
          description:
            'Download archive file from cloud storage to local file system. If targetFilePath is not specified, creates a temporary file.',
          parameters: {
            archiveUUID: 'string (required) - Unique archive identifier',
            archiveFileId:
              'string (required) - File identifier (from getArchiveList or createArchive)',
            targetFilePath:
              'string (optional) - Local path to save file. If omitted, creates temp file.',
            success: 'function (optional) - Success callback with { filePath }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue:
            'Promise<{ filePath: string }> - Returns the local path where file was saved',
          example: `const cloudSaveManager = tap.getCloudSaveManager();
const fs = tap.getFileSystemManager();

// First get archive list to find UUID and fileId
cloudSaveManager.getArchiveList({
  success: (res) => {
    if (res.saves.length === 0) {
      console.log("No archives found");
      return;
    }

    const archive = res.saves[0];  // Get first archive

    // Download archive data
    cloudSaveManager.getArchiveData({
      archiveUUID: archive.uuid,
      archiveFileId: archive.fileId,
      targetFilePath: \`\${tap.env.USER_DATA_PATH}/downloaded_save.json\`,
      success: (downloadRes) => {
        console.log("Downloaded to:", downloadRes.filePath);

        // Read the downloaded file
        fs.readFile({
          filePath: downloadRes.filePath,
          encoding: 'utf8',
          success: (fileRes) => {
            const saveData = JSON.parse(fileRes.data);
            console.log("Save data:", saveData);
          }
        });
      },
      fail: ({ errMsg, errno }) => {
        console.error(\`Download failed: \${errno} - \${errMsg}\`);
        // 400002: Archive does not exist
        // 400201: archiveUUID is empty
        // 400202: archiveFileId is empty
      }
    });
  }
});`,
        },
        {
          name: 'getArchiveCover',
          method:
            'cloudSaveManager.getArchiveCover({ archiveUUID, archiveFileId, targetFilePath?, success?, fail?, complete? })',
          description:
            'Download archive cover image from cloud storage to local file system. If targetFilePath is not specified, creates a temporary file.',
          parameters: {
            archiveUUID: 'string (required) - Unique archive identifier',
            archiveFileId: 'string (required) - File identifier (from getArchiveList)',
            targetFilePath:
              'string (optional) - Local path to save cover. If omitted, creates temp file.',
            success: 'function (optional) - Success callback with { filePath }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue:
            'Promise<{ filePath: string }> - Returns the local path where cover was saved',
          example: `const cloudSaveManager = tap.getCloudSaveManager();

// Download archive cover image
cloudSaveManager.getArchiveCover({
  archiveUUID: "your_archive_uuid",
  archiveFileId: "your_file_id",
  targetFilePath: \`\${tap.env.USER_DATA_PATH}/cover.png\`,
  success: (res) => {
    console.log("Cover downloaded to:", res.filePath);
    // Use res.filePath to display the cover image
  },
  fail: ({ errMsg, errno }) => {
    console.error(\`Failed: \${errno} - \${errMsg}\`);
  }
});`,
        },
      ],
    },

    cloud_save_delete: {
      title: 'Delete Archive',
      description: 'Delete cloud save archives',
      apis: [
        {
          name: 'deleteArchive',
          method: 'cloudSaveManager.deleteArchive({ archiveUUID, success?, fail?, complete? })',
          description:
            'Delete an existing cloud archive. This action is permanent and cannot be undone.',
          parameters: {
            archiveUUID: 'string (required) - Unique identifier of the archive to delete',
            success: 'function (optional) - Success callback with { uuid }',
            fail: 'function (optional) - Failure callback with { errMsg, errno }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'Promise<{ uuid: string }> - Returns the deleted archive UUID',
          example: `const cloudSaveManager = tap.getCloudSaveManager();

// Delete an archive
cloudSaveManager.deleteArchive({
  archiveUUID: "archive_uuid_to_delete",
  success: (res) => {
    console.log("Deleted archive:", res.uuid);
  },
  fail: ({ errMsg, errno }) => {
    console.error(\`Delete failed: \${errno} - \${errMsg}\`);
    // 400002: Archive does not exist
    // 400007: Concurrent calls not permitted
    // 400201: archiveUUID is empty
  }
});

// With confirmation dialog
function deleteWithConfirm(uuid, name) {
  if (confirm(\`Delete save "\${name}"? This cannot be undone.\`)) {
    cloudSaveManager.deleteArchive({
      archiveUUID: uuid,
      success: () => {
        alert("Save deleted successfully");
        refreshSaveList();
      },
      fail: (err) => {
        alert(\`Failed to delete: \${err.errMsg}\`);
      }
    });
  }
}`,
        },
      ],
    },

    file_system_initialization: {
      title: 'File System Initialization',
      description:
        "Get the FileSystemManager instance from the global 'tap' object for local file operations",
      apis: [
        {
          name: 'tap.getFileSystemManager',
          method: 'tap.getFileSystemManager()',
          description:
            "Get the FileSystemManager instance for local file operations. Required for creating save files before uploading to cloud. ⚠️ 'tap' is a GLOBAL object - no imports needed.",
          returnValue: 'FileSystemManager - The file system manager instance (singleton)',
          example: `// Get FileSystemManager instance
const fs = tap.getFileSystemManager();

// Available paths (from tap.env):
console.log("User data:", tap.env.USER_DATA_PATH);   // tapfile://usr
console.log("Temp data:", tap.env.TEMP_DATA_PATH);   // tapfile://tmp
console.log("Store data:", tap.env.STORE_DATA_PATH); // tapfile://store

// Use USER_DATA_PATH for persistent save files
// Use TEMP_DATA_PATH for temporary files`,
        },
      ],
    },

    file_system_write: {
      title: 'File Write Operations',
      description: 'Write data to local files (required before creating cloud archives)',
      apis: [
        {
          name: 'writeFile',
          method:
            'fileSystemManager.writeFile({ filePath, data, encoding?, success?, fail?, complete? })',
          description:
            'Write data to a local file. Use this to create save files before uploading to cloud storage. Supports string or ArrayBuffer data.',
          parameters: {
            filePath:
              'string (required) - Target file path, use tap.env paths (e.g., tap.env.USER_DATA_PATH + "/save.json")',
            data: 'string | ArrayBuffer (required) - Data to write',
            encoding:
              "string (optional) - Character encoding: 'utf8' (default), 'ascii', 'base64', 'binary', 'hex'",
            success: 'function (optional) - Success callback',
            fail: 'function (optional) - Failure callback with { errMsg }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'void - Result returned via callback (no Promise support)',
          example: `const fs = tap.getFileSystemManager();

// Write JSON save data
const saveData = {
  playerName: "Hero",
  level: 25,
  gold: 10000,
  inventory: ["sword", "shield", "potion"],
  position: { x: 100, y: 200 },
  timestamp: Date.now()
};

fs.writeFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/game_save.json\`,
  data: JSON.stringify(saveData, null, 2),
  encoding: 'utf8',
  success: () => {
    console.log("Save file written successfully");
    // Now you can upload to cloud with createArchive
  },
  fail: (res) => {
    console.error("Write failed:", res.errMsg);
  }
});

// Write binary data (ArrayBuffer)
const buffer = new ArrayBuffer(1024);
const view = new Uint8Array(buffer);
// ... fill buffer with data ...

fs.writeFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/binary_data.bin\`,
  data: buffer,
  success: () => console.log("Binary file written"),
  fail: (res) => console.error("Failed:", res.errMsg)
});

// Sync version (may throw exception)
try {
  fs.writeFileSync(
    \`\${tap.env.USER_DATA_PATH}/sync_save.json\`,
    JSON.stringify(saveData),
    'utf8'
  );
  console.log("Sync write successful");
} catch (error) {
  console.error("Sync write failed:", error);
}`,
        },
      ],
    },

    file_system_read: {
      title: 'File Read Operations',
      description: 'Read data from local files (used after downloading cloud archives)',
      apis: [
        {
          name: 'readFile',
          method:
            'fileSystemManager.readFile({ filePath, encoding?, position?, length?, success?, fail?, complete? })',
          description:
            'Read content from a local file. Use this after downloading cloud archives to parse the save data. Max file size: 100MB.',
          parameters: {
            filePath: 'string (required) - Path to file to read',
            encoding:
              "string (optional) - If specified, returns string. Options: 'utf8', 'ascii', 'base64', 'hex'. If omitted, returns ArrayBuffer.",
            position: 'number (optional) - Starting byte position [0, fileLength-1]',
            length: 'number (optional) - Number of bytes to read [1, fileLength]',
            success: 'function (optional) - Success callback with { data: string | ArrayBuffer }',
            fail: 'function (optional) - Failure callback with { errMsg }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'void - Result returned via callback with data as string or ArrayBuffer',
          example: `const fs = tap.getFileSystemManager();

// Read JSON save file
fs.readFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/game_save.json\`,
  encoding: 'utf8',
  success: (res) => {
    const saveData = JSON.parse(res.data);
    console.log("Loaded save:", saveData);
    console.log("Player level:", saveData.level);
    console.log("Gold:", saveData.gold);
  },
  fail: (res) => {
    console.error("Read failed:", res.errMsg);
  }
});

// Read as ArrayBuffer (binary data)
fs.readFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/binary_data.bin\`,
  // No encoding = returns ArrayBuffer
  success: (res) => {
    const buffer = res.data;  // ArrayBuffer
    const view = new Uint8Array(buffer);
    console.log("First byte:", view[0]);
  },
  fail: (res) => {
    console.error("Read failed:", res.errMsg);
  }
});

// Read partial file
fs.readFile({
  filePath: \`\${tap.env.USER_DATA_PATH}/large_file.bin\`,
  position: 0,      // Start from beginning
  length: 1024,     // Read first 1KB only
  success: (res) => {
    console.log("Read", res.data.byteLength, "bytes");
  }
});

// Sync version
try {
  const data = fs.readFileSync(
    \`\${tap.env.USER_DATA_PATH}/game_save.json\`,
    'utf8'
  );
  const saveData = JSON.parse(data);
  console.log("Sync read:", saveData);
} catch (error) {
  console.error("Read failed:", error);
}`,
        },
      ],
    },

    file_system_directory: {
      title: 'Directory Operations',
      description: 'Create and remove directories in local file system',
      apis: [
        {
          name: 'mkdir',
          method: 'fileSystemManager.mkdir({ dirPath, recursive?, success?, fail?, complete? })',
          description: 'Create a directory. Use this to organize save files into folders.',
          parameters: {
            dirPath: 'string (required) - Path of directory to create',
            recursive: 'boolean (optional) - If true, creates parent directories as needed',
            success: 'function (optional) - Success callback',
            fail: 'function (optional) - Failure callback with { errMsg }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'void - Result returned via callback',
          example: `const fs = tap.getFileSystemManager();

// Create a directory for saves
fs.mkdir({
  dirPath: \`\${tap.env.USER_DATA_PATH}/saves\`,
  success: () => {
    console.log("Directory created");
  },
  fail: (res) => {
    console.error("Failed:", res.errMsg);
  }
});

// Create nested directories
fs.mkdir({
  dirPath: \`\${tap.env.USER_DATA_PATH}/saves/slot1/backups\`,
  recursive: true,  // Creates all parent directories
  success: () => {
    console.log("Nested directories created");
  }
});`,
        },
        {
          name: 'rmdir',
          method: 'fileSystemManager.rmdir({ dirPath, recursive?, success?, fail?, complete? })',
          description: 'Remove a directory. If recursive is true, removes all contents.',
          parameters: {
            dirPath: 'string (required) - Path of directory to remove',
            recursive: 'boolean (optional) - If true, removes directory and all its contents',
            success: 'function (optional) - Success callback',
            fail: 'function (optional) - Failure callback with { errMsg }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'void - Result returned via callback',
          example: `const fs = tap.getFileSystemManager();

// Remove empty directory
fs.rmdir({
  dirPath: \`\${tap.env.USER_DATA_PATH}/old_saves\`,
  success: () => {
    console.log("Directory removed");
  },
  fail: (res) => {
    console.error("Failed:", res.errMsg);
    // May fail if directory not empty
  }
});

// Remove directory with all contents
fs.rmdir({
  dirPath: \`\${tap.env.USER_DATA_PATH}/temp_data\`,
  recursive: true,  // Deletes all files and subdirectories
  success: () => {
    console.log("Directory and contents removed");
  }
});`,
        },
      ],
    },

    file_system_delete: {
      title: 'File Delete Operations',
      description: 'Delete individual files from local file system',
      apis: [
        {
          name: 'unlink',
          method: 'fileSystemManager.unlink({ filePath, success?, fail?, complete? })',
          description: 'Delete a file from local storage.',
          parameters: {
            filePath: 'string (required) - Path to file to delete',
            success: 'function (optional) - Success callback',
            fail: 'function (optional) - Failure callback with { errMsg }',
            complete: 'function (optional) - Completion callback',
          },
          returnValue: 'void - Result returned via callback',
          example: `const fs = tap.getFileSystemManager();

// Delete a file
fs.unlink({
  filePath: \`\${tap.env.USER_DATA_PATH}/old_save.json\`,
  success: () => {
    console.log("File deleted");
  },
  fail: (res) => {
    console.error("Delete failed:", res.errMsg);
  }
});

// Delete temporary file after uploading to cloud
function cleanupAfterUpload(tempFilePath) {
  fs.unlink({
    filePath: tempFilePath,
    success: () => console.log("Temp file cleaned up"),
    fail: () => console.log("Cleanup failed, but upload succeeded")
  });
}`,
        },
      ],
    },

    common_workflows: {
      title: 'Common Workflows',
      description: 'Complete examples for typical cloud save use cases',
      apis: [
        {
          name: 'Complete Save Flow',
          method: 'N/A',
          description: 'Example of creating and saving game progress to cloud',
          example: `// Complete workflow: Save game progress to cloud

const cloudSaveManager = tap.getCloudSaveManager();
const fs = tap.getFileSystemManager();

async function saveGameToCloud(gameState, slotName) {
  const savePath = \`\${tap.env.USER_DATA_PATH}/\${slotName}.json\`;

  // Step 1: Prepare save data
  const saveData = {
    ...gameState,
    savedAt: Date.now(),
    version: "1.0.0"
  };

  // Step 2: Write to local file
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: savePath,
      data: JSON.stringify(saveData),
      encoding: 'utf8',
      success: () => {
        // Step 3: Upload to cloud
        cloudSaveManager.createArchive({
          archiveMetaData: {
            name: slotName,
            summary: \`Level \${gameState.level} - \${gameState.gold} gold\`,
            extra: JSON.stringify({ slot: slotName }),
            playtime: gameState.playTime || 0
          },
          archiveFilePath: savePath,
          success: (res) => {
            console.log("Saved to cloud:", res.uuid);
            resolve(res);
          },
          fail: (err) => {
            console.error("Cloud upload failed:", err);
            reject(err);
          }
        });
      },
      fail: (err) => {
        console.error("Local save failed:", err);
        reject(err);
      }
    });
  });
}

// Usage
saveGameToCloud({
  level: 10,
  gold: 5000,
  position: { x: 100, y: 200 },
  playTime: 3600
}, "slot_1");`,
        },
        {
          name: 'Complete Load Flow',
          method: 'N/A',
          description: 'Example of loading game progress from cloud',
          example: `// Complete workflow: Load game progress from cloud

const cloudSaveManager = tap.getCloudSaveManager();
const fs = tap.getFileSystemManager();

async function loadGameFromCloud(slotName) {
  return new Promise((resolve, reject) => {
    // Step 1: Get archive list
    cloudSaveManager.getArchiveList({
      success: (listRes) => {
        // Step 2: Find the target archive
        const archive = listRes.saves.find(s => s.name === slotName);

        if (!archive) {
          reject(new Error(\`Save slot "\${slotName}" not found\`));
          return;
        }

        const downloadPath = \`\${tap.env.USER_DATA_PATH}/\${slotName}_download.json\`;

        // Step 3: Download archive data
        cloudSaveManager.getArchiveData({
          archiveUUID: archive.uuid,
          archiveFileId: archive.fileId,
          targetFilePath: downloadPath,
          success: (downloadRes) => {
            // Step 4: Read downloaded file
            fs.readFile({
              filePath: downloadRes.filePath,
              encoding: 'utf8',
              success: (fileRes) => {
                const gameState = JSON.parse(fileRes.data);
                console.log("Loaded from cloud:", gameState);
                resolve(gameState);
              },
              fail: reject
            });
          },
          fail: reject
        });
      },
      fail: reject
    });
  });
}

// Usage
loadGameFromCloud("slot_1")
  .then(gameState => {
    // Restore game state
    player.level = gameState.level;
    player.gold = gameState.gold;
    player.position = gameState.position;
    console.log("Game loaded successfully!");
  })
  .catch(error => {
    console.error("Failed to load:", error);
  });`,
        },
        {
          name: 'Save Slot Manager',
          method: 'N/A',
          description: 'Example of a reusable save slot management system',
          example: `// Reusable Save Slot Manager

class SaveSlotManager {
  constructor() {
    this.cloudSaveManager = tap.getCloudSaveManager();
    this.fs = tap.getFileSystemManager();
    this.basePath = tap.env.USER_DATA_PATH;
  }

  // Get all save slots
  async getSlots() {
    return new Promise((resolve, reject) => {
      this.cloudSaveManager.getArchiveList({
        success: (res) => resolve(res.saves),
        fail: reject
      });
    });
  }

  // Save to specific slot
  async save(slotId, gameData, coverPath = null) {
    const filePath = \`\${this.basePath}/slot_\${slotId}.json\`;
    const saveData = {
      ...gameData,
      slotId,
      savedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      this.fs.writeFile({
        filePath,
        data: JSON.stringify(saveData),
        encoding: 'utf8',
        success: () => {
          // Check if slot exists
          this.getSlots().then(slots => {
            const existing = slots.find(s => s.name === \`slot_\${slotId}\`);

            const archiveOptions = {
              archiveMetaData: {
                name: \`slot_\${slotId}\`,
                summary: \`Slot \${slotId} - Level \${gameData.level || 1}\`,
                extra: JSON.stringify({ slotId }),
                playtime: gameData.playTime || 0
              },
              archiveFilePath: filePath,
              archiveCoverPath: coverPath,
              success: resolve,
              fail: reject
            };

            if (existing) {
              // Update existing
              this.cloudSaveManager.updateArchive({
                archiveUUID: existing.uuid,
                ...archiveOptions
              });
            } else {
              // Create new
              this.cloudSaveManager.createArchive(archiveOptions);
            }
          }).catch(reject);
        },
        fail: reject
      });
    });
  }

  // Load from specific slot
  async load(slotId) {
    const slots = await this.getSlots();
    const slot = slots.find(s => s.name === \`slot_\${slotId}\`);

    if (!slot) {
      throw new Error(\`Slot \${slotId} not found\`);
    }

    return new Promise((resolve, reject) => {
      const downloadPath = \`\${this.basePath}/slot_\${slotId}_temp.json\`;

      this.cloudSaveManager.getArchiveData({
        archiveUUID: slot.uuid,
        archiveFileId: slot.fileId,
        targetFilePath: downloadPath,
        success: (res) => {
          this.fs.readFile({
            filePath: res.filePath,
            encoding: 'utf8',
            success: (fileRes) => resolve(JSON.parse(fileRes.data)),
            fail: reject
          });
        },
        fail: reject
      });
    });
  }

  // Delete slot
  async delete(slotId) {
    const slots = await this.getSlots();
    const slot = slots.find(s => s.name === \`slot_\${slotId}\`);

    if (!slot) {
      throw new Error(\`Slot \${slotId} not found\`);
    }

    return new Promise((resolve, reject) => {
      this.cloudSaveManager.deleteArchive({
        archiveUUID: slot.uuid,
        success: resolve,
        fail: reject
      });
    });
  }
}

// Usage
const saveManager = new SaveSlotManager();

// Save game
await saveManager.save(1, { level: 10, gold: 5000 });

// Load game
const gameData = await saveManager.load(1);

// Get all saves
const slots = await saveManager.getSlots();

// Delete save
await saveManager.delete(1);`,
        },
      ],
    },
  },
};
