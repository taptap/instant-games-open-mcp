# UrhoX 本地新增资源与 .meta 流程

本文档根据以下两个仓库的当前代码整理：

- 引擎与构建工具：/Users/liangdong/Documents/Maker/urhox_dev
- Maker 核心大仓：/Users/liangdong/Documents/Maker/maker-dev

适用对象是 UrhoX 游戏项目中的资源文件（图片、模型、材质、音频、场景、Prefab、脚本等）。Maker 素材库里的 .assets-meta.json 是展示用的 sidecar 元数据，和 UrhoX 资源的“资源文件名加 .meta”不是同一份协议，不能互相替代。

## 结论

本地新增资源的 UUID 必须由 UrhoX 项目级生成器产生，不能由 AI 拼接或自行生成随机字符串。推荐优先走编辑器 AssetDatabase；如果资源是由文件系统、下载器或素材画布写入，则在写入后调用 meta_generator.py，最后用构建扫描和唯一性检查收口。

maker-dev 当前负责工作区、素材上传和构建调用，没有发现一套独立的 UrhoX .meta 生成实现；新增逻辑应复用 urhox_dev/tools/project-tools，不要在 Maker 侧重新实现 UUID 编码。

## Maker MCP 调用入口

工具名：`generate_resource_meta`。由 AI 根据任务主动调用；Canvas 导入、生图和模型交付不会自动调用。

```json
{
  "target_dir": "/absolute/path/to/game",
  "paths": ["assets/image/button.png", "assets/model/hero"]
}
```

- `target_dir` 必填，必须是游戏项目根目录的绝对路径；`paths` 是 1～100 个项目相对文件或目录路径，使用 `/` 分隔。目录递归处理，单次最多扫描处理 5000 个文件；同名配置关联可能增加结果项。
- 复用 Maker Python 环境；未就绪时先执行 `taptap-maker python setup`。无需安装编辑器、启动 Runtime、登录素材生成服务或重新生成素材。
- 直接复用随包分发的 UrhoX `MetaGenerator` / `UUIDGenerator`，当前来源提交为 `a6a4145ac8be26d9385f3a318032cc79009f8a79`；依赖随现有官方工具快照维护，运行时不依赖开发机上的引擎仓库。
- 配置查找沿用官方顺序：`.project/`、项目根、`config/`、`.urhox/`、`.sce/`，每处先 `project.json` 后 `project.jsonc`；使用 `author.id`，项目字段 `id` 优先于 `project_id`。缺少有效身份直接失败，不使用 Maker 绑定信息兜底。
- 缺失的 `.meta` 使用官方规则生成；已有文件校验 JSON 对象与 24 字符 URL-safe UUID 格式后逐字节保留，不要求历史资源的作者/项目归属等于当前项目。
- 同名 `.xml` 优先于 `.json`，`config` 和 `path_refs` 等字段遵循官方生成器；隐式生成的配置 `.meta` 也会出现在结果里。
- 不接受 UUID、作者/项目覆盖值或 `force`。拒绝越界、符号链接、隐藏/构建目录；源码、文档和其它不适用文件遵循官方排除规则。

成功返回 `success: true`、`projectPath`、`generatorCommit` 和 `results`。每项包含 `path`、`status`（`generated` / `preserved` / `skipped`）；生成或保留项还包含 `metaPath` 和 `uuid`。AI 直接使用返回的 UUID，不自行编造。

工具只生成元数据，不修改资源内容、改写引用、构建、上传或刷新正在运行的编辑器。重复 UUID 检查覆盖请求范围及其同名配置，不代替全项目检查。同项目并发调用互斥；不与外部编辑器共享写锁，调用期间避免外部修改相同文件。

参数、路径、已有无效 meta 等问题尽量在生成前拒绝；执行中途失败或取消可能保留部分已生成文件，工具不会删除用户资源或自动重写坏 meta。失败返回 MCP `isError`，Python 业务失败还返回 `success: false`、`error` 和 `next_action`。检查并修复后可再次调用，已有有效 meta 不会重建。

下文是引擎资源工作流说明；其中导入器伪代码属于独立导入器参考，不表示 Maker MCP 会自动挂接资源写入。

## UUID 与 .meta 契约

### UUID

UrhoX 当前资源 UUID 具有以下格式：

- 18 字节，编码后 24 个字符；
- URL-safe Base64，去掉 = padding；
- 当前版本包含 version、随机位、作者哈希、项目哈希和毫秒时间戳；
- 生成输入是项目配置中的 author.id 和 project_id；
- UUIDGenerator 只保证本次生成器会话内不碰撞，落盘后仍需做全项目唯一性检查。

项目身份从 .project/project.json 读取：

    {
      "project_id": "p_example",
      "author": { "id": "user_example" }
    }

对应实现是：

