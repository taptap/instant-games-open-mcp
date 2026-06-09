# Release PR 门禁说明

本文档记录主包发版 PR 在 GitHub 保护规则下的预期合并方式，作为后续修改
workflow 和代码审核时的参考说明。

## 1. 背景

仓库当前有两类不同性质的 PR：

- 普通功能 PR：开发者提交功能、修复、重构或 CI 配置变更，目标是把代码合入
  `main`。普通 PR 的 commit message 不允许包含 `[skip ci]`、`[ci skip]` 等 CI skip
  指令。
- 主包发版 PR：人工运行 `Manual Main Package Release` workflow 后，由 workflow 自动
  创建的 PR，主要用于把版本号和 CHANGELOG 写回 `main`。

普通功能 PR 必须承担完整的代码质量和代码审核责任。功能代码在这个阶段进入
`main`，因此必须经过 CI、CodeQL 和 review 检查。

主包发版 PR 的性质不同。它不是新的业务功能变更，而是发版流程在发布 npm 后写回：

- `package.json` 中的版本号。
- `package-lock.json` 中的版本号。
- `CHANGELOG.md` 中的发布记录。

历史流程里，功能 PR 合并后曾经自动触发发版，并自动创建 release PR。为了避免这种
自动 PR 再进入完整代码审核链路，仓库里曾加入过跳过逻辑。现在主包发版已经改为人工
触发，release PR 仍然会被自动创建并等待合并，但旧的跳过逻辑已经和当前保护规则发生
冲突。

## 2. 当前遇到的问题

当前 `main` 受两层门禁影响：

- 组织级 `trunk-guard`：要求合入默认分支的 PR 满足 PR 流程、CodeQL/code scanning
  和 code quality 等规则。
- 仓库级 `code-review-guard`：要求存在名为 `review` 的 required status check。

当前 workflow 的问题是：

- `CodeQL` workflow 对 `release/*` 分支的 PR 主动跳过。
- `Claude Code Review` workflow 对标题包含 `(release)` 的 PR 主动跳过 `review` job。
- 主包 release workflow 创建的分支是 `release/vX.Y.Z`，PR 标题是
  `chore(release): X.Y.Z`。

这导致 release PR 同时命中多个风险点：

- `[skip ci]` 会影响 GitHub Actions 的 `push` 和 `pull_request` 事件，普通 PR 和
  release PR 都不能依赖带 skip 指令的提交或标题。
- CodeQL 显式跳过 release 分支时，无法满足组织级 `trunk-guard`。
- `review` 显式跳过 release 标题时，无法满足仓库级 `code-review-guard`。

因此 release PR 虽然没有代码冲突，普通 CI 也可能通过，但 GitHub 仍会把 PR 判定为
`BLOCKED`，auto-merge 无法完成。

另外需要端到端验证 release workflow 使用 `GITHUB_TOKEN` 创建分支和 PR 后，是否能触发
后续 `pull_request` workflows。GitHub 默认会抑制由 `GITHUB_TOKEN` 触发的大多数后续
workflow 事件；如果真实 release PR 仍不产生 required checks，应改用受控的 GitHub App
installation token 或专用 bot PAT 创建 release 分支和 PR。

## 3. 正确处理原则

当前目标不是绕过组织规则，而是让 release PR 按正确方式满足组织规则。

### 3.1 CodeQL 不应该跳过 release PR

CodeQL 是组织级安全扫描门禁。只要 PR 要合入 `main`，就应当让 CodeQL 正常执行。

release PR 只改版本号和 CHANGELOG，并不代表可以跳过 CodeQL。CodeQL 在这种 PR 上
通常成本较低，但它必须产生成功的检查结果，供 `trunk-guard` 判定。

因此，CodeQL workflow 不应再用 `release/*` 分支名作为跳过条件。

### 3.2 review 不等于人工 Approve

当前 ruleset 没有要求非提交人员手动 Approve：

- required approving review count 是 0。
- 不要求 code owner review。
- 不要求 last push approval。

仓库级 `code-review-guard` 要求的是一个名为 `review` 的 status check，而不是 GitHub
人工 review 记录。

所以 release PR 不需要额外找非提交人员点 Approve。它需要的是 `review` 这个 required
check 有明确结果。

### 3.3 普通 PR 和 release PR 的 review 语义应区分

普通功能 PR 的 `review` 应该是代码审核：

- 检查业务逻辑。
- 检查接口和行为变化。
- 检查风险、兼容性、测试和文档。
- 对阻塞问题或警告提出评论。

release PR 的 `review` 不应该理解成完整代码审核。它更适合成为 release guard：

- 校验 PR 是否由主包 release workflow 创建。
- 校验 PR 是否只修改允许的发版文件。
- 校验 `package.json`、`package-lock.json` 和 CHANGELOG 的版本一致。
- 校验 PR 标题、分支和发布版本符合规则。

短期内，为了尽快恢复流程，可以先让 release PR 也跑现有 `Claude Code Review`。
长期看，更合理的做法是保留 `review` 这个 required check 名称，但对 release PR 执行
确定性的 release guard，而不是调用 AI code review。

## 4. 预期合并流程

### 4.1 普通功能 PR

普通功能 PR 的预期流程如下：

