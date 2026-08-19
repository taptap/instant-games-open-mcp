# DeepSeek Harness（DSH）插件开发机制调研报告

> 调研对象：`@deepseek-ai/dsh@0.1.0-rc.6`（npx 安装于 `/Users/liangdong/.npm/_npx/1e7f6d9597241db0/node_modules/`，下文简称 `NM/`）。所有代码证据均来自该目录下的**只读**源码；官方文档证据来自 GitHub `deepseek-ai/deepseek-harness`（master 分支，与 rc.6 代码一致）。
>
> 版本矩阵（`NM/@deepseek-ai/*/package.json`）：`dsh-*` 业务包全部为 `0.1.0-rc.6`；vender 的 Cordis 内核 `@deepseek-ai/cordis@4.0.1`；`cordis-plugin-loader@1.0.2`、`cordis-plugin-include@1.0.6`、`cordis-plugin-group@1.0.1`、`cordis-plugin-timer@1.1.3`、`cordis-plugin-hmr@1.0.16`。
>
> **与仓库现状的对应**：本仓库（TapTap Maker MCP）的 DSH 集成分两层——
>
> - **L1（零代码配置）**：`src/maker/cli/dshMcpConfig.ts` 已完整实现并通过测试；`taptap-maker install --ide dsh` 自动检测 DSH，向 `$DSH_HOME/cordis.patch.yml` 写入第 8 节路径 1 形态的 `insert` 行（`@deepseek-ai/dsh-mcp-client` + `toolCallTimeoutMs: 3600000` + `failOnStartupError: true`），并已接入 issue report 诊断与文档。
> - **L2（bundle 插件）**：`packages/dsh-maker/`（`@taptap/dsh-maker`），即第 8 节路径 2/3 的落地形态；实现与使用见 [DSH_PLUGIN.md](DSH_PLUGIN.md)。
>
> 本文第 1-7 节是 DSH 插件机制的通用参考；第 8 节的三条路径按"由轻到重"的层次展开（L1 配置安装 / L2 bundle 插件 / L3 原生插件）。

---

## 1. Cordis 插件 row 格式（cordis.yml / cordis.patch.yml）

### 1.1 一个 row（EntryOptions）的完整字段语义

核心数据结构是 `EntryOptions`（`NM/@deepseek-ai/cordis-plugin-loader/src/config/entry.ts:9-22`）：

```ts
export interface EntryOptions {
  /** Stable id inside the containing entry tree. */
  id: string;
  /** Module specifier imported by the entry tree. */
  name: string;
  /** Config passed to the plugin. */
  config?: any;
  /** Marks this entry as a nested group. */
  group?: boolean | null;
  /** Prevents this entry and descendants from running. */
  disabled?: boolean | null;
  /** Required services or service intercept config for this entry. */
  inject?: Inject | null;
}
```

由 `isolate.ts` 扩展的两个字段（`cordis-plugin-loader/src/config/isolate.ts:5-9`）：

```ts
interface EntryOptions {
  intercept?: Dict | null;
  isolate?: Dict<true | string> | null; // true = entry 级隔离；字符串 = 命名隔离域
}
```

各字段语义（结合 `entry.ts` 与官方教程 [Cordis tutorial ch6](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/06-composition-and-hmr.md)）：

