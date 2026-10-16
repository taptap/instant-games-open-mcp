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

另外，release workflow 使用 `GITHUB_TOKEN` 创建分支和 PR 时，会触发 GitHub Actions 的
防递归机制，后续 `pull_request` workflows 不会可靠产生。这会导致 release PR 虽然已经
创建并设置 auto-merge，但 required checks 没有出现，原 release job 只能一直等待直到超时。
因此，release workflow 创建 release 分支、release PR、auto-merge、tag 和 GitHub Release
这些写操作应使用受控的 GitHub App installation token。

本仓库已经配置 release GitHub App 所需的 repository secrets：

- `RELEASE_APP_ID`
- `RELEASE_APP_PRIVATE_KEY`

release workflow 应使用这些 secrets 生成短期 App token，并用该 token 执行写操作。只读查询
仍可继续使用默认 `GITHUB_TOKEN`，以减少权限面。

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

当前实现保留 `Claude Code Review` workflow 不变，避免 Anthropic action 在修改自身 workflow 的 PR 上拒绝运行。release PR 由单独的 `Release PR Review Guard` workflow 产出同名 `review` job，并执行确定性的 release guard，而不是调用 AI code review。

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
7. workflow 使用 release GitHub App token 创建 release PR 到 `main`。
8. release PR 触发 `PR Check`。
9. release PR 触发 `CodeQL`，并产生成功结果。
10. release PR 触发 `Release PR Review Guard` 的 `review` job，校验 release PR 的标题、变更文件和版本一致性。
11. GitHub 看到 `PR Check`、`CodeQL` 和 `review` 都通过。
12. auto-merge 合并 release PR。
13. release workflow 轮询到 PR 已合并。
14. workflow 在最新 `main` 上创建 tag 和 GitHub Release。

这条流程里，release PR 不需要人工 Approve。人工确认动作已经发生在手动触发 release
workflow，以及需要时的 protected environment 审批中。

如果 CodeQL 或 GitHub Actions 排队时间较长，release workflow 会等待更长时间。若仍然
超时，维护者可以在 release PR 上等待检查通过并合并，然后回到失败的 release run 执行
`Re-run failed jobs`。release job 应复用已有 release 分支和 PR，并校验 npm、tag 和
GitHub Release 的现有状态，而不是重复创建或重复发布。

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

保持 `Claude Code Review` workflow 不变，另新增 `Release PR Review Guard` workflow：

- 普通 PR 继续由现有 Claude review 产出 `review` required check。
- release PR 由确定性的 release guard 产出同名 `review` job。
- release guard 只在 `release/*` 来源分支上运行，并校验 PR 标题、允许变更文件和版本一致性。

这样避免在同一个 PR 中修改 `claude-review.yml` 时触发 Anthropic action 的 workflow 校验失败，同时保证 release PR 当前 head commit 上仍有 `review` 结果。

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

### 6.4 使用 release GitHub App token 创建自动 PR

主包 release workflow 应生成 GitHub App installation token，并在 release job 中用于：

- `actions/checkout` 的 `token`，确保后续 `git push` 以 App 身份执行。
- `gh pr create`，确保 release PR 的后续 `pull_request` workflows 能正常触发。
- `gh pr merge --auto`，确保 auto-merge 由受控 App 身份设置。
- `git push` tag 和 `gh release create`，确保 release 收尾动作使用同一受控身份。

这个 App token 不用于绕过 CodeQL 或 review。release PR 仍然要正常产生并通过 required
checks。token 的作用是避免默认 `GITHUB_TOKEN` 的防递归限制导致 required checks 不出现。

GitHub App installation token 有固定有效期。release job 等待 PR 合并的步骤可能持续较久，
因此等待合并和最终写 release 需要拆开：等待 PR 合并时只做只读轮询；确认 PR 已合并后，
重新生成一个新的 App token，再执行 `git push` tag、上传 assets 和创建 GitHub Release。
同理，lint、build、test 和 npm publish 完成后，创建 release 分支、PR 和 auto-merge 前也
需要重新生成 write token，并刷新 Git 的 auth header，缩短 token 实际使用窗口。

GitHub App token 同时会被 `gh` 和 `git` 使用，但两者的认证形态不同：

- `gh` 命令通过 `GH_TOKEN` 使用 token。
- `git push` / `git fetch` 使用 HTTPS Git 凭据，需要配置成 Basic auth header，
  即 `x-access-token:<token>` 的 base64 形式。

不要把 Git 的 `http.https://github.com/.extraheader` 配置成 `AUTHORIZATION: bearer ...`。
这种写法可能让 `gh` API 正常工作，但 HTTPS Git push 会在认证阶段失败，表现为
`could not read Username for 'https://github.com'`。

### 6.5 增强 release job 的可恢复性

release job 应允许在超时或中断后重跑：

- 如果 release 分支已经存在，复用远端分支。
- 如果 release PR 已经存在，复用 PR，不重复创建。
- 如果 release PR 已合并，直接校验 `main` 上的版本并继续创建 tag / GitHub Release。
- tag 必须指向 release PR 的 merge commit，而不是重跑时的 `origin/main` HEAD，避免
  release PR 合并后 `main` 又有新提交时把 tag 打到错误提交。
- 如果 release PR 已关闭且未合并，立即失败；后续带显式 `if` 的步骤必须同时包含
  `success()`，避免 closed PR 失败后继续执行分支、提交或 auto-merge 操作。
- 如果 release PR 仍是 OPEN 且已经启用 auto-merge，重跑时直接复用该状态，不重复调用
  `gh pr merge --auto` 导致失败。
- 如果 npm 版本已经存在，校验并重置 `latest` dist-tag，不重复发布。
- 如果 npm 已发布但 release 分支、release PR、tag 或 GitHub Release 还没有完成，维护者
  可以手动重跑主包 release workflow，并显式输入当前 npm latest 版本继续恢复。此时 workflow
  不应自动递增到下一个 patch，也不应因为 npm 上已有该版本而提前失败。
- 如果 tag 或 GitHub Release 已经存在，校验或补充 assets，不重复创建。

这样 release PR 检查较慢时，不需要新建第二个 workflow。维护者可以在同一个 release PR
上等待检查通过并合并，然后重跑失败 job 继续完成收尾。

### 6.6 后续优化 release guard

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
