---
name: taptap-maker-local
description: Guide TapTap Maker local development workflows. Use when a user asks to initialize Maker local development, clone/download a Maker project, continue a Maker project, inspect local Maker status, pull, submit, push, or resolve Git conflicts.
---

# TapTap Maker Local Workflow

Use this skill as the workflow layer for Maker local development. MCP tools provide machine
capabilities; this skill decides the sequence, asks the user for choices, and explains local
state in plain language.

## Scope

This skill covers:

- initialize local Maker development
- prepare local AI dev kit before project binding
- clone a Maker project
- choose a Maker app from the app list
- explain PAT, Git, project binding, and editor reloads
- inspect local changes
- pull remote changes
- submit local changes
- push local commits
- explain and resolve conflicts with user approval

Build behavior still belongs to the existing Maker MCP build tool. Do not remove or bypass the
current MCP tools.

## Responsibilities

Keep this split clear:

- Skill: user intent, step order, whether to ask the user, friendly explanations, failure recovery.
- MCP tools: save PAT, fetch app list, clone, submit, build, inspect Maker status.
- CLI: install MCP config and install bundled skills.

Do not reimplement Maker API calls or Git authentication in shell when a Maker MCP tool exists.

## Main Intent Table

| User intent                                               | Required workflow                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| initialize / configure / continue Maker local development | Follow "Initialization Workflow".                                                                                                  |
| clone / download Maker project locally                    | Follow "Initialization Workflow"; do not ask for app_id directly.                                                                  |
| status / is Maker ready                                   | Call `maker_status`, then explain missing prerequisites.                                                                           |
| submit / commit / push to Maker                           | Inspect local Git state, summarize changed files, then call `maker_submit_current_directory` unless blocked.                       |
| pull / update from remote                                 | Inspect local changes first; if dirty, explain options before pulling.                                                             |
| conflict / merge failed                                   | Explain why the conflict happened, list conflict files, inspect conflict hunks, propose a resolution plan, and ask before editing. |
| build / preview / run / verify                            | Use `maker_build_current_directory`; if it reports local changes, ask using the exact options returned by the tool.                |

## Project Detection

A directory is a Maker project when the current directory or one of its parents contains:

```text
.maker-mcp/config.json
```

When this file exists, explain that the directory is already bound to a Maker project.

When this file is missing and the user asks to clone, initialize, or continue Maker local
development, do not ask the user for an app_id directly. Follow the initialization workflow.

## Initialization Workflow

Trigger phrases include:

- 我要开发 Maker 游戏
- 本地 Maker 开发
- 拉取 Maker 游戏到本地
- clone Maker 项目
- 下载 Maker 项目代码
- 初始化 Maker 项目
- 初始化 Maker 开发目录
- 配置 Maker 本地开发
- 打开/继续开发 Maker 项目

Workflow:

1. Call `maker_status`.
2. If Git is missing, stop. Tell the user Git is required for clone/submit/build-side Git work.
3. If `maker_status` lists bundled skill documents, just tell the user which skills are available.
   Do not run editor-specific CLI install commands.
4. If PAT is missing, ask the user to open the PAT page shown by `maker_status`, create a PAT, and send it back.
5. When the user provides PAT, call `maker_exchange_pat(manual_pat)`.
6. Show the returned Maker app list and ask the user to choose. Do not auto-select, even if there is only one app.
7. Run the working directory compliance check below.
8. After the user chooses an app, call `maker_clone_to_current_directory(app_id)`. The clone
   tool prepares the AI dev kit automatically before project checkout.
9. After clone succeeds, call `maker_status` again or explain that `.maker-mcp/config.json` now binds the directory to the Maker project.

Keep the user-facing explanation short:

```text
我会先检查本机 Git、PAT 和当前目录是否已绑定 Maker 项目。
如果还没有 PAT，我会让你去页面创建一个；拿到项目列表后你选游戏，我再拉代码。
```

## AI Dev Kit Preparation

`maker_clone_to_current_directory` prepares local development environment files in the current
working directory before it checks out the Maker project.

The clone tool downloads and installs:

```text
https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/stable/ai-dev-kit.zip
```

The clone tool is responsible for deterministic file operations:

- extract the ZIP into the current directory
- skip the ZIP top-level `scripts` directory because it conflicts with Maker project code
- delete the downloaded `ai-dev-kit.zip` after extraction
- write a temporary `.gitignore.dev-kit-before-clone` block for installed dev-kit entries
- after Maker clone succeeds, merge that block into the checked-out `.gitignore`
- keep the dev-kit files local-only so they are not submitted to Maker Git

Do not hand-write a custom download/unzip script while this MCP clone tool is available.

If clone fails because dev-kit network access is unavailable, explain that the Maker project can
still be cloned, but local AI development docs/API/demo support may be incomplete. Ask whether
the user wants to retry or continue without the dev kit.