| 字段        | 语义                                                                                                                                                                                                                                                                             | 证据                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`        | 该 row 在 entry tree 内的**稳定身份**，Loader 靠它区分"编辑已有条目"与"删除+新增"。**缺省时自动生成**随机十六进制 id（`tree.ts:66-73` 的 `ensureId`），因此一个没写 `id` 的 row 每次读文件都会被视为"删了再加"，配置一改就整行重挂。**id 是任意的、与 name 无关**。              | `tree.ts:66-73`；教程 ch6 "an entry without one gets a generated id on every read…remounts"                                          |
| `name`      | 要 import 的**模块说明符**：相对路径（`./hello.ts`）、绝对路径、或 npm 包名（`@deepseek-ai/dsh-mcp-client`）。`cordis:` 前缀走 Loader 内建插件（`tree.ts:146-148`，如 `cordis:include`）。**id ≠ name**，`mcp-taptap-maker` 这种 id 只是行标识，真正加载的是 `name` 指向的插件。 | `tree.ts:145-162`；`mountRootInclude` 里 root row `{ id: "include", name: "cordis:include" }`（`dsh-app-boot/lib/index.js:976-983`） |
| `config`    | 传给插件 `apply(ctx, config)` 的配置，会被 Schemastery `Config` schema 校验并填充默认值（`cordis/lib/index.js:955-957` `resolveConfig`）。**支持 `!!js` 表达式**（见 1.3）。                                                                                                     | `cordis/lib/index.js:950-957`                                                                                                        |
| `disabled`  | 阻止该 row（及其子孙）运行，但保留条目。`disabled: !!js <expr>` 在**每次挂载决策时**对 loader 上下文求值（如 `process.platform === 'win32'`），普通布尔值也行。group 永远视为 enabled。                                                                                          | `entry.ts:83-108`（`_disabled`/`disabledOf`）；`entry.ts:104-108`                                                                    |
| `group`     | 标记该 row 是嵌套组：其 `config` 是子 row 列表，整组作为一个插件单元挂载/卸载。group 的配置保持字面量，不插值。                                                                                                                                                                  | `group.ts`（`Group` 类）；`loader/src/index.ts:95-100`                                                                               |
| `inject`    | 依赖的服务名列表（或 服务名→intercept 配置 map）。服务未就绪时 fiber 停在 PENDING，就绪后自动加载；服务消失则连带卸载（教程 ch3）。                                                                                                                                              | `cordis/lib/index.js:1484-1497`、`1595-1602`                                                                                         |
| `intercept` | 对某服务的依赖拦截配置（`Loader.Intercept.await` 等）。                                                                                                                                                                                                                          | `loader/src/index.ts:54-58`                                                                                                          |
| `isolate`   | 服务隔离：`{ serviceName: true }` 给该 row 一个私有服务实例；`{ serviceName: 'label' }` 与同 label 的 row 共享实例。agent-presets 的 `agent.cordis.yml` 大量使用（见第 4 节）。                                                                                                  | `isolate.ts:70-153`                                                                                                                  |

### 1.2 patch 语义：`insert` patch 与顶层 row 的区别、"未命中 id 被静默跳过"

patch 文件的解析与合并是 `@deepseek-ai/cordis-plugin-include` 的 `applyEntryPatches`（`NM/@deepseek-ai/cordis-plugin-include/src/index.ts:58-128`；`dsh-app-boot/lib/index.js:57-106` 是内联副本，两者逐行一致）：

```ts
for (const patch of patches) {
  const { id, insert, name, ...overrides } = patch;
  if (insert) {
    if (id) {
      const target = entryMap.get(id);
      if (!target) {
        warn('patch insert: entry %C not found', id);
        continue;
      }
      if (!target.group) {
        warn('patch insert: entry %C is not a group', id);
        continue;
      }
      if (!Array.isArray(target.config)) target.config = [];
      target.config.push(...insert); // 插入到指定 group 的 config 里
    } else {
      data.push(...insert); // 无 id → 追加到顶层列表
    }
    buildMap(insert); // 后插入的行可被同列表后续 patch 命中
    continue;
  }
  if (!id) {
    warn('patch: id is required for non-insert patches');
    continue;
  }
  const target = entryMap.get(id);
  if (!target) {
    warn('patch: entry %C not found', id);
    continue;
  }
  if (name && name !== target.name) {
    warn('patch: name mismatch …');
    continue;
  }
  for (const [key, value] of Object.entries(overrides)) {
    target[key] = value;
  }
}
```

关键结论：

- **`insert` 是"新增行"操作**：`{ insert: [ {...row1}, {...row2} ] }` 把整组新 row 追加到顶层（无 `id` 时）或某个 group 的 `config`（带 `id` 时）。`dsh-base/cordis.patch.yml` 就是一个巨大的单条 `insert`（"applied as ONE insert over the empty profile root"，见其文件头注释）。
- **非 insert patch 是"按 id 覆盖/禁用已有行"**：`{ id: 'xxx', config: {...} }` 整块**替换**目标行的 `config`（不是 merge！`dsh-base/cordis.patch.yml` 头部注释明确："A patch replaces the targeted row's whole `config` rather than merging into it"）；`{ id: 'xxx', disabled: true }` 禁用它；带 `name` 时校验 `name` 与目标行一致否则跳过。
- **为什么未命中的 id 会"静默跳过"**：`applyEntryPatches` 对找不到的行只 `warn(...)` 然后 `continue`，**不抛错**。设计意图在 `dsh-app-boot/lib/index.js:820-832`（`parsePatchList` 注释）写得很清楚：_"a single patch whose target row is absent stays a per-entry Loader warning, so one overlay shared across surfaces does not have to match every tree"_ —— 同一份 overlay 可同时用于 web/headless 等不同组合，某个 tree 里没有目标行是合法的。warn 走 loader logger（`include/src/index.ts:267-271`），`--dump-config` 里也会逐层打印（`dsh-app-boot/lib/index.js:906-921`）。**注意**：文件整体解析失败（非数组、语法错误、行不是 mapping）是 fail-loud 的（`parsePatchList` 直接 throw），只有"单条 patch 目标缺失"是 warn。
- **同一 id 多行合并规则**：分两个层面——
  1. **同一 group 列表内**：重复 id 直接抛 `duplicate loader entry id: <id>`（`group.ts:62-65`），是配置错误。
  2. **patch 索引层面**：`buildMap` 用 `entryMap.set(entry.id, entry)` 后者覆盖前者，即 patch 命中**最后一行**；`composeProfile` 的 `rows.set(row.id, row)` 同样 last-wins（`dsh/lib/profile-boot-DG5t9aNs.js:171-177`）。
  3. **嵌套 id**：`Entry.id` getter 会给嵌套条目拼上前缀 `<父id>:<子id>`（`entry.ts:75-81`，`EntryTree.sep = ':'`），所以不同 group 下可以有同名 id。
- **层间合并**：多个 patch 层**顺序应用、逐字段覆盖**（后面的层 wins），同一层内的 patch 按数组顺序应用；`applyEntryPatches` 输入是 `structuredClone` 的，重复应用不会污染缓存（`include/src/index.ts:63`）。

### 1.3 `!!js` 表达式

YAML 标签 `!!js` 解析为 `{ __jsExpr: string }` 节点（`cordis-plugin-include/src/index.ts:9-15`）。Loader 在以下位置求值（`loader/src/index.ts:92-101` + `entry.ts:104-108`）：

- row 的 `config`：在**该 row 自己的 fiber 激活后**、以该 fiber 的 ctx 为作用域插值（`interpolate`，`config/utils.ts:12-22`，用 `with (ctx) { eval(expr) }`，所以能访问 `ctx.serviceName`、`process.env`、`dshHomePath(...)` 等）；
- row 的 `disabled`：每次挂载决策时对 loader 上下文求值；
- **其他元数据（id/name/inject…）保持字面量**，表达式只是普通 truthy 数据（教程 ch5："the other metadata (`name`, `id`, `inject`, ...) stays static"）。

`dsh-base/cordis.patch.yml` 里的实例：`disabled: !!js process.platform === 'win32'`、`config: { mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write' }`、`root: !!js dshHomePath('sessions')`。

---

## 2. 外部插件安装（`dsh plugin --profile <name> <pnpm args>`）

### 2.1 命令流

`dsh/lib/bin.js:96-105` 定义 `plugin` 子命令 → `dsh/lib/plugin-9h8shc4d.js:101-127` 的 `runPlugin`：

1. `resolveProfileDir(profile)`（`dsh-app-boot/lib/index.js:318-321`，禁止空名/`..`/`node_modules`）→ 若 profile 目录没有 `package.json`，用 `PROFILE_TEMPLATES[profile] ?? DEFAULT_PROFILE_BUNDLES` 初始化（web/headless 有内置模板 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]` / `[..., "@deepseek-ai/dsh-headless"]`；自定义 profile 默认 `["@deepseek-ai/dsh-base"]`，`lib/index.js:322-334`）。
2. 在 profile 目录里 `spawnSync("pnpm", args, { cwd: dir })`，参数原样转发（相对路径 spec 会被锚定到调用者 cwd，`plugin-9h8shc4d.js:90-94`）。**依赖本机已安装 pnpm**（找不到就提示安装并返回 127）。
3. pnpm 成功后 `reconcilePlugins`（`plugin-9h8shc4d.js:46-78`）：扫描 profile `package.json` 的 `dependencies`，**凡是解析后声明了 `dsh.bundle` 的包自动加入 `dsh.profile.bundles` 层列表**；被移除或不再声明 `dsh.bundle` 的依赖自动从 bundles 移除；普通库给出一次警告但照常安装。git 源安装的插件若被 pnpm 的 build script 拦截，会提示在 `pnpm-workspace.yaml` 的 `allowBuilds` 里放行（`plugin-9h8shc4d.js:124`）。

### 2.2 profile 目录结构

`initProfile`（`dsh-app-boot/lib/index.js:353-369`）+ `PROFILE_PATCH_TEMPLATE`（335-339）+ `PROFILE_PNPM_WORKSPACE`（340-345）：

```
$DSH_HOME/profiles/<name>/
├── package.json           # { name: "dsh-profile-<name>", private, dependencies: {...},
│                          #   dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", ...] } } }
├── cordis.patch.yml       # 用户 patch 层：顶层 YAML 数组（id 覆盖 / insert / disable，可 !!js）
├── pnpm-workspace.yaml    # nodeLinker: hoisted, autoInstallPeers: false
└── cordis.yml             # 永远被重写为空数组 [] 的"根文件"（见下）
```

`$DSH_HOME` 解析：`~/.dsh` 或环境变量 `DSH_HOME`（`dsh-home-paths/lib/index.js:11-15,73-84`）。**`cordis.yml` 只是 Loader 挂树需要的真实 include 锚点**——每层 patch 都是直接作用在空列表上合成整棵树，`prepareProfile` 每次启动都把它重写回 `[]`，防止 Loader 的配置回写把合成行烙进文件导致下次重复挂载（`dsh/lib/profile-boot-DG5t9aNs.js:127-145,102-106`）。

### 2.3 patch 层叠加顺序（`composeProfile`，`profile-boot-DG5t9aNs.js:166-198`）

```
bundle 层（按 dsh.profile.bundles 顺序，每个 bundle 的 cordis.patch.yml）
  → profile 自己的 cordis.patch.yml
  → $DSH_HOME/cordis.patch.yml（home 级用户层，高于 profile 层）
  → --patch <file> overlay（命令行，按 argv 顺序）
  → 运行时合成层（telemetry 开关 patch 等）