1. 开发者从 `main` 创建 feature/fix/chore 等分支。
2. 开发完成后创建 PR 到 `main`。
3. `PR Check` 先拒绝 CI skip 指令，然后运行 lint、build、test 和 commitlint。
4. `CodeQL` 正常运行，上传 code scanning 结果。
5. `review` 正常运行，完成代码审核。
6. 所有 required checks 通过后，PR 可以被合并。
7. 合并到 `main` 后不会自动发布 npm；需要发布时人工运行主包 release workflow。

普通 PR 中，CodeQL 和 review 不重复：

- CodeQL 是静态安全扫描和 code scanning 门禁。
- review 是针对本次 diff 的代码审核。

两者职责不同，应同时保留。

### 4.2 主包 release PR

主包 release PR 的预期流程如下：

1. 维护者在 GitHub Actions 页面人工运行 `Manual Main Package Release` workflow。
2. workflow 解析目标版本。
3. workflow 执行主包发布前检查，包括 lint、format、build 和 test。
4. workflow 构建或复用 native signer。
5. workflow 更新版本号和 CHANGELOG。
6. workflow 发布 npm 包。
7. workflow 创建 release PR 到 `main`。
8. release PR 触发 `PR Check`。
9. release PR 触发 `CodeQL`，并产生成功结果。
10. release PR 触发 `review`：
    - 短期可以继续跑现有 review。
    - 长期建议改为 release guard。
11. GitHub 看到 `PR Check`、`CodeQL` 和 `review` 都通过。
12. auto-merge 合并 release PR。
13. release workflow 轮询到 PR 已合并。
14. workflow 在最新 `main` 上创建 tag 和 GitHub Release。

这条流程里，release PR 不需要人工 Approve。人工确认动作已经发生在手动触发 release
workflow，以及需要时的 protected environment 审批中。

## 5. Maker 发包流程影响

Maker 发包走独立的 `Publish Maker Package` workflow：

- 由 `workflow_dispatch` 手动触发。
- 发布 `@taptap/maker`。
- 使用 `npm_publish` environment 审批。
- 不创建 release PR。
- 不把 Maker 包版本号写回主包 `package.json` 或 `CHANGELOG.md`。

因此，主包 release PR 门禁调整不应直接影响 Maker 发包 workflow。

需要注意的是 Maker 代码变更 PR：

- 如果是开发者提交的普通 Maker 功能 PR，它仍然是合入 `main` 的代码变更，理论上应当
  跑 CodeQL 和 review。
- 如果未来存在 Maker 自动化 PR，应单独设计 Maker guard，不应简单用 `(maker)` 跳过
  所有 Maker PR 的 review。

## 6. 本次修改步骤

本节只描述本次修改步骤，不展开具体代码。

### 6.1 恢复 CodeQL 对 release PR 的执行

调整 `CodeQL` workflow：

- 移除对 `release/*` head 分支的跳过条件。
- 保持 `pull_request` 到 `main` 时运行。
- 保持 `push` 到 `main` 和定时运行。

目标是所有合入 `main` 的 PR，包括 release PR，都能产生 CodeQL/code scanning 结果。

### 6.2 恢复 release PR 的 review check

调整 `Claude Code Review` workflow：

- 不再让 release PR 的 `review` job 直接 skipped。
- 短期方案：release PR 也执行现有 Claude review，保证 required check 能产生结果。
- 长期方案：把 `review` job 拆成两条路径：
  - 普通 PR 运行 AI code review。
  - release PR 运行确定性的 release guard。

无论采用哪条路径，最终都要保证 required check 名称仍然是 `review`，并且在 release PR
当前 head commit 上产生成功结果。

### 6.3 保持主包 release workflow 的基本结构

`Manual Main Package Release` workflow 可以继续：

- 手动触发。
- 创建 release 分支。
- 更新版本号和 CHANGELOG。
- 发布 npm。
- 创建 release PR。
- 启用 auto-merge。
- 等待 PR 合并后创建 tag 和 GitHub Release。

只要 CodeQL 和 review 不再跳过 release PR，现有 auto-merge 逻辑就能等待 required
checks 通过后继续执行。

### 6.4 后续优化 release guard

建议在流程恢复后补一个 release guard，用于替代 release PR 上的 AI code review。

release guard 应验证：

- PR 目标分支是 `main`。
- PR 来源分支符合主包 release workflow 生成规则。
- PR 标题符合 release PR 格式。
- PR 只修改 `package.json`、`package-lock.json` 和 `CHANGELOG.md`。
- `package.json` 和 `package-lock.json` 中的版本一致。
- CHANGELOG 包含目标版本条目。

这样可以保留二次确认，又避免对自动生成的版本号和 CHANGELOG 做无意义的完整代码审核。

## 7. 给审核员的判断标准

审核相关 workflow 修改时，重点检查以下问题：

- release PR 是否还能正常满足组织级 `trunk-guard`。
- release PR 是否还能产生名为 `review` 的 required check。
- 普通功能 PR 是否仍然会跑 CodeQL 和 review。
- Maker 发包 workflow 是否仍独立手动触发，不被主包 release PR 逻辑误伤。
- 是否存在通过跳过、伪造或绕过保护规则来完成合并的行为。

正确方向是让不同类型 PR 使用不同语义的检查，而不是跳过组织要求的门禁。
