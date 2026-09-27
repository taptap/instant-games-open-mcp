# 给项目测试 AI：使用本次 Maker MCP

本文用于让另一个 AI 在现有 Maker 游戏项目中测试本次本地验证功能。

## 先看结论

本次 Maker MCP 已经在当前仓库的分支 `fix/local-validation-phase-one` 完成并推送，功能提交为 `2062d2b`，后续文档提交为 `8fa3360`。

本机 Codex 使用的是插件内置 Maker MCP，不是另一个需要重新安装的普通全局 MCP：

```text
/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3
```

插件入口：

```text
/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3/dist/maker.js
```

当前 Codex 插件的 MCP 配置是：

```json
{
  "mcpServers": {
    "taptap-maker-plugin": {
      "command": "node",
      "args": ["./dist/maker.js"],
      "cwd": ".",
      "env": {
        "TAPTAP_MAKER_DISTRIBUTION": "codex_plugin",
        "TAPTAP_MCP_CLIENT_IDE": "codex"
      }
    }
  }
}
```

**插件文件存在，不等于当前 AI 会话已经加载 MCP。** 如果工具列表中没有 `maker_status_lite`、`preview` 等 Maker 工具，应重新加载或重启当前插件会话；不要重复安装或重新编译。

## 检查当前会话

如果当前 AI 能调用 Maker MCP，先调用：

```text
maker_status_lite
```

也可以读取：

```text
maker://status
```

如果只能使用终端，可以检查插件自身：

```bash
node "/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3/dist/maker.js" plugin inspect --client codex --json
node "/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3/dist/maker.js" status --json
```

终端命令只能证明插件程序可以启动，不能证明当前 AI 会话已经注册了 MCP 工具。

## Runtime 是否需要重新准备

本次 macOS Runtime 已经安装在本机共享目录：

```text
/Users/liangdong/.taptap-maker/runtime/runtime-local-validation-ecb76d388/UrhoXRuntime.app/Contents/MacOS/UrhoXRuntime
```

因此测试项目不需要把 Runtime 复制到项目里，也不需要重新编译。Maker MCP 的预览流程会按本机 Runtime 安装记录复用它。

## 测试当前游戏项目

令 `GAME` 为当前游戏项目的绝对路径。不要使用占位字符串，也不要把 MCP 仓库路径当作游戏项目路径。

通过当前会话的 Maker MCP 执行：

```text
preview validate
```

参数含义：

- `targetDir`：当前游戏项目绝对路径。
- `mode=validate`：运行并获取 JSON 验证报告、stdout/stderr 和 Runtime 日志。
- `mode=screenshot`：运行并获取截图。
- `mode=both`：同时获取验证报告和截图，优先使用这个模式。

如果只能调用 CLI，使用：

```bash
CLI="/Users/liangdong/.codex/plugins/cache/taptap-maker/taptap-maker/0.0.3/dist/maker.js"
GAME="/绝对路径/到/当前游戏项目"
node "$CLI" preview validate --mode both --target-dir "$GAME" --json
```

结果中的这些字段必须保留并检查：

- `report`：JSON 验证结果，确认运行是否成功以及是否有错误。
- `artifacts[].path`：截图或其他产物的实际绝对路径。
- `log_path`：Runtime stdout/stderr 日志。
- `invocation_path`：实际调用参数，便于确认运行的 Runtime 和参数。

AI 必须按顺序完成：

1. 运行验证。
2. 阅读 `report`。
3. 阅读 `log_path`，检查 Lua 错误、Runtime 错误和启动失败。
4. 读取 `artifacts[].path` 中的 PNG/JPG 截图并做视觉判断。
5. 如发现问题，修改游戏代码后重新执行验证。

## Computer Use 结论

截图检查不需要 Computer Use。

Web/Claude 流程是 Runtime 生成图片后，由 AI 使用图片读取能力读取 PNG/JPG，再进行视觉判断。Codex 应使用本地图片查看能力。Computer Use 只适用于需要操作桌面窗口的场景，不是 `run-lua-validate` 的前置条件。

如果 AI 在读取截图前要求 Computer Use，优先判断为当前会话没有加载图片读取能力，或没有正确加载 `run-lua-validate` Skill；不能据此判断 Maker MCP 缺少截图功能。

## Skill 加载要求

测试 AI 需要同时具备：

1. Maker 插件生命周期 Skill：用于确认插件已加载。
2. Maker 本地开发 Skill：用于执行本地预览和验证。
3. 当前游戏项目提供的 `run-lua-validate` Skill：用于遵循验证、日志和截图检查流程。

Skill 没有加载时，另一个 AI 可能只会看到普通终端命令，或者错误地要求 Computer Use。此时先修复会话的 Skill/MCP 加载，不要改游戏代码。

## 关于 tgz / TGA

`TGA` 是图片格式，不是 Maker MCP 分发包格式。

如果你说的是 `tgz`，项目现有的 `tgz` 打包脚本用于 DSH 插件，不是 Codex Maker 插件：

```bash
npm run maker:dsh-plugin:package
```

Codex/WorkBuddy Maker 插件的正式分发格式是插件 ZIP；项目提供：

```bash
npm run maker:plugins:package
```

这会生成 Codex 和 WorkBuddy 插件 ZIP。无论是 ZIP 还是 tgz，归档文件都不会自动让另一个 AI 会话获得 MCP；目标客户端仍必须注册插件并重新加载会话。
