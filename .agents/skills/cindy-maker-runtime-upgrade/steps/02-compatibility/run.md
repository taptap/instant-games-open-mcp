# 02：逐项兼容审核，完成 vendor 替换

先确认 01 已通过，读取候选路径、来源摘要和差异索引。本步的清单是检查起点；
不能只检查 V1-V10，也不能因为旧测试通过就假定新入口已被覆盖。

## 1. 补全本轮历史

从 Maker 仓执行以下只读脚本，路径换成本机插件仓：

```text
node .agents/skills/cindy-maker-runtime-upgrade/scripts/check-history.mjs --plugins <Cindy插件仓绝对路径>
```

脚本比对 [历史来源台账](../../sources/history.md)，列出未记录候选与合并索引，不自动认可保护已通过。
按需读取台账对应日期/提交段，不先全文加载。新增候选逐个读实际 diff，映射到下列清单；
核查同轮 PR 审核后追加的提交，不能停在第一次升级提交。

- 普通提交用 git show --format=fuller <hash> -- <paths>。
- 合并读 combined diff，并与每个父树比较；父树继承和合并独有处理分开记录。
- --all --full-history 只覆盖本地可达 refs。记录 refs 时间和浅克隆情况，按正常
  Git/API 补缺失历史；被删分支、无权限对象如实记缺口。主路径改名、新测试与共享发布
  脚本变化都要看，不能仅依赖提交标题或带 Maker 关键词的搜索。
- 查台账里的替代关系，特别是 [10 月决策与误判纠正](../../sources/october-decisions.md)。
  不重开已有证据驳回的问题，不把曾讨论的方案当最终需求。

已审历史不每轮重审：依据上次已审 SHA/台账，只读新增候选及本轮相关差异。
脚本的 mergeReviewCandidates 是合并索引，不是全部重审清单；共享脚本和规则还须
检查已审基线到目标的实际 diff，不能只依赖带 Maker 字样的搜索。

## 2. 一次只读一组，逐项作结论

下表顺序执行。每个 ID 记录处置、实现定位和证据/待测项，静态历史信息引用清单即可。
先逐组审清差异和适配方案，再统一应用补丁、运行回归并回填结果；各组末尾“验收”是
最终候选的通过标准，不能要求尚未适配的新包先通过才允许读下一组。

| 顺序 | 本组文档                                                  | 重点                                   |
| ---- | --------------------------------------------------------- | -------------------------------------- |
| 2A   | [Runtime 补丁](../../compatibility/01-runtime.md)         | V1-V10、上游等价修复、画布付费请求恢复 |
| 2B   | [Host 与进程](../../compatibility/02-host.md)             | H1-H7、Electron/Windows、roots、超时   |
| 2C   | [账号与目录](../../compatibility/03-account.md)           | A1-A4、T1-T2、PAT/项目隔离/身份恢复    |
| 2D   | [工具与产品契约](../../compatibility/04-tools.md)         | T3-T6、M1-M3、Git/媒体策略/引导        |
| 2E   | [界面与本地验证](../../compatibility/05-ui-validation.md) | U1-U4、L1-L7、画布/编辑器/证据         |
| 2F   | [来源与包安全](../../compatibility/06-package.md)         | P1-P3、N1-N3、增量网络/下载/凭证风险   |

每项核对清单中的历史保护，记录新包实际实现、处理结论、证据及缺口；不重复抄来源。
“上游等价替代”须验证正常及相关异常行为，不能仅凭函数名、版本号或字面串移除补丁。
“废弃”要有后继契约与已确认范围；无法判断写待验证。

S/F 证据不足以完成的项目应在此写明第三/四步必须实测的场景。
若实现已审清但真实进程/宿主证据待补，可将其列为明确的后续验收项；
行为是否保留仍未知、来源不明或有未解决缺陷时，本步不能通过。

## 3. 用现有机制完成适配和替换

1. 通用上游修复与 Cindy 产品策略分清归属，优先复用现有 CLI、原生 Git、
   Host adapter、错误归一化。未经本次授权不修改 Maker 源码来迁就 Cindy，也不改 Cindy 客户端。
2. 新建目标版本独立 .github/maker-runtime/<version>.json，保留旧 recipe；
   从审过的原始包记录 integrity、originalSha256，精确 edits/count、patchedSha256、
   完整 vendorHashes。已等价修复的旧补丁记录移除依据，不为凑补丁数量复制旧实现。
3. 旧 recipe 锚点不符时重新定位并审核，不放宽 count/哈希，也不把现有 vendor 哈希
   反填成“官方原包哈希”。候选包加回仓库维护的 LICENSE，保留官方 Skills/docs。
4. 当前 sync-maker-runtime.mjs 的写入模式从 registry 下载；--check 才是离线模式，
   **没有 --tarball 或 --source 参数**。正式包可走现有同步器；已经验证的本地 tgz
   可用其导出的 validateArchiveEntries/applyPatches/fileHashes/verifyVendor 在临时目录
   完成相同校验，再执行备份、同文件系统 rename 切换、失败恢复。一次性操作脚本放证据目录，
   记录实际命令和输入，不为此另建一套长期升级器。
5. 本地测试版本可先在独立插件工作树验证；现同步器 CLI 只收三段正式版本。不要
   伪造正式版本或替换线上 recipe 来绕过限制。正式交付用官方包重建/复核来源链；
   若确需扩展来源契约，作为明确改动审查，不在升级中暗改门禁。
6. 根据真实差异同步 main.js/node adapter、测试、四语言、双语交付说明、许可证和
   ghost.json.version；别顺带添加未使用权限或进行全仓重构。

## 4. 自动验证本轮候选

从插件仓运行；下列同步器命令用于三段正式版本，换成本轮实际值。
本地 local/test 候选改用同步器导出的 verifyVendor(候选目录, 本地配方对象) 与
applyPatches 校验，并运行 node --check <候选maker.js>，不要把预发布版本传给仅接受
三段版本的 CLI。其余测试仍须指向本轮候选，不能跳过。本地配方标清构建来源，
不把自行计算的 integrity 冒充官方 registry 证明。

```text
node .github/scripts/sync-maker-runtime.mjs <目标版本> --check
node --test .tests/taptap-maker.test.mjs .tests/taptap-maker-upgrade.test.mjs .tests/taptap-maker-local-validation.test.mjs
node --test .tests/plugin-contract.test.mjs .tests/localization.test.mjs .tests/provisioning.test.mjs .tests/publish-workflows.test.mjs
git diff --check
```

升级测试若仍写死旧 recipe，须改成真正验证目标包；只测试旧配方不能证明新包。
新增/变化的失败链路补针对性回归，提取当前 bundle 的真实函数并验证最终结果，
不能只模拟一个理想函数。断言正常路径、未执行、已执行、未知和实际调用次数。

记录真实通过/失败数和日志。环境问题与本次回归分开定位；旧 Bash、Windows 路径、
jq/zip 缺失要修正执行环境或转等价 CI，不能删断言换绿灯。
通过自动验证后读取 [02 验收](acceptance.md)。
