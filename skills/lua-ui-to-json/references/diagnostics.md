# 检查与预览排错

## 检查范围

从 skill 目录运行（替换游戏路径）：

```bash
node scripts/check-ui.cjs --project "/path/to/game" --format json
node scripts/check-ui.cjs --project "/path/to/game" --file assets/ui/settings.ui.json
```

扫描 `assets/` 内 `.ui.json`，不处理 `.ui.json.meta`；不会写任何项目文件。
文件上限 4 MiB，单文档最多 10000 节点、深度 128；超过限制不是通过。
目录符号链接不递归，报告警告。显式文件和资源不能越出 assets。

退出码：`0` 执行的规则无错误，`1` 有文档错误或无 UI，`2` 参数/环境失败。
使用 `--format json` 时，成功扫描后的结果输出到 stdout；环境失败信息在 stderr。
一个 JSON 解析失败不会阻止检查其他可读文件。

已检查：

- JSON 可解析、节点对象、type 非空、children 为数组。
- 同文档静态 ID 重复、内部字段、回调字段。
- 部分布局数值与枚举、显隐布尔值、透明度、九宫格数组。
- 图片与 `$repeat.template` 路径安全和文件存在。
- `.project/project.json` 的屏幕方向；页面根宽高与项目方向一致性。
- `assets/ui/ui-export-manifest.ui.json` 的页面、组件、模板清单覆盖；目录中未登记文件会提示清单可能过期，清单登记的缺失文件会报错。

未全面检查：引擎字段全集、主题默认值、布局/字体度量、图片解码、meta/字体索引、组件/Slot 展开、
Lua 行为绑定、源页面覆盖、JSON 重复键以及引擎画面等价。
模板参数、编辑器专属 `$repeat` 和非基础控件会提示人工核对。
未知字段不等于受支持字段，不报错不表示语义正确。

浏览器“检查 UI”使用相同规则，但只检查**当前内存文档**，资源存在性依据项目资源索引。
点击问题可定位源节点；复制诊断报告给 AI。它不替代全项目检查，也不会自动保存修改。

## 报告如何处理

诊断包含 `code`、`severity`、`file`、`pointer`、`message`。
例如 `/children/2/backgroundImage` 是 JSON Pointer，不是第 2 行代码。
修复时根据文件与指针定位，再核对源 Lua；不要只按错误码批量替换。

| 现象 / 代码 | 先检查 | 修复边界 |
|---|---|---|
| UI_NO_FILES | 选的是包含 assets 的游戏根目录吗？ | 无文件才走提取；不要扫描 meta 当 UI |
| UI_JSON_PARSE | 编码、尾逗号、文件截断、大小 | 修复合法 JSON，保留用户原修改 |
| UI_RESOURCE_MISSING/PATH | assets 相对路径、大小写、文件是否随项目存在 | 不改为网站路径或复制别的项目图片凑数 |
| `UI_COMPONENT_MISSING/TYPE` | `component` 相对路径、组件文件是否存在、根 props 覆盖规则 | 先修引用或核对组件注册；不要把组件静默降级成 Panel |
| UI_DUPLICATE_ID | 同一实例的行为绑定目标 | 修改 ID 同时对照调用方；跨实例不盲目改名 |
| UI_LENGTH/ENUM | 源布局和目标加载器支持 | 不随意把百分比改成固定像素 |
| UI_TEMPLATE_CONTEXT | 调用 props、默认值、实际加载模式 | 编辑器默认值显示正常不代表 Lua 正常 |
| UI_PREVIEW_TYPE | 组件注册、模板、Slot 和引擎版本 | 预览不支持与引擎不支持分开报告 |
| UI_EDITOR_REPEAT | 是否已有运行时循环实例化 | 保留 Lua 数据驱动，不把预览列表当引擎能力 |
| 无报错但画面空 | 根尺寸、祖先显隐/裁切、opacity、动态内容 | 先判断预期状态，再修确定的错误 |
| `UI_PROJECT_CONFIG_MISSING/PARSE` | 项目根目录、`.project/project.json` 编码和 JSON 结构 | 补齐或修复配置后重跑；未确认方向时不要交付视觉结论 |
| `UI_DESIGN_ORIENTATION` | 页面根 `width/height` 与 `screen_orientation` | 回到源布局确认设计尺寸；不要只交换宽高掩盖坐标语义 |
| `UI_MANIFEST_STALE/MISSING_FILE/PARSE` | 导出 manifest 与 `assets/ui` 实际文件 | 先确认是否为旧导出或有意未发布；不要为了消除警告删除模板 |
| 页面缺部分控件 | 工厂默认值、初始化后的 AddChild/SetStyle | 补遗漏的静态结构，不展开业务运行态 |
| 文字换行/大小差异 | 字体资源、主题、字号单位、父容器约束 | 保留字体度量差异说明，需运行时对照 |
| 改 JSON 不影响游戏 | 活动入口是否仍创建旧 Lua 树 | 明确尚未接入，取得授权后迁移 |
| 图片索引存在但画布裂图 | 图片解码、格式、预览控制台 | 归类资源解码或编辑器问题，不伪造路径 |

## 最小交付报告

```text
模式：仅提取 / 检查 / 诊断 / 已接入
活动页面及输出：源文件 -> UI 文件（含未覆盖的页面及原因）
静态检查：检查 N 文件，E 错误，W 警告；附命令及原始报告位置
警告处理：每类问题的判断，不能直接删除警告
编辑器：实际打开哪些页面/模板，检查哪些状态
引擎：实际运行哪些状态；未运行明确说明
仍留 Lua：行为、动画、动态节点和自绘
下一步：需要用户操作或尚未验证的范围
```
