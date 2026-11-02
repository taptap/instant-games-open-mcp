# macOS / Windows 执行说明

仅在要执行相应命令时读对应节。路径均由本机发现；命令模板中的占位路径必须替换。
不依赖 /Users/...、/tmp、Homebrew 或某台 Windows 盘符。Node 脚本用 node:path/
node:os 和 pathToFileURL；不要手工拼 file:/// 或把 Windows 路径反斜线当转义文本。

## 工具

两平台：Node（满足两仓实际 engines）、npm、Git、tar。正式包脚本额外需要 Bash、
zip/unzip、jq（以当前脚本为准）。Windows 可用已安装 Git Bash 或 WSL，明确哪一端
运行 Git/Node，以及盘符路径到 WSL 的映射，别混用两端进程/凭证目录。
macOS 自带旧 Bash 可能无法运行使用 Bash4 语法的发布测试；按实际脚本选择兼容 Bash
或 CI，不删测试。PowerShell 中 npm.cmd 与 npm 按本机解析情况使用；进程里调用 npm
须遵循本机 .cmd 启动语义，不能为省事把用户输入拼入 shell。

## 构建与打包

以下均在**隔离的 Maker 源码副本根目录**执行；版本仅为明确的本地测试示例，
不是要求将下次正式版本写成这个值。现有构建脚本可通过 MAKER_BUNDLE_OUTFILE
改输出位置，但 prepare-maker-package.js 固定读取 dist/maker.js，不能因此拿错旧 bundle。

macOS/Linux：

```bash
MAKER_PACKAGE_VERSION=0.0.40-local.1 node scripts/bundle-maker.js
node scripts/prepare-maker-package.js --version 0.0.40-local.1
```

Windows PowerShell（只在当前进程临时设置，执行后恢复原值）：

```powershell
$makerPriorVersion = $env:MAKER_PACKAGE_VERSION
try {
  $env:MAKER_PACKAGE_VERSION = '0.0.40-local.1'
  node scripts/bundle-maker.js
  if ($LASTEXITCODE -ne 0) { throw 'Maker bundle build failed' }
  node scripts/prepare-maker-package.js --version 0.0.40-local.1
  if ($LASTEXITCODE -ne 0) { throw 'Maker package assembly failed' }
} finally {
  $env:MAKER_PACKAGE_VERSION = $makerPriorVersion
}
```

逐命令确认成功后，在该副本 packages/maker 执行：

```text
npm pack --dry-run --ignore-scripts
npm pack --ignore-scripts --pack-destination <已创建的仓库外证据目录>
```

正式发布的 source/tag/版本与 integrity 依当前仓库发版协议核对；本工作流不运行
npm publish，也不改主包版本来给 Maker-only 产物命名。

## 哈希与只读历史

以下 Node 命令两平台可用，打印文件 SHA-256 和 SRI SHA-512，不执行包内容：

```text
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; const b=readFileSync(process.argv[1]); console.log(createHash('sha256').update(b).digest('hex')); console.log('sha512-'+createHash('sha512').update(b).digest('base64'));" "<实际文件路径>"
```

历史核查脚本从本 Skill 根相对解析台账，--plugins 必须给真实插件仓库。
支持含空格/中文路径；不依赖 cwd 是哪个仓库，不修改 refs，也不自动 fetch。
其 exit=1 可表示浅历史/有候选未归档，不等于已发现产品缺陷；先看 JSON 原因。

## 隔离进程

创建仓库外临时目录（Node 的 os.tmpdir 或本机临时目录），
开发 CLI 启动环境使用 TAPTAP_MAKER_HOME 指向本次目录；不要改全局 Shell profile。
Console/preview 调用用同一精确绝对入口与 home。PowerShell 用 try/finally 恢复
环境变量；原有 Maker home 的凭证、锁、session 不复制到测试目录。

纯状态测试需要现有账号时只在已授权的真实 home 读取，不启动/停止其已有服务。
Windows 服务/游戏窗口与 Mac 分别记录；不要用 WSL 的 Node 运行成功声称
Windows Electron/原生 UrhoX 已通过。
