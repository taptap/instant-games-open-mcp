# 2D：工具、Git 和媒体策略

| ID  | 来源 / 定位                                                                                              | 逐项检查与通过条件                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3  | 9029599、891868e、d0b428c、7465ceb、431213e；makerExecutionDetails/sanitizeMakerFailure/sendToolResult   | structuredContent/remote_structured_content、JSON text、remote_result/error_details 和固定文本三态穿透；catch、初始化、重试、列表拦截均查最终结果。脱敏不丢状态；unknown 先核对远端/产物/用量。仅完整 INSUFFICIENT_BALANCE 信号判余额不足，Art 替代需用户确认                                                               |
| T4  | 2407dd5、0a05682、891868e、bdc6bdd、4d4a992；normalizeMakerPluginGuidance/status/remoteProxyToolSnapshot | 保留 detail/skip_remote_sync，状态仍可能 /tracking；PAT+auth 同缺先匹配，Python/LSP 未就绪/已就绪/建议升级分清。固定别名过滤，不从动态入口绕 maker_build。深比较新旧工具名/描述/schema，检查新增媒体工具及不可逆工具。文本与结构化 next_action 都改为实际可用的 Cindy 入口，不建议独立 npm/CLI 覆盖托管包                   |
| T5  | 9aa6527、a887ccc；maker_ads_guide                                                                        | 真实 Runtime 只读 resources/read 固定 maker://ads-integration-guide 成功，指南 API 内容正确；Maker 广告召回不扩大到泛 TapTap/小游戏/H5 广告                                                                                                                                                                                 |
| T6  | 577da80→64dbb6c→4904a1c、4d4a992；pushMakerProject/git runner                                            | 以已确认的 0.0.39 功能为基线：main 落后快进，分叉保留本地提交后合并，云端脏改动自动提交再合并重推；冲突取消合并保留提交，非 main/同步不明/覆盖未提交文件停止。推送失败不 build，推送后 build 失败不说未提交。通用 Git/Cindy 保存点共存，无额外 Git 实现；新包进一步变化需按差异更新契约                                     |
| M1  | 3e0dffb、a12cdc5；callMakerTool                                                                          | 三类默认开，目录仍显示。图：generate_image/batch_generate_images/edit_image；视频仅 create_video_task，query_video_task 不拦；音频：text_to_music/text_to_sound_effect/batch_sound_effects/text_to_dialogue/audition_voices_for_character/confirm_character_voice。新工具按实际副作用分类，不能默认已覆盖 3D 或全部素材能力 |
| M2  | 6602807、431213e、a301b67、a12cdc5；设置读取和恢复门禁                                                   | 关闭/读取失败/损坏 fail-closed，实际派发为零，最终 structuredContent 为 not_executed；身份恢复重试再次读开关。三类分别测，不转其他插件、不取消既有任务                                                                                                                                                                      |
| M3  | 3e0dffb、0f88218；settings.js                                                                            | 加载期间禁用；读改写只更新目标键并保留其他偏好，新类别默认开；互斥保存，失败恢复显示并要求核对，不能假报保存。设置读取请求与正文均有边界，不改成跨进程共享媒体策略                                                                                                                                                          |

本组验收：七项逐行记录，工具快照真正对比过；既有断言与新版功能冲突时按已确认契约
更新测试，不能只删除失败断言。旧“分叉必停”和“额外云端构建恢复”已被替代。
Git 真行为及保存点在第三步验证，界面设置在第四步验证。完成后读取 [2E](05-ui-validation.md)。

T3 的本地等待超时路径还须按[等待与传输专题](../sources/wait-and-transport.md)核对：
保留宿主 `TIMEOUT`；已派发长任务未拿到回执时最终结果为 `unknown`、
`automatic_retry:false`，不落回普通异常后丢状态，不触发身份恢复重送。
发送前拒绝仍为 `not_executed`，短查询沿用原语义；PR #159 仅是该保护的参考，
不能据其标题或存在就断言已合入，也不能把它当作延长等待的实现。
