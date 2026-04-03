# TapTap 小游戏 MCP 服务 - 快速开始

装好这个服务后，你就可以在 Cursor 里直接用中文跟 AI 说话，让它帮你管理 TapTap 小游戏——创建排行榜、上传 H5 游戏、接入多人联机等，不用写代码、不用翻文档。

> **前提：** 需要已安装 [Node.js 18+](https://nodejs.org/zh-cn)、Cursor 编辑器，以及 TapTap 开发者账号。

---

## 安装步骤

### 第一步：配置 MCP

**推荐方式（自动部署）：** 把 [AI_SETUP_GUIDE.md](AI_SETUP_GUIDE.md) 直接发给你的 AI，让它自动完成所有配置。

**手动方式：** 编辑 Cursor 的全局 MCP 配置文件 `~/.cursor/mcp.json`，在 `mcpServers` 中添加以下内容：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@taptap/minigame-open-mcp"]
    }
  }
}
```

> 注意：Cursor 只读取全局配置 `~/.cursor/mcp.json`，不支持项目根目录下的 `.mcp.json`。

### 第二步：验证连接

打开 Cursor 设置（`Cmd + ,` / `Ctrl + ,`）→ **Tools & MCP**，看到 **taptap-minigame** 旁边显示绿色圆点 🟢 即表示连接成功。

![Cursor Tools & MCP 设置页面，taptap-minigame 显示绿色连接状态](https://app-res.tapimg.com/img/2026-03-11/8ed9f70edfd78cc648c12ab8c9c36526.png)

若显示红色 🔴，参考下方「遇到问题？」。

### 第三步：登录授权

在 Cursor AI 对话框里说任意一句操作请求（如"帮我看看我有哪些应用"），AI 会提示你登录：

1. 点击 AI 返回的链接，用 **TapTap App** 扫码
2. 手机上点「确认授权」
3. 回到 Cursor 告诉 AI **"我已经授权了"**

![AI 返回扫码授权链接示例](https://app-res.tapimg.com/img/2026-03-11/cc822581f1bab662f3ff50480b77d183.png)

> 登录一次即可，之后无需重复扫码。

---

## 你可以对 AI 说什么？

登录成功后，直接用中文告诉 AI 你想做什么：

- **应用管理**："帮我看看我有哪些应用" / "帮我创建一个新应用"
- **排行榜**："帮我创建一个排行榜" / "帮我发布这个排行榜"
- **H5 游戏**："帮我把 dist 目录上传到 TapTap" / "帮我查看游戏审核状态"

其他功能（多人联机、分享、广告、云存档、振动等）同样支持，直接描述需求即可。

> AI 会一步步引导你完成操作，有需要选择的地方会主动问你。

---

## 遇到问题？

| 问题                 | 解决方法                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `node -v` 找不到命令 | 安装 [Node.js LTS](https://nodejs.org/zh-cn) 后重启 Cursor              |
| MCP 显示红色 🔴      | 检查 `~/.cursor/mcp.json` 格式正确、网络正常，在 Tools & MCP 页面点刷新 |
| 扫码后 AI 没有继续   | 跟 AI 说 **"我已经授权了"**                                             |
| AI 找不到文件        | 告诉 AI 文件的完整路径，如 `/Users/你的用户名/项目/dist`                |
| 以前能用，突然不行了 | 跟 AI 说 **"帮我重新登录"** 重新授权                                    |