- urhox_dev/tools/project-tools/uuid_generator.py
- urhox_dev/tools/project-tools/uuid_decoder.py
- urhox_dev/tools/project-tools/build_context.py 中的 ctx.uuid_generator

### .meta 文件

资源旁边放同名 sidecar：

    assets/characters/hero.glb
    assets/characters/hero.glb.meta

普通资源最小内容是：

    {
      "uuid": "24-char-url-safe-base64"
    }

根据资源和命令参数，.meta 还可能包含 group、c_or_s、path_refs 和 config。其中 config 用于把 hero.png 与同名 hero.xml 或 hero.json 的 UUID 关联起来。.meta 只保存元数据，构建时提取到 manifest，不会作为运行时资源输出。

## 新增资源的标准流程

### 1. 确定项目根与目标路径

先确定目标项目根目录和资源目录，读取该项目自己的 .project/project.json。路径必须是项目内的 Project-relative 路径；拒绝绝对路径、.. 穿越、盘符、UNC、URI 和工程目录之外的目标。

不要从聊天内容、文件名或 AI 上下文推导 author.id、project_id，也不要把 Maker 项目 UUID 当成资源 UUID。

### 2. 写入资源文件

将文件写到目标资源目录。文件系统导入器应先写同目录临时文件，再原子 rename 到目标文件名，避免留下半个资源。创建新文件时不要复制来源资源的 .meta，除非操作语义明确是“移动/改名、保留原资源身份”。

### 3. 生成或保留 .meta

| 情况                           | 处理                                      | UUID                 |
| ------------------------------ | ----------------------------------------- | -------------------- |
| 新路径没有 .meta               | 使用编辑器导入，或运行 meta_generator.py  | 生成新的项目级 UUID  |
| .meta 已存在且 JSON、uuid 有效 | 读取并保留                                | 不变                 |
| 同项目内改名/移动              | 资源文件和 .meta 一起改名/移动            | 不变                 |
| 复制成一个新的资源             | 只复制资源内容，删除副本 .meta 后重新生成 | 新 UUID              |
| 覆盖同名目标资源               | 保留目标 .meta，只替换资源内容            | 保留目标 UUID        |
| .meta 无法解析或缺 uuid        | 停止导入并修复/重新生成                   | 不允许 AI 猜测或覆盖 |

覆盖同名文件时，来源素材的 UUID 没有优先级；目标路径已有的 UUID 才是引用身份。这样已有场景、Prefab 和脚本引用不会因为素材内容更新而失效。

### 4. 优先使用编辑器 API

编辑器内的资源创建、复制和外部文件导入应使用 AssetDatabase：

    -- 外部文件已经写入项目后
    AssetDatabase.ImportAsset("assets/characters/hero.glb")

    -- 从已有资源创建项目副本（成功后会生成目标 .meta）
    AssetDatabase.CopyAsset(
        "assets/characters/source.material",
        "Generated/characters/hero.material",
        { overwrite = false }
    )

    -- 对已加载、已修改并标记 dirty 的资源保存
    AssetDatabase.SaveAssetIfDirty(asset)

    -- 批量文件系统变化后刷新
    AssetDatabase.Refresh()

CreateAsset、CopyAsset 成功后会生成 .meta、刷新 Resource Browser 并通知 ResourceCache；Package 资源只读，派生资源要先 Object.Instantiate，再写入项目新路径。

### 5. 文件系统导入时使用官方 CLI

素材画布、下载器或 MCP 如果无法直接调用编辑器，应复用引擎工具：

    cd /Users/liangdong/Documents/Maker/urhox_dev/tools/project-tools

    # 先预览，不写文件
    python3 meta_generator.py \
      --project /path/to/game \
      --path /path/to/game/assets/characters/hero.glb \
      --dry-run

    # 确认后只为缺失的 .meta 生成文件；已有 .meta 默认跳过
    python3 meta_generator.py \
      --project /path/to/game \
      --path /path/to/game/assets/characters/hero.glb

指定目录时会递归处理子目录，并跳过源码、文档、构建产物、临时文件和 .meta 本身。--group、--c-or-s 只有业务确实需要时才传入。--force 会改变已有资源身份，正常新增和覆盖流程禁止使用。

如果项目有多个 asset_dirs，从 .project/settings.json 读取配置，让工具按项目配置扫描；不要在 Maker 侧自己拼接 Res、Data、CoreData 的路径。

### 6. 刷新索引或运行构建兜底

编辑器入口在导入后调用 AssetDatabase.Refresh()。纯文件系统入口没有编辑器时，运行：

    cd /Users/liangdong/Documents/Maker/urhox_dev/tools/project-tools
    python3 project_builder.py \
      --project /path/to/game \
      --meta-only

--meta-only 使用 ScanLocalResourcesStep：已有 .meta 读取并保留，缺失时通过项目级 ctx.uuid_generator 生成，然后重新加载 meta_cache，让资源进入统一索引。它是导入后的收口和 CI 兜底，不应该成为让资源长期没有 .meta 的理由。

