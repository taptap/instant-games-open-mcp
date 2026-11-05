# 01：准备本地版本和替换候选包

本步只建立可追溯的升级输入和候选目录。第二步审核后才完成正式 vendor 切换。
不先覆盖旧包再试图从记忆恢复补丁。

## 1. 定位两仓和现有产物

1. 读取两仓 AGENTS.md；插件仓再读 README、plugin-authoring、Maker maintenance 和
   .greptile 审查契约的相关章节。Maker 仓读 docs/CI_CD.md、RELEASE_PR_GUARDS.md
   的 Maker-only 构建/打包约定。不要加载与此任务无关的整个文档索引。
2. 两仓分别检查 git status、分支、HEAD、remotes、浅克隆状态。新升级分支基于已核对的
   最新官方 main；已有本轮分支继续使用。脏树不自动切换/清理，可在独立工作树完成升级。
   Maker 源码只是读取/取产物时，不切其分支。远端地址输出先去掉认证信息。
3. 确定仓库外 EVIDENCE_ROOT，复制 [交接模板](../../templates/run-record.md)。
   记录源码、插件、证据三个根路径；Windows 不套用原 Mac 用户路径。
4. 先查本地 packages/maker/package.json、dist/maker.js、已有 tgz、npm 缓存，
   再决定是否需要编译/联网。主包 package.json 的版本属于另一个 npm 包，不能当 Maker 版本。
   dist 的 dev、packages 的 local 版本及旧控制台版本可能不同，必须核对实际字节。

## 2. 决定来源，先用本地已有证据

| 情况                 | 做法                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地已有目标正式 tgz | 核对 @taptap/maker 身份、版本、SHA-512 integrity、官方发布出处/元数据；无需重复下载                                                           |
| 正式 tgz 在 npm 缓存 | 可用 npm pack @taptap/maker@目标版本 --offline --ignore-scripts --pack-destination 证据目录导出；失败再查现有文件，不把缓存缺失说成版本不存在 |
| 用户指定本地源码构建 | 记录 HEAD、纳入的 diff、锁文件和构建参数；生成明确 local/test 版本，先做候选及本地验证                                                        |
| 本地资料不足         | 才查官方 registry/CI/tag 并获取确切包；区分未发布、网络失败、无访问权限                                                                       |

本地文件也要核对来源。源码 tag 用于解释包内容，单独一个 tag 或版本号不能证明 tgz 字节。
本地自编包不能伪称正式 npm 发布物；可以完成本地适配，正式交付前补齐来源/配方适用性。

## 3. 需要编译时，编译 Maker-only

读 [跨平台命令](../../references/platform.md) 的“构建与打包”节。
依赖已可用且锁文件未变时直接复用；缺依赖才按锁文件 npm ci。
例如 10 月曾缺 three，正确处理是补齐锁定依赖后重建，不删 Canvas 代码让构建通过。

- 构建：scripts/bundle-maker.js；用 MAKER_PACKAGE_VERSION 标明实际版本。
- 组装：scripts/prepare-maker-package.js --version；它读取根 dist/maker.js，
  并删除重建 packages/maker。使用隔离的源码副本执行全套组装，保护现有产物和运行中服务。
- 产包：在隔离副本的 packages/maker 执行 npm pack --dry-run 和 npm pack
  --ignore-scripts --pack-destination 证据目录。不执行 npm publish。
- 源码副本必须含本次授权纳入的工作区改动；只 clone HEAD 会漏掉未提交修复。
  不复制凭证、原项目数据和无关未跟踪文件。
- 记录原始 bundle、包内 bundle、包元数据、构建日志及哈希；检查 bin/skills/docs
  完整性。只需读取 CLI help 确认包可启动，更完整 CLI 验证在第三步。

## 4. 准备三份对比材料

1. 当前插件 vendor 和旧版本 recipe 的只读快照。
2. 旧版本的未打补丁原始包：先对比旧 vendor，列出 Cindy 自维护补丁及非 bundle 文件差异。
   可用可逆配方辅助还原，但还原结果必须匹配官方旧包哈希；不是自动获得来源证明。
3. 本次新包的独立候选目录：对比新旧原始包，另列新增/删除文件、依赖、工具 schema、
   网络/下载/动态执行/凭证/进程入口、编码 UI 资产变化。不要把 vendor 大差异全当上游变化。

解包前用插件仓 sync-maker-runtime.mjs 的 validateArchiveEntries 检查路径及条目类型，
拒绝越界、链接和特殊文件。不要为了看源码先执行未知下载内容。
读取 [01 验收](acceptance.md)，通过后进入第二步。
