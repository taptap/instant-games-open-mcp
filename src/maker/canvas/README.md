# 序列帧动画：AI 使用说明

仅在用户主动询问或要求使用序列帧动画制作功能时，按下面的步骤打开现有界面；不主动推荐或发起生成。

## 打开并添加模板

1. 使用当前客户端已配置的 Maker CLI 打开控制台：

   ```sh
   taptap-maker console open --target-dir "<当前游戏的绝对路径>" --json
   ```

   命令沿用当前 Maker 启动入口，不临时安装其他版本。若不知道游戏目录，省略 `--target-dir`，让用户在控制台选择项目，不猜测目录。

2. 在控制台切换到「序列帧动画」栏目。
3. 点击「添加模板」，选择预设「序列帧动画」并添加，即可创建图片 → 视频 → 抽帧 → 序列帧动画的工作流。

有浏览器操作能力时，AI 可完成以上点击；否则打开控制台并告知用户点击位置，不宣称已添加模板。

到这里即可交给用户体验。打开界面、添加模板不需要构建或提交游戏；生成图片、视频会消耗积分，未经用户明确要求不要点击生成或启动队列。

视频不设本地固定冷却时间，能否提交由 Maker 服务判断。卡片「停止等待」或分组队列「停止」
会结束本地视频等待、暂停后续步骤，不取消远端任务，也不会自动重新付费生成。请求长时间未返回
时同样会释放本地等待。原 taskId 和结果保留在日志栏展开后的「视频历史」中，提交后 6 小时内
可查询取回；该期限仅为本地策略。主动重新生成可能重复扣费，请先核实原任务。

## Canvas CLI（首版）

AI 可以通过当前安装的 Maker CLI 操作已打开的画布，无需浏览器自动点击，不新增 MCP tool。
所有命令绑定明确的项目绝对路径；不要使用其它项目、默认 cwd 或直接修改 .maker 内的 JSON。

链路：AI → canvas CLI → 本机控制台转发 → 画布页面现有操作 → Store 保存。
编辑、生成、抽帧需要页面保持打开；列表和已保存快照不需要页面。后台浏览器被系统暂停时，
命令可能无法及时执行；回到画布页后重新查询，不自动重发生成。

### 使用顺序

1. 查询 capabilities、list、templates、pages。pages 返回页面 ID、当前画布 ID、revision 和打开页面的 URL。
2. 用 inspect 读取实时卡片、连线、队列和阻塞原因。多个页面时明确选 page-id，不猜测用户所在页面。
3. 提交编辑时带上该快照的 revision；参数建议写入 UTF-8 JSON 文件，避免 Windows 命令行转义问题。
4. 命令立即返回操作 id，再用 wait 等待或 status 查询。wait 默认等 30 秒，最多 60 秒；超时返回当前状态，
   不取消或重提任务。succeeded 表示本次命令完成；query 成功不代表视频已完成，要看返回的卡片状态。

   taptap-maker canvas capabilities
   taptap-maker canvas pages --target-dir "<项目绝对路径>"
   taptap-maker canvas templates --target-dir "<项目绝对路径>"
   taptap-maker canvas inspect --target-dir "<项目绝对路径>" --page-id <页面ID> --canvas-id <画布ID>
   taptap-maker canvas wait --target-dir "<项目绝对路径>" --operation-id <操作ID>
   taptap-maker canvas update-nodes --target-dir "<项目绝对路径>" --page-id <页面ID> --canvas-id <画布ID> --revision <版本> --input-file "<参数JSON路径>"

离线于页面的只读查询：inspect --saved --canvas-id <画布ID>，返回 source=saved，不包含实时任务状态。
首次没有页面时，打开 pages 返回的 URL，或按上面的控制台步骤进入序列帧动画。

### 支持的操作

