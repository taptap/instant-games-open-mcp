# CI/CD 和发布

本文档说明 TapTap MCP Server 的 CI/CD 流程和发布机制。主包 npm 发布不允许由 PR
合并或分支 push 自动触发，必须由人工在 GitHub Actions 页面手动运行 workflow。

## 目录

1. [概述](#1-概述)
2. [分支策略](#2-分支策略)
3. [开发工作流](#3-开发工作流)
4. [版本号规则](#4-版本号规则)
5. [CI/CD 工作流](#5-cicd-工作流)
6. [配置文件](#6-配置文件)
7. [环境变量和 Secrets](#7-环境变量和-secrets)
8. [手动操作](#8-手动操作)
9. [版本管理](#9-版本管理)
10. [Release PR 门禁说明](#10-release-pr-门禁说明)

---

## 1. 概述

项目采用 **GitHub Flow + Semantic Release** 管理版本分析和发布产物，但主包 npm
发布入口必须手动触发。

### 核心特性

- ✅ 基于 Conventional Commits 自动计算版本号
- ✅ 自动生成 CHANGELOG.md
- ✅ 人工触发后发布到 npm
- ✅ 自动创建 GitHub Release
- ✅ 完整的 PR 检查（lint、build、test、commitlint）

### 发布流程图

```
人工运行主包发布 workflow
    ↓
读取 npm latest 并解析目标版本
    ↓
创建 release 分支（release/vX.X.X）
    ↓
在 release 分支：
  - 更新 package.json 版本号
  - 生成/更新 CHANGELOG.md
  - Git commit 和 tag
  - 发布到 npm
    ↓
自动创建 PR（release → main）
    ↓
创建 release PR
    ↓
创建 GitHub Release
```

---

## 2. 分支策略

### 分支结构

```
main          # 稳定版本（1.2.3）- 受保护
├── beta      # Beta 测试版（1.3.0-beta.1）
├── alpha     # Alpha 早期版（1.3.0-alpha.1）
├── next      # 下一个主版本（2.0.0-next.1）
└── 1.x       # 旧版本维护（1.2.4）
```

### 分支保护规则

- **`main` 分支受组织级 Ruleset (trunk-guard) 保护**
- 所有更改必须通过 PR 合并
- PR 必须通过所有 CI 检查
- Commit 消息必须符合 Conventional Commits 规范

### 主包发布机制

主包自动发布已禁用。PR 合并到 `main`、`beta` 或 `alpha` 不会自动发布 npm。

1. **人工触发 workflow** → 在 GitHub Actions 页面运行主包发布 workflow
2. **解析版本** → 留空时基于 npm `latest` 只递增 patch
3. **创建 release 分支** → `release/vX.X.X`
4. **发布到 npm** → 在 release 分支更新版本
5. **生成 CHANGELOG** → 自动生成版本说明
6. **自动创建 PR** → release 分支 → main
7. **创建 GitHub Release** → 添加 tag 和 release notes

---

## 3. 开发工作流

### 3.1 开发新功能

```bash
# 1. 从 main 创建 feature 分支
git checkout main
git pull origin main
git checkout -b feature/awesome-feature

# 2. 开发并提交（使用规范格式）
git add .
git commit -m "feat: add awesome new feature"

# 3. 推送到远程
git push origin feature/awesome-feature

# 4. 在 GitHub 创建 PR
# 5. 等待 CI 检查通过
# 6. 请求 Code Review
# 7. 合并后不会自动发布 npm；需要发布时人工运行 GitHub Actions workflow
# 版本变更：1.2.0 → 1.3.0 (minor)
```

### 3.2 修复 Bug

```bash
# 1. 创建 fix 分支
git checkout -b fix/critical-bug

# 2. 修复并提交
git commit -m "fix: resolve critical security issue"

# 3. Push 并创建 PR
git push origin fix/critical-bug

# 4. 合并后不会自动发布 npm；需要发布时人工运行 GitHub Actions workflow
# 版本变更：1.2.0 → 1.2.1 (patch)
```

### 3.3 发布 Maker Beta 版本

Maker Beta 用于内部预览测试，走 `@taptap/maker@beta` dist-tag，不会创建 release PR，
也不会把 `package.json` / `CHANGELOG.md` 的版本变更写回仓库。
注意：npm 包仍发布到 public registry，`@beta` 不是访问控制；beta 包必须按对外发布标准处理，
不能包含 RND 凭证、内部账号 Token 或未公开的敏感配置。

```bash
# 1. Maker 修复通过 PR 合并到 beta 或 main
# 2. 人工运行 Publish Maker Package workflow
#    - Use workflow from: beta
#    - Version mode: auto-last-number
#    - tag: beta
#    - version 留空

# 3. 用户安装 Maker beta 版本
npm install @taptap/maker@beta
npx -y @taptap/maker@beta init

# 4. 测试稳定后，再通过 PR 将对应修复同步到 main
```

产品侧 Maker MCP 配置可以直接使用 beta 包：

```json
{
  "mcpServers": {
    "taptap-maker-beta": {
      "command": "npx",
      "args": ["-y", "@taptap/maker@beta", "mcp"],
      "env": {
        "TAPTAP_MCP_ENV": "rnd",
        "TAPTAP_MCP_CLIENT_ID": "your_rnd_client_id",
        "TAPTAP_MCP_CLIENT_SECRET": "your_rnd_client_secret",
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

> RND 凭证只在 MCP 客户端配置或受控环境变量中注入，不要提交到仓库。

### 3.4 重要注意事项

- ✅ **始终在 feature/fix 分支工作**，不要直接 commit 到 main
- ✅ **不要在正常 PR commit 中使用 `[skip ci]`、`[ci skip]`、`[skip actions]` 等跳过指令**
- ✅ **Commit 类型决定版本号**：
  - `feat:` → minor 版本 (1.2.0 → 1.3.0)
  - `fix:` → patch 版本 (1.2.0 → 1.2.1)
  - `feat!:` / `fix!:` → major 版本 (1.2.0 → 2.0.0)
  - `docs:` / `ci:` / `chore:` → 不触发发布
- ✅ **发布完全自动化**，无需人工干预
- ✅ **符合组织 Ruleset**，所有更改通过 PR
- ✅ 如果历史手动发包导致 npm 已存在目标 patch 版本但 Git tag 缺失，正式发布 job 会自动选择同一 major/minor 下的下一个可用 patch 版本，避免 npm publish 撞版本。

---

## 4. 版本号规则

Semantic Release 根据 commit 类型自动计算版本号（遵循 [Semantic Versioning](https://semver.org/)）。

### 4.1 版本变更规则

| Commit 类型                       | 版本变更 | 示例          |
| --------------------------------- | -------- | ------------- |
| `feat:`                           | Minor    | 1.2.0 → 1.3.0 |
| `fix:`                            | Patch    | 1.2.0 → 1.2.1 |
| `feat!:` 或 `BREAKING CHANGE:`    | Major    | 1.2.0 → 2.0.0 |
| `docs:`, `chore:`, `test:`, `ci:` | 无变更   | 不触发发布    |
| `refactor:`, `perf:`              | Patch    | 1.2.0 → 1.2.1 |

### 4.2 混合 Commit 优先级

当 PR 包含多个 commits 时，取**最高优先级**的版本变更：

```bash
# PR 包含多个 commits
git commit -m "fix: bug fix 1"        # patch
git commit -m "feat: new feature"      # minor
git commit -m "feat!: breaking change" # major

# 最终版本变更：Major（因为有 feat!）
# 1.2.0 → 2.0.0
```

**优先级排序**：Major > Minor > Patch

### 4.3 Conventional Commits 规范

**格式**：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Type 类型**：

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新增功能，也不是修复bug）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动
- `ci`: CI 配置变更

**示例**：

```bash
✅ feat: add cloud save support
✅ fix(auth): resolve token refresh issue
✅ feat!: change API endpoint structure
✅ docs: update README installation guide
❌ Added new feature  # 缺少 type
❌ fix: bug.          # 以句号结尾
❌ feat: fix          # 太短（< 5 字符）
```

**Breaking Changes**：

```bash
# 方式 1：使用 ! 标记
git commit -m "feat!: remove deprecated API"

# 方式 2：使用 footer
git commit -m "feat: new API structure

BREAKING CHANGE: old API endpoints have been removed"
```

---

## 5. CI/CD 工作流

### 5.1 PR 检查工作流

**文件**：`.github/workflows/pr.yml`

**触发条件**：PR 创建或更新时自动运行

**检查项目**：

- ✅ **Lint** - ESLint 代码风格检查
- ✅ **Build** - TypeScript 编译检查
- ✅ **Test** - Jest 单元测试
- ✅ **Commitlint** - Commit 消息格式验证

**所有检查通过才能合并。**

**本地验证**：

```bash
# 运行所有检查
npm run lint      # 代码检查
npm run build     # 构建
npm test          # 测试

# 验证 commit 消息
node scripts/check-no-ci-skip.cjs --from HEAD~1 --to HEAD
npx commitlint --from HEAD~1 --to HEAD
```

### 5.2 主包手动发布工作流

**文件**：`.github/workflows/release.yml`

**触发条件**：只能从 `main` 手动运行 `workflow_dispatch`

**页面参数**：

- `version` 可留空；留空时默认读取 npm `latest`，只递增 `x.y.z` 中的 `z`。
- 只有需要手动指定版本时才填写 `version`，格式必须是稳定三段版本，例如 `1.24.7`。
- 如果手动版本修改了 `x` 或 `y`，预检 Summary 会展示当前线上版本和目标版本，发布 job
  必须经过 `npm_publish` protected environment 人工审批后才能继续。

**执行步骤**：

1. **解析版本** - 从 npm `latest` 读取当前线上版本，默认只递增 patch。
2. **预检 Summary** - 展示当前线上版本、目标版本、是否修改 major/minor。
3. **质量检查** - 运行 lint、format check、build、test。
4. **生成发布产物** - 更新 `package.json`，生成主包 CHANGELOG / Release notes。
5. **发布到 npm** - 发布 `@taptap/instant-games-open-mcp@latest`。
6. **创建 release PR** - 写回 `package.json` / `package-lock.json` / `CHANGELOG.md`。
7. **创建 GitHub Release** - release PR 合并后创建 tag 和 GitHub Release。

**npm 发布策略**：

- ⚠️ **不使用 Provenance**（npm Provenance 仅支持 public 仓库，当前仓库为 internal）
- ✅ 使用 **Automation Token** 绕过 2FA
- ✅ 完整的 CI/CD 质量检查

### 5.3 主包 Beta 发布

主包 `@taptap/instant-games-open-mcp` 的旧 beta 发布 job 已关闭。需要 beta 验证时，
优先使用 Maker 独立包的 `Publish Maker Package` workflow 发布 `@taptap/maker@beta`。

### 5.4 Maker 独立包发布工作流

**文件**：`.github/workflows/publish-maker.yml`

**包名**：`@taptap/maker`

**触发条件**：手动运行 workflow

**认证方式**：

- 优先使用 npm Trusted Publishing / GitHub OIDC。
- workflow 必须保留 `permissions.id-token: write`。
- `npm publish --provenance` 失败时 fallback 到不带 provenance 的 `npm publish`。

**执行步骤**：

1. 运行 `npm ci`、`npm run lint`、`npm test`
2. 解析并校验目标版本号
3. 构建 Maker-only bundle
4. 组装 `packages/maker`
5. `npm pack --dry-run`
6. 用 tarball 验证 `taptap-maker help`
7. `npm publish` 前再次查询目标版本，避免审批等待期间同版本被抢先发布。
8. 使用 `npm publish --provenance` 发布到指定 dist-tag。

**设计约束**：

- 不走旧包的 semantic-release。
- 主包和 Maker 包都必须手动发版；PR 检查不再按 Maker/main 路径做发布范围拦截。
- 主包 release workflow 不会由 Maker PR 合并自动触发。
- 旧包 semantic-release 分析、CHANGELOG 和 GitHub Release notes 会过滤 Maker-only commits。
- workflow 默认使用 `auto-last-number`，通常只需要选择分支后直接运行。
- 手动版本号只在需要指定版本时填写。
- Maker 包只能从长期发布分支 `beta` 或 `main` 发布；`fix/*` 分支只用于提交 PR，
  不作为发版来源。
- 自动版本号只允许在 `beta` 或 `main` 分支上递增最后一个数字段。
- 手动发布如果修改三段版本号里的前两段，CI 会先在 Actions Summary 显示当前
  线上 dist-tag 版本和目标版本，再由人工点击 protected environment 审批按钮继续。
- 发布 job 在实际 `npm publish` 前会再次检查目标版本是否仍未发布。
- 如果带 provenance 和不带 provenance 的发布都失败，workflow 必须失败并停止。

### 5.5 主包与 Maker 包发布隔离

`@taptap/instant-games-open-mcp` 和 `@taptap/maker` 使用隔离的发布边界：

- 主包发布由 `.github/workflows/release.yml` 负责。
- Maker 包发布由 `.github/workflows/publish-maker.yml` 负责。
- 主包 npm 只发布主 MCP 和 proxy 入口，不包含 `taptap-maker` CLI、Maker-only bundle
  或 Maker skills；这些文件由 `@taptap/maker` 独立发布。
- Maker 相关 PR 建议继续使用 Conventional Commit scope 标记，例如
  `fix(maker): repair local build`，便于审查和日报周报追踪。
- PR 可以同时整理 root `README.md` 中的 Maker 对外使用说明；这不会自动触发主包发布。
- 发布边界由手动 workflow 控制：主包只能从 `main` 运行
  `.github/workflows/release.yml`，Maker 包只能从 `main` 或 `beta` 运行
  `.github/workflows/publish-maker.yml`。
- `package.json`、`.releaserc.cjs` 和 release workflow 等共享发布配置仍建议单独 PR，
  但该限制作为团队流程要求，不再由 PR Check 自动拦截。

Maker 包版本号使用三段式 semver，例如 `0.0.1`。CI 自动递增默认在 `beta` 或 `main`
分支使用 `auto-last-number`，且只递增最后一个数字段；如果当前 dist-tag 落后于已发布
稳定版本，CI 会跳过已存在版本并选择同 major/minor 下未发布的下一个 patch。手动发布
如果要改变 major 或 minor，CI 会在预检 job 的 Actions Summary 展示当前线上
dist-tag 版本和目标版本，人工核对后点击
protected environment 审批按钮继续发布。
beta 发布建议使用 `0.0.6-beta.1` 这类 prerelease 版本和 `tag=beta`，正式发布使用稳定三段
版本和 `tag=latest`，两者保持相同的 npm pack、CLI 验证和 publish 流程。

---

## 6. 配置文件

### 6.1 Semantic Release 配置

**文件**：`.releaserc.js`

```javascript
module.exports = {
  branches: [
    'main',
    { name: 'beta', prerelease: true },
    { name: 'alpha', prerelease: true },
    { name: 'next', prerelease: true },
  ],
  plugins: [
    './scripts/semantic-release-main-analyzer.cjs',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
    '@semantic-release/git',
  ],
};
```

### 6.2 Commitlint 配置

**文件**：`.commitlintrc.js`

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci'],
    ],
    'subject-min-length': [2, 'always', 5],
    'subject-max-length': [2, 'always', 100],
  },
};
```

### 6.3 GitHub Actions 工作流

**PR 检查**：`.github/workflows/pr.yml`
**主包手动发布**：`.github/workflows/release.yml`

---

## 7. 环境变量和 Secrets

### 7.1 必需的 Secrets

需要在 **GitHub 仓库设置**中配置：**Settings → Secrets and variables → Actions**

#### NPM_TOKEN（必需）

- **用途**：发布到 npm
- **类型**：**Automation Token**（可绕过 2FA）
- **创建步骤**：
  1. 登录 https://www.npmjs.com/
  2. 进入 **Access Tokens** 页面
  3. 点击 **"Generate New Token"**
  4. 选择 **"Automation"** 类型
  5. 勾选 **"Bypass 2FA"**
  6. 复制 token 并添加到 GitHub Secret

### 7.2 自动提供的 Secrets

以下 secrets 由 GitHub 自动提供，无需配置：

- **`GITHUB_TOKEN`** - GitHub API 令牌
  - 用于创建 PR、合并、创建 Release
  - 自动注入到 GitHub Actions 环境

### 7.3 Permissions 要求

**GitHub Actions 权限配置**：

```yaml
permissions:
  contents: write # 创建 commit 和 tag
  issues: write # 发布说明
  pull-requests: write # 创建和合并 PR
  id-token: write # GitHub OIDC（未来可能需要）
```

---

## 8. 手动操作

### 8.1 安装依赖

```bash
npm install
```

这会安装所有 CI/CD 相关的依赖：

- `semantic-release` - 自动化发布
- `@commitlint/cli` - Commit 消息检查
- `@semantic-release/*` - 各种插件

### 8.2 本地验证 Commit 消息

```bash
# 检查最近的 commit
npx commitlint --from HEAD~1 --to HEAD

# 检查多个 commits
npx commitlint --from HEAD~5 --to HEAD
```

### 8.3 本地测试版本解析

```bash
# 需要能访问 npm registry，只解析版本，不发布
GITHUB_REF_NAME=main node scripts/resolve-main-release-version.js
```

**输出示例**：

```
Current online @taptap/instant-games-open-mcp@latest version: 1.24.5
Resolved @taptap/instant-games-open-mcp version: 1.24.6
Version mode: auto-last-number
Major/minor changed: false
```

---

## 9. 版本管理

### 9.1 语义化版本（Semantic Versioning）

项目遵循 [Semantic Versioning 2.0.0](https://semver.org/)：

- **Major 版本（X.0.0）**：不兼容的 API 变更
- **Minor 版本（1.X.0）**：向后兼容的功能性新增
- **Patch 版本（1.0.X）**：向后兼容的问题修正

### 9.2 版本号计算

- ✅ 版本号由 workflow 计算，**不需要手动修改** `package.json`
- ✅ 默认由 npm `latest` 自动计算下一个 patch
- ✅ 手动填写版本时，major/minor 变化必须经过 protected environment 审批
- ❌ 不要手动修改版本号

### 9.3 预发布版本

**Beta 版本**：

主包 `@taptap/instant-games-open-mcp` 的 beta 发布 job 已关闭。Maker 验证使用
`Publish Maker Package` workflow 发布 `@taptap/maker@beta`。

**Alpha 版本**（早期测试）：

```bash
git checkout -b alpha
git push origin alpha
# 不会自动发布；当前主包 release workflow 只允许从 main 发布 latest
```

**Next 版本**（下一个主版本）：

```bash
git checkout -b next
git push origin next
# 不会自动发布；当前主包 release workflow 只允许从 main 发布 latest
```

### 9.4 旧版本维护

通过维护分支支持旧版本：

```bash
# 创建 1.x 维护分支
git checkout -b 1.x v1.5.0
git push origin 1.x

# 在 1.x 分支修复 bug
git checkout 1.x
git commit -m "fix: security patch"
git push origin 1.x
# 不会自动发布；需要发布时人工运行 release workflow
```

---

## 10. Release PR 门禁说明

主包手动发版 workflow 会自动创建 release PR，用于把版本号和 CHANGELOG 写回 `main`。
这类 PR 与普通功能 PR 的审核语义不同，但仍必须满足组织级 `trunk-guard` 和仓库级
`code-review-guard`。

详细背景、问题分析、正确处理方式和后续修改步骤见
[Release PR 门禁说明](RELEASE_PR_GUARDS.md)。

---

## 相关文档

- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南
- [ARCHITECTURE.md](ARCHITECTURE.md) - 架构文档
- [RELEASE_PR_GUARDS.md](RELEASE_PR_GUARDS.md) - Release PR 门禁说明
- [Conventional Commits 规范](https://www.conventionalcommits.org/)
- [Semantic Versioning 规范](https://semver.org/)
- [semantic-release 文档](https://semantic-release.gitbook.io/)

---

**需要帮助？** 提交 Issue：https://github.com/taptap/instant-games-open-mcp/issues