```

`boot()`（`dsh-app-boot/lib/index.js:1166-1188`）流程：`new Context()` → `ctx.provide("dshHomePath", dshHomePath)` → `ctx.plugin(Loader)` → `prepare?.(ctx)`（注入 cmdline/env 快照）→ `mountRootInclude(ctx, cordis.yml, patches)`（把 root include 挂成 `cordis:include` builtin，`963-990`）→ `await loader.await()` → `assertEntriesActivated`（失败即退出，`1106-1135`）。长驻表面（web）还会通过 `watchUserPatches`（`760-780`）+ HMR `registerConfig` 对 `cordis.patch.yml` 做热更新。

### 2.4 一个第三方 npm 包要成为 DSH 插件 bundle 的条件

证据：`dsh-base/package.json` 是官方 bundle 的模板。

1. **`package.json` 声明 bundle manifest**（`loadProfile`/`resolveBundleDir` 强制要求，缺失即 fail-loud，`dsh-app-boot/lib/index.js:546-557,518-524`）：

```jsonc
{
  "name": "@deepseek-ai/dsh-base",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" }, ... },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },   // ← 关键
  "dependencies": { ... },                                   // 被扫描进闭包，见下
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.1", ... }
}
```

bundle 的 `cordis.patch.yml` 内容就是一个 patch 数组（通常是一条 `insert`，如 `dsh-base` 那样插入全部基础插件行）。

2. **插件模块本身**：ESM 包，导出三种形式之一（`cordis/lib/index.js:1529-1535,1613-1634` + 官方教程 ch1）：
   - 函数插件：`export function apply(ctx, config) {}`；
   - 对象/命名空间插件：`export const name/inject/Config + export function apply`（`dsh-mcp-client`、`dsh-tool-jobs` 都这样：`export { Config, apply, inject, name }`）；Loader 的 `unwrapExports` 会兼容 `default`/`__esModule` 形态（`loader/src/index.ts:191-199`）；
   - 类插件：`class X extends Service { static inject=[...]; constructor(ctx){ super(ctx,'name') } }`。
     本仓库内部统一用命名导出（`{ name, inject, Config, apply }`），rc.6 无 `main`/`exports` 之外的额外要求——只要 Node 能从 profile 目录解析到模块即可。

3. **peerDependencies 必须指向与宿主同源的包实例**：Cordis 服务注册靠 `Symbol.for`/ctx 引用身份，第三方插件必须 `peerDependencies: { "@deepseek-ai/cordis": "^4.0.1" }`（以及它用到的 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm` 等 `^0.1.0-rc.6`）。这能成立全靠 **`healProfilesModuleFallback`**（`dsh-app-boot/lib/index.js:409-438`）：它把 dsh 安装包**整棵依赖闭包**（dependencies+peerDependencies BFS）的每个包在 `$DSH_HOME/profiles/node_modules/` 下建一个指向安装目录真实位置的符号链接。于是从任何 profile 目录出发的 Node 父目录查找都能命中与宿主同一份 `@deepseek-ai/cordis` 等实例——"bundles come from the installation" 契约。

