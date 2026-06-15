# Maker Windows 测试用例

本文用于验证本地测试包：

```text
packages/maker/taptap-maker-0.0.0-windows-test.20260615.1.tgz
```

测试目标：

- 验证 `taptap-maker init` 可在本地创建新的 Maker 项目。
- 验证 Maker MCP 暴露 3D 模型生成 proxy tools。
- 验证 3D 模型生成结果会落到 Maker 项目 `assets/` 目录。
- 验证 Windows 下 MCP 配置仍通过 `cmd.exe` 包装 `npx.cmd`。

## 安装测试包

把 tgz 复制到 Windows 机器，例如：

```powershell
C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz
```

确认 CLI 可启动：

```powershell
npx -y -p C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz taptap-maker help
```

验收点：

- help 中包含 `taptap-maker init ... [--create --name NAME]`。
- 输出 Windows note，说明 MCP 配置会包装 `npx.cmd`。

## 功能 1：init 创建 Maker 项目

### 用户入口

交互入口：

```powershell
mkdir C:\MakerProjects\local-create-test
cd C:\MakerProjects\local-create-test
npx -y -p C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz taptap-maker init
```

app 列表底部必须固定出现：

```text
0. Create a new Maker project
```

提示行必须包含：

```text
Choose app by index, app_id, 'new', or 'all' to show all
```

输入 `0` 或 `new` 后，CLI 会要求输入项目名称。

非交互入口：

```powershell
mkdir C:\MakerProjects\local-create-test-cli
cd C:\MakerProjects\local-create-test-cli
npx -y -p C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz taptap-maker init --create --name "my-local-game"
```

### 后端 API

CLI 会调用 Maker API：

```http
POST /api/v1/apps
Authorization: Bearer <PAT>
Content-Type: application/json

{"name":"my-local-game","gameType":"sce"}
```

返回中的 `app.id` 会作为 Maker 项目 id 写入：

```text
.maker-mcp/config.json
```

### 验收点

- 创建成功后当前目录存在 `.maker-mcp/config.json`。
- `.maker-mcp/config.json` 中 `project_id` 等于新创建项目的 id。
- 当前目录被初始化为 Maker Git 项目。
- 创建后继续执行 clone、dev-kit 准备和 MCP 配置安装。
- 已绑定目录再次运行 `taptap-maker init --create --name "another-game"` 应失败，并提示换新目录。

## 功能 2：3D 模型 MCP proxy tools

### 暴露的 MCP tools

已绑定 Maker 项目的 MCP tools 列表中应包含：

```text
create_3d_model_task
query_3d_model_task
```

它们与图片/视频/音乐工具一样走 Maker remote proxy。工具的原始 description、input schema、
参数和返回值来自远端 Maker server，本地 MCP 只负责白名单暴露、参数路径改写和结果素材落地。

### create_3d_model_task 常见参数形态

Phase 1 文生模型或图生模型：

```json
{
  "mode": "text_to_model",
  "prompt": "low poly treasure chest"
}
```

使用本地图片素材作为输入：

```json
{
  "mode": "image_to_model",
  "image": "assets/image/source_icon.png"
}
```

Phase 2 使用四视图确认图：

```json
{
  "mode": "text_to_model",
  "confirmed_image_paths": {
    "front": "assets/image/model-task_front.png",
    "left": "assets/image/model-task_left.png",
    "back": "assets/image/model-task_back.png",
    "right": "assets/image/model-task_right.png"
  }
}
```

多视图直接生成：

```json
{
  "mode": "multiview_to_model",
  "front_image": "assets/image/front.png",
  "left_image": "assets/image/left.png",
  "back_image": "assets/image/back.png",
  "right_image": "assets/image/right.png"
}
```

本地 MCP 会把已登记的本地生成素材路径改写为 CDN URL 后再转发给远端。

### query_3d_model_task 常见参数形态

```json
{
  "task_id": "model-task-id"
}
```

### 结果落地规则

Phase 1 返回四视图预览时：

- `preview_urls.front/left/back/right` 会下载到 `assets/image/`。
- 响应中会新增 `preview_assets`。
- `.maker/assets/generated-assets.json` 会记录 `tool=create_3d_model_task`、`phase=1`、`view` 和 CDN 映射。

