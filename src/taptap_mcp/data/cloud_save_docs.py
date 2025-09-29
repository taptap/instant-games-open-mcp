"""TapTap 云存档 API 文档"""

CLOUD_SAVE_DOCUMENTATION = {
    "title": "TapTap 云存档系统",
    "description": "为小游戏提供跨设备的存档同步和管理功能",
    "categories": {
        "basic_operations": {
            "title": "基础存档操作",
            "description": "云存档的基本增删改查操作",
            "apis": [
                {
                    "name": "上传存档",
                    "endpoint": "PUT /v1/cloud-save/{slot_id}",
                    "description": "上传或更新指定槽位的游戏存档",
                    "parameters": {
                        "slot_id": "存档槽位ID，支持自定义命名",
                        "data": "存档数据，支持JSON或二进制格式",
                        "metadata": "存档元数据（可选）"
                    },
                    "example": """
// 上传存档数据
const saveData = {
    level: 10,
    score: 50000,
    items: ['sword', 'shield', 'potion'],
    settings: {
        music: true,
        sound: true
    }
};

const response = await fetch('/v1/cloud-save/main_save', {
    method: 'PUT',
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        data: saveData,
        metadata: {
            version: '1.0',
            timestamp: Date.now(),
            device: 'mobile'
        }
    })
});

const result = await response.json();
console.log('存档已保存:', result.save_id);
"""
                },
                {
                    "name": "下载存档",
                    "endpoint": "GET /v1/cloud-save/{slot_id}",
                    "description": "获取指定槽位的游戏存档",
                    "parameters": {
                        "slot_id": "存档槽位ID"
                    },
                    "example": """
// 下载存档数据
const response = await fetch('/v1/cloud-save/main_save', {
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN'
    }
});

if (response.ok) {
    const saveFile = await response.json();

    console.log('存档数据:', saveFile.data);
    console.log('最后修改:', saveFile.metadata.timestamp);

    // 恢复游戏状态
    restoreGameState(saveFile.data);
} else {
    console.log('未找到存档或已过期');
}
"""
                },
                {
                    "name": "删除存档",
                    "endpoint": "DELETE /v1/cloud-save/{slot_id}",
                    "description": "删除指定槽位的游戏存档",
                    "example": """
// 删除存档
const response = await fetch('/v1/cloud-save/main_save', {
    method: 'DELETE',
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN'
    }
});

if (response.ok) {
    console.log('存档已删除');
}
"""
                }
            ]
        },
        "advanced_features": {
            "title": "高级功能",
            "description": "云存档的高级特性和管理功能",
            "features": [
                {
                    "name": "多槽位管理",
                    "description": "支持多个独立的存档槽位",
                    "example": """
// 管理多个存档槽位
const slots = ['auto_save', 'manual_save_1', 'manual_save_2', 'checkpoint'];

// 获取所有存档信息
const response = await fetch('/v1/cloud-save/list', {
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN'
    }
});

const allSaves = await response.json();
console.log('现有存档:', allSaves.saves);
"""
                },
                {
                    "name": "版本冲突处理",
                    "description": "处理多设备间的存档冲突",
                    "example": """
// 检查存档版本冲突
async function handleSaveConflict(localSave, cloudSave) {
    if (localSave.timestamp > cloudSave.timestamp) {
        // 本地存档更新，上传到云端
        await uploadSave('main_save', localSave);
    } else if (cloudSave.timestamp > localSave.timestamp) {
        // 云端存档更新，下载到本地
        applyCloudSave(cloudSave);
    } else {
        // 让用户选择
        const choice = await showConflictDialog(localSave, cloudSave);
        if (choice === 'local') {
            await uploadSave('main_save', localSave);
        } else {
            applyCloudSave(cloudSave);
        }
    }
}
"""
                },
                {
                    "name": "自动同步",
                    "description": "实现自动的存档同步机制",
                    "example": """
// 自动存档同步
class CloudSaveManager {
    constructor(token) {
        this.token = token;
        this.autoSaveInterval = null;
    }

    startAutoSync(intervalMs = 30000) {
        this.autoSaveInterval = setInterval(() => {
            this.syncSave();
        }, intervalMs);
    }

    async syncSave() {
        try {
            const localSave = getLocalSave();
            const cloudSave = await this.downloadSave('auto_save');

            if (!cloudSave || localSave.timestamp > cloudSave.timestamp) {
                await this.uploadSave('auto_save', localSave);
                console.log('存档已同步到云端');
            }
        } catch (error) {
            console.error('存档同步失败:', error);
        }
    }

    stopAutoSync() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
    }
}
"""
                }
            ]
        },
        "best_practices": {
            "title": "最佳实践",
            "description": "云存档开发的最佳实践和建议",
            "practices": [
                {
                    "category": "数据管理",
                    "items": [
                        "定期清理过期的存档数据",
                        "使用压缩算法减少存档文件大小",
                        "为重要存档创建备份机制",
                        "实现存档数据的校验和验证"
                    ]
                },
                {
                    "category": "用户体验",
                    "items": [
                        "在上传/下载时显示进度指示器",
                        "提供离线模式的本地存储",
                        "在网络异常时优雅降级",
                        "允许用户手动触发同步操作"
                    ]
                },
                {
                    "category": "安全考虑",
                    "items": [
                        "对敏感存档数据进行加密",
                        "验证存档数据的完整性",
                        "实现防作弊检测机制",
                        "限制存档文件的大小和频率"
                    ]
                }
            ]
        }
    }
}

CLOUD_SAVE_SEARCH_INDEX = {
    "keywords": {
        "云存档": ["basic_operations", "advanced_features"],
        "存档": ["basic_operations", "advanced_features"],
        "同步": ["advanced_features", "best_practices"],
        "上传": ["basic_operations"],
        "下载": ["basic_operations"],
        "删除": ["basic_operations"],
        "冲突": ["advanced_features"],
        "版本": ["advanced_features"],
        "自动": ["advanced_features"],
        "备份": ["best_practices"],
        "安全": ["best_practices"]
    }
}