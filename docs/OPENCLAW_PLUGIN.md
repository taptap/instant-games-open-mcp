# OpenClaw Plugin

本仓库包含一个可独立发布的 OpenClaw plugin 子包：

- `packages/openclaw-dc-plugin`

## 设计目标

- 不要求最终用户单独配置 MCP
- 直接作为 OpenClaw native plugin 安装
- 发布时把 `@mikoto_zero/minigame-open-mcp` 作为 bundled dependency 一起打进插件包
- 运行时优先使用插件包内自带 runtime；缺失时再回退到本地依赖或缓存 runtime
- 对 OpenClaw 暴露 raw JSON tools
- bundled 一个 `taptap-dc-ops-brief` skill，负责把 raw data 解读成运营简报

## 目录结构

```text
packages/openclaw-dc-plugin/
├── package.json
├── openclaw.plugin.json
├── index.js
├── lib/
│   └── mcp-bridge.js
└── skills/
    └── taptap-dc-ops-brief/
```

## 工作方式

1. OpenClaw 安装 plugin
2. plugin 内部优先启动 bundled TapTap MCP stdio runtime
3. plugin 调用仓库里新增的 `*_raw` tools
4. skill 基于 raw JSON 做简报和动作建议

补充说明：

- 主包里的 `*_raw` tools 默认不会暴露给普通 MCP 客户端
- OpenClaw plugin 在内部启动 runtime 时会自动设置 `TAPTAP_MCP_ENABLE_RAW_TOOLS=true`
- 因此 plugin 用户不需要手动打开这个开关

## 发布顺序

当前建议的发布顺序是：

1. 先发布主包 `@mikoto_zero/minigame-open-mcp`
2. 确认主包里已经包含本 plugin 依赖的 raw tools
3. 再发布 `packages/openclaw-dc-plugin`

原因：

- OpenClaw plugin 会在首次调用时拉取或复用主运行时
- 真正拉数据的运行时仍然来自 `@mikoto_zero/minigame-open-mcp`
- 如果主包版本还没发出去，plugin 即使发了也会因为缺少对应 raw tools 而不可用

## 当前发布现状

当前仓库的 GitHub release workflow 只会自动发布主包：

- 根包 `package.json`
- 根目录 `npm publish`

`packages/openclaw-dc-plugin` 目前还没有接入独立自动发布流水线，所以：

- 提 PR / merge PR 不会自动把 plugin 发布到 npm
- 当前阶段建议先手工发布一次，验证 OpenClaw 安装链路

## 手工发布

仓库已经提供了一个发布脚本：

```bash
# 仅检查打包内容，不真正发布
npm run openclaw:pack

# 发布 OpenClaw plugin 到 npm
npm run openclaw:publish
```

这个脚本会：

- 固定在 `packages/openclaw-dc-plugin` 目录执行
- 使用独立的临时 npm cache
- 避开本机 `~/.npm` 权限脏状态导致的 `EPERM`
- 在发布前提示当前主包版本与 plugin 依赖关系

如果你想直接执行底层脚本，也可以：

```bash
./scripts/release-openclaw-plugin.sh pack
./scripts/release-openclaw-plugin.sh publish
```

## 用户安装方式

发布完成后，OpenClaw 用户侧安装命令是：

```bash
openclaw plugins install @lotaber_wang/openclaw-dc-plugin@0.1.11
```

说明：

- 安装插件本身时，不再要求宿主已经额外装好 `@mikoto_zero/minigame-open-mcp`
- 正常情况下，首次调用不会再触发在线安装主运行时
- `package.json` 中声明了 `openclaw.install.npmSpec`，方便 OpenClaw 安装链路和后续检查统一识别 npm 安装源
- `package.json` 中额外补充了 `openclaw.install.postInstallMessage` / `instructions` / `restartCommand`，让宿主更容易在重启前提示用户
- `openclaw.plugin.json` 中显式标记 `enabledByDefault: true`，减少装完后还要额外启用的概率
- 插件 id 已统一为 `openclaw-dc-plugin`，避免 manifest id 与宿主 entry hint 不一致
- 插件导出对象也同步暴露 `installation` / `installHints`，作为安装提示的第二层兜底
- bridge 会优先走标准 stdio；如果 `initialize` 卡住，会自动尝试无缓冲 / PTY 兼容启动
- bridge 兼容两种输出：标准 `Content-Length` 帧，以及个别宿主下出现的裸 JSON 输出
- bridge 向内嵌 runtime 发送请求时默认使用裸 JSON + 换行，避免部分宿主下只发 `Content-Length` 帧导致初始化无响应
- 授权相关工具会把裸授权直链放到最前面，同时附带 markdown 链接、包装链接与 `details.preferred_auth_url` / `details.auth_links`，降低宿主偶发吞链接时的影响

推荐安装后立刻执行：

```bash
openclaw plugins inspect openclaw-dc-plugin
```

补充：

- `inspect` 可以帮助确认 Gateway 是否已经识别出插件元信息与工具
- OpenClaw 当前通常会在安装完成后自动触发 Gateway 重启；插件包本身不能可靠拦截安装器去弹“即将重启”的通知，这需要宿主侧支持
- 因此插件侧会尽量把“先提示用户再重启”的信息同时写进 npm metadata、plugin export 和 README，交给宿主择优消费
- 很多“装上了但 Agent 看不到 `taptap_dc_*`”的问题，本质上是 Gateway 还没自动重启完成
- 如果等待 10-30 秒后仍未恢复，再执行 `openclaw gateway restart`
- 如果没有 `openclaw gateway restart`，就直接完整重启宿主应用
- 不建议尝试在 `openclaw.plugin.json` 中手工声明运行时 `tools` 列表；本插件的工具仍由入口代码动态注册

## 当前 raw tools 范围

- 环境检查 / 授权开始 / 授权完成 / 清理认证
- 开发者与应用列表 / 选择应用 / 当前应用信息
- 商店 / 评价 / 社区 overview
- 商店 snapshot
- forum contents / reviews
- 点赞评价 / 官方回复评价

## OpenClaw 兼容性说明

为降低 OpenClaw / 容器 / PTY 宿主下的握手失败概率，插件侧做了额外兼容：

- 启动顺序：direct stdio -> `stdbuf` 无缓冲 -> `script` PTY wrapper
- `initialize` 默认超时为 45 秒，超时会自动切换下一种策略
- `initialize` 默认使用 `protocolVersion=2024-11-05` 和空 `capabilities`，优先走兼容性更高的握手参数
- bridge 发往 runtime 的 MCP 报文默认走裸 JSON + 换行，不依赖 `Content-Length` 请求帧
- stdout 解析兼容标准 MCP 帧和裸 JSON
- 如果启动时 stdout 混入人类可读日志，bridge 会先丢弃噪音再继续解析
- 如果拿到的是半截 JSON，bridge 会继续等待剩余分片，不会立刻判定失败
- 如果 PTY 回显了请求报文，bridge 会自动过滤，不把回显误当成服务端响应
- 授权工具文本会把移动端“直接点击授权”链接放在最前面，减少模型只转述扫码方案的概率
