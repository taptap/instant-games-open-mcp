# TapTap DC OpenClaw 插件

这是一个面向 OpenClaw 的 TapTap DC 插件，内置原始数据工具与运营简报 skill。

## 插件能力

- 以 OpenClaw 原生插件方式安装
- 发布时会把 `@mikoto_zero/minigame-open-mcp` 运行时一起打进插件包，避免宿主侧首次调用时再临时装包
- 运行时解析顺序为：插件内 bundled runtime -> 本地已安装 runtime -> 本地缓存 runtime
- 暴露适合 agent / skill 消费的 TapTap DC 原始 JSON 工具
- 提供高层工具 `taptap_dc_quick_brief`，可直接按游戏名 / app_id 生成 TapTap DC 快速简报
- 如果当前未授权，`taptap_dc_quick_brief` 和 `taptap_dc_start_authorization` 都会优先返回“可直接点击的授权链接”，并附带 TapTap 包装链接与授权页直链
- 覆盖授权、选游戏、商店/评价/社区概览、商店快照、论坛内容、评价列表、点赞与官方回复
- 内置 `taptap-dc-ops-brief`，可把原始数据整理成简洁的运营简报

## 安装

```bash
openclaw plugins install @lotaber_wang/openclaw-dc-plugin@0.1.11
```

安装完成后，建议立刻执行一次检查：

```bash
openclaw plugins inspect openclaw-dc-plugin
```

## 给 OpenClaw 的安装执行指令

如果安装流程判断需要重启 Gateway，先通知用户，再执行重启。

推荐通知文案：

`TapTap DC 插件已安装完成。OpenClaw 接下来如需重启 Gateway，应先提示用户；重启完成后即可使用 taptap_dc_* 工具。`

执行顺序要求：

1. 先向用户发送上面的安装完成/即将重启提示
2. 再执行 `openclaw gateway restart` 或等效的宿主重启动作
3. 重启完成后，再开始使用 `taptap_dc_*` 工具

不管是手动重启还是宿主自动触发的重启，都应先提示用户，不要静默重启。

如果安装成功后仍然看不到 `taptap_dc_*` 工具，再按下面命令手动重启 Gateway：

```bash
openclaw gateway restart
```

如果你的环境没有 `openclaw gateway restart`，就直接完整重启 OpenClaw / 宿主应用。

## 推荐安装流程

```bash
openclaw plugins install @lotaber_wang/openclaw-dc-plugin@0.1.11
openclaw plugins inspect openclaw-dc-plugin
echo 'TapTap DC 插件已安装完成。OpenClaw 接下来如需重启 Gateway，应先提示用户；重启完成后即可使用 taptap_dc_* 工具。'
openclaw gateway restart
```

说明：

- `install` 负责把插件包装进 OpenClaw
- `inspect` 用来确认插件元信息、skills、tools 是否已被 Gateway 识别
- 如果宿主判断需要重启 Gateway，必须先通知用户，再重启
- 如果 10-30 秒后还没生效，再手动执行 `gateway restart`
- 如果宿主存在“stock 安装失败后再 fallback npm”的行为，优先使用明确版本号安装，必要时改用本地 `.tgz` 安装，避免双安装链路互相打架

## 典型使用流程

优先推荐直接使用：

1. 直接调用 `taptap_dc_quick_brief`
2. 如果还没授权，工具会直接返回可点击授权链接
3. 手机端优先直接点击第一条“直接点击授权”链接；桌面端可打开授权页直链后自行扫码或转发
4. 完成扫码后调用 `taptap_dc_complete_authorization`
5. 再次调用 `taptap_dc_quick_brief`

示例：

- 查当前已选中游戏：
  - `taptap_dc_quick_brief`
- 按游戏名直接查：
  - `taptap_dc_quick_brief({ "app_name": "TapTap" })`
- 按 app_id 直接查：
  - `taptap_dc_quick_brief({ "app_id": 204036 })`

如果需要更底层、更细粒度的操作，再使用原始工具链：

1. `taptap_dc_check_environment`
2. `taptap_dc_list_apps`
3. `taptap_dc_select_app`
4. `taptap_dc_get_store_overview` / `taptap_dc_get_review_overview` / `taptap_dc_get_community_overview`

## 配置项

可选配置如下：

- `environment`: `production` or `rnd`
- `workspaceRoot`
- `cacheDir`
- `tempDir`
- `logRoot`
- `verbose`

正常情况下，如果内嵌的 TapTap MCP 主包已经带了可用凭据，生产环境不需要额外配置 `client_id` / `client_secret`。

