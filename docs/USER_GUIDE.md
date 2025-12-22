# TapTap Minigame MCP Server 配置指南 (小白版)

这份文档是专门为刚接触 MCP (Model Context Protocol) 的用户准备的。我们会一步步教你如何在常用的 AI 工具中配置 TapTap 小游戏助手。

## 📋 准备工作

在开始之前，请确保你的电脑上已经安装了：

1.  **Node.js** (版本 18 或更高)
    - 如果不确定，可以在终端/命令行输入 `node -v` 检查。
    - 如果没有安装，请去 [Node.js 官网](https://nodejs.org/) 下载安装。

    > **💡 偷懒小技巧：让 AI 帮你装**
    >
    > 如果你不知道怎么安装，可以直接把下面这段话发给 AI (比如 Cursor 的 Chat)：
    >
    > > 我需要安装 Node.js (版本 18+)，我的电脑是 [你的系统，如 Mac/Windows]，请一步步教我怎么安装，最好能给我具体的命令或者下载链接。

---

## 🚀 方式一：项目级配置 (推荐)

这是最简单的方式！只需要在你的游戏项目根目录下创建一个文件，Cursor 和 Claude Code 就能自动识别。

**适用工具**：Cursor, Claude Code (CLI)

### 步骤：

1.  打开你的游戏项目文件夹。
2.  在根目录创建一个新文件，命名为 `.mcp.json` (注意前面有个点)。
3.  将下面的内容复制进去并保存 _(如果已有其他配置，请参考 [常见问题 - 2. 多服务器配置示例](#2-我已经有其他-mcp-服务器了怎么合并配置))_：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
    }
  }
}
```

**配置说明**：

- 我们使用了 `npx`，这样你不需要手动下载任何东西，每次都会使用最新版本。

---

## 🛠️ 方式二：工具单独配置

如果你希望在所有项目中都能使用这个工具，或者上面的方法不生效，可以尝试在工具里单独配置。

### 1. Cursor (图形界面配置)

1.  打开 Cursor。
2.  点击右上角的 **齿轮图标 (Settings)** (或按 `Ctrl/Cmd + ,`)。
3.  在左侧菜单找到 **Features** -> **MCP**。
4.  点击 **+ Add New MCP Server** 按钮。
5.  在弹出的表单中照着填 (见下图表)：

| 选项 (Field) | 填什么 (Value)                      | 说明                 |
| :----------- | :---------------------------------- | :------------------- |
| **Name**     | `taptap-minigame`                   | 名字随便起，好记就行 |
| **Type**     | `command`                           | 必须选 command       |
| **Command**  | `npx`                               | 这是运行命令         |
| **Args**     | `-y @mikoto_zero/minigame-open-mcp` | 参数，注意空格和`-y` |

6.  点击 **Save** 保存。
7.  查看状态指示灯变绿 🟢，说明连接成功！

### 2. Claude Desktop 配置

Claude Desktop (Mac/Windows 客户端) 使用一个全局配置文件。

1.  点击菜单栏的 Claude -> **Settings**。
2.  点击 **Developer** -> **Edit Config**。
3.  这会打开一个 `config.json` 文件。在 `mcpServers` 部分添加我们的配置：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
    }
  }
}
```

_(如果文件里已经有其他服务器，请注意 JSON 格式，在上一项后面加逗号，可参考 [常见问题 - 2. 多服务器配置示例](#2-我已经有其他-mcp-服务器了怎么合并配置))_

### 3. VS Code 配置 (原生 / GitHub Copilot)

VS Code 配合 **GitHub Copilot Chat** 扩展现已原生支持 MCP 协议。

#### 方式 A：原生配置文件 (推荐)

1.  确保你安装了 **GitHub Copilot Chat** 插件。
2.  在你的项目文件夹下，找到或创建一个名为 `.vscode` 的文件夹。
3.  在 `.vscode` 文件夹里新建一个文件，叫 `mcp.json`。
4.  复制下面的内容进去 _(如果已有其他配置，请参考 [常见问题 - 2. 多服务器配置示例](#2-我已经有其他-mcp-服务器了怎么合并配置))_：

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
    }
  }
}
```

5.  重启 VS Code。现在你可以在 Copilot Chat 中直接使用了！

#### 方式 B：使用插件 (Cline / Roo Code)

如果你没有订阅 GitHub Copilot，可以使用免费的开源插件，比如 **Cline** 或 **Roo Code**，它们也支持 MCP 并且有图形界面。

以 **Cline** 为例：

1.  安装 **Cline** 插件。
2.  点击插件设置（齿轮图标）。
3.  找到 **MCP Servers** 并点击编辑。
4.  添加上面的 JSON 配置即可。

---

## 💡 进阶配置 & 常见问题

### 1. 第一次使用需要认证吗？

是的！当你第一次让 AI 执行创建排行榜等操作时，它会暂停并给出一个**二维码链接**。

1.  点击链接或复制到浏览器打开。
2.  使用 **TapTap App** 扫码授权。
3.  授权成功后，告诉 AI "我已经授权了"，它就会继续执行。

- Token 会自动保存在你的电脑上，下次就不需要再扫码了。

### 2. 我已经有其他 MCP 服务器了，怎么合并配置？

如果你需要同时使用多个 MCP 服务器，在编辑 JSON 文件时，请注意 **JSON 语法格式**：

- 每项配置之间必须用**逗号 `,`** 分隔。
- 最后一项后面**不能**加逗号。

**配置示例：**

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": [...]
    }, // 👈 注意这里必须有逗号
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"]
    }
  }
}
```

### 3. 为什么 AI 找不到我的文件？(环境变量 / 路径问题)

如果你在使用 H5 游戏上传等功能时，AI 提示找不到目录，可能是因为相对路径解析问题。

通常情况下，AI 能够自动处理这些问题。但如果它一直报错找不到文件，你可以尝试显式配置 `env`。

**解决方法：**
在配置中添加 `env` 字段，并指定 `TAPTAP_MCP_WORKSPACE_ROOT`。

**以项目级配置 (.mcp.json) 为例：**

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@mikoto_zero/minigame-open-mcp"],
      "env": {
        // 👇 这里通常不是必须的，除非遇到路径问题
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
        // 注意：${workspaceFolder} 是 VS Code/Cursor 的变量
        // 如果是在 Claude Desktop 中，这里需要填项目文件夹的绝对路径，例如 "/Users/xxx/MyGame"
      }
    }
  }
}
```

### 4. Google Gemini AI Studio 如何配置？

目前 **Google AI Studio** 网页版暂时还**不支持**作为 MCP 客户端直接连接外部 MCP 服务器。它目前主要支持 Google 自家的生态集成。

如果你想用 Gemini 模型配合 MCP 使用，建议使用支持 Gemini 模型的客户端，例如：

- **Cursor**: 在模型设置里选择 Gemini 模型。
- **Cline (VS Code)**: 模型提供商选择 Gemini。

### 5. 遇到报错怎么办？

如果遇到连接错误，通常是因为网络问题（无法连接 npm）。

- **解决方法**：确保你的网络可以访问 npm 仓库，或者配置了合适的镜像源。
- **调试**：可以在 Cursor/VS Code 的输出面板查看 MCP 相关的日志。

---

希望这份指南能帮到你！如果有其他问题，欢迎查阅 [DEPLOYMENT.md](DEPLOYMENT.md) 获取更详细的技术细节。
