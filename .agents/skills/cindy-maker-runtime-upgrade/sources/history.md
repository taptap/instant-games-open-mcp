# 历史来源台账（按需查阅）

2026-11-02 从 Cindy 插件仓现有升级 Skill 的逐提交台账保留。
以下是历史快照，里面的“当前”“尚未提交/发布”属于当时语境，不是本轮状态。
历史台账只证明来源；每次升级仍须逐组给出新的兼容结论。

原始位置：cindy-official-plugins/.agents/skills/taptap-maker-runtime-upgrade/references/history.md。
本目录的现行检查入口见 [第二步](../steps/02-compatibility/run.md)，
对话最终决定见 [10月记录](october-decisions.md)。不要一次加载此台账全文。

## 本次补齐的最终三个提交

| 完整 hash                                | 实际保护与对应检查                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 4904a1cec2e3f4d29343b1bc34810cc358d80272 | V9云端Git未知态、新旧阻塞文本；T6/T4采用0.0.39自动合并/云端提交，同步文案和测试，不恢复旧云端构建绕行。 |
| fc21a2558df208d1d37c2e0cc9c2fdc36c108bba | V10未知付费请求/识图pendingId保留、等待超限暂停、015准备和恢复等待停止、迟到结果不重启。                |
| 4d4a99275d3e8d496c66d4139cba10dd23cf845b | V9补齐成功云端提交后的merge/HEAD抛错executed；H5内部列表115秒；T4文本/结构化Git指引统一。               |

已读取上述实际diff，并对照最终recipe、专项测试与10月对话；仅作本地分支来源，
不宣称已经main合入或市场发布。下面保留更早的完整hash与替代关系。

---

# 历史提交与替代关系

## 范围和证据边界

- 增量核查日期：2026-10-27；本地基线 HEAD 为 9efadd88b4fb1993a415d3302060b4168fd02d15，非浅克隆。0.0.39 适配尚未提交；以下旧清单保留其原核查范围。
- 本地专项路径的 full-history 非合并提交共 50 条，另有 20b0b064 的合并独有版本/测试处理；下面逐条列出。普通路径 git log 曾漏掉 da7f978，不能再用简化历史作为完整性依据。
- 核查包括插件、专项测试、升级脚本/配方、维护文档；另检查共享 README、provisioning、发布/契约路径。新增共享候选必须读 diff 判定，不把全部仓库提交都叫 Maker 兼容修改。
- 行内短 hash 只用于矩阵交叉引用；下表给出完整 hash。实际实现/验收见 [现行分组检查入口](../steps/02-compatibility/run.md)。版本、许可证、文案和测试提交也保留记录，不能把它们误算成新的 Runtime 补丁。
- 0.0.31 分支不在当前本地 refs：四条提交通过 GitHub get_commit 取得实际补丁；a3d295d 在 2026-10-27 已从本地对象取回并读到实际 diff。不能宣称已穷尽被删除分支、不可访问 fork 和未公开历史。
- 整包升级的记录是官方版本及其兼容差异/契约检查，不表示逐行审计所有第三方依赖的全部源码。新增风险仍须按本次新旧发布包单独检查。

## 本地逐提交清单

状态：保留＝现有保护需继续验收；替代＝只保留最终行为，不照搬旧实现；契约/测试＝非 bundle 补丁，但不能漏交付；版本＝不能作为行为已修复的证据。

