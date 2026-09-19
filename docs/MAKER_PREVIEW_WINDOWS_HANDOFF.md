# 本地预览重构：Windows 测试交接

## 本轮改了什么

- 启动 Runtime 前分类，结果见 `preflight.kind`、`preparation_required`、
  `preparation_reason`，不能仅凭配置存在或“是单机”就直接启动。
- 简单、无资源索引需求的完整单机项目直接运行原目录。
- 联机/server、缺配置、有资源/构建配置或 `.meta` 的项目，在受管理副本生成本轮产物。
- Windows 原目录有 `dist/latest.json` 时也准备新产物，避免运行旧代码；不改原项目 dist。
- 删除 junction/软链接路径映射，准备副本改用逐文件复制；复制输入含符号链接时明确拒绝。
- 联机准备失败不得静默离线；不自动提交、推送或远端构建。服务端仍运行远端测试版本，
  本地 server 修改不会自动上传生效。

主要源码：`src/maker/preview/configuration.ts`、`runtime.ts`、`prepare.ts`、`network.ts`。
Codex/WorkBuddy 插件产物已同步。完整约束见 `MAKER_LOCAL_PREVIEW.md`。

## 从本轮源码开始

检出 `fix/maker-local-preview-phase-one`，确认包含本交接文档及预览分类改动。
不要用全局旧 CLI 或 npm latest 代替待测版本。已有安装依赖可直接构建；否则先 `npm ci`。

```powershell
npm run build
$cli = (Resolve-Path ".\dist\maker.js").Path
$project = "D:\游戏测试\项目目录"
node $cli preview status --target-dir $project --json
node $cli preview start --target-dir $project --json
node $cli preview logs --target-dir $project --json
node $cli preview refresh --target-dir $project --json
node $cli preview stop --target-dir $project --json
```

项目须已绑定 Maker。Runtime 未安装时使用 `preview install`，或启动时显式指定
`--runtime <exe绝对路径>`。不要覆盖用户正在运行的会话。

## 代表性测试

| 用例                                 | 重点检查                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| 完整简单单机，无资源索引、无旧 dist  | `preparation_required=false`，原目录启动                           |
| 单机有旧 dist，随后修改脚本          | `preparation_required=true`，画面/日志确实体现新修改；原 dist 不变 |
| 单机使用 UUID/alias 或公共资源       | 走准备链路，图片/字体/模型实际正常，不以进程存活代替验收           |
| 无配置新项目                         | 副本补默认值，原项目不新增 `.project`                              |
| 联机，以及启用联机配置的 server 项目 | 启动前分类正确，真实测试服回包；server 项目使用 client 入口        |
| 中文、空格和较长目录                 | 至少用一个需准备的项目覆盖；启动、刷新、停止无残留                 |

每类选一个即可，不需要跑遍所有游戏。可参考 `测试匹配` 和 `世界杯游戏主题` 的项目类型。
联网测试使用已有合法登录；不要输出 PAT/token，不自动远端构建来掩盖错误。

## 已知边界，必须关注

- **长路径尚未通过 Windows 实机验收。** 删除映射不等于引擎长路径限制已解决；
  重点记录原项目和受管理副本的实际路径。不能用重新加 junction/subst 作为测试通过依据。
- Windows Runtime 曾报告缺少 `themis_x64.dll`；macOS 仍有
  `Cube/Day/DaySpecularHDR_QualityLow.dds` 缺失。区分包缺失与项目问题，不盲目补 DLL。
- 只有 server 入口、没有启用联机配置时，目前会明确失败；不能报告为已完整支持。
- JSONC/旧配置布局、外部 asset_dirs 和符号链接输入不在当前支持范围。
- macOS 已做代表性启动/停止和自动化回归，不代表 Windows、完整画面或完整玩法已通过。

## 交付测试结果

每个用例只记录：通过/失败、CLI 提交号、Node/Runtime 版本、分类结果、画面或业务证据。
失败附脱敏后的 `status`、`logs`、`prepare.log` 或 supervisor 日志，以及复现路径长度。
停止本轮会话，确认原项目源码/配置/dist 未被准备流程改写。
这次推送用于 Windows 验收，尚不是“所有环境稳定”的发布结论。
