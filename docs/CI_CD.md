# CI/CD 和自动化发布

本文档说明 TapTap MCP Server 的 CI/CD 流程和自动化发布机制。

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

---

## 1. 概述

项目采用 **GitHub Flow + Semantic Release** 实现完全自动化的版本管理和发布流程。

### 核心特性

- ✅ 基于 Conventional Commits 自动计算版本号
- ✅ 自动生成 CHANGELOG.md
- ✅ 自动发布到 npm
- ✅ 自动创建 GitHub Release
- ✅ 完整的 PR 检查（lint、build、test、commitlint）

### 发布流程图

```
Feature PR 合并到 main
    ↓
触发 GitHub Actions
    ↓
分析 commits（semantic-release dry-run）
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
自动合并 PR（符合 trunk-guard 规则）
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

### 自动发布机制

1. **Feature PR 合并** → 触发 GitHub Actions
2. **分析 commits** → 确定版本号（semantic-release dry-run）
3. **创建 release 分支** → `release/vX.X.X`
4. **发布到 npm** → 在 release 分支更新版本
5. **生成 CHANGELOG** → 自动生成版本说明
6. **自动创建 PR** → release 分支 → main
7. **自动合并 PR** → 符合 trunk-guard 要求
8. **创建 GitHub Release** → 添加 tag 和 release notes

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
# 7. 合并后自动触发发布
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

# 4. 合并后自动发布
# 版本变更：1.2.0 → 1.2.1 (patch)
```

### 3.3 发布 Beta 版本

```bash
# 1. 创建或切换到 beta 分支
git checkout -b beta

# 2. 合并要测试的功能
git merge feature/feature-a
git merge feature/feature-b

# 3. 推送到远程
git push origin beta

# 4. 自动发布 beta 版本
# 版本：1.3.0-beta.1

# 5. 用户安装 beta 版本
npm install @taptap/minigame-open-mcp@beta

# 6. 测试稳定后，合并到 main
git checkout main
git merge beta
git push origin main

# 7. 发布正式版本
# 版本：1.3.0
```

### 3.4 重要注意事项

- ✅ **始终在 feature/fix 分支工作**，不要直接 commit 到 main
- ✅ **Commit 类型决定版本号**：
  - `feat:` → minor 版本 (1.2.0 → 1.3.0)
  - `fix:` → patch 版本 (1.2.0 → 1.2.1)
  - `feat!:` / `fix!:` → major 版本 (1.2.0 → 2.0.0)
  - `docs:` / `ci:` / `chore:` → 不触发发布
- ✅ **发布完全自动化**，无需人工干预
- ✅ **符合组织 Ruleset**，所有更改通过 PR

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
npx commitlint --from HEAD~1 --to HEAD
```

### 5.2 自动发布工作流

**文件**：`.github/workflows/release.yml`

**触发条件**：PR 合并到 `main` / `beta` / `alpha` 分支后自动运行

**执行步骤**：

1. **质量检查** - 运行 lint、build、test
2. **执行 semantic-release**：
   - 分析所有 commits
   - 计算新版本号
   - 更新 `package.json`
   - 生成/更新 `CHANGELOG.md`
   - Git commit 和 tag
   - **发布到 npm**
   - 创建 GitHub Release

**npm 发布策略**：

- ⚠️ **不使用 Provenance**（npm Provenance 仅支持 public 仓库，当前仓库为 internal）
- ✅ 使用 **Automation Token** 绕过 2FA
- ✅ 完整的 CI/CD 质量检查

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
    '@semantic-release/commit-analyzer',
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
**自动发布**：`.github/workflows/release.yml`

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

### 8.3 本地测试发布流程（dry-run）

```bash
# 不会真正发布，只显示会做什么
npx semantic-release --dry-run
```

**输出示例**：

```
[semantic-release] › ℹ  Running semantic-release version 19.0.5
[semantic-release] › ✔  Loaded plugin "commit-analyzer"
[semantic-release] › ✔  Loaded plugin "release-notes-generator"
[semantic-release] › ✔  Loaded plugin "npm"
[semantic-release] › ✔  Loaded plugin "github"
[semantic-release] › ℹ  This run was triggered in dry-run mode. No release will be published.
[semantic-release] › ✔  Allowed to push to the Git repository
[semantic-release] › ℹ  Start step "analyzeCommits" of plugin "commit-analyzer"
[semantic-release] › ℹ  Analyzing commits...
[semantic-release] › ✔  Completed step "analyzeCommits" of plugin "commit-analyzer"
[semantic-release] › ℹ  The next release version is 1.3.0
```

---

## 9. 版本管理

### 9.1 语义化版本（Semantic Versioning）

项目遵循 [Semantic Versioning 2.0.0](https://semver.org/)：

- **Major 版本（X.0.0）**：不兼容的 API 变更
- **Minor 版本（1.X.0）**：向后兼容的功能性新增
- **Patch 版本（1.0.X）**：向后兼容的问题修正

### 9.2 版本号自动化

- ✅ 版本号完全自动化，**不需要手动修改** `package.json`
- ✅ 由 semantic-release 根据 commit 历史自动计算
- ❌ 不要手动修改版本号

### 9.3 预发布版本

**Beta 版本**（测试新特性）：

```bash
git checkout -b beta
git push origin beta
# 自动发布：1.3.0-beta.1
npm install @taptap/minigame-open-mcp@beta
```

**Alpha 版本**（早期测试）：

```bash
git checkout -b alpha
git push origin alpha
# 自动发布：1.3.0-alpha.1
npm install @taptap/minigame-open-mcp@alpha
```

**Next 版本**（下一个主版本）：

```bash
git checkout -b next
git push origin next
# 自动发布：2.0.0-next.1
npm install @taptap/minigame-open-mcp@next
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
# 自动发布：1.5.1
```

---

## 相关文档

- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南
- [ARCHITECTURE.md](ARCHITECTURE.md) - 架构文档
- [Conventional Commits 规范](https://www.conventionalcommits.org/)
- [Semantic Versioning 规范](https://semver.org/)
- [semantic-release 文档](https://semantic-release.gitbook.io/)

---

**需要帮助？** 提交 Issue：https://github.com/taptap/minigame-open-mcp/issues
