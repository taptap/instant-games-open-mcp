# Maker Python Runtime Windows Test Guide

## 背景

Maker 本地开发当前只能把代码提交到远端 server 构建。本地缺少 Lua 编译/诊断环境时，远端构建失败后，用户和本地 AI 很难快速定位 Lua 语法或依赖问题。

server 侧会提供 `maker-lua-lsp` 安装脚本，并自带 `luac`。本分支不负责安装 LSP 或 luac，只解决 LSP 之前的 Python 运行时准备问题。

## 需求

- 用户已有 Node/npx，因为 Maker MCP 本身依赖 npx 启动。
- 不要求用户手动安装系统 Python、pip、Homebrew 或 winget。
- Windows 是重点支持环境。
- Windows 上不能触发 Microsoft Store 的 `python.exe` app execution alias。
- 如果用户已有可信 Python，就复用它。
- 如果没有可信 Python，就自动准备 Maker 私有 Python。
- Python 最低支持版本是 3.8，推荐 3.12 或更新。
- Python 缺失不能阻塞 Maker MCP 的主状态、提交、推送和远端构建流程。

## 当前实现

新增 Maker Python runtime 模块：

- `src/maker/system/python.ts`

新增 CLI 命令：

```bash
taptap-maker python doctor
taptap-maker python setup
taptap-maker python path
```

策略：

1. 优先检测可信系统 Python。
   - Windows 优先使用 `py -3`。
   - Windows 会识别并拒绝 `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`。
   - macOS 会跳过 Apple/Xcode/Command Line Tools 自带 Python。
2. 如果 Python + pip 可用，记录真实 Python 路径。
3. 如果 Python 低于 3.8，状态为 `version_unsupported`，提示运行 setup。
4. 如果 Python 是 3.8 到 3.11，状态为 `ready`，但会提示推荐 3.12 或更新。
5. 如果不可用，`taptap-maker python setup` 会：
   - 下载 uv 到 `~/.taptap-maker/bin/`。
   - 使用 uv 安装 Python 3.12 managed Python 到 `~/.taptap-maker/python/uv/`。
   - 写入 `~/.taptap-maker/python.json`。
6. `maker://status` 和 `maker_status_lite` 会输出 `Python environment`。
7. `maker_build_current_directory` 的 tool description 会引导 AI 在本地 Lua 诊断需要 Python 时先运行 setup，但缺 Python 不阻塞远端构建。

## 测试包

本机已构建测试 tgz：

```text
packages/maker/taptap-maker-0.0.0-python-runtime.0.tgz
```

包信息：

- npm package：`@taptap/maker`
- 测试版本：`0.0.0-python-runtime.0`
- tgz 大小：约 282 KB
- 包内不包含 uv 或 Python runtime；首次 `python setup` 时实时下载并缓存。

## Windows 测试步骤

把 tgz 拷贝到 Windows 测试机，例如：

```powershell
C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz
```

### 1. 验证 CLI 可启动

```powershell
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker help
```

预期：

- 输出包含 `taptap-maker python doctor`
- 输出包含 `taptap-maker python setup`
- 输出包含 `taptap-maker python path`

### 2. 检查 Python 状态

建议先使用临时 Maker home，避免污染正式账号缓存：

```powershell
$env:TAPTAP_MAKER_HOME="$env:TEMP\taptap-maker-python-test"
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker python doctor --json
```

可能结果：

- `status: "ready"`：已有可信 Python 和 pip，可直接用。
- `status: "store_alias_only"`：只检测到 Windows Store alias，需要 setup。
- `status: "missing"`：没有可用 Python，需要 setup。
- `status: "pip_missing"`：Python 存在但 pip 不可用，建议 setup。
- `status: "version_unsupported"`：Python 低于 3.8，必须 setup。

状态中还会包含：

- `python_version_requirement: >=3.8`
- `recommended_python_version: >=3.12`

### 3. 自动准备 Maker 私有 Python

```powershell
$env:TAPTAP_MAKER_HOME="$env:TEMP\taptap-maker-python-test"
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker python setup --json
```

预期：

- 下载 uv 到 `$env:TAPTAP_MAKER_HOME\bin\uv.exe`
- 下载 Python 3.12 managed Python 到 `$env:TAPTAP_MAKER_HOME\python\uv\`
- 输出 `environment.status: "ready"`
- 输出 `environment.provider: "uv-managed"`

### 4. 获取 Python 路径

```powershell
$env:TAPTAP_MAKER_HOME="$env:TEMP\taptap-maker-python-test"
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker python path
```

预期：

- 只输出一行真实 Python 路径。
- 路径应该位于 `$env:TAPTAP_MAKER_HOME` 下，或是可信系统 Python。

### 5. 验证 MCP status 引导

在 Maker 项目目录下运行：

```powershell
$env:TAPTAP_MAKER_HOME="$env:TEMP\taptap-maker-python-test"
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker doctor
```

预期：

- 输出包含 `Python environment`
- 如果 Python 缺失，`next_action` 提示 `taptap-maker python setup`
- 仍然继续展示 Git、Auth、Project、AI dev kit 等状态

## 在 AI 客户端里测试本地 tgz

如果需要让 Codex/Cursor/Claude 临时使用这个 tgz，不要运行 `taptap-maker mcp install` 覆盖正式配置；它会写入线上包名 `@taptap/maker`。

测试时手动配置 MCP command 更安全：

```json
{
  "command": "npx.cmd",
  "args": ["-y", "-p", "C:\\Temp\\taptap-maker-0.0.0-python-runtime.0.tgz", "taptap-maker"],
  "env": {
    "TAPTAP_MCP_ENV": "rnd"
  }
}
```

Windows 必须使用 `npx.cmd`。

## 排障

### npm cache 报权限错误

可以指定临时 cache：

```powershell
npx --cache "$env:TEMP\npm-cache-maker-test" -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker help
```

### uv 下载失败

常见原因：

- 公司网络或代理拦截 `https://astral.sh/uv/install.ps1`
- PowerShell 无法访问外网
- 安全软件拦截新下载的 `uv.exe`

这种情况下，`python doctor` 和 Maker MCP 主流程仍应可用；只是本地 Lua 诊断所需 Python 尚未 ready。

### Windows Store alias

如果输出 `store_alias_only`，说明检测到的是 Windows 的商店占位 `python.exe`，不是可用 Python。继续运行：

```powershell
npx -y -p C:\Temp\taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker python setup --json
```

## 已完成的本地验证

```bash
npm run format:check
npm run lint
npm run build
npm test -- makerPythonRuntime.test.ts makerCliCommands.test.ts makerBuildLocalChanges.test.ts --runInBand
npx -y -p ./packages/maker/taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker help
npx -y -p ./packages/maker/taptap-maker-0.0.0-python-runtime.0.tgz taptap-maker python doctor --json
```

结果：

- build 通过
- 相关 Jest 3 个 test suites、132 个 tests 通过
- tgz CLI help 可执行
- tgz `python doctor --json` 可执行