4. **模块解析两锚点**：`resolveBundleDir`（`518-524`）先查 dsh 安装目录、再查 profile 目录；Loader 对**普通插件行**（非 bundle）的 import 以 `baseUrl`（= profile 目录）为父路径走 Node 解析：`profile/node_modules` → `$DSH_HOME/profiles/node_modules`（扁平 fallback）→ 更上层。即：**裸包名优先从 profile 的 node_modules 解析，而内置包永远来自 dsh 安装**（`tree.ts:145-162` + `dsh-app-boot` 注释 299-305）。

---

## 3. 自定义插件能力

### 3.1 插件骨架

最小插件（官方教程 [Your first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/01-first-plugin.md)）：

```ts
import type { Context } from '@deepseek-ai/cordis';
export const name = 'hello';
export function apply(ctx: Context) {
  /* ... */
}
```

`inject` 使 `apply` 在其依赖服务就绪后才运行；`Config`（Schemastery schema）在 `apply` 前校验配置并填默认值（教程 ch5）。`ctx.plugin(child)` 可从代码里再挂子插件，返回 fiber。

### 3.2 注册工具：`ctx.tools`（ToolRuntime）

`@deepseek-ai/dsh-tools` 的 `ToolRuntime` 是 `Service`（`lib/index.js:2546-2547`，`static inject = ["systemPrompt"]`），通过 `super(ctx, "tools")` 注册为 `ctx.tools`。注册入口 `register(definition)`（`2755-2764`）：校验 `output` 结构、`output.schema` 必须是受支持 JSON Schema 子集、拒绝保留名 `run_code`，然后 `layers.effect(...)`——**注册即 effect，插件卸载自动注销**。

`ToolDefinition`（`lib/types/index.d.ts:119-171`，`ToolSchema` + 扩展）：

```ts
interface ToolDefinition extends ToolSchema {
  // name/description/parameters（JSON Schema）
  readonly output: ToolOutputDefinition; // { schema, render(args,value)→ContentBlock[], presentationMeta? }
  execute(args, exec: ToolRunContext): Promise<unknown>; // 返回 output.schema 声明的规范 JSON 值
  finalizeContent?(exec, result): ContentBlock[] | undefined;
  presentCall?(args): ToolCallView | undefined; // UI 卡：generic/terminal/diff
  presentResult?(args, result): ToolResultView | undefined;
  isConcurrencySafe?(args): boolean;
  timeoutMs?: number; // 协作式超时预算（配合 dsh-tool-call-timeout-policy）
}
```

推荐写法是 `defineTool`（`lib/index.js:836-882`）：从 `parameters` DSL（`{ name: { type: 'string', required: true, description } }`，支持 `enum/const/oneOf/json` 等）编译出受限 JSON Schema，`execute` 前自动校验参数（非法抛 `ToolArgsError`）。`dsh-tool-jobs` 是完整范例（`NM/@deepseek-ai/dsh-tool-jobs/lib/index.js:167-300`）：`apply` 里 `ctx.tools.register(defineTool({...}))` × 3，另用 `ctx.on('tools/pre-execute', ...)`、`ctx.systemPrompt.section(...)`、`ctx.jobs.attachController(...)` 扩展能力。

可扩展的事件（`dsh-tools/lib/types/index.d.ts:27-106`）：`tools/pre-execute`（水瀑布 allow/deny/ask）、`tools/execute`（环绕分发：超时/重试/度量）、`tools/post-execute`（替换/阻塞结果）、`tools/result`（只读观察）、`tools/change`。`ctx.tools.restrict()`/`guard()` 做按 agent 的可见性/守卫（`index.js:2772-2799`）。

### 3.3 提供服务：`ctx.provide` / Service

两种方式（教程 ch3）：

```ts
// 方式一：ctx.provide（registry 原语）
ctx.provide('myService', impl, check?)          // cordis/lib/index.js:799-823
// 方式二：Service 子类（既是服务又是插件）
class MyService extends Service {
  constructor(ctx: Context) { super(ctx, 'myService') }
}
```

`ctx.provide(name, value, check)` 注册在**当前 fiber** 上，返回的 disposer 注销服务并唤醒依赖它的 fiber（`notify`，`831-851`）。声明合并 `declare module '@deepseek-ai/cordis' { interface Context { myService: MyService } }` 只提供类型。可选依赖用 `ctx.get('myService')`（不 inject）。

### 3.4 生命周期：`ctx.effect`

`ctx.effect(execute, label)`（`cordis/lib/index.js:1168`）在加载时执行、卸载时执行返回的 disposer（async disposer 也支持，多个 async disposer 并发，需保序就合成一个）。Cordis 的注册 API 本身都是 effect：`ctx.on`、`ctx.plugin`、服务注册、`ctx.tools.register`、`ctx.systemPrompt.section` 等，**插件卸载（含 HMR）时自动全部回滚**（教程 ch2："registrations made through Cordis APIs are effects and are undone when their owning plugin unloads"）。fiber 状态机：`PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`（FAILED 分支），PENDING 表示缺依赖服务（ch6 的"插件不打印任何东西"的常见原因）。

### 3.5 HMR 语义（`@deepseek-ai/cordis-plugin-hmr`）