| #   | 完整 hash                                | 实际修改与要防的问题                                                                                                                                                                                                                                                                                                                         | 处理 / 验收 ID                                                                     |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 01  | 41d53ce6f5154203a1c9eeae42a9d1f2557477e4 | 初始固定 Maker MCP/账号/子进程入口；异步 spawnEntry 转同步流 facade，缓存早到 stdin，proxy 配置用既有 JSON 参数。CLI 最终 JSON 后主动回收 ParentPort 保活进程，输出/时间上限与进度心跳。roots/list 按活动列表代理、排队超时重建。PAT stdin、账号互斥、批量最多五项目、reqId 去重、可信 workdir 覆盖 target_dir、构建右侧预览、固定工具别名。 | 保留 H1/H2/H5/H6、A1–A4、T1、U1；初始目录方案由 02–06 收紧，H3/H4 是后续宿主修复。 |
| 02  | ddcc0b70ea2b8d3a17175de014e4ce4d97cc2e04 | 清洗项目名并加 project.id 的 SHA-256 前 16 位；移除仅批次内同名 Set，避免分批同步同名项目落到同一目录；Windows 保留名仍处理。                                                                                                                                                                                                                | 保留 A3。                                                                          |
| 03  | 675d2c3eb140eaa4a43c476190dd9f6e0b4d3da1 | 为重复同步暂时取消非空目录拒绝；目标检查移进逐项 try，单项目失败不终止整批。                                                                                                                                                                                                                                                                 | 非空目录放行被 04–06 替代；逐项反馈保留 A3/A4。                                    |
| 04  | e58a2414b284566de3cb3bbfbda700fd7ab3ff73 | 非空目录只接受 .maker-mcp/config.json 的 project_id 相同；不再接受任意内容。                                                                                                                                                                                                                                                                 | 后续还必须验 origin，不能停在本提交的宽松条件；A3。                                |
| 05  | d5132e4793afe7621199d664a4b026648d6979dc | 生产/RND Git base 与指定环境一致；origin URL 去 auth 后精确比较项目地址；lstat 检查配置目录/文件及 .git，拒绝符号链接和非目录元数据。                                                                                                                                                                                                        | 保留 A3；当时缺 .git/config/origin 仍放行，由 06 修复。                            |
| 06  | 9cbebaa19ce752924a4b8fb952c550a582538f3c | 缺 .git、Git config、origin 均拒绝；仅 project_id 匹配不够。补有绑定但无 remote 的负例。                                                                                                                                                                                                                                                     | 最终目录门禁，保留 A3。                                                            |
| 07  | 9029599fe1b58079ef8160ccd0b6876b297bc08a | Runtime 升到 0.0.26；缺身份时按工作区合并二维码初始化并只重试一次，不自动补构建；结果去 PAT hint、本地路径、令牌和堆栈，保留精确余额不足；批量同步失败区分认证/目录/Git/Python/网络。                                                                                                                                                        | 保留 A1/A2/T2/T3；身份重试由 27 继续收紧。                                         |
| 08  | 3b8f23d5a8daf17baa90f95d935f8a001894ce12 | 补 maker pat missing、pat expired、HTTP 403 登录失效识别，保留原 missing/JWT/401/unauthorized。                                                                                                                                                                                                                                              | 保留 A2；不要把任意网络失败都改成未登录。                                          |
| 09  | e351b9611bed0b87b9a84223a4ec4facfb4ab05e | manifest 声明 zh-CN/en/ja/ko，由 Host 选语言，插件版本 2.1.0。                                                                                                                                                                                                                                                                               | 契约 U2/P1。                                                                       |
| 10  | 36cac63adf2f6a3ea1c7ff9493f2d2ead458c0d7 | 加仓库 Apache-2.0 与 Maker vendor/LICENSE（不是新增行为补丁）。                                                                                                                                                                                                                                                                              | 保留 P2；整包替换不能丢仓库补充的许可证。                                          |
| 11  | 71454807d950e295a26ef9124899e7d993f4312f | 许可证打包变更对应 plugin 2.1.1；本地化双语文档。                                                                                                                                                                                                                                                                                            | 版本/契约 P1/P2。                                                                  |
| 12  | 423593847eb79008ced958efee74d338f80e3fd4 | 统一插件显示名与 locale，用 Art 插件称呼替代 Cindy Art；仍须精确余额不足并经用户确认才切换。                                                                                                                                                                                                                                                 | 契约 U2/T3，不恢复更广的自动替代策略。                                             |
| 13  | df0885729d4ada27249b74957447b9d85d85d8ec | 增随包工作流 Skill、四语言参数、禁止绕过插件；只读会话拒绝 init/build/动态工具；预览加 hide_chat=1；曾加 watcher 活动续命与十分钟空闲回收。                                                                                                                                                                                                  | T1/U1 保留；Skill 被 32/33 迁 Manual；watcher controller 被 23 删除，禁止恢复。    |
| 14  | 72809106a53c69fb8825918d68abb0d46d91f10c | 明确 query_video_task 下载视频、get_debug_feedbacks 下载附件，不能按 query/get 名字当只读；补拒绝测试。                                                                                                                                                                                                                                      | 保留 T1。                                                                          |
| 15  | 850d696cede959d9418a332e883dbedb44d5fa09 | 全量发布中的 Maker patch 版本 2.1.3；此处无 Maker Runtime 行为变化。                                                                                                                                                                                                                                                                         | 版本 P1，不是兼容补丁。                                                            |
| 16  | 14cfc58fc202be5204ab5d7397dce8b3b61bde81 | 按 stdin/stdout 属性可配置性选择替换或原地代理；先取完预缓存 initialize 再回灌，保存原 write/nativePush 防递归。解决 Electron/Windows Cannot redefine property: stdin。                                                                                                                                                                      | 保留 H3；普通 Node 启动不能替代钉死 stdio 回归。                                   |
| 17  | 52f15ee9d097048e88e928b64b3aa3498328178f | 打包带根法律文件，Maker bundle 完整依赖归属；roots 测试用 pathToFileURL，避免硬编码 POSIX file URI。                                                                                                                                                                                                                                         | 保留 H5/P2，发布脚本也属于检查范围。                                               |
| 18  | d1994f7b19e09bec2446d006415fceeac6ff2fb9 | 仅为重发 bump 至 2.1.5。                                                                                                                                                                                                                                                                                                                     | 版本 P1。                                                                          |
| 19  | 9aa6527f3384b1dd5817c582957dc112e73442a3 | Runtime 0.0.27；新增 maker_ads_guide，仅 resources/read 固定 maker://ads-integration-guide，允许只读会话；补真实 Runtime 资源测试。                                                                                                                                                                                                          | 保留 T5，不从网络临时拼指南。                                                      |
| 20  | e5e13961231dffc55f49b420376dee1a522a0295 | settings 从 /app-context 获取 Host locale，四语言及英文回退；目录选择和请求携带 locale，不猜操作系统语言。                                                                                                                                                                                                                                   | 保留 U2。                                                                          |
| 21  | 6e4affec09cfce3f95631af74fd316d432269bb7 | locale 请求两秒 AbortController；settingsErrorCode 与 action 映射，逐项目失败按 code 本地化，不直接回显底层错误。                                                                                                                                                                                                                            | 保留 A2/U2；当时遗漏 GIT_REQUIRED，见 22。                                         |
| 22  | 8475e3385b37ae2c82096314d64caa5f17844e39 | 设置页同时接受 GIT_REQUIRED 和 GIT_NOT_FOUND，避免后端错误码不一致只显示泛化失败。                                                                                                                                                                                                                                                           | 保留 A2/U2。                                                                       |
| 23  | 53056275d37c204e566590cd2707e7570d04b0cb | logs watch 专走系统 node，删除 Cindy watcher controller/touch/track；无 Node 单次错误后由 Maker 降级，不回退 Cindy.exe；主构建 \_\_maker-proxy 仍 spawnEntry。                                                                                                                                                                               | 最终策略 H4；不是关闭日志，也不是全部子进程改原生 spawn。                          |
| 24  | 7f00a60aa2278376d7be828c8f650f122e94667b | UrhoX 沙箱禁用 os.clock()/io.\* 可能无报错卡住，工作流改建议 Update TimeStep 累积并查运行日志。                                                                                                                                                                                                                                              | 契约 U3，不能把启动窗口当游戏正确。                                                |
| 25  | a13062eae7963af536914d7a24efd63424ae9436 | Runtime 0.0.28；删除“素材能力优先使用 Maker”的契约；仍保留精确余额不足判断和用户确认切换。                                                                                                                                                                                                                                                   | 版本/契约 T3/P1；勿恢复旧素材优先级。                                              |
| 26  | b662445c7ecb42c34449125ddcbc6cb0579ba1c9 | provisioning audience 从 all 改为 emails: []；专项测试从默认播种改手动安装。                                                                                                                                                                                                                                                                 | 保留 P1；插件目录外的产品策略，升级不能恢复自动分发。                              |
| 27  | 891868efb8827287a3d9bd440715ba5c44bdc332 | 整包 0.0.32；三态从 structuredContent/remote_result/error_details 提取，executed/unknown 不自动身份恢复；二维码失败/第二次失败保留状态。主子入口注入 cindy_plugin，CLI/npm/环境建议改插件入口；状态 detail/skip_remote_sync、目录快照契约。                                                                                                  | 保留 T2–T4/H1；替代 0.0.31 的特定工具补丁形态，不代表可放松不重放。                |
| 28  | d0b428c9734f2cd7ff1510ad31929eaed834423a | 普通工具 unknown 错误加先核对 Maker 状态、产物、用量提示，禁止盲目/自动重试。                                                                                                                                                                                                                                                                | 保留 T3。                                                                          |
| 29  | 7465cebea1b434f5e51664a46112153cce743515 | 补固定文本 execution_state=... 与 automatic retry is disabled 解析；身份恢复后的第二次 unknown 同样要求远端核对。                                                                                                                                                                                                                            | 保留 T2/T3，不能只测第一次失败。                                                   |
| 30  | bdc6bdd853a8c5b44b2fd000d98a5bed9358c6db | 状态摘要虽不改文件/远端 Git 同步，绑定项目仍 /tracking 上报用户/项目/工具/状态；同步 manifest/四语言说明。                                                                                                                                                                                                                                   | 契约 T4；不宣称零网络/纯离线。                                                     |
| 31  | ff54f59868c92517677c2718798b88abebf47319 | normalizeRemoteProxyExecutionState 原只认 not_executed/unknown，补 executed，避免远端已执行被降级。                                                                                                                                                                                                                                          | 保留 V1；0.0.37 还有新聚合器，不能只补此白名单。                                   |
| 32  | a887ccc63e4e9255024b5daf55075f0ac783d461 | 随包 Skill 改按需 Manual、移除全局 skill 投影；限定明确 Maker 游戏任务，排除泛 TapTap/SDK/上架/插件维护；广告召回也收窄，minCindyVersion 0.1.48。                                                                                                                                                                                            | 保留 U2/T5；最终版本下限见 34。                                                    |
| 33  | 20b0b0644717ee81c4973d98ddce52f1c9c17cda | 合并 Manual 分支与 0.0.32 修复，combined diff 单独选择 plugin 2.1.12 和对应测试。                                                                                                                                                                                                                                                            | 合并独有差异；不能因 --no-merges 漏掉。                                            |
| 34  | 3e0dffb55def10b3f4f81872329838037b45e84a | 三类媒体开关默认开、调用前 /kv 校验，坏设置拒绝；保存读改写保留其它键、失败不假报成功；恢复重试仍经过门禁。同期 manifest v2→v3，去 slots，加 sessionContext/pick，minCindyVersion 0.1.64。                                                                                                                                                   | 保留 M1–M3/P1；不是只改生图按钮。                                                  |
| 35  | 577da800fb9f104fa733206afbd6a872d24ce6f6 | 整包 0.0.33 保留当时 executed 补丁；本地 main 只落后时 build 前 ff-only，分叉/非 main/同步不明/覆盖修改则提交前停止，描述同步。                                                                                                                                                                                                              | 保留 V1/T6；此时“一项补丁”不代表后续仍只有一项。                                   |
| 36  | a5d85df8e893c99ca97135f9271e60a1ed1b24fa | BLACKLISTED 调用发送前拦截，加顶层 execution_state=not_executed。                                                                                                                                                                                                                                                                            | 被 39 改为 structuredContent，保留最终 V2 而非顶层旧写法。                         |
| 37  | 660280753d1ee651d161718fceab1162341d9d92 | 媒体关闭/设置读取错误的抛错对象标 not_executed，并在最终 tool-result 顶层保留。                                                                                                                                                                                                                                                              | 由 39 补结构化穿透，M2。                                                           |
| 38  | 2a80b2827db7e799df4eb690ca77528fe6199e60 | 删除启动期 accessStatePromise，tools/list、resources/read、tools/call 每请求检查账号限制。                                                                                                                                                                                                                                                   | 保留 V3；换 PAT/权限时不能沿用旧访问结果。                                         |
| 39  | 431213ec97909bdaae05b8d6bde8cd0b848734e8 | Runtime 黑名单结果改 structuredContent(success/message/state)；宿主 catch 同样提供 structuredContent，防 transport/包装丢状态。                                                                                                                                                                                                              | 保留 V2/M2/T3。                                                                    |
| 40  | a301b67bdb80a3ff3db8177e9ef3274b59163d6d | 生图关闭、损坏/读取失败场景检查最终 structuredContent.execution_state，而非仅顶层字段。                                                                                                                                                                                                                                                      | 测试 M2，不能只测内部抛错对象。                                                    |
| 41  | a12cdc5bd66e5da6e3c2227e2570729dc111fbb9 | 三类媒体关闭补 structuredContent 未执行断言。                                                                                                                                                                                                                                                                                                | 测试 M1/M2，视频/音频不遗漏。                                                      |
| 42  | d54ef28bc5044c0eefbe9e9a64c0319cb36d206b | 目录内找不到动态工具时返回结构化 not_executed/automatic_retry:false，不再普通 throw；补当时补丁清单。                                                                                                                                                                                                                                        | 保留 T3/V4；不要把目录缺失误当已派发失败。                                         |
| 43  | c0e3c5be65360016c741825b99c5936fd8028b3c | Runtime 受限 tools/list 加 \_meta.maker_access；宿主将 BLACKLISTED 转明确账号限制，不当作未知工具；调用前列表同样短路。                                                                                                                                                                                                                      | 保留 V4；保留固定目录限制，不放开受限动态工具。                                    |
| 44  | a506b401f27a3ac7f22f26050b998a602242e301 | user-skills pull 下载前逐级 lstat 检查 .installer/.codex/.cursor/.workbuddy 下 skills 根，已有 symlink 停止。                                                                                                                                                                                                                                | 保留 V5；不只看项目目录最后一级。                                                  |
| 45  | 6c4f22352db175c347112aa1130a948cf3bb6ea2 | installUserSkills 和 installUserSkillsForClients 实际写入前再次检查根；受限工具目录提示收敛。                                                                                                                                                                                                                                                | 保留 V5/V4；下载前检查不能替代安装前检查。                                         |
| 46  | 78e795b8dc3b070f6a05d08ef11da9a0caa9ab86 | Manual 明确账号受限可能返回限制提示而非动态目录，快照不保证可调用。                                                                                                                                                                                                                                                                          | 契约 V4/U2。                                                                       |
| 47  | da7f978eec6c370bb48c28dac60a1d3bc0ab833b | 同一受限目录说明同步四语言；在合并的一侧，普通简化 log 会省略。                                                                                                                                                                                                                                                                              | 契约，和 48/49 最终效果重叠；不要误计为另一个 backend 修复。                       |
| 48  | a352bde51f36ffc893c29de86413768d691a7d25 | 另一条历史路径同步受限目录 locale 说明。                                                                                                                                                                                                                                                                                                     | 契约 V4/U2，结合 47/49 看合并最终文件。                                            |
| 49  | 2259e387a0df44963e0f1a8b0b3d1f8fed836998 | 日韩补齐受限目录返回提示。                                                                                                                                                                                                                                                                                                                   | 契约 V4/U2，不只核对中文 manifest。                                                |
| 50  | c58a81ae5e662c1d66fc05baeb3de37afcf4064c | Runtime 0.0.34/插件 2.1.15；五项补丁可复现配方、完整 vendor 哈希、staging/rollback；新增 maker_console/settings 入口，以系统 Node execFile 固定参数、45 秒/输出限额、cindy_plugin 启动；严格 loopback URL，两层校验；启动不明 unknown，打开页面失败仍 executed。                                                                             | 保留 P3/U4/V1–V5；console 手动操作不受 Agent 媒体开关，不能扩大声明。              |
| 51  | 8e9defb33a21d54f949507ff56517b7e7eb5af7c | tar 解包前同时检查路径和条目类型，拒绝 symlink/hardlink/特殊文件；完整补齐 long/marked/protobufjs/ws/Lucide 等法律文本；多语言说明关页不停止服务、不自动提交/安装。                                                                                                                                                                          | 保留 P2/P3/U4；仅检查 ../ 不足。                                                   |

