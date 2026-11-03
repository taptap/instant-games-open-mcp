---
name: maker-project-check
description: Inspect a local TapTap Maker project's architecture and assets, then publish evidence-backed results to the console. Use for project checks, architecture diagrams, unreferenced or duplicate assets, oversized images, and asset organization reviews.
---

# Maker 项目检查

用户通过 AI 对话发起检查。你负责读代码、理解职责和复核引用；CLI 收集事实并保存结果；
控制台“其他 → 项目检查”只展示已保存结果。打开页面不会发起扫描或调用 AI。

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

## 图片压缩

用户要求 PNG 压缩时，复用现有命令输出新副本，具体限制以当前 help 为准：

    taptap-maker image compress --input SOURCE.png --output COPY.png --json

它保持像素、透明度和尺寸，不覆盖原件；可能无法进一步减小体积。
无损压缩不会降低纹理内存。缩尺寸或转格式需要另行核对图集、九宫格、像素风和运行时支持，
不作为检查的一部分自动执行。检查本身不授权上传、付费生成、构建或发布游戏。