| 命令                             | input JSON                                                 | 说明                                                                        |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| create / rename                  | {"title":"新画布"}                                         | 新建并切换 / 重命名当前画布                                                 |
| open                             | {"id":"目标画布ID"}                                        | 从当前画布安全切换                                                          |
| add-template                     | {"id":"模板ID"}                                            | 添加内置或用户模板的独立副本，不修改模板库                                  |
| add-node                         | {"type":"image"}                                           | 新建 image、video、note；sequence/animation 另传 sourceId，复用现有派生流程 |
| import                           | {"title":"角色参考"}                                       | 另传 --file 本地绝对路径，导入为新卡片，不覆盖已有卡片                      |
| set-references                   | {"id":"目标ID","sourceIds":["图片ID"],"includeSelf":false} | 有序替换全部图片参考；[] 清空，includeSelf 仅图片卡可用                     |
| export                           | {"id":"结果ID","format":"atlas","loop":true}               | 导出已有结果；另传 --output-dir 已存在的绝对目录可直接保存                  |
| update-nodes                     | {"nodes":[{"id":"卡片ID","prompt":"完整猫咪，站立"}]}      | 批量校验后修改，不自动生成                                                  |
| delete-nodes / duplicate / group | {"ids":["卡片ID"]}                                         | 删除 / 复制 / 分组；删除分组本身不删除成员                                  |
| connect                          | {"from":"图片ID","to":"视频输入卡ID"}                      | 已保存图片连接到尚未生成的视频输入卡                                        |
| disconnect                       | {"edgeId":"连线ID"}                                        | 只移除图片参考线，不拆断序列帧/动画来源                                     |
| run                              | {"id":"卡片或分组ID"}                                      | 单卡执行或运行分组剩余步骤；已完成模板卡先修改参数                          |
| stop                             | {"id":"视频卡或分组ID"}                                    | 停止本地视频等待或后续队列，不取消远端任务                                  |
| query                            | {"id":"视频卡ID"}                                          | 查询原视频任务，不发起新生成；历史面板仍由人工操作                          |

update-nodes 支持 title、便签 text、单卡位置 x/y、prompt、parameters、sequenceSettings。
generation 的任务标识、结果路径、来源快照不允许写入。空图片和视频卡使用生成草稿保存输入；
已有素材保留，模板修改只标记待处理，不覆盖下游结果。

图片 parameters：model=auto/gpt/nanobanana，resolution=1K/2K，aspectRatio=1:1/16:9/9:16/4:3/3:4。
视频 parameters：model=2.0/2.5，resolution=720p/480p，duration=4～8，ratio=adaptive/16:9/9:16/1:1，
mode=first_frame/first_last_frame/multi_modal_reference。Seedance 2.5 的首帧/首尾帧模式必须使用
ratio=adaptive。参考图数量和来源仍按原界面校验。

抽帧开放 start/end（秒）、fps（1～30）、width/height（1～2048）、fit（contain/cover/stretch）、
pixel、cutout、cutoutMode（connected/chroma）、backgroundColor（#RRGGBB）、tolerance（0～255）。
最多 120 帧，还受原处理器的像素及图集容量约束。run 复用模板抽帧流程，自动去重阶段保留全部帧，
不替用户删帧。画笔、蒙版、逐帧修图、人工去重确认和模板库保存/替换暂不开放 CLI，仍可在界面使用。

### 已有素材到游戏资源

1. import --file "<本地绝对路径>"：PNG/JPEG/WebP 图片最多20 MiB，MP4/MOV/WebM 视频最多100 MiB。
   返回新增卡片 selectedIds。CLI 读取文件，控制台复用受控导入，页面解码成功后才添加卡片。
   上传成功但后续操作被拒绝时，素材可能已在项目内，但不会添加到其它画布；不要直接修改素材路径。
2. 图片用途：set-references 指定目标卡和有序图片ID；默认不引用目标自身。
   图片 sourceIds=[] 且 includeSelf=false 为纯文本生成；视频清空后必须补参考图才能生成。
   引用选择随画布保存，替换输入保留旧生成结果、只标记待处理，不扣费、不自动生成。
   旧版固定 templateFlow 的视频来源不允许通过 CLI 更换，需从添加模板创建新版副本；不会半途改写旧流程。