## 0.0.31 历史分支（非当前 HEAD 合入证明）

以下四条于 2026-10-19 从 makecindy/cindy-official-plugins GitHub commit API 取得实际 files.patch；不把它们当成本地 ancestry。查看地址为 https://github.com/makecindy/cindy-official-plugins/commit/<完整hash>。

| hash                                     | 实际修改                                                                                                                                                      | 后续处理                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2407dd5125a4d107fb8f3d3b4ea68e8a03625146 | 0.0.28→0.0.31 整包；主/子入口 cindy_plugin；状态 detail/skip_remote_sync 参数；yaml 许可证。                                                                  | 891868e 的 0.0.32 路径重新落地同类能力；保留 H1/T4，不拿本分支版本证明已上线。                                        |
| 0a0568223449100d0c5086b698cf4f96f1d256d5 | normalizeMakerAuthGuidance 先匹配 PAT+TapTap auth 同时缺失，再匹配单独缺失；引导 maker_login 或设置页重存 PAT。                                               | 已在 891868e 的宿主层保留，T4；顺序错误会留下无效 CLI 指引。                                                          |
| e4e5f63c9fd89e7aef033b4e34682aa2b7790d6f | confirm_character_voice 单次尝试；重连时/待重放队列拒绝未发送请求，派发后断线返回 unknown；说明 ElevenLabs Voice Slot 副作用，禁止自动重放。                  | 0.0.32 后使用通用不重放/三态契约；0.0.37 仍须检查 manager、直接调用、pending queue、MAC retry，不能只保护工具名列表。 |
| aec91ddcaa0e0fd727ad64117a82acb977848343 | manager.acquire 和直接 client.connect 失败用 makerProxyToolNotExecuted 标记；派发后仍 unknown；直接 connect 失败关闭 client，测试两条初始化路径与派发后中断。 | 保留 V6/T3 的阶段区分，不机械复制旧符号；需要新包实际行为测试。                                                       |
| a3d295da1729939b77ca0827b2d94b40aa51ae9f | 远端 confirm_character_voice 的 isError 结果归为 unknown；宿主禁止身份恢复重发该工具，目录同步先核对再操作。2026-10-27 取回并核对实际补丁。                   | 已由通用执行态和不重放契约承接，V1/V6/T2/T3；不是当前分支的发布记录。                                                 |