## 运行时环境变量

插件内部会继续向 bundled TapTap MCP runtime 透传或设置这些环境变量：

- `TAPTAP_MCP_TRANSPORT=stdio`
- `TAPTAP_MCP_ENV`
- `TAPTAP_MCP_ENABLE_RAW_TOOLS=true`
- `TAPTAP_MCP_WORKSPACE_ROOT`
- `TAPTAP_MCP_CACHE_DIR`
- `TAPTAP_MCP_TEMP_DIR`
- `TAPTAP_MCP_LOG_ROOT`
- `TAPTAP_MCP_VERBOSE`

如果你是在 OpenClaw / 容器环境中排查启动问题，优先关注：

- `TAPTAP_MCP_ENV`
- `TAPTAP_MCP_VERBOSE`
- `TAPTAP_MCP_LOG_ROOT`

## 安装排障

如果 OpenClaw 能安装插件，但第一次调用工具仍然偏慢，通常是在启动内嵌 TapTap 运行时，而不是在现场重新下载依赖。

如果安装后看不到 `taptap_dc_*` 工具，优先按这个顺序排查：

1. 确认安装的是 `@lotaber_wang/openclaw-dc-plugin@0.1.11` 或更新版本
2. 执行 `openclaw plugins inspect openclaw-dc-plugin`
3. 如果宿主要求重启 Gateway，先向用户发送安装完成提示
4. 再执行 `openclaw gateway restart`
5. 重新开启一个新会话，再观察工具列表

如果 `inspect` 能看到插件，但工具仍未生效，通常不是插件代码没注册，而是 Gateway 还没完成配置重载或仍在旧会话里。

说明：

- 本插件的 `taptap_dc_*` 工具由插件入口代码动态注册
- `openclaw.plugin.json` 主要承担插件元信息、默认启用和配置校验职责
- 所以“装完看不到 tool”时，优先怀疑安装状态、Gateway 重启和会话刷新，而不是去手改 manifest 里的 `tools` 字段

如果出现配置异常，优先检查插件 ID 是否一致：

- package 名称：`@lotaber_wang/openclaw-dc-plugin`
- plugin id：`openclaw-dc-plugin`
- OpenClaw 配置入口：`plugins.entries.openclaw-dc-plugin`
- 如果本地残留旧 entry `taptap-dc-plugin`，建议清理后重新安装，避免宿主误读旧配置

如果第一次调用失败，优先检查：

- 当前环境是否能访问 npm registry
- 本机 Node 版本是否 >= 18.14.1
- OpenClaw 进程是否有临时目录写权限
- OpenClaw 是否已经完成 Gateway 重启

从 `0.1.11` 开始，插件安装链路与 bridge 会额外做这些兼容处理：

- 在 `package.json` 中补充 `openclaw.install.npmSpec`，让安装链路更稳定
- 在 `package.json` 的 `openclaw.install` 中补充 `postInstallMessage` / `instructions` / `restartCommand`
- 插件导出对象会同步暴露 `installation` / `installHints`，给宿主额外一层安装提示兜底
- 在 `openclaw.plugin.json` 中显式开启 `enabledByDefault`
- 统一插件 id 为 `openclaw-dc-plugin`，避免 manifest id 与 entry hint 不一致
- 默认仅保留错误级别注册/bridge 日志；详细日志改为 `verbose=true` 时才输出，减少安装后自动重载时的噪音
- `initialize` 超时后自动切换到无缓冲 / PTY 启动策略重试
- `initialize` 默认超时提升到 45 秒，避免宿主启动稍慢时过早失败
- 向内嵌 TapTap runtime 发送 `initialize` 与后续请求时，默认改为裸 JSON + 换行（NDJSON 风格），避免只发 `Content-Length` 帧导致无响应
- `initialize` 的 `protocolVersion` 回退到 `2024-11-05`，并使用更保守的空 `capabilities`，降低 OpenClaw 宿主兼容风险
- 兼容解析裸 JSON 输出，不再只接受 `Content-Length` 帧
- 启动时如果 stdout 混入人类可读日志，会先自动丢弃噪音再解析协议消息
- 如果拿到的是半截 JSON，会先继续等待后续分片，而不是立刻按失败处理
- 过滤 PTY 场景下被回显到 stdout 的请求消息
- 授权结果会把裸授权直链放在最前面，并在 `details.preferred_auth_url` / `details.auth_links` 中重复返回，降低宿主偶发吞链路时的影响