3. 视频用途：add-node 的 input 传 {"type":"sequence","sourceId":"视频卡ID"}，再修改抽帧参数并 run。
   已保存序列帧可用 {"type":"animation","sourceId":"序列帧ID"} 创建动画，不自动打开编辑器。
4. export 的 format：图片 png/jpg，视频 video（原字节），序列帧或动画 atlas/frames（Maker ZIP）。
   两种ZIP均复用界面导出格式与命名，导出不会触发生成或修改游戏代码。
   --output-dir 由 CLI 在本机解析，控制台不会接收任意输出路径。同名文件增加序号，绝不覆盖已有文件。

   taptap-maker canvas import --target-dir "<项目>" --page-id <页面> --canvas-id <画布> --revision <版本> --file "<图片或视频>"
   taptap-maker canvas export --target-dir "<项目>" --page-id <页面> --canvas-id <画布> --revision <版本> --input-file "<导出参数JSON>" --output-dir "<目录>"
   taptap-maker canvas download --target-dir "<项目>" --operation-id <导出操作ID> --output-dir "<目录>"

带 --output-dir 的 export 最多等待60秒；尚未完成时保留原操作ID，用 status/wait 查询，再 download。
不带 --output-dir 则与其它命令一样立即返回操作ID。下载成功返回 outputPath；只有该字段才证明已写到本地。
导出临时字节按操作隔离、总量最多128 MiB、10分钟过期；成功下载后释放，写入失败可再次 download。
缓存过期或控制台重启后重新 export 即可，不需要重新生成。import 的 request-id 已存在时拒绝再次上传，
请查询原操作，避免为同一导入重复创建素材。

### 更小的状态查询

capabilities 返回参数类型、选项、范围和重要组合限制。inspect 的 input 可传 {"id":"卡片或分组ID"}，
仅返回目标、组内卡片和直接上游；队列信息仍是关联分组整体状态，不把局部列表误当完整画布。
inspect --saved --canvas-id <画布ID> --id <卡片或分组ID> 可筛选已保存快照。
guidance 只是当前快照的操作提示，不保证可执行；source=saved 不代表正在运行的页面状态。

### 角色 3D 模型模板

在“添加模板”选择“角色模型 · 多视图确认”。流程为：

    角色图片（生成或导入并确认外观）
      → 多视图（展示上游返回的全部视图，不写死三张）
      → 人工确认全部视图 → 3D 模型（项目本地模型包）

角色图复用图片卡；双足角色建议正面完整全身、A 姿势、四肢分离、无遮挡、纯色背景。
四足动物和道具应按实际对象改角色提示词，不机械套用 A 姿势。画布只把确认的图片传给生模服务，
不额外拼接隐藏提示词。多视图卡默认 balanced，可改 fast（草稿）或 high_quality；
质量应在生成多视图前选好，修改后旧预览失效，需要新流程或重新生成视图。

上游 create_3d_asset 的完整协议是 start / query / get_options / continue / post_process。
本模板固定使用 reviewed 图片流程，不走 direct，不自动确认预览；远端可能返回四个方向，
全部下载成功后才开放确认。后台支持面数、贴图/PBR 等 options，但受服务端阶段及质量策略限制；
本版只开放三个质量档位，不写死高级参数。绑骨、贴图重做、重拓扑、格式转换仍使用原 Maker 工具，
不加入画布首版。模型交付后，点击“查看模型 · 旋转预览”打开详情弹窗，可拖拽旋转、滚轮缩放及复位。
预览直接读取交付包内的 UMD2 MDL、prefab/材质 UUID 与基础色贴图，不调用转换或付费接口；
仅显示静态外观，不播放骨骼动画，也不保证与引擎 PBR 光照一致。缺失依赖、不支持的格式或无 WebGL2 时
明确提示，可继续导出原模型包。关闭弹窗释放加载请求、纹理与 WebGL 资源，卡片不常驻 3D 渲染器。