## 共享文件与合并处理

- 98c362b3e93a0df2f254b41fc685be79308fd040：仓库发布/审查门禁，plugin-contract 对 public Skill 豁免、Manual/minCindyVersion、打包文件做校验。是 P1/P2 的共享约束，不是 Runtime 补丁。
- 2559942575680226c2499de9976c8c394ba61413：双语 README/SECURITY 和其他插件许可证；Maker 提及属于仓库说明，不新增 Maker 行为。
- 379831f9f614f97b366007d8003c1517c38619cb：重塑 README 与贡献/审查说明；Maker vendor 升级说明是入口，不替代配方和实际补丁。
- 20b0b064 有实际 combined diff，已经单列。3c26b0b23e50175bfe60e4f11376cfcb478b7de7 合并 locale 两侧；47–49 均保留来源。其余本次范围合并主要继承父树，不重复算新补丁；下一次仍检查合并独有差异，不能永久排除 merge。

## 0.0.37 实现增量（原工作树记录）

位置：.github/maker-runtime/0.0.37.json、专项测试、node/child-process-adapter.cjs；原实现提交 435abb3f，最终经 cc23d4f9 合入。以下条目描述实现，不表示新版本已通过实机验收。

1. V1 旧白名单之外修新 getRemoteProxyExecutionState 聚合器：executed 保留，unknown 优先，executed/not_executed 冲突为 unknown。
2. V2–V5 继续保留黑名单结构化结果、按请求账号检查、列表受限原因、三处用户 Skill 根检查；V5 重定位打包符号，不能照抄旧行号。
3. V6 MAC 失效只允许明确 not_executed 的请求重试一次，其他状态/缺省及派发后断线禁止重放。
4. V7 Console 身份加入 distribution 与入口路径，拒绝复用同版本 standalone/另一插件入口的服务。
5. V8 仅 Cindy 隐藏模型设置按钮、禁自定义配置写 API、识图 Server-only，不可用明确 503，无 ChatGPT 回退；独立 Maker 行为保留。
6. H2 facade 补 exitCode/signalCode 初始 null、exit/close 更新和启动失败 -1，匹配 HiddenStdioClientTransport 的 alive/kill 判断；测试实际提取的 transport + Host handle。
7. 官方新 UI Editor/编码资源与依赖按来源检查、补许可证。以上不代表正式/Beta Cindy 实机验收已完成。