`NM/@deepseek-ai/cordis-plugin-hmr/lib/index.js`：

- 依赖 `loader` + `timer`，且要求 `--expose-internals`/原生 helper（`78-81,107`）；通过 Node 内部 ModuleLoader 跟踪模块依赖图。
- **模块变更分类**（`analyzeChanges`，`282-323`）：变更文件本身（stashed）及其依赖链 → `accepted`（可热更）；`node_modules`、`node:` 及主入口依赖（externals）→ `declined`；**externals 变更直接 `loader.exit()` 整体重启**（`215`）。
- **`partialReload`**（`324-435`）：清掉 ESM loadCache + CJS cache 里 accepted 文件的缓存 → 重新 import → 对每个旧 runtime：`ctx.registry.delete(plugin)`（自动跑完旧 fiber 的全部 disposer）→ `parent.registry.plugin(plugin, oldFiber._config)` **用同一份 config 重建新 fiber**（`393-400`）→ 失败则回滚到旧模块。**对插件作者意味着**：热更 = 旧 `apply` 的 effect 全部撤销 + 新 `apply` 重跑一遍；有外部资源（连接/子进程/定时器）必须用 `ctx.effect` 注册 disposer，否则泄漏。
- **配置文件热更**：`registerConfig(filename, refresh)`（`118-166`）监视精确路径；`watchUserPatches`（`dsh-app-boot/lib/index.js:760-780`）用它把 `cordis.patch.yml` 变更事务化重放到 root include（重读文件→`applyEntryPatches`→`entry.update({config})`→Loader diff 后只增删改受影响行）。mcp-client 的行被改（HMR 整体替换该行）→ disconnect → 重连（README：_"HMR hot-swaps by disposing the old instance and creating a new one; identical serverName reproduces identical public tool names"_）。

---

## 4. Skill 机制

### 4.1 架构：注册表 + Provider

`@deepseek-ai/dsh-skill` 是 Service Definition（注册表），`@deepseek-ai/dsh-skill-filesystem` 是 Provider 实现（`lib/index.js:10-20` 注释："This package is one implementation of the `ctx.skills` provider registry"）。注册表按 agent scope 分层合并各 provider 的候选、按 `rank` 排序决胜（`dsh-skill/lib/index.js:96-108,338-390`）。运行时 skill 也可直接 `ctx.skills.register(...)`（`193-214`）。当前会话的 `available_skills` 目录正是 `dsh-tool-skill` 生成的模型可见目录（`NM/@deepseek-ai/dsh-tool-skill/lib/index.js:39-43`，`skill` 加载工具）。

### 4.2 发现根目录（`dsh-skill-filesystem/lib/index.js:150-188`）

按 cwd 相关次序（rank 越小越优先）：

| rank | root                                                                              | source                                            |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| 100  | `<projectRoot>/.dsh/skills`（projectRoot = 向上找 `.git`）                        | project-dsh                                       |
| 200  | `<projectRoot>/.agents/skills`                                                    | project-agents                                    |
| 300  | `config.customSkillDirs[]`（skill-filesystem 行的配置项）                         | custom                                            |
| 400  | `$DSH_HOME/skills`（`~/.dsh/skills`）                                             | user-dsh                                          |
| 500  | `$DSH_AGENTS_HOME ?? ~/.agents/skills`                                            | user-agents                                       |
| —    | `bundledSkillDir`（`config.bundledSkillDir` 或 `DSH_BUNDLED_SKILL_DIR` 环境变量） | bundled（trustedHost，走 Node 直读而非 `ctx.fs`） |

每个根目录下：**一个子目录 + `SKILL.md`**（目录型），或**扁平的 `*.md` 文件**（`discoverRoot`，`581-614`）。文件被 chokidar 实时监视（`watch: true` 默认开，`31-44,285-331`），模型侧通过 `ctx.fs` 读文件（有 fs 服务时）；root 是系统信任目录（`trust: system`）时直读 Node fs。

### 4.3 SKILL.md 格式（`parseSkillFile`，`664-704`）

YAML frontmatter（`---` 包裹，`772-785`）+ 正文：

```yaml
---
name: my-skill # 必须，校验 /^[a-z0-9-]+$/-风格（isSkillName）
description: ... # 必须
whenToUse: ... # 可选
disable-model-invocation: false # 可选（布尔，旧字段 userInvocable/modelInvocable 被拒）
user-invocable: true # 可选
metadata: { ... } # 可选，任意 JSON 对象
---
正文（.trim() 后作为 skill 内容注入模型）
```

缺 frontmatter / 缺 name / 缺 description / 非法 name → 该文件被忽略并 warn（`675-694`）。

### 4.4 agent-presets（`dsh/config/agent-presets/`）

`@deepseek-ai/dsh-agent-presets` 服务（Config：`{ default: string, roots: [{path, trust:'system'|'user'}], includeUserRoot: true }`，`lib/index.js:808-815`）：

