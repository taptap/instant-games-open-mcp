# Windows 本地验证分支验收说明

本文给 Windows 环境的开发 AI 使用。目标是拉取本次本地验证改动，完成构建和验收，不要把 macOS 已通过直接当成 Windows 已通过。

## 1. 需要拉取的分支

两个仓库都使用同名分支：

| 仓库 | 远端 | 分支 | 本次提交 |
| --- | --- | --- | --- |
| Maker MCP | `git@github.com:taptap/instant-games-open-mcp.git` | `fix/local-validation-phase-one` | `2062d2bcbe84e15ff16c4646b72b3f658a391455` |
| UrhoXRuntime | `git@github.com:taptap/urhox.git` | `fix/local-validation-phase-one` | `ecb76d38847652b866a5380aff8aee4afd1342ef` |

在两个仓库分别执行：

```bash
git fetch origin
git switch fix/local-validation-phase-one
git pull --ff-only origin fix/local-validation-phase-one
git rev-parse HEAD
```

`git rev-parse HEAD` 必须分别得到上表中的提交号。不要在 `main` 上测试，也不要把两个仓库的分支混用。

## 2. 本次改动内容

### Maker MCP

- 开放 macOS 本地 `run-lua-validate` Skill 分发。
- 增加本地一次性验证入口：
  - `preview validate --mode validate`
  - `preview validate --mode screenshot`
  - `preview validate --mode both`
- 验证结果保留 `validate.json`、运行日志、截图、实际调用参数和准备日志。
- 截图必须检查真实 PNG，不接受空文件、损坏 PNG 或旧 loading 截图。
- 旧 Runtime 缺少 `-screenshot-after-start` 时返回 `UNSUPPORTED`，并返回：
  - `upgrade_required: true`
  - `required_capabilities`
  - `upgrade_message`
- `both` 模式即使截图能力不可用，也保留已经生成的 validate 报告。

### UrhoXRuntime

- 新增 `-screenshot-after-start`。
- 游戏脚本及 `Start()` 成功后才开始截图帧计数，避免截到 loading 页面。
- 增加截图能力状态日志和截图写盘错误日志。
- 修复 macOS/Metal 截图请求时机。
- 没有新增新的 validate 协议或新的验证类别。

## 3. Windows 代码测试

### 3.1 Maker MCP

在 MCP 仓库根目录执行：

```powershell
npm ci
npm test -- --runInBand
npm run build
npm run lint
npm run maker:codex-plugin:prepare
npm run maker:workbuddy-plugin:prepare
```

预期：

- Jest 全部通过。
- MCP、Maker、Codex 插件和 WorkBuddy 插件构建成功。
- 两个插件生成的 `dist/maker.js` 都包含本地验证和旧 Runtime 兼容逻辑。

重点回归 `src/__tests__/makerPreview.test.ts`：

- `validate` 能生成并检查 JSON 报告。
- `screenshot` 能检查真实 PNG。
- `both` 同时返回报告和截图。
- 旧 Runtime 不会被误判为截图 PASS。
- 旧 Runtime 的 `both` 结果保留 validate 报告并要求升级。

### 3.2 UrhoXRuntime 静态契约测试

在 UrhoXRuntime 仓库根目录执行：

```powershell
python engine\Tests\Integration\validate\test_screenshot_contract.py -v
python -m unittest discover -s ai-dev-kit\tools\tests -p test_local_validate_distribution.py -v
```

Windows 上 Skill 分发测试中，macOS 专用安装测试可以跳过；不能把这个跳过结果当成 Windows Skill 已支持。

### 3.3 Windows Runtime 构建

按照 UrhoXRuntime 仓库现有 Windows 构建流程生成 Agent 工程，然后构建 Release Runtime：

```powershell
tools\generators\gen_vs_agent.bat
cmake --build build_agent --target UrhoXRuntime --config Release
```

如果本机仓库已经存在有效的 `build_agent`，只需重新配置后执行构建。不要删除或覆盖其他开发 AI 的构建目录。

构建完成后确认存在：

```text
build_agent\bin\Release\UrhoXRuntime.exe
```

实际路径以本机 CMake 配置输出为准。

## 4. 本地验证验收

准备一个已绑定的、单机项目，不能使用多人、server 或云端依赖项目。先确认没有常驻预览占用：

```powershell
taptap-maker preview status --target-dir "C:\absolute\path\to\game" --json
```

确认状态为停止后，依次执行：

```powershell
taptap-maker preview validate --mode validate --target-dir "C:\absolute\path\to\game" --json
taptap-maker preview validate --mode screenshot --target-dir "C:\absolute\path\to\game" --json
taptap-maker preview validate --mode both --target-dir "C:\absolute\path\to\game" --json
```

测试时可以通过 `--runtime` 指定刚构建的 Runtime：

```powershell
taptap-maker preview validate `
  --mode both `
  --target-dir "C:\absolute\path\to\game" `
  --runtime "C:\absolute\path\to\UrhoXRuntime.exe" `
  --json
```

每次都要检查 CLI 返回的：

- `result`
- `report`
- `artifacts`
- `log_path`
- `invocation_path`
- `evidence_directory`

验收标准：

| 场景 | 预期 |
| --- | --- |
| 新 Runtime + `validate` | `PASS`，有有效 `validate.json` |
| 新 Runtime + `screenshot` | `PASS`，有非空有效 PNG |
| 新 Runtime + `both` | `PASS`，同时有报告和 PNG |
| 旧 Runtime + `validate` | 只要旧 Runtime 原有 validate 能力正常，可以通过 |
| 旧 Runtime + `screenshot` / `both` | `UNSUPPORTED`，不能伪造 `PASS`，并提示升级 Runtime |
| 多人或 server 项目 | `UNSUPPORTED`，不能降级成离线验证 |
| Lua 错误、资源错误、缺报告、损坏截图 | `FAIL`，不能改写成 `PASS` |

## 5. Windows Skill 边界

当前 UrhoXRuntime 的 `.installer/local-skill-filter.json` 仍然把以下 Skill 排除在 Windows 外：

```text
run-lua-headless
run-lua-validate
```

这是当前分支的明确配置，不是安装失败。Windows 验收时：

- 不要手工修改过滤名单。
- 不要把 macOS 的 Skill 分发测试结果当成 Windows 支持结论。
- 可以直接使用 MCP CLI 和构建出的 Runtime 验证 MCP 逻辑。
- 如果产品要求 Windows 也能自动安装 `run-lua-validate`，那是另一个需求，需要单独修改过滤配置并重新做 Windows Runtime 验收。

## 6. 验收结果回报格式

Windows 开发 AI 完成后请回报：

```text
Maker MCP:
- 分支和 HEAD:
- npm test:
- npm run build:
- npm run lint:
- Codex/WorkBuddy plugin prepare:

UrhoXRuntime:
- 分支和 HEAD:
- Runtime 构建:
- screenshot contract tests:
- Skill distribution tests:

实际验证:
- validate:
- screenshot:
- both:
- 旧 Runtime 兼容:
- 生成的 report/log/screenshot 路径:
- 失败原因或未覆盖项:
```

任何一个构建、测试或实际验证失败，都不要回报“Windows 验收通过”；附上失败命令、完整错误和对应证据路径。