## 2026-10-27 补核的历史增量

本地脚本检查 69 个普通提交、29 个合并；combined diff 仍仅 20b0b064 有独有修改。
下列新增候选已按实际 diff 核对，未把 stash 快照或被 squash 的提交当作新发布。

| 完整 hash                                | 核对结果 / 验收                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 4c70f9858b6cc117242f8ac9b3435978423f2846 | PAT 与登录恢复提示适配插件入口，已由 891868e 承接；T4。                                                            |
| 8e3743f3b4c7a4db24fe339737bce2701e62ad42 | status 的 Python/LSP/升级建议改插件指引；T4。                                                                      |
| 11178b2e9765b65b5338c74de8185ef97e93a895 | 状态建议归一化固定工具名，防绕过 maker_build；T4。                                                                 |
| 5d5080bd0e5dbc440c4ce6dd89b49c5596e2c6bd | 静态目录只是快照，不能保证账号实际可调用；T4/V4。                                                                  |
| 44c02fa26e9e20345d1e50076a38f9eed1d7a12b | stash 的未跟踪双语维护文档快照，无产品代码；不作为发布或新保护。                                                   |
| 435abb3fbd0abffa2ab03104ae44a5f306ffab2b | 0.0.37 八项配方、child facade 状态字段、本地 validate 入口及终态收集；V1–V8/H2/H6/L1。                             |
| c2d4e119fdf959f7fcbb86fc4ee51d2591c2b01d | validate stdout 单独增至 8 MiB，响应超过 64 KiB 返回摘要及原始证据；L1。                                           |
| 00aa15e4adc645db6e72c7a37a5cd66a3f52ff87 | 派发前检查证据 Git 忽略与索引，拒绝模式冲突，清理结构化路径；L1。                                                  |
| 0ca5cd3f2f06a1be90da65dbc8a33f0a484e469d | 四语言声明验证前提、参数适用模式、Skill filter 修复副作用；L1/U2。                                                 |
| 9481d24b445c2425122d228ed5ff1cb0743bc5d6 | validate 的带值参数改 --flag=value，全部选项仍在 childSpawn 16 项内；L1/H1。                                       |
| 757f486e3431cf29804043ece3fcf89b31c8d501 | 保留各轮证据与 attempt IDs，拒绝链接/注入，产物路径仅指向已验证证据；L1。                                          |
| cc23d4f9100eb5a88b73457527c0066c5c14e51a | #187 squash 合入；与 757f486e 的 node/main.js/0.0.37 配方无差异，承接上述保护。                                    |
| 0f88218715a4086b8032a20d1c9b7a4810b5ccb7 | 预览开关默认开，设置请求及正文均限 2 秒；失败仍保留成功构建和链接，不重建；U1/M3。                                 |
| 64dbb6c7425fbbffcb6589ef9853fadbfd4dc891 | 云端脏工作区恢复提示要求先取得云端构建授权，再合并分叉，不能直接重试；T6/T3。0.0.39 的自动修复与此契约须一并决定。 |

