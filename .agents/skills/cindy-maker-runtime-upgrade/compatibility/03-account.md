# 2C：账号、目录和身份恢复

| ID  | 来源 / 定位                                                                             | 逐项检查与通过条件                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 41d53ce、9029599；account.cjs/settings.js/publicAccountResult                           | 保存走 Maker pat set --pat-stdin --json，Maker 校验/落盘。PAT 不进 argv/日志/模型结果/Cindy KV 或 Secret，输入用后清空；保留环境变量、新旧路径的存在/掩码兼容。网络失败 unknown，不假报退出；没有等价接口不删兼容判断           |
| A2  | 3b8f23d、9029599、6e4affe、8475e33；isMissingLogin/projectSyncFailure/settingsErrorCode | 覆盖 missing/expired/JWT/401/403 与新包错误样例；Git 的 GIT_REQUIRED/GIT_NOT_FOUND 都映射，目录/Python/网络分清并脱敏，不把所有失败变成登录失效                                                                                 |
| A3  | ddcc0b7、675d2c3→e58a241→d5132e4→9cbebaa；ensureTargetAvailable                         | 名称清洗加 project.id 的 SHA-256 前16位，跨批次稳定，同名不同 ID 不冲突，处理 Windows 保留名。仅空目录或 project_id+环境匹配 origin 的同项目可重用；缺 .git/config/origin、错项目、symlink/非目录元数据拒绝，origin 比较去 auth |
| A4  | 41d53ce、675d2c3、9029599；settingsRequests/withMutation                                | reqId 重发不重复登录/克隆；账号变更互斥，最多五个去重项目，逐项错误不终止整批；已有 app 与新建参数互斥；--skip-mcp-install 保留，不修改外部 Agent 注册                                                                          |
| T1  | 41d53ce、df08857、7280910；requireLocalContext/requireWritableContext                   | 宿主 session_context 的可信本地 workdir 覆盖 target_dir，远程/只读拦截写操作；query_video_task 和 get_debug_feedbacks 也会落盘，不能按名称当只读。设置页选目录是独立授权入口，不硬套 Agent workdir                              |
| T2  | 9029599、891868e、7465ceb；initializeMakerIdentity                                      | 同工作区合并初始化，仅明确缺身份且旧契约允许的缺省/not_executed 才一次二维码+一次原调用；executed/unknown 不恢复。二维码失败、第二次失败/unknown 不再重试；缺构建/方向/游戏类型不能自动补构建                                   |

本组验收：六项正常和拒绝场景均有结果；目录 fixture 用临时目录/占位项目。
T2 的缺省例外只属于既有身份恢复，不能扩到 MAC/通用网络重试。
真实 PAT 切换/批量克隆按授权交第四步，不读取/展示整份凭证文件，不为验证而换掉用户账号。
完成后读取 [2D](04-tools.md)。