### 7. 做完整性与唯一性检查

至少检查目标目录和项目实际资源目录：

    python3 check_meta_uuid_unique.py \
      /path/to/game/assets \
      /path/to/game/scripts \
      --fail-on-invalid

检查项包括：

1. 每个资源的 .meta 是有效 UTF-8 JSON 对象；
2. uuid 存在且是字符串；
3. UUID 不重复；
4. UUID 语法为 24 个 URL-safe Base64 字符、解码后 18 字节；当前 check_meta_uuid_unique.py 对长度异常只告警，严格格式应再用 UUIDDecoder.verify；
5. 对需要强校验的项目，可用 uuid_decoder.py 的 UUIDDecoder.verify 检查作者和项目归属；
6. 同名配置文件存在时，主资源的 config 指向配置文件的 UUID。

构建 CI 的标准做法是先执行 project_builder.py --meta-only，再扫描资源目录并检查重复 UUID。复制资源时连 .meta 一起复制，是重复 UUID 最常见的原因；发现重复时应删除副本 .meta 后重新生成，不要对原资源使用 --force。

### 8. 更新引用并交付

资源配置和序列化数据引用资源时使用 uuid:// 加 UUID。如果项目仍有旧的路径引用，使用官方路径替换流程生成 UUID 引用，不要让 AI 直接把文件名替换成自造 UUID。

最终交付应同时包含资源文件和 .meta 文件；改名、移动和覆盖后的目标 .meta 必须在同一次变更中保留或更新，不能只提交资源文件。

## 可直接落地的导入器伪代码

    import_resource(source, destination, project):
        validate_project_relative(destination)
        validate_source_file(source)

        if destination exists:
            # 覆盖语义：目标是正式资源，目标身份优先
            target_meta = read_meta(destination + ".meta")
            require_valid_uuid(target_meta)
            atomic_replace_file(source, destination)
            keep(destination + ".meta")
        else:
            atomic_copy_file(source, destination)
            # 不继承草稿/其他项目的身份
            remove_if_present(destination + ".meta")
            run_meta_generator(project, destination)

        refresh_editor_or_meta_cache(destination)
        verify_meta_and_project_uniqueness(project)
        return destination, read_uuid(destination + ".meta")

如果操作是“同项目资源改名/移动”，应改为同时移动 source 和 source.meta，并跳过重新生成；如果操作是“复制一个全新资源”，则必须删除副本的 .meta 再生成新 UUID。

## 不应复用的实现

- crypto.randomBytes(18) 或 uuid.uuid4().bytes 再 Base64 作为资源 UUID；
- 由 AI 根据文件名、时间或提示词拼接 UUID；
- 从另一个项目或草稿目录直接复制 .meta 到新资源；
- 覆盖同名正式资源时用来源素材的 .meta 替换目标 .meta；
- 使用 --force 批量重写已有 .meta；
- 只更新素材库的 .assets-meta.json，却不生成 UrhoX 资源 .meta；
- 生成 .meta 后不刷新 meta_cache / Resource Browser，也不做全项目重复检查。

## 源码对比中的边界与风险

urhox_dev 的普通本地资源扫描和 meta_generator.py 使用同一套项目级 UUIDGenerator，这是本流程的依据。maker-dev 主要通过工作区文件接口和构建工具协作，不应另造一套 UUID 规则。

同时，当前 urhox_dev 的以下辅助步骤仍有独立的普通 uuid4 Base64 生成代码：

- tools/project-tools/build_steps/step_generate_runtime_config.py
- tools/project-tools/build_steps/step_generate_manifests.py
- tools/project-tools/build_steps/step_i18n.py

它们针对运行时配置、manifest/i18n 派生文件，不能拿来实现普通新增资源导入。若后续要求所有 .meta 都满足作者/项目可解码归属，应将这些辅助路径统一改为 ctx.uuid_generator，并补充对应回归；本流程暂不把它们当作普通资源入口。

## 代码依据

- urhox_dev/tools/project-tools/uuid_generator.py：UUID 编码和会话内碰撞重试。
- urhox_dev/tools/project-tools/meta_generator.py：项目配置读取、缺失 .meta 生成、同名配置关联、默认跳过已有 .meta。
- urhox_dev/tools/project-tools/build_steps/step_scan_local_resources.py：构建扫描时读取/生成 .meta 并加载 meta_cache。
- urhox_dev/tools/project-tools/check_meta_uuid_unique.py：重复、缺失和无效 .meta 检查。
- urhox_dev/ai-dev-kit/editor-docs/api/asset.md：AssetDatabase 的导入、创建、复制和刷新语义。
- urhox_dev/ai-dev-kit/editor-docs/examples/AssetDatabaseWorkflow.lua：编辑器侧完整示例。
- maker-dev/docs/design/asset-library.md：Maker 素材库 sidecar 元数据边界。
