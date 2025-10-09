# 🎉 版本 1.0.4 发布成功！

## 📦 发布信息

- **包名**: `@mikoto_zero/minigame-open-mcp`
- **版本**: 1.0.4
- **发布时间**: 2025-10-09 15:13 (GMT+8)
- **npm 链接**: https://www.npmjs.com/package/@mikoto_zero/minigame-open-mcp

## 🆕 本次更新

### 🔍 显著增强 Verbose 日志功能

#### HTTP 请求日志增强
- ✅ **独立显示** Method 和 URL，一目了然
- ✅ **高亮 Authorization** header（MAC 签名自动脱敏为 `***REDACTED***`）
- ✅ **Headers 统计** - 显示总数（如 "6 total"）
- ✅ **智能解析** - 自动检测和格式化 JSON 请求体
- ✅ **明确标识** - 空 body 显示为 "(empty)"

#### HTTP 响应日志增强
- ✅ **完整 Response Headers** - 包括所有响应头
- ✅ **Headers 统计** - 显示总数
- ✅ **智能格式化** - 自动检测 JSON/文本并格式化
- ✅ **明确标识** - 空响应显示为 "(empty)"

#### 视觉体验改进
- ✅ **更宽分隔符** - 从 80 字符扩展到 100 字符
- ✅ **统一脱敏标记** - 使用 `***REDACTED***` 替代 `***`
- ✅ **结构化输出** - 更清晰的层次结构

#### 文档完善
- ✅ **新增 VERBOSE-LOG-EXAMPLE.md** - 包含完整的日志示例
- ✅ **更新 CHANGELOG.md** - 详细记录所有改进

## 📊 版本对比

| 指标 | 1.0.3 | 1.0.4 | 变化 |
|------|-------|-------|------|
| 包大小 | 40.3 KB | 41.2 KB | +0.9 KB |
| 解压大小 | 175.4 KB | 180.0 KB | +4.6 KB |
| 文件数量 | 51 | 51 | - |
| 日志功能 | 基础 | 增强 | ⬆️ |

## 🎯 日志示例对比

### 之前（1.0.3）
```
[HTTP REQUEST] POST https://agent.tapapis.cn/level/v1/create
Headers: {"Authorization": "MAC ...", ...}
Body: {...}

[HTTP RESPONSE] 200 OK
Response: {...}
```

### 现在（1.0.4）
```
====================================================================================================
[2025-10-09T07:13:45.500Z] [HTTP REQUEST]
====================================================================================================
📤 Method: POST
📤 URL: https://agent.tapapis.cn/level/v1/create?client_id=your_client_id

🔐 Authorization:
MAC id="abc123", ts="1234567890", nonce="random", mac="***REDACTED***"

📋 Headers (6 total):
{
  "Content-Type": "application/json",
  "Authorization": "MAC id=\"abc123\", ts=\"1234567890\", nonce=\"random\", mac=\"***REDACTED***\"",
  "X-Tap-Ts": "1234567890",
  "X-Tap-Nonce": "random123",
  "X-Tap-Sign": "***REDACTED***"
}

📦 Request Body (JSON):
{
  "name": "Weekly Ranking",
  "score_type": 0
}

----------------------------------------------------------------------------------------------------
[2025-10-09T07:13:45.789Z] [HTTP RESPONSE] ✅ SUCCESS
----------------------------------------------------------------------------------------------------
📥 Method: POST
📥 URL: https://agent.tapapis.cn/level/v1/create?client_id=your_client_id
📥 Status: 200 OK

📋 Response Headers (5 total):
{
  "content-type": "application/json; charset=utf-8",
  "content-length": "156",
  "connection": "keep-alive",
  "date": "Thu, 09 Oct 2025 07:13:45 GMT",
  "x-request-id": "req-abc123"
}

📦 Response Body (JSON):
{
  "success": true,
  "data": {
    "leaderboard_id": "123456"
  }
}
====================================================================================================
```

## 🚀 升级方式

### 全局安装用户
```bash
npm update -g @mikoto_zero/minigame-open-mcp
```

### npx 用户
npx 自动使用最新版本，无需手动更新：
```bash
npx @mikoto_zero/minigame-open-mcp
```

### MCP 配置用户
使用 npx 的配置会自动使用最新版本，无需修改配置文件。

## 📝 Git 提交记录

```
3a00212 chore: bump version to 1.0.4
1277e65 feat: 增强 verbose 日志，添加更详细的 HTTP 请求响应信息
1c0790c feat: 添加详细日志功能，支持工具调用和 HTTP 请求响应日志记录
```

## 🎁 使用方式

启用详细日志（无需任何代码更改）：

```bash
# 方式 1: 命令行
export TAPTAP_MINIGAME_MCP_VERBOSE=true
npm start

# 方式 2: Claude Desktop 配置
{
  "mcpServers": {
    "taptap-minigame": {
      "env": {
        "TAPTAP_MINIGAME_MCP_VERBOSE": "true"
      }
    }
  }
}

# 方式 3: OpenHands 配置
{
  "mcpServers": {
    "taptap-minigame": {
      "env": {
        "TAPTAP_MINIGAME_MCP_VERBOSE": "true"
      }
    }
  }
}
```

## 🔒 安全性

- ✅ MAC Token 签名自动脱敏
- ✅ X-Tap-Sign 签名自动脱敏
- ✅ 日志输出到 stderr，不干扰 MCP 通信
- ✅ 默认关闭，按需启用

## 📚 相关文档

- [CHANGELOG.md](CHANGELOG.md) - 完整变更历史
- [VERBOSE-LOG-EXAMPLE.md](VERBOSE-LOG-EXAMPLE.md) - 详细日志示例
- [README.md](README.md) - 项目使用文档
- [CLAUDE.md](CLAUDE.md) - 开发者指南

## 🙏 致谢

感谢所有使用和支持 TapTap Minigame MCP Server 的开发者！

---

**下载链接**: https://www.npmjs.com/package/@mikoto_zero/minigame-open-mcp
**发布时间**: 2025-10-09 15:13:27 (GMT+8)
**维护者**: mikoto_zero
