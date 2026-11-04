---
name: maker-project-check
description: Inspect a local TapTap Maker project's architecture and assets, then publish evidence-backed results to the console. Use for project checks, architecture diagrams, unreferenced or duplicate assets, oversized images, and asset organization reviews.
---

# Maker 项目检查

用户通过 AI 对话发起检查。你负责读代码、理解职责和复核引用；CLI 收集事实并保存结果；
控制台“其他 → 项目检查”展示已保存结果。项目没有结果时页面会自动做一次只读的目录分组检查（不调用 AI）；
AI 检查结果带模块职责说明与整理建议，重新检查前页面会提示将替换它们。

## 执行流程

1.  沿用用户指定的已绑定项目绝对路径和当前 Maker CLI 入口。不要另装另一版 Maker。
    不确定项目时先确认；已明确的项目不重复询问。CLI 和控制台应使用相同 Maker home。
2.  读取当前版本的命令契约，再收集依据；大结果可重定向到项目外临时文件分段阅读：

        taptap-maker project-check capabilities --json
        taptap-maker project-check collect --target-dir ABSOLUTE_PROJECT --json

    collect 返回事实快照、factsRevision、resultRevision。它不替换已发布结果。

3.  阅读项目入口和关键 Lua、UI/场景配置、资源加载及构建配置。以职责划分模块，
    每个已收集 Lua 文件归入一个模块；给出文件、行号和函数/用途依据。
    字面量 require 关系不是执行顺序。动态加载、事件和网络分支需要读实现后解释。
    仅在实际复核流程节点和分支后填写 flow；否则保持 null，用 guide 提供源码导览，
    并在 limitations 说明未覆盖范围。项目没有可分析源码时如实说明，不编造模块。
4.  结合下方判断原则写素材结论。至少交代引用、重复、大图、目录分类四项的检查情况，
    无问题可不填 findings，但未检查和不确定之处必须写入 limitations。
    按 capabilities 的 organization 契约输出用途分组与逐项建议，遵循下方分类流程。
5.  按 capabilities 返回的 analysis 契约在项目外临时文件编写 JSON，复制本次两个 revision。
    保留扫描限制，不把局部读取写成全量通过，不包含源码全文、凭证或配置秘密。

        taptap-maker project-check publish --target-dir ABSOLUTE_PROJECT --input-file ANALYSIS.json --json
        taptap-maker project-check show --target-dir ABSOLUTE_PROJECT --json

    publish 在校验项目、模块归属、依据路径/行号、源码摘要及版本后原子保存。
    冲突或源码变化时重新 collect，复核受影响结论再发布，不只替换 revision 强行覆盖。
    失败保留之前的结果。确认 show 返回目标项目和新时间后，引导用户重新打开检查页。

## 素材判断

- 未发现静态引用只是候选。检查动态拼接、UUID、预加载/目录加载、场景/材质依赖、
  编辑器和活动画布引用；同名文件只证明有线索，不能证明具体文件已使用。
  未核实的资源保留为待核对，不给“可以删除”的确定结论。
- 完全重复由 CLI 的字节数和 SHA-256 识别，不等同视觉相似或可直接释放空间。
  合并前仍需核对不同 UUID、加载路径和各自用途。
- 图片长边超过 2048 px 为中高风险，超过 4096 px 为高风险；说明实际用途，
  大背景和图集可能合理。宽 × 高 × 4 只是单层 RGBA 估算，不是实测显存。
- 目录按用途/业务模块判断，不能仅凭文件数量判定“不合理”。大量直接堆在
  assets/image 的混合素材，应结合内容建议 UI 模块、角色、场景、音效等分类。
  区分运行素材、创作原稿、历史备份、缓存和活动画布；创作资料可以在游戏之外。
  Git 忽略规则不等于构建排除规则。整理建议注明引用、meta/UUID 与构建配置影响，
  不移动工具管理的活动画布文件，也不自动删资源或修改加载代码。

## 用途分类与整理建议

目标是让制作人找到素材、了解用途和决定下一步；分类不要求立即移动文件。

1. 看图片和实际调用位置，沿用合理的现有分类，通常使用“界面 / 主界面”“角色 / 战斗动作”
   两级用途名称。混合图集作为整体，共享素材只归一处；不要按生成日期、模型或文件后缀
   推断用途。没有证据时保留待分类，不为了覆盖率编造用途。
2. organization.groups 给出分类名称和理由；items 只引用本次 facts.assets.assets 的 path。
   每项填写 groupId、role、usage、action、reason 和 evidence。role 区分 runtime、source、
   history、unknown；action 使用 keep（保持原位）、review（先核实）、move（建议迁移）。
   未列出的素材会显示为待分类；明确说明本次覆盖数量和未覆盖范围。
3. referenceEvidence 的 path/uuid 是静态明确线索，filename 是可能同名的弱线索，registry
   是生成记录，不代表运行使用。canvas uses 是已保存卡片的路径引用；origin 是匹配生成
   任务或成功交付记录的来源关联，不证明缓存与原图当前内容一致。cachePath 表示该卡片
   使用独立缓存。来源与使用分开，缺证据留空，不凭文件名或相似画面补画布 ID。
4. move 才填写 suggestedPath，保留原文件名、扩展名，限当前项目 assets 下的新目录。
   publish 检查已有目标/meta、大小写冲突、链接和素材/引用依据变化；这只是建议校验，
   不代表已完成迁移依赖审查。画布管理或直接使用的图片保持原位或先核实，不填 move。
   检查本身不移动文件，也不生成可盲目执行的路径替换脚本。
5. 真正迁移前在 AI 对话中展示具体旧新路径、引用补丁、未解析项、备份和撤回方式，由用户
   确认清单。可沿用 asset-organizer 的 scan/plan/apply/verify 方法；若当前未安装该 Skill，
   不要声称已调用。必须核对 .meta/UUID、生成注册表、动态目录、构建忽略和受影响工作页。
   外部资料库先明确范围；工具管理的画布通过正式接口处理，独立缓存不随原图搬迁。

控制台项目检查是一张纵向报告：上方项目架构默认收起（点击标题条展开或点查看详细才显示模块节点与关系连线；详细弹层只有结构总览，不显示 guide/flow），下方资源统计和问题图片，
不拆分功能页签，不展示全量图库。默认只展示关键数字和超大图/引用待核对图片，
用途、依据、目录、检查范围及整理建议在点击后的详情中查看。写给用户的摘要应简短、
使用易懂表达；完整证据继续保存在报告里，不为简洁省略未核实项。
旧报告仍可阅读；新分类需重新 collect。预览只读本次报告中的 PNG/JPEG/WebP，文件变化
后拒绝展示旧版本，超过 16 MiB 或 1600 万像素时不加载；不在打开页面时触发扫描。
磁盘占用不等于构建包体，重复副本占用不等于可释放空间。

## 图片压缩

用户要求 PNG 压缩时，复用现有命令输出新副本，具体限制以当前 help 为准：

    taptap-maker image compress --input SOURCE.png --output COPY.png --json

它保持像素、透明度和尺寸，不覆盖原件；可能无法进一步减小体积。
无损压缩不会降低纹理内存。缩尺寸或转格式需要另行核对图集、九宫格、像素风和运行时支持，
不作为检查的一部分自动执行。检查本身不授权上传、付费生成、构建或发布游戏。
