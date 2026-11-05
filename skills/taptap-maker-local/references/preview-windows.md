# Windows Preview Diagnostics

Read only when a Windows local preview launch fails.

### Windows Node 与后台启动诊断

Maker 预览优先使用当前宿主进程的 `process.execPath`；宿主 Node 不可用时才回退系统 Node。
不要因为看到 system Node，或因为它不是 WorkBuddy managed Node，就直接判定环境错误、要求用户
切换 Node、修改 PATH 或重装依赖。只有在 Node 缺失、版本不满足，或用实际配置的 Node 直接执行
Maker bundle 已失败时，才把 Node 环境列为主要怀疑对象。

Windows 预览失败时，先收集并区分以下证据，再决定修复方向：

1. Node 来源、`process.execPath`、版本，以及直接执行 bundle 的结果。
2. Runtime 可执行文件、资源准备结果、supervisor 状态和 `supervisor_log_path`。
3. Runtime 原始日志、control channel 发布/超时结果，以及 Windows 后台启动器的返回信息。

仅在显式 legacy 模式下，WMI/CIM 返回已受理或 PID 只证明请求被接受，不证明 Runtime 已执行。
正常进程内模式不要求生成独立 supervisor.log，优先读取所属 Node 的 stderr、status 和本轮 logs。
legacy 模式若 supervisor 日志为空且 control channel 超时，先归类为 Windows 后台启动链路
的待确认问题；不要直接改 PATH、切换 Node、修改游戏代码，或把问题归因于 Runtime 文件缺失。
Issue/反馈中附上上述脱敏证据，让后续处理基于实际环境，而不是把某一次 Windows 兼容性问题写死
成所有项目的结论。
