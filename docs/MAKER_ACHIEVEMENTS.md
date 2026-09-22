# Maker 成就管理

面向本地 Maker MCP 使用者的成就管理说明。本文覆盖前置条件、操作边界、部分成功恢复和验收范围。
具体参数以 MCP 客户端展示的 `achievement` schema 为准。

## 适用范围

- 已绑定 Maker 项目的成就管理工具：查询、创建/更新普通成就、测试账号、检查/发布、白金成就。
- 不包含玩家进度上报 API，也不包含具体游戏玩法实现。
- 管理工具可用，不等于某个游戏已经完成运行时接入。运行时解锁/进度代码必须使用该项目实际 Runtime SDK 文档，并单独做真机验证。找不到 Runtime 契约时可以继续管理，但必须明确“游戏运行时接入未验收”；禁止编造 Lua API，也禁止借用小游戏/H5 成就 SDK。

## 前置条件

1. 先读 `maker://status`，资源不可用时调用 `maker_status_lite`。
2. 解析唯一绑定项目，之后固定同一个 `target_dir`。
3. 确认当前会话已暴露 `achievement`。版本未接入时不要尝试隐藏工具调用。
4. 不要把本地缺少 `taptap_publish` 或 status 的 `missing_taptap_identity` 当成远端必然缺失。
   成就管理先 `sync_achievements`；不要套用广告/二维码的本地身份前置门。
5. 用户授权当前管理目标后再调用 `op="sync_achievements"`。只查询且没有写入授权时，先说明
   sync 会写远端 workspace lock，不要宣称只读，也不要直接 sync。

身份来自远端 workspace `.project/project.json` 的 `taptap_publish` 以及服务端环境。不要传入
`app_id`、`developer_id`、`client_id` 或 managementId。

`sync_achievements` 会写远端 workspace lock（`.project/achievements.lock.json`），不是纯只读操作。
`get_achievement` 在映射缺失或无效时也可能刷新该远端 lock。统一称远端 workspace lock，
不要根据 `lock_sync.path` 在用户电脑读写、拼接任意 URL 或发起下载。

## 推荐流程

```text
用户请求管理或接入成就
  -> 读取 Maker 状态，解析唯一项目，之后固定 target_dir
  -> 确认工具已暴露
  -> 只查询且无写入授权
       | 先说明 sync 会写远端 workspace lock
       | 等待授权后再 sync；不得宣称只读
  -> 用户授权当前管理目标后调用 achievement(sync_achievements)
       | 无应用配置/身份（以 sync 返回为准，不以本地缺项阻断）
       |   -> 展示具体缺项
       |   -> 需要构建/上传时说明影响并取得授权
       |   -> 复用既有构建或二维码初始化流程
       |   -> 有开发者选择时展示真实候选并等待用户选择
       |   -> 完成后重新 sync；不自动循环构建
       | 未开通服务
       |   -> 展示返回的开发者中心开通指引，等待用户完成再重试
       |   -> 这是业务失败，不是 MCP 连接故障，不上报 issue
       | 认证/服务端环境错误
       |   -> 按实际错误恢复；缺服务端 clientId 不向用户索要
       | 同步失败
       |   -> 呈现业务错误；不进入后续定义修改
  -> 获取现有 ID 和状态；需要详情时 get_achievement
  -> 按用户目标创建/更新普通成就，使用开发者 achievement_id
  -> 解析 success / remote_applied / lock_sync
       | 平台成功、lock 失败 -> 只恢复 sync，不重放原写操作
       | 请求中断 -> 结果未知，核对状态后由用户决定下一步
  -> 测试账户：用户提供真实 user_ids 后再 add_achievement_test_users
  -> 游戏接入：查真实 SDK -> 写进度逻辑 -> 按授权测试
  -> 发布：check_publish_achievements -> 展示应用范围/结果 -> 用户明确授权
       -> publish_achievements -> 核对最终审核/发布状态
  -> 白金（仅用户明确要求时）
       -> 上游检查普通成就数量/已发布状态
       -> create_platinum_achievement
       -> check_publish_platinum_achievement
       -> 用户明确授权后再 publish_platinum_achievement
```

首次 sync 返回的 `app_id` / `developer_id` 若与用户明确指定的目标或已知本地发布身份冲突，停止后续写操作并解释不一致。不能以“远端权威”为由静默管理用户不期望的应用。本地未提交的应用身份修改不通过参数转发，也不触发隐式 push。

## 操作注意

| 操作组 | op | 注意 |
| --- | --- | --- |
| 同步/详情 | `sync_achievements`、`get_achievement` | sync 写远端 lock；get 也可能因缺失映射触发远端 lock 同步 |
| 普通定义 | `create_achievement`、`update_achievement`、`set_achievement_order` | 使用 `achievement_id`，按请求修改，不自动生成重复 ID |
| 普通删除 | `delete_achievement` | 确认具体目标及删除影响；失败重试不是恢复策略 |
| 普通发布 | `check_publish_achievements`、`publish_achievements` | 作用于整个应用；检查不等于发布授权 |
| 白金 | `get_platinum_achievement`、`create_platinum_achievement`、`update_platinum_achievement`、`delete_platinum_achievement`、`cancel_platinum_achievement_audit`、`check_publish_platinum_achievement`、`publish_platinum_achievement` | 仅用户明确要求时进入；应用级单例；数量/状态门槛交给上游；取消审核不等于删除 |
| 测试用户 | `add_achievement_test_users`、`list_achievement_test_users` | 真实用户 ID 用十进制字符串；列表需要分页参数 |
| 玩家数据 | `reset_achievement`、`reset_achievement_test_user` | 前者清普通成就玩家数据，后者清一个测试账号；两者不是本地文件清理 |

发布、删除、取消审核、玩家数据重置须明确授权。已有清晰且覆盖同一目标的用户指令可作为授权，不强制每次重复确认；普通创建/更新也不得超出用户请求。

## 图标

`image_url` 只接受 HTTP(S) URL。不要把本地路径或 data URL 直接转发。已通过 Maker 资源生成得到可信远端 URL，且 registry key 或 `localPath` 精确匹配时，复用该 URL，不要重新上传同一个文件。不要按文件名模糊匹配。本地文件没有现有可用远端映射时，说明该输入还不能直接使用；本版本不支持本地图标直传。

## 结果解释

- `success=false`：按 MCP 业务失败处理。展示返回错误和开通指引，等待用户；不要当成 MCP 连接故障去上报。上游业务错误并不保证没有副作用，不要自动推断“未执行”。
- 完整成功：保持原结果。没有 `lock_sync` 的查询或测试用户操作是合法返回。
- `success=true` 且 `remote_applied=true`、`lock_sync.synced=false`：平台操作成功，远端 lock 未同步。只执行 `sync_achievements` 恢复，不要重放原写操作。
- 请求中断：执行状态未知。先核对远端状态，再由用户决定下一步；本地不会自动重试。
- `lock_sync.path` 只展示为远端相对路径。

请求成功不表示已经发布。白金“至少 10 个”是上游对特定审核状态的检查，不在本地重复实现审核状态机。

## 验收边界

- 已交付：MCP 管理工具和 Agent 引导可用，具备真实平台管理验证后才能宣称生产可用。
- 要宣称某个游戏已接入成就：还必须完成该项目实际 SDK 的进度/解锁代码和真机验证。
- 没有授权测试项目时，实现和 mock 测试可以完成，但必须标注“生产可用性未验收”，不能自行发布。