## PAT Handling

If the user pastes a token-like string while the initialization flow is waiting for PAT, call
`maker_exchange_pat(manual_pat)` and continue to app selection. Do not just say "received".

If PAT exchange fails:

1. Explain that the PAT may be invalid or expired.
2. Ask the user to create a new PAT.
3. Do not switch to JWT/OAuth fallback unless the user explicitly asks.

## App Selection

Always display the app list from `maker_exchange_pat` or `maker_list_apps` and ask the user to
choose by index, app id, or name.

Do not auto-select:

- the first app
- the most recent app
- the only app

After the user chooses, pass the concrete `app_id` to `maker_clone_to_current_directory`.

## Working Directory Compliance Check

Before clone, inspect only the current directory top level.
The goal is to avoid surprising overwrites, not to deeply audit game code.

Acceptable local config entries include:

- `.claude`
- `.mcp`
- `.skill`
- `.config`
- `.ini`
- `.cursor`
- `.codex`

If the directory contains ordinary user files or folders, explain that Maker initialization will
keep local files, but clone can fail if a local path conflicts with the Maker project. Ask whether
to continue in this directory or switch to a clean directory.

Do not delete, move, or overwrite user files during this check.

## Clone Directory Safety

Before clone, the Maker MCP clone tool checks local files and reports conflicts. The AI dev kit
may create local-only files before clone, so explain this in non-technical terms:

- existing local config folders such as `.claude`, `.mcp`, `.skill`, `.config`, `.ini` are kept
- normal local files are kept unless they conflict with files from the Maker project
- if conflicts are reported, tell the user exactly which files block clone and ask whether to move,
  rename, or choose another directory

Do not delete or overwrite user files to make clone work unless the user explicitly asks.

### `.gitignore` Merge During Clone

The Maker clone tool stages the dev-kit managed ignore block in
`.gitignore.dev-kit-before-clone` instead of writing `.gitignore` before checkout. After Maker
clone succeeds, the clone tool merges that managed block into the checked-out `.gitignore` and
removes the temporary file.

If clone still reports conflicts for files other than `.gitignore.dev-kit-before-clone`, do not
auto-merge them. Show the conflict list and ask the user whether to move the local files, choose
another directory, or let the local AI inspect and resolve the conflict.

Explain to the user that this `.gitignore` merge prevents local dev-kit files from being
submitted to Maker Git.

## Bundled Skills

When `maker_status` reports TapTap bundled workflow skills, show the skill names and document
paths. Do not install or register skills automatically.

`taptap-maker-local` covers Maker local workflow. `update-taptap-mcp` covers local TapTap MCP
cache updates.

Prefer user/global scope for Maker MCP installation. If a project/local config already exists,
do not block the workflow; just explain that user/global scope is recommended to avoid config
being tied to a specific project folder.

## Local Change Review

Before submitting, run local Git inspection when available:

```bash
git status --short --branch
git diff --stat
```

If the change set is small, inspect relevant diffs before summarizing. Do not paste large diffs
unless the user asks. Summaries should be understandable to non-programmers:

- what changed
- why these files are being submitted
- whether any generated or suspicious files are included

If there are no local changes, do not create an empty commit unless the user explicitly asks.

## Submit And Push

For Maker projects, user words like "提交", "提交代码", "推送", "push", or "提交到 Maker"
mean:

```text
commit + push + Maker build
```

Use `maker_submit_current_directory` for this path. Do not use generic Git task-id,
branch-creation, or PR rules inside Maker project repositories.

If `maker_submit_current_directory` returns a build failure after a successful push, report both:

- submit/push succeeded
- build failed, with the concrete build error

## Pull And Conflict Handling

Before pulling:

1. Run `git status --short --branch`.
2. If the workspace is dirty, explain that pulling can mix remote changes with local edits.
3. Offer safe options:
   - submit current local changes first
   - stash local changes, pull, then restore
   - cancel and let the user review local files

If conflicts occur:

1. Run `git status --short`.
2. Identify conflicted files (`UU`, `AA`, `DU`, `UD`, or unmerged paths).
3. Show the user the conflict files and explain why the conflict happened.
4. Inspect conflict markers in each file.
5. Explain the competing versions in plain language.
6. Propose a resolution strategy.
7. Ask for confirmation before editing files.

When showing conflict content, keep excerpts small and focused around conflict markers:

```text
<<<<<<<
local version
=======
remote version
>>>>>>>
```

Do not hide unresolved conflicts. After editing, run:

```bash
git status --short
```

Only submit after conflicts are fully resolved.

## User Communication

Maker users may not understand Git terminology. Prefer concrete wording:

- "本地改动" instead of "working tree"
- "提交到 Maker" instead of "commit and push"
- "远端版本" instead of "origin/main"
- "冲突文件" instead of "unmerged paths"

Always explain the next irreversible step before taking it.