- **roots 发现**：配置的 roots（`dsh` 包的 `config/agent-presets/` 由 profile boot 以 `{ path: SHIPPED_PRESET_ROOT, trust: 'system' }` 注入，`profile-boot-DG5t9aNs.js:179-188`）+ 用户根 `$DSH_HOME/.agent-presets`（trust user，`USER_PRESET_DIR=".agent-presets"`，`160,851-854`）。每个 preset 是一个目录：`preset.yml`（name/description/order）+ `agent.cordis.yml`（该 preset 的**插件行列表**，按第 1 节格式，可含 `!!js` 与 `isolate`）。preset 被"standing mount"一次（`933-961`），新 agent 通过 scope 绑定加入；子 agent 继承父的 preset（`composeFrom`，`988-995`）。
- 本机实测：`~/.dsh/profiles/web/package.json` 的 bundles 为 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`，preset 行由 web-app bundle 挂载（`dsh-web-app/cordis.patch.yml:410-424`，`config: { default: standard }`）；`standard` preset 的 `agent.cordis.yml` 里挂 `skill-filesystem` + `tool-skill`（见 4.2 根目录），这就是为什么 agent 能看到 skill 目录。

### 4.5 结论：能否像 codex 一样把一组 skill 目录"装进 profile"让 agent 使用？

**可以，而且不需要写任何插件**。最低成本路径：把 `<skill-name>/SKILL.md`（带 frontmatter）放进 `$DSH_HOME/skills/`（即 `~/.dsh/skills/`）或项目 `.agents/skills/`（或 `.dsh/skills/`）→ skill-filesystem provider 自动发现、实时热更、进 `skill` 工具目录。若要放进某个 profile 目录而非全局，可以在该 profile 的 `cordis.patch.yml` 里给 `skill-filesystem` 行补 `customSkillDirs`（第 2 节 patch 机制）；甚至可在 profile 里写一个自定义 provider 插件。这与 codex 的"把 skill 目录放到 `~/.codex/skills`"体验一致。

---

## 5. MCP client 插件配置（`@deepseek-ai/dsh-mcp-client`）

### 5.1 Config schema（`lib/index.js:563-581`）

```ts
const Config = z.union([
  z.object({                      // stdio 分支
    transport: z.const("stdio"),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),  // /^[A-Za-z0-9_-]{1,32}$/
    command: z.string().required(),
    args: z.array(String).default([]),
    env: z.dict(String).default({}),
    cwd: z.string().default(""),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS), // 60000
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect          // { enabled:true, initialDelayMs:500, maxDelayMs:30000, maxAttempts:10 }
  }),
  z.object({                      // streamable-http 分支
    transport: z.const("streamable-http"),
    serverName: 同正则,
    url: z.string().required(),
    headers: z.dict(String).default({}),
    toolCallTimeoutMs / failOnStartupError / reconnect 同上
  }),
])
```

- `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`（`549`）；**每个插件实例占一个 serverName 命名空间**，同进程内重复即抛错（`590-601`，`activeServerNames` WeakMap）。
- 插件形态：命名空间插件 `{ name: "mcp-client", inject: ["tools"], Config, apply }`（`543-545,610`）。一个实例连一个 server，多 server 就多行（README）。
- `cwd` 默认 `""`：MCP SDK 的 `StdioClientTransport` 把 `cwd` 原样交给 `child_process.spawn`（SDK `dist/esm/client/stdio.js:65-75`）；实测 Node v25 对 `cwd: ''` 的 async spawn 等价于继承父进程 cwd（即 DSH 的启动目录，按 dsh 文档即默认 workspace 根）。**想固定工作目录就显式写 `cwd: !!js process.cwd()` 或绝对路径**。

### 5.2 工具公开名（`lib/index.js:56-114,139-168`）

- 稳定身份是 `(serverName, rawName)`；模型可见名 = `mcp__<serverName>__<rawName>`。
- 归一化约束：**≤64 字符**（`MAX_PUBLIC_NAME_LENGTH = 64`）且只允许 `[A-Za-z0-9_-]`（`INVALID_NAME_CHARS`）。一旦发生字符替换或截断，追加 `(serverName, rawName)` 的 SHA-256 前 12 位 hex，保证不同身份不坍缩（`publicToolName`，`108-114`）。
- 原始名只在 `tools/call` 线上发送，公开名从不被解析回原始名（README "Naming invariants" 引用；代码注释 `55-59`）。
- 同步是两阶段（fetch 全量 → swap）：先拉 `tools/list`（分页）构建新世代，成功才注销旧世代、注册新世代；注册冲突（外来工具抢占 `mcp__<serverName>__` 命名空间）整体回滚并报错（`139-168`）。监听 `notifications/tools/list_changed` 增量重同步（`451-459`）。

### 5.3 是否会向 MCP server 广播 roots？——**不会**

`Client` 构造为 `new Client({ name: "dsh-mcp-client", version: "0.0.1" }, { capabilities: {} })`（`436-439`）——**capabilities 是空对象，没有声明 `roots`**；整个包里没有任何 `roots`/`listRoots`/`ListRoots` 相关代码（已全文检索确认）。README "Known Limitations" 也写明 **"Tools are the only bridged MCP capability — Resources and Prompts have no harness consumer"**。含义见第 7 节。

### 5.4 `failOnStartupError` 与超时

- `failOnStartupError` 默认 **false**：首次连接/同步失败只记日志，插件照常激活（无工具注册），后续靠 reconnect 重试；为 true 时 `apply` 在 `connection.ready` 出错时 throw → fiber FAILED → 整个 DSH 启动失败（`590-608` + `dsh-app-boot` 的 `assertEntriesActivated`）。可配合 `reconnect.enabled: false` 做"严格模式"。
- `toolCallTimeoutMs` 默认 **60000**（`DEFAULT_TOOL_CALL_TIMEOUT_MS = 6e4`，`547`），作用于每次 `tools/call`（`callToolUncached`，`82-92`，同时挂 `exec.signal` 取消）。另外 MCP SDK 自己的 initialize/`tools/list` 默认也是 60 秒（README Known Limitations，DSH 尚未暴露连接/发现超时）。
- reconnect 默认全开：`{ enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 }`（`291-296`），指数退避，连上超过 `maxDelayMs` 会重置预算；耗尽后注销该 server 的全部工具，只能靠 HMR/重启恢复（`398-424`）。

---

## 6. API 稳定性与官方插件文档

### 6.1 版本状态

- 全部 `@deepseek-ai/dsh-*` 业务包为 **`0.1.0-rc.6`（预发布）**；被 vendor 进仓库的 Cordis 栈已过 1.x：`cordis@4.0.1`、`cordis-plugin-loader@1.0.2`、`cordis-plugin-include@1.0.6`、`cordis-plugin-group@1.0.1`、`cordis-plugin-timer@1.1.3`、`cordis-plugin-hmr@1.0.16`。
- 插件对宿主 API 的依赖是**严格 peer 锁定**的：`dsh-mcp-client` 的 peerDependencies 为 `cordis ^4.0.1`、`dsh-llm/dsh-invariants/dsh-subprocess/dsh-timeout/dsh-tools ^0.1.0-rc.6`（`dsh-mcp-client/package.json`）；`dsh-tool-skill` 同款。**rc 版本变动风险**：`dsh-tools` 的 ToolDefinition/事件名、`dsh-mcp-client` 的 Config 字段、`dsh-subprocess` 的 scrubbedParentEnv 语义都可能在 rc 迭代中变动；由于 peer range 用 `^0.1.0-rc.6`（0.x 的 caret 只锁 patch 段），配套包必须一起升。HMR/loader 还依赖 Node 22-24 的**内部模块加载器 API**（`internal.ts` 的 ModuleLoaderV1/V2，Node 22→24 有破坏性变更），这是框架侧最大的兼容风险面。
- 官方尚未把 rc 冻结为正式版，`dsh-app-boot` 中多处"FIXME: settle the intended rename"（如 `dsh-tool-call-timeout-policy/lib/index.js:8`）表明 API 仍在收尾。

### 6.2 官方插件开发文档（GitHub 仓库内，与 rc.6 代码同源）

- [Cordis tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md)：7 章实操，覆盖第一个插件、effect 生命周期、Service/inject、事件、配置（含 `!!js`）、组合与 HMR、注册真实工具。
- [Your first Harness plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)：最小插件 + `pnpm dsh web --patch ./scratch-plugin/cordis.yml` 加载进 Web UI（插件路径必须绝对）。
- [Build a tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md) 与 [Tool authoring reference（cookbook）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)：`defineTool` 完整契约（execute 规则、exec.signal、canonical value、presentCall/presentResult 卡片、后台任务、策略钩子）。
- [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：Loader Configuration 一节明确了 `!!js` 的求值位置（config/disabled，其他字段字面量）。
- mcp-client 代码注释引用了仓库内 Agent Note **"Naming invariants"**（`dsh-mcp-client/lib/index.js:55`）；仓库 `.agents/notes/` 有大量已实现特性的 Agent Note（见 [README](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/README.md)），是比 README 更细的行为规格来源。
- 生态参考（非官方）：[deepseek-harness-handbook](https://github.com/zoahdev/deepseek-harness-handbook)（中文实战手册）等。

---

## 7. 对集成方重要的 DSH 约束

1. **DSH 不广播 MCP Roots**（证据见 5.3）。对 Maker MCP 的直接后果：**每次调用必须显式传 `target_dir`/绝对路径参数**，服务器侧不能依赖客户端注入的 roots 发现工作区；DSH 也不会代填任何 workspace 路径。子进程 `cwd` 默认是 DSH 启动目录，但服务器**不知道**它是哪个目录（env 里无 `DSH_*`，见下），所以服务器端应从工具参数收路径，或要求用户在 `env` 里显式传（如 `WORKSPACE_ROOT`）。

2. **子进程环境 scrubbing（`scrubbedParentEnv`）**（`NM/@deepseek-ai/dsh-subprocess/lib/index.js:24-50`）：

```js
const DSH_ENV_PREFIX = 'DSH_';
const SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i; // 大小写不敏感
function scrubbedParentEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env))
    if (
      value !== undefined &&
      !SENSITIVE_ENV_PATTERN.test(key) &&
      !key.toUpperCase().startsWith('DSH_')
    )
      env[key] = value;
  return env;
}
```

任何名字含 KEY/PASSWORD/SECRET/TOKEN 的变量和全部 `DSH_*` 变量都不会隐式传给子进程。mcp-client 的子进程 env = `{...scrubbedParentEnv(), ...config.env}`（`dsh-mcp-client/lib/index.js:25-30`）——**显式写的 `env` 在 scrub 之后合并，所以显式传就能生效**。对 Maker MCP：`TAPTAP_MCP_CLIENT_SECRET`、`DEEPSEEK_API_KEY` 这类必须写进 mcp-client 行的 `env`，否则子进程拿不到。

3. **npx 沙箱问题**：DSH 对 `command: npx` 没有特殊处理（全库检索无 npx 逻辑），它只是一个普通 stdio 子进程。相关事实：(a) 子进程不在 DSH 的 fs sandbox 里（sandbox 只约束 DSH 自己的 bash/fs 工具，MCP 子进程是 DSH 进程的直接 child）；(b) 但环境被 scrub（见上），且 `npx -y` 首次运行需要网络下载包；(c) `dsh plugin` 转发 pnpm 时 git 源插件需要 `allowBuilds` 放行（`plugin-9h8shc4d.js:124`）。**注意**：以 `npx -y @taptap/instant-games-open-mcp` 方式运行的是"每会话临时下载"，若网络受限建议 `dsh plugin --profile web add @taptap/instant-games-open-mcp` 装进 profile 再用 `command: node, args: [<绝对路径>/bin/...]` 或包内 bin 启动，或直接 `npx --no-install`。

4. **超时**：MCP 工具调用默认 `toolCallTimeoutMs = 60000`（可配）；MCP SDK 的 initialize/`tools/list` 也是 60 秒默认（DSH 未暴露覆盖项）；服务器端对慢工具应自行流式返回或控制在 60 秒内。

5. **只桥接 tools**：MCP Resources/Prompts 无消费者（README Known Limitations），依赖资源发现的服务器（如想通过 `resources/list` 暴露文档）不会工作。

6. **HMR 双刃剑**：改 `cordis.patch.yml` 会热重载整行；mcp-client 行变化 = 断开重连（工具名不变则模型侧无感）。但改**服务器自己**的源码/配置不会触发 DSH 端任何动作——reconnect 只按原 command 重启。

---

## 8. 对第三方 MCP 服务器集成方的可行性结论

**结论：技术上完全可行，官方就是为此设计的，但要把以下细节一次做对。**

### 三条可选集成路径（由轻到重）

1. **零代码配置（推荐起步）**：在 `~/.dsh/profiles/web/cordis.patch.yml`（或 headless profile）加一行：

   ```yaml
   - insert:
       - id: mcp-taptap-maker
         name: '@deepseek-ai/dsh-mcp-client'
         config:
           serverName: taptap-maker
           transport: stdio
           command: npx
           args: ['-y', '@taptap/instant-games-open-mcp']
           env:
             WORKSPACE_ROOT: !!js process.cwd()
             TAPTAP_MCP_CLIENT_SECRET: !!js process.env.TAPTAP_MCP_CLIENT_SECRET
           cwd: !!js process.cwd()
           toolCallTimeoutMs: 120000 # 按需
           failOnStartupError: true # 可选严格模式
   ```

   `id` 任意（如 `mcp-taptap-maker`），`name` 必须是 `@deepseek-ai/dsh-mcp-client`。无需 npm 发布。
   示例中 `command/args` 仅为示意；**对 TapTap Maker MCP 不要用手写 npx**（DSH 沙箱下 npx 冷启动可能写不了默认 npm cache），应运行 `taptap-maker install` 自动写入稳定 self launcher（绝对 `node.exe` + `TAPTAP_MAKER_HOME/mcp-runtime/<version>/dist/maker.js`），或手动填绝对 Node + 已物化 bundle 路径。

2. **外部插件 bundle**：发布 `@taptap/dsh-taptap-maker`（或 `@yourorg/dsh-<name>`），`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 里 insert mcp-client 行 + 任意附加行；用户 `dsh plugin --profile web add @taptap/dsh-taptap-maker` 自动完成安装 + bundles 注册 + 层叠加（`reconcilePlugins` 自动处理）。也可把 Maker MCP 的 npm 包直接加进 profile 依赖，再用 `command: node <abs path>` 启动（避免 npx 网络依赖）。

