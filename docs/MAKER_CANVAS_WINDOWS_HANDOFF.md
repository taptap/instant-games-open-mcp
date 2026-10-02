# Windows 序列帧画布测试交接

更新：2026-10-03。本文替代旧版交接，交给 Windows 测试 AI 执行。
先同步整条分支、重新编译，再按本文验收。macOS 结果不能替代 Windows 实机结果。

## 1. 同步与启动

- 仓库：taptap/instant-games-open-mcp。
- 分支：feature/maker-canvas-sequence-editor。
- 本轮修复：fcaf288（逐帧背景变化、手动取色、失败续跑与来源保护）。
- 已包含 Windows 修复：618e90c（隐藏命令行窗口）、c03c3b8（首帧白闪及未派发队列锁）。
- 后续整合：b5b08e8（布局及卡片状态）、975bbe0（合并 Windows 修复、解码及任务恢复）。
- 拉取该分支最新提交，包括本交接文档；不要在旧版本上只复制文件或重复 cherry-pick。
- 旧 taptap-maker-0.0.37-local.20261002.192149.tgz 不包含本轮修复，不用于本次验收。

工作区干净且已在目标分支时执行。有本地改动或分叉时先保留现场，再处理合并，不要 reset/强推：

    git status --short --branch
    git fetch origin
    git pull --ff-only origin feature/maker-canvas-sequence-editor
    git merge-base --is-ancestor fcaf288 HEAD
    git log -5 --oneline
    npm ci
    node scripts/bundle-maker.js

确认没有生成、保存或预览任务后，正常停止旧控制台并从新 bundle 打开：

    node dist/maker.js console stop --json
    node dist/maker.js console open --target-dir "D:\实际游戏项目目录" --json

目录必须替换为 Windows 上真实游戏项目。使用返回的新 URL，进入「序列帧动画」，
不要继续看旧端口或另一份 npx 缓存。不要强杀正在写文件的控制台。

## 2. 根因与本轮改动

用户实际视频可以解码：H.264 / yuv420p、960×960、24 FPS、约 4.096 秒。
前 3 秒按 4 FPS 得到 12 帧。第一帧是白底完整角色（约 85% 背景），后续为深红底；
旧去背景校验要求颜色接近，错误拒绝了整批。它不是无主体白闪，也不是 Windows 专属格式问题。

| 改动         | 预期行为                                             | 文件/入口                                               |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| 逐帧背景     | 每帧可靠识别即可使用不同颜色；失败不部分替换         | src/maker/canvas/sequence.ts：cutout                    |
| 手动恢复     | 自动失败可输入 HEX 或点击原图取色，支持当前帧/全部帧 | src/maker/canvas/backgroundUi.ts                        |
| 处理范围     | 去背景弹窗默认边缘连通，全图同色由用户显式选择       | backgroundUi.ts                                         |
| 失败续跑     | 从失败步骤继续；保存失败不重复抽帧、抠图、上传       | src/maker/canvas/sequenceUi.ts：runTemplate             |
| 来源保护     | 加载前捕获来源，加载后、抽帧后和保存前校验           | sequenceUi.ts：startExtraction、assertExtractionCurrent |
| 手工编辑     | 有效来源图集草稿可续跑，无效来源提示先保存或明确重抽 | sequenceUi.ts：editableFrames                           |
| Windows 脚本 | 修正 npm 命令解析，隐藏样本生成子进程窗口            | 两个专项 .mjs 脚本                                      |

保留既有白闪规则：仅片头 0.5 秒内、覆盖率至少 99.5%、近乎纯白/黑且不同于稳定背景的帧
可跳过，并记录日志；有主体的白底帧必须保留。旧模板 chroma 设置不自动迁移，
弹窗默认 connected 不代表旧队列参数已改变。

## 3. 专项自动检查（PowerShell）

需要仓库 Node/npm 依赖、Playwright Chromium；视频兼容性脚本还需要 PATH 中的 FFmpeg。
FFmpeg 仅用于构造回归样本，产品内抽帧由浏览器完成。
脚本默认读取全局 Playwright。若使用本地安装，可设置 PLAYWRIGHT_MODULE 为其 index.mjs
绝对路径；没有安装时按本机开发环境约定准备 Playwright，再执行 playwright install chromium。

    npm test -- --runInBand src/maker/canvas/__tests__/sequenceUi.test.ts src/maker/canvas/__tests__/sequenceCompatibility.test.ts src/maker/canvas/__tests__/templateWorkflow.test.ts src/maker/canvas/__tests__/groupQueue.test.ts
    node scripts/test-maker-background-editor.mjs
    node scripts/test-maker-video-compatibility.mjs

附加 Windows 上真实失败的 MP4（替换为实际路径）：

    $env:MAKER_SEQUENCE_TEST_VIDEO = "D:\测试素材\实际失败视频.mp4"
    node scripts/test-maker-video-compatibility.mjs
    Remove-Item Env:MAKER_SEQUENCE_TEST_VIDEO