最终模型成功时：

- `mdl_cdn_url` 会下载到 `assets/model/<task_id>_<timestamp>.zip`。
- `rendered_image_url` 会下载到 `assets/image/<task_id>_render_<timestamp>.png`。
- `model_cdn_url` 指向的原始 GLB 只记录映射，默认不下载。
- 响应中会新增 `mdlLocalPath`、`mdlAbsolutePath`、`renderedImageLocalPath` 和
  `renderedImageAbsolutePath`。

如果只有 `model_cdn_url` 且存在 `mdl_conversion_error`：

- tool 调用不应失败。
- 原始 `mdl_conversion_error` 应保留在响应中。
- 不应生成 `mdlLocalPath`。

## Windows 验收用例

### 用例 1：新账号或新目录创建项目

1. 在空目录运行 `taptap-maker init`。
2. 确认 app 列表底部有 `0. Create a new Maker project`。
3. 输入 `0`，再输入项目名。
4. 等待 clone 和 dev-kit 完成。

通过标准：

- `.maker-mcp/config.json` 存在。
- `taptap-maker doctor` 显示项目已绑定。
- 重新打开 AI 客户端后 Maker MCP tools 可见。

### 用例 2：已绑定目录禁止创建新项目

1. 在已经绑定 Maker 项目的目录运行：

```powershell
npx -y -p C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz taptap-maker init --create --name "another-game"
```

通过标准：

- 命令失败。
- 错误提示包含当前目录已经绑定 Maker project。
- 原 `.maker-mcp/config.json` 未被覆盖。

### 用例 3：MCP 配置 Windows 包装

运行：

```powershell
npx -y -p C:\Temp\taptap-maker-0.0.0-windows-test.20260615.1.tgz taptap-maker mcp install --ide codex --env rnd
```

通过标准：

- Codex MCP 配置中的 command 是 `cmd.exe`。
- args 包含 `/d /s /c npx.cmd -y -p @taptap/maker taptap-maker`。

### 用例 4：3D tools 可见

1. 在已绑定项目目录启动 AI 客户端。
2. 读取 `maker://status` 或调用 `maker_status_lite`。
3. 检查 MCP tools 列表。

通过标准：

- 可见 `create_3d_model_task`。
- 可见 `query_3d_model_task`。
- 如果缺失，状态输出应提示缺失工具列表，包含这两个 tool 名称。

### 用例 5：Phase 1 预览图落地

调用 `create_3d_model_task`，让远端返回 Phase 1 四视图预览。

通过标准：

- `assets/image/` 下出现 front/left/back/right 预览图。
- 响应包含 `preview_assets`。
- `.maker/assets/generated-assets.json` 记录对应四个图片素材。

### 用例 6：最终 MDL zip 落地

调用 `query_3d_model_task` 查询成功的模型任务。

通过标准：

- `assets/model/` 下出现 `.zip` 文件。
- `assets/image/` 下出现渲染预览图。
- 响应包含 `mdlLocalPath` 和 `renderedImageLocalPath`。
- `.maker/assets/generated-assets.json` 记录 MDL zip、rendered image 和 `modelCdnUrl`。

### 用例 7：本地图片路径改写

1. 先生成或准备 `assets/image/front.png` 等图片。
2. 调用 `create_3d_model_task`，参数使用本地 `assets/image/...` 路径。

通过标准：

- 远端收到的是 CDN URL 或保留的服务端可访问路径。
- 本地不存在映射的手工图片路径不会被误改写。
- 已登记过的 generated asset 会从 `.maker/assets/generated-assets.json` 解析 CDN URL。

## 失败信息收集

Windows 测试失败时请收集：

- 完整命令和输出。
- `taptap-maker doctor --json` 输出。
- `.maker-mcp/config.json` 是否存在，不要贴 PAT。
- `.maker/assets/generated-assets.json` 中相关条目。
- `assets/image/`、`assets/model/` 目录文件列表。
- AI 客户端 MCP 配置中 `taptap-maker` 的 command 和 args。
