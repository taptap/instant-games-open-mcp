# OpenClaw Plugin

本仓库包含一个可独立发布的 OpenClaw plugin 子包：

- `packages/openclaw-dc-plugin`

## 设计目标

- 不要求最终用户单独配置 MCP
- 直接作为 OpenClaw native plugin 安装
- 内部复用 `@mikoto_zero/minigame-open-mcp` 运行时
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
2. plugin 内部启动 TapTap MCP stdio runtime
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

- OpenClaw plugin 只是一个安装壳
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
openclaw plugins install @taptap/openclaw-dc-plugin
```

## 当前 raw tools 范围

- 环境检查 / 授权开始 / 授权完成 / 清理认证
- 开发者与应用列表 / 选择应用 / 当前应用信息
- 商店 / 评价 / 社区 overview
- 商店 snapshot
- forum contents / reviews
- 点赞评价 / 官方回复评价
