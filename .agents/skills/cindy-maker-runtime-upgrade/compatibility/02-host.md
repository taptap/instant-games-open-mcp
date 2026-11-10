# 2B：Host、进程和请求预算

本组 ID 沿用旧 Skill 的矩阵；维护文档 H 编号排列曾不同，以行为/文件为准。

| ID  | 来源 / 定位                                                                      | 逐项检查与通过条件                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | 41d53ce、891868e；node/maker-mcp.cjs、maker-child.cjs、child-process-adapter.cjs | 主/子入口注入 cindy_plugin，仅改道自身 process.execPath+固定 makerEntry；proxy JSON 用既有参数。非固定脚本拒绝，新 spawn/execFile/transport 不绕 adapter，\_\_maker-proxy 仍 spawnEntry；不扩成任意命令/env          |
| H2  | 41d53ce、435abb3；createDeferredChild/HiddenStdioClientTransport                 | Host 异步句柄返回前 stdin/PAT 字节不丢；流/事件/abort/kill 语义保持。exitCode/signalCode 初始 null，exit/close 更新，启动失败合理结束；活子进程 close 真正 kill，重复 close 不重杀                                   |
| H3  | 14cfc58；maker-mcp.cjs stdio                                                     | 按属性描述符替换或原地代理；钉死 stdin/stdout、已缓存 initialize 组合仍能初始化；先抽干预缓存，保存原 write/push 防递归。Windows 不靠 OS 名称猜属性能力                                                              |
| H4  | df08857→5305627；logs watch                                                      | 使用系统 node，由 Maker 管 PID/生命周期；缺 Node 单次错误后降级，不回退 Cindy.exe/spawnEntry。不恢复已删除 watcher controller/touch/idle 回收；主 proxy 路径不受影响。区分远端日志 watcher 与本地 preview supervisor |
| H5  | 41d53ce、52f15ee、4d4a992；mcp-root-router.cjs                                   | 仅活动 tools/list 提供可信绝对 workdir 的 roots/list，拒绝其它反向 RPC；多工作区串行不串线。超时结束活动及队列、拒陈旧回包并重建；Windows URI 用 pathToFileURL。内部列表默认 115s，早于外层 120s 留回收余量          |
| H6  | 41d53ce、435abb3；account.runMaker/isMakerCliOutputComplete                      | login/pat/apps/doctor/init/preview 等逐命令核对终态；进度/半截 JSON 不当完成，最终 JSON 后回收 ParentPort 保活进程；非零退出仍交有效失败证据。保留 14min CLI 限时、输出上限与现有进度机制                            |
| H7  | f4ccda7、4d4a992；main.js nodeRequest/account/roots budget                       | 原 60s 长请求/工具发现统一 120s，短请求仍 30s；进度 token 独立、maxTotalMs=900000。核对远端工具、静默窗口、总时限和内部 115s 的层次。不新增定时假心跳；无进度仍可能 120s 超时，不能承诺无限等待                      |

“生成超过120秒”按 H7 核对：120秒是长请求的静默窗口，不是有进度时的总时限。
除参数断言外，验证真实bundle的远端进度转发保留调用方token、启用续期，
未知超时不盲目重发；区分参数/进度回归与真实长生成，不把前者冒称后者，
不为验证扣费或引入已被否定的定时假心跳。

本组验收：逐项标出新上游增加的启动路径及覆盖情况，完成现有 deferred/stdio/roots
真实 Runtime 测试与定向回归。模拟时钟/钉死 stdio 不等于实际 Windows Cindy；
CLI 真进程在第三步，Electron 子进程生命周期在第四步。无 Node 的故障只在隔离进程模拟，
不卸载用户 Node。完成后读取 [2C](03-account.md)。