CLI 与界面复用同一入口：

1. add-template 使用模板 ID 7e1cb6ad-732f-4dc3-a951-000000000004。
2. 编辑/生成角色图片，或使用 import 导入图片，再 add-node 创建 model-views（sourceId=图片ID）
   和 model（sourceId=多视图卡ID）。模型卡不能没有上游，也不接受任意结果路径写入。
3. update-nodes 可设置多视图卡的 modelQuality：fast / balanced / high_quality。
4. 确认角色图后，对多视图卡执行 run --allow-paid。inspect 的 state.model 返回状态、全部预览路径、
   assetId/taskId 及 reviewId。query 查询原上游任务，不发起新的生成。
5. **展示全部预览并取得用户明确批准后**，执行 confirm-model --allow-paid，input 为
   {"id":"模型卡ID","reviewId":"当前预览令牌"}。通用 run 或分组队列不会跳过确认。
6. query 直至 state.model.status=completed；以 modelPath 为实际本地交付入口。
   preview-model 的 input 为 {"id":"模型卡ID"}，只打开只读预览弹窗，不修改画布、不扣费；
   返回 opened 只表示弹窗打开，加载结果需查看弹窗状态，不等同于模型视觉验收通过。
   右键模型卡导出，或 export 的 format=model，可下载含模型、材质、贴图原相对路径的 ZIP。
   带 --output-dir 即保存到本地目录；不重命名包内依赖文件。最多121个资源文件、128 MiB，
   超限时明确提示从项目 assets/model 目录复制，不导出不完整模型包。

canvas models --target-dir "<项目绝对路径>" --canvas-id <画布ID> 返回持久任务记录，
无需页面；这是本地记录，不代表已刷新远端状态。新建、执行和确认仍需要打开画布页。

原型图或质量变化后，旧预览不能确认，旧产物保留；结果未知或生成中不能再次提交。
任务 ID 在素材下载前落盘，刷新不自动恢复付费生成。停止等待只释放页面，不取消远端；
原请求还在执行时先“刷新本地状态”，请求结束后再“查询原任务”。模型查询不沿用视频6小时期限。
单卡复制不复制模型依赖或任务；要创建独立模型流程，请添加模板或把完整流程另存用户模板。
删除卡片不删除历史任务与已交付素材，历史 ID 可通过 models 查看并交给原 Maker 工具查询。

### 安全与恢复

- 生图、生视频或分组 run 必须先取得用户授权，再显式传 --allow-paid；修改参数、添加模板不会扣费。
- 页面有未保存修改、参数面板、编辑器草稿或执行中任务时，拒绝冲突操作，不丢弃人工编辑。
- 关闭生成面板不代表提交人工参数草稿。仍有草稿时，先手动完成生成，或刷新页面明确放弃，再交给 AI。
- 可传 --request-id 标识同一次操作；同一会话重复请求返回原操作，不重复执行。不同参数不能共用 ID。
- 保存失败时修改可能已在页面，保留页面手动保存；不要再次添加模板或重新生成。
- 页面刷新、断开或控制台重启后，原命令不自动重放。unknown 表示结果待确认，不是重试许可。
- 操作记录只在本次控制台会话内存在，不是持久任务系统。生成 taskId 仍由视频历史持久保存。
- query 先刷新本地生成记录，可取回停止等待后才返回的 taskId；尚未返回 ID 时稍后再查，不能重提生成。
- 保留最近 20 次完整结果，更早记录标记 resultExpired；需要详情时重新 inspect。
  每次控制台会话最多接收 1000 条命令，达到上限后完成现有任务再重启控制台。
- 画布打开、CLI 状态成功或抽帧成功不等于视觉验收通过；朝向、完整构图、抠图质量仍需看图确认。