## 0.0.39 分支适配（尚未发布）

- 从本机 npm 缓存离线取得正式 @taptap/maker@0.0.39，完整性与独立配方一致；本地源码的 dev bundle 不作发布物。
- V1–V8 保留，V5 按新打包别名重定位；V8 保留 Cindy Server-only/503，上游已自行移除无服务时的 ChatGPT 回退，不再叠加旧回退替换。
- main.js 原 60 秒请求窗口改为 120 秒；保留 30 秒短请求、既有进度续期和 15 分钟总时限。
- T6：上游新增分叉自动合并和云端未提交改动自动入库；用户已确认以 0.0.39 功能为准。旧插件声明及回归测试已同步新版；本轮真实游戏副本 7 项 Git 集成通过，详见兼容矩阵，云端未知态 G1 已由 V9 通用补丁修复。
- 官方包未新增依赖名称或 HTTP(S) 字面地址；新增云端 Git 路径使用既有 Maker API/PAT。嵌入 UI Editor 的 preview.js/layout.js 两文件变化与本地源码一致，其余编码资源对照未变化。

### 0.0.39 最终适配（2026-10-27，PR #232）

- 新增 V9-cloud-git-outcome 可逆补丁组：云端提交超时复查仍不能确认时，保留 unknown、禁止自动重试提示；兼容新旧云端脏工作区错误文本，失败阶段与成功说明按实际结果输出。
- T6/T4 同步上游自动合并/云端提交的四语言声明、Manual、插件工具名和登录引导；移除旧版要求额外云端构建的恢复步骤，未新增 Git 实现。
- 七套 142/142 通过；最终 bundle 的真实游戏副本 Git 7/7 通过，包含 Cindy 源码保存点共存。Forge 安装插件 2.1.25 成功，在 macOS Cindy 0.1.118 调用状态、目录和控制台成功，右侧 WebView 能读取真实游戏 Git 历史。
- 精确证据范围、安装包哈希和未覆盖场景见兼容矩阵最终验证；未做生产云端写入、付费媒体、Windows 新包或游戏截图验收，不视为 main 合入或发布证明。