3. **全功能插件**：直接写 Cordis 插件（`{ name, inject: ["tools", ...], Config, apply }`），在 `apply` 里 `ctx.tools.register(defineTool(...))` 注册自有工具、`ctx.effect` 管连接生命周期、必要时 `ctx.provide` 服务——不依赖 mcp-client 桥。适合"MCP 服务器 + DSH 原生能力（如 skill 目录、system prompt 段、agent preset）"组合发布。

### 必须避开的坑（均来自源码证据）

| 坑                                                                                                                                                        | 证据                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `serverName` 受 `^[A-Za-z0-9_-]{1,32}$` 约束且进程内唯一；连字符/下划线之外（如点、中文）直接配置报错                                                     | `dsh-mcp-client/lib/index.js:549,598`                 |
| 工具公开名 `mcp__<serverName>__<rawName>` 最多 64 字符，超长/含非法字符会被改写并加 hash——**工具名是公开契约，别依赖名字反推 server**（公开名从不被解析） | `108-114`                                             |
| **无 MCP Roots**：`target_dir` 等路径必须显式入参；服务器不要试图从 client 拿 workspace                                                                   | `capabilities: {}`，`436-439`                         |
| **env scrub**：`KEY/PASSWORD/SECRET/TOKEN/*` 与 `DSH_*` 不会自动进子进程，密钥/路径必须写在 `env` 里                                                      | `dsh-subprocess/lib/index.js:46-50`                   |
| patch 只按 id 覆盖整块 `config`（非 merge）；同一列表内重复 id 是硬错误；目标行缺失只是 warn（跨 profile 共享 overlay 时注意）                            | `include/src/index.ts:58-128`；`group.ts:62-65`       |
| `!!js` 只在 `config` 和 `disabled` 求值，其他字段是字面量；表达式作用域是该 row 的 ctx（可用 `process.env`、`dshHomePath()`）                             | `loader/src/index.ts:92-101`；教程 ch5                |
| peerDependencies 必须 `cordis ^4.0.1` + 用到的 `@deepseek-ai/dsh-* ^0.1.0-rc.6`（宿主闭包符号链接保证单实例；`dsh-base` 是模板）                          | `dsh-base/package.json`；`healProfilesModuleFallback` |
| rc 版本 API 可能变动：发布插件时把 peer range 写紧，并在 README 注明配套 rc 版本                                                                          | 第 6 节                                               |
| HMR：插件热更 = dispose + 重跑 apply，所有资源必须走 `ctx.effect` 注册 disposer；mcp-client 行被编辑会断连重连                                            | `cordis-plugin-hmr/lib/index.js:324-435`              |
| 工具 execute 必须遵守 DSH 规范：返回 `output.schema` 声明的 canonical JSON 值、`output.render` 转模型内容、尊重 `exec.signal`；抛出 = isError             | `dsh-tools/lib/types/index.d.ts:119-171`；cookbook    |
| 默认每次 `tools/call` 60 秒超时；服务器慢操作要拆分/流式                                                                                                  | `DEFAULT_TOOL_CALL_TIMEOUT_MS`                        |

**一句话总结**：DSH 的插件体系 = "Cordis 4 插件 + YAML patch 层合成"，官方教程、示例、cookbook 齐全；对 Maker MCP 而言，最省事的是路径 1（一行 mcp-client 配置 + 显式 env/cwd），要"正式产品化"则走路径 2（`dsh.bundle` manifest + `dsh plugin --profile` 一键安装），需要超出 tools 的能力（skill/预设/自定义服务）再走路径 3 写原生插件。