视频脚本把副本导入临时项目，输出截图、checks.json 并打印目录，不发起付费生成。
背景编辑器脚本覆盖 7 类行为；需截图时设置 MAKER_BACKGROUND_SCREENSHOT 为本地 PNG 路径。
依赖缺失应先解决环境，不能把未执行记为通过。脚本通过后仍须目视主体和透明边缘。

## 4. Windows 实机清单

在测试画布或备份项目中操作，不清空用户画布、历史或源素材。

### 背景、格式与取消

1. 白底有主体首帧、后续变色的视频：问题样本前 3 秒 / 4 FPS 应保留 12 帧，不能再因颜色不同失败或删除完整角色首帧。
2. 「预览并调整去背景」中切换自动、手动 HEX、原图取色，预览与应用参数一致；自动识别失败后仍可手动操作，非法 HEX 不能提交。
3. Windows 100%、125%、150% 显示缩放和不同窗口尺寸下，原图取色坐标准确，图片外留白不取色，不能从抠图结果误采样。
4. 当前帧应用保留其它帧编辑；整批中途失败、取消均不能提交前半批结果。快速改参数、关闭后迟到预览不能覆盖新参数或复活弹窗。
5. 检查披风和透明边缘。深红背景与红披风近色仍可能误伤，不能凭“没报错”判视觉通过；可调参数、补修或跳过抠图，不自动重新扣费生成。
6. 覆盖 H.264 MP4（前置/尾部索引、长 GOP、可变帧率）、VP9 WebM、H.264 MOV；音轨-only/损坏视频应失败并释放状态，之后正常视频仍可抽帧。
7. 在实际使用的 Windows 浏览器和内置 WebView 验证关键流程，不以扩展名推断可解码；明确不支持时提示转换格式，不能生成空白 1×1 结果。

### 续跑、保存与引用

1. 去背景失败后继续只重试该阶段；原帧和旧图集保留，取消后也能明确重试。
2. 手动处理背景/修图后继续，保存真实手工修改，不重新抽帧覆盖；输出 FPS 可独立调整。
3. 保存失败后仅继续保存，保存成功前旧结果及下游关系不变。
4. 换视频或引用后重新抽帧；加载期间换源停止本轮，不给旧帧写新来源快照。
5. 已保存图集再编辑：来源有效可续跑；缺失/过期时保留草稿并提示，手动保存仍保留原来源记录。
6. 页面刷新不持久化临时帧；已保存结果、视频历史保留，刷新不自动提交付费生成。
7. 分组队列失败暂停，手动修正/保存后再继续，不新增重复目标卡或绕过依赖。

### 既有 Windows 修复与路径

1. 中文、空格项目目录下，图片/视频导入、图集保存、资源导出成功，Git 忽略检查不被绕过。
2. 单卡生视频、分组队列、序列帧保存均不弹内部命令行窗口。需要真实远端覆盖时按用户授权测试，优先复用已有素材与原 taskId。
3. 明确未派发且无 taskId 的失败可重试；派发后 unknown 保留历史/taskId，不自动创建第二笔收费任务。
4. 10 分钟视频名额释放、6 小时本地查询期限保留原契约；它们不意味着整张画布必须冻结。
5. 断连分别记录前端 inFlight、group.active、服务端 videoOperations、远端占用；不以删缓存或缩短占用时间掩盖问题。

相关入口：src/maker/server/remoteProxyManager.ts、hiddenStdioTransport.ts；
src/maker/canvas/files.ts、generationUi.ts、groupQueue.ts、videoTaskTiming.ts；
src/maker/console/canvasGeneration.ts、canvasVideoGate.ts。

## 5. 已有验证与边界

- macOS：相关 4 套件 94 项通过，背景编辑器浏览器专项 7 项通过。
- 视频脚本：5 类编码/容器、内置真实视频、音轨-only/损坏文件恢复通过。
- 实际视频：12 帧提取、边缘连通处理及打包通过；在最终打包页面注入去背景失败后，重试共抽帧 1 次、去背景 2 次、保存 1 次，失败时保留旧结果。
- 红披风存在近色误伤风险，未宣称抠图无损；Windows 尚未实测。
- 完整 npm run test:maker:canvas-ui 停在旧“视频历史”按钮定位，未完成全流程。当前入口在展开日志栏里，请按实际界面核实，不把定位超时直接当产品故障。
- 全仓 tsc --noEmit 在 macOS 有 284 条既有诊断，本轮目标文件未发现新增错误；Windows 应保存输出并与基线比较，不宣称全仓类型检查通过。
- 本轮没有发布 npm 或附加新安装包，以该分支源码重新 bundle 为准。

## 6. 回传要求

给出完整 commit SHA、Windows/Node/浏览器版本、实际 bundle 启动路径，逐项 PASS/FAIL/未测。
失败项附复现步骤、日志、视频参数及截图，区分解码、背景识别、视觉误伤、保存、队列/占用问题。
可记录卡片/任务 ID 供定位；日志脱敏，不提交 PAT、MAC token、用户原素材或测试缓存。
小问题最小修复并附验证；涉及计费、引用契约或架构调整先列证据，不重做工作流或添加自动付费重试。