## 2026-10-27 当前分支提交补核

本地可达历史为 72 个普通提交、31 个合并；combined diff 仍仅 20b0b064 有独有修改。以下是 PR 分支记录，不是 main 合入或市场发布证明。

| 完整 hash                                | 核对结果 / 验收                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| f4ccda77d11179bec0706fed56ed91ee2b260c05 | 官方 Runtime 0.0.39、八组补丁配方及 120 秒窗口；V1–V8/H6/P2/P3。T6 行为冲突保留失败测试；本次复核另确认云端修复丢失未知执行态，见兼容矩阵 G1。 |
| f2f25a9b4c87772daacaee54ee8a62e037ab0bf9 | 仅把插件版本及对应文档/断言改为 2.1.28，无新 Runtime 行为；P1。后由 f501a1c 撤回版本选择。                                                     |
| f501a1c45729301bf5fcdaa7ed847873b15c4ad3 | 核实市场及 main 为 2.1.24 后，按用户要求恢复插件 2.1.25；P1。Runtime 仍为 0.0.39，不代表实机安装通过。                                         |

## 下次怎样避免漏项

2026-10-27 自动审核补充：PR #232 在 4904a1c 之后新增 V10-canvas-safe-recovery，修复上游 015 流程对未知付费请求解除保护及等待期无法停止的问题；不修改用户的 Maker 源码仓库。配方可逆，七套 149/149 通过，新包原位更新并加载真实画布通过，证据范围及最终哈希见兼容矩阵 V10 记录。后续升级须保留该保护直至上游等价修复。

运行脚本后不能直接把新 hash 粘进表里就算通过：必须读 diff、分清父树继承/真实修复/已废弃行为、映射到兼容矩阵并补测试证据。共享路径用 -G 搜索只是候选，需要额外查看发布/权限边界变化。测试/文档路径也可能新增，所以范围本身需要维护。历史归档中的旧测试通过与旧实机记录均不能替代本次目标版本结果。

2026-10-27 Codex 补核：V9 捕获云端提交后的 merge/HEAD 异常并保留 executed；H5 内部列表超时改为 115 秒；T4 统一新版 Git 的插件/通用 Git 指引。完整 152/152 与最终游戏副本 7/7 通过，最新包已更新安装，哈希见兼容矩阵。
