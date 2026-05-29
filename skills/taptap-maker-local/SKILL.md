---
name: taptap-maker-local
description: Guide TapTap Maker local development workflows. Use when a user asks to initialize Maker local development, clone/download a Maker project, continue a Maker project, inspect local Maker status, pull, submit, push, or resolve Git conflicts.
---

# TapTap Maker Local Workflow

Use this skill as the workflow layer for Maker local development. The Maker CLI owns one-time
initialization; MCP tools own the high-frequency development loop. This skill decides the sequence,
asks the user for choices, and explains local state in plain language.

## Scope

This skill covers:

- initialize local Maker development
- run the Maker CLI initialization flow
- clone a Maker project
- prepare local AI dev kit after project checkout
- choose a Maker app from the CLI app list
- explain PAT, Git, project binding, and editor reloads
- inspect local changes
- pull remote changes
- submit local changes
- push local commits
- explain and resolve conflicts with user approval

Build, submit, push, preview, and verify behavior belongs to the single Maker MCP build tool. The
post-build runtime log polling loop belongs to the local Maker CLI watcher.

## Responsibilities

Keep this split clear:

- Skill: user intent, step order, whether to ask the user, friendly explanations, failure recovery.
- CLI: save PAT, fetch app list, clone, prepare dev kit, install MCP config, verify local setup,
  and run the local runtime log watcher.
- MCP tools/resources: inspect Maker status, run the combined commit/push/build path, and support
  one-shot runtime log pulls.

Do not reimplement Maker API calls or Git authentication in shell when the Maker CLI or MCP tool
exists.

## Main Intent Table

| User intent                                               | Required workflow                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| initialize / configure / continue Maker local development | Run the Maker CLI initialization workflow.                                                                                         |
| clone / download Maker project locally                    | Follow "Initialization Workflow"; do not ask for app_id directly.                                                                  |
| status / is Maker ready                                   | Read `maker://status`, call `maker_status_lite` if resources are unavailable, then follow `Maker remote sync` if present.          |
| submit / commit / push to Maker                           | Inspect local Git state, summarize changed files, then call `maker_build_current_directory` unless blocked.                        |
| pull / update from remote                                 | Inspect local changes first; if dirty, explain options before pulling.                                                             |
| conflict / merge failed                                   | Explain why the conflict happened, list conflict files, inspect conflict hunks, propose a resolution plan, and ask before editing. |
| build / preview / run / verify                            | Use `maker_build_current_directory`; it starts the local runtime log watcher after a successful remote build result.               |

## Project Detection

A directory is a Maker project when the user's current project directory or one of its parents contains:

```text
.maker-mcp/config.json
```

When this file exists, explain that the directory is already bound to a Maker project.

When this file is missing and the user asks to clone, initialize, or continue Maker local
development, do not ask the user for an app_id directly. Follow the initialization workflow.

The user's current project directory is the business target. Do not ask the user to choose a
directory and do not scan unrelated Maker projects. If the MCP process cwd is a transient
dialogue/session directory, pass the user's current project directory as `target_dir`. If the AI
client does not expose that directory, say the current client did not provide the project directory
instead of guessing.

### Attached Workspace Selection

Some AI clients start MCP from a dialogue/session directory and expose the real project as an
attached workspace. For Maker status, clone, submit, and build, compare:

- the AI dialogue current directory, often containing `dialogues`
- the attached workspace directories shown by the client

If there is a single attached workspace, use that single attached workspace as `target_dir` when
calling Maker tools. If there are multiple attached workspaces, show the paths and ask the user
which one is the Maker project directory. Do not treat the dialogue/session directory as the Maker
project directory, and do not ask the user to clone an app into that directory.

If status output returns `AI client workspace selection`, follow that hint: choose an attached
workspace first, then read `maker://status` or call `maker_status_lite` with the attached project
directory.

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

1. Run `taptap-maker doctor` for the user's intended Maker directory, or read `maker://status` when
   the MCP server is already available.
2. If the status reports the current directory is already bound to a Maker project, stop the
   initialization/clone path. Continue with the user's current intent in that bound project. Do not
   ask which app to clone unless the user explicitly asks to switch or re-clone.
3. If Git is missing, stop. Tell the user Git is required for clone/submit/build-side Git work.
4. Run `taptap-maker init` in the user's intended Maker directory. The CLI will request PAT if
   missing, fetch TapTap token, show a paged app preview, ask the user to choose, prepare the AI dev
   kit, clone the Maker project, and install/verify MCP config.
   Tell the user that the first Maker clone can take 20+ seconds because the server may be
   preparing the repository, and that they should keep the command running while the CLI retries
   transient 503/5xx failures.
5. If the CLI reports ordinary local files or parent Git repository risk, explain the warning and
   ask whether the user wants to continue in this directory or switch to a clean independent one.
6. After clone succeeds, run `taptap-maker doctor` again or explain that `.maker-mcp/config.json`
   now binds the directory to the Maker project.
7. Tell the local AI/Agent to use the `taptap-maker-dev-kit-guide` skill for the installed dev-kit
   resources, especially `CLAUDE.md`, `examples/`, `templates/`, and `urhox-libs/`.

Keep the user-facing explanation short:

```text
我会先用 Maker CLI 检查本机 Git、PAT 和当前目录是否已绑定 Maker 项目。
如果还没有 PAT，CLI 会让你去页面创建一个；拿到项目列表后你选游戏，我再拉代码。
```

## AI Dev Kit Preparation

`taptap-maker init` checks out the Maker project before preparing local development environment
files in the current working directory. Init reinstalls the dev kit after checkout and allows
dev-kit files to overwrite same-path local helper files; the managed `.gitignore` block keeps
those files local-only so they are not submitted to Maker Git.

`taptap-maker doctor` and `maker://status` check the dev-kit top-level entries for an already bound
Maker project. If `CLAUDE.md`, `examples/`, `templates/`, or `urhox-libs/` are missing, run
`taptap-maker dev-kit update` to restore the dev kit without overwriting existing local files and
refresh the managed `.gitignore` block.

The CLI downloads and installs (selected automatically by `TAPTAP_MCP_ENV`):

```text
# production (default)
https://urhox-demo-platform.spark.xd.com/ai-dev-kit/pd/stable/ai-dev-kit.zip

# rnd
https://urhox-demo-platform.spark.xd.com/ai-dev-kit/rnd/latest/ai-dev-kit.zip
```

After clone, use the bundled `taptap-maker-dev-kit-guide` skill to explain the installed dev-kit
resources to the local AI/Agent:

- `CLAUDE.md` is the AI development guide entry.
- `examples/` contains Maker development examples.
- `templates/` contains reusable templates.
- `urhox-libs/` contains engine APIs and capability references.

The CLI is responsible for deterministic file operations:

- extract the ZIP into the current directory after checkout
- skip the ZIP top-level `scripts` directory because it conflicts with Maker project code
- delete the downloaded `ai-dev-kit.zip` after extraction
- write a temporary `.gitignore.dev-kit-before-clone` block for installed dev-kit entries
- after dev-kit preparation succeeds, merge that block into the checked-out `.gitignore`
- keep the dev-kit files local-only so they are not submitted to Maker Git

Do not hand-write a custom download/unzip script while this CLI command is available.

If dev-kit network access is unavailable after clone succeeds, explain that the Maker project is
already checked out, but local AI development docs/API/demo support may be incomplete. Ask whether
the user wants to retry `taptap-maker init` for a full post-checkout dev-kit reinstall or continue
without the dev kit.

If clone or fetch fails with Maker Git output, inspect the returned error fields instead of asking
the user to delete local files immediately. Treat `retryable: yes`, `classification:
remote_transient`, or retry reasons such as `remote_http_5xx`, `network_or_timeout`, and
`connection_interrupted` as temporary service/network failures. For first clone, explain that 503
often means the Maker server is still preparing the repository and can take more than 20 seconds.
The CLI already retried these automatically; if it still fails, tell the user they can retry
`taptap-maker init` later or switch to a cleaner independent directory after repeated failures. Do
not retry for auth, permission, repository-not-found, remote-rejected, local file conflict, or local
permission errors until the reported cause is fixed.

## PAT Handling

If the user pastes a token-like string while the initialization flow is waiting for PAT, let the
running `taptap-maker init` prompt consume it, or run `taptap-maker pat set` and paste the PAT into
the prompt. Do not put PAT directly in argv unless the user explicitly accepts the ps/shell-history
exposure. Do not just say "received". If the directory is already bound, treat `taptap-maker apps`
output as account reference only and continue the user's current bound-project task.

If PAT exchange fails:

1. Show the PAT page URL for the current environment:
   production `https://maker.taptap.cn/pat-tokens`, RND `https://fuping.agnt.xd.com/pat-tokens`.
2. Ask the user to create a new Maker PAT on that page.
3. Run `taptap-maker pat set` and paste the PAT into the prompt.

## App Selection

Use app selection only when the current directory is unbound and the user is initializing or cloning
a Maker project, or when the user explicitly asks to switch or re-clone.

If the current directory is already bound, app lists from `taptap-maker apps` are reference only.
Continue operating on the current bound project. When the user explicitly requests a different
project, start the project selection flow for that request.

When app selection is needed, show the returned app preview and total count, then ask the user to
choose by index, app id, or name. The default preview shows the 40 most recently active apps.
If the target is not visible, ask the user to type `all` inside `taptap-maker init` to expand the
full list, or run `taptap-maker apps --all` for a one-shot human-readable dump; use
`taptap-maker apps --json` only when AI / scripts need the machine-readable list. If the
chat/client width is enough, you may present the preview as a compact two-column layout;
otherwise keep a single column. Keep app_id visible in every app row, and include the preview
details instead of only a summary such as "40 apps are available".

Selection confirmation:

- Ask the user to choose by index, app id, or name.
- Treat the user's explicit reply as the selected app.
- If there is only one app, still ask for confirmation before selecting it.

After the user chooses, route the next action to `taptap-maker init` so the Maker initialization
workflow can continue with the selected app. For non-interactive CLI runs, pass the selected app id
through the supported CLI option.

## Working Directory Compliance Check

Before every clone attempt, run `taptap-maker doctor` for the user's intended Maker development
directory. Use that result as the source of truth for Git availability, existing Maker binding,
outer Git repository detection, and AI dev-kit status.

### Directory Suitability Decision

After `taptap-maker doctor`, decide whether the directory is suitable for clone:

- If the directory is already bound to a Maker project, do not clone again unless the user
  explicitly asks to switch or re-clone.
- If Git is missing, stop and tell the user to install Git first.
- If `Maker Git directory` reports `inside_parent_git_repo` or `target_is_git_root: no` with an
  outer `git_root`, explain that the directory is under another Git repository. Recommend a
  completely independent directory, such as `~/MakerProjects/<game-name>`.
- If the directory is unbound and only contains ignored local config folders, continue after the
  user chooses an app.
- If the directory contains ordinary user files or folders, explain that Maker clone keeps local
  files but may stop on path conflicts. Ask whether to continue here or switch to a clean directory.

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

If the current directory is inside a larger Git repository but is not itself a Git root, warn the
user before clone:

- The outer repository may be an existing user project.
- A Maker project can live under that directory only if the Maker directory gets its own `.git`.
- Recommend a completely independent directory, such as `~/MakerProjects/<game-name>`, for safer
  local development.
- If the user explicitly continues, continue `taptap-maker init`; the CLI must initialize an
  independent Maker Git repository in the target directory and must not modify the outer repository
  remote.

Do not delete, move, or overwrite user files during this check.

## Clone Directory Safety

Before clone, the Maker CLI checks local files and reports conflicts. The current init flow installs
the AI dev kit after checkout, so a fresh directory should not get checkout conflicts from newly
generated dev-kit files. Explain this in non-technical terms:

- existing local config folders such as `.claude`, `.mcp`, `.skill`, `.config`, `.ini` are kept
- normal local files are kept unless they conflict with files from the Maker project
- if conflicts are reported, tell the user exactly which pre-existing files block clone and ask whether to move,
  rename, or choose another directory

Do not delete or overwrite user files to make clone work unless the user explicitly asks.

If `taptap-maker init` fails and returns `partial_state`, explain the state in plain language:

- `project_bound: no` usually means clone did not finish; retrying clone is allowed.
- `git_initialized: yes` with `project_bound: no` means the directory may contain a partial local
  Git setup; retry once, and if it fails again recommend a fresh independent directory.
- `ai_dev_kit_present: yes` means local AI docs/examples may already be present even though Maker
  project checkout failed.
- `project_bound: yes` means the directory already has Maker binding; run `taptap-maker doctor` before
  attempting anything else.

Do not delete partial files automatically. For novice users, prefer recommending a new independent
directory over manual cleanup.

### `.gitignore` Merge During Clone

The Maker CLI stages the dev-kit managed ignore block in
`.gitignore.dev-kit-before-clone` while preparing the dev kit. After the Maker checkout and dev-kit
preparation both succeed, the CLI merges that managed block into the checked-out `.gitignore` and
removes the temporary file.

If clone still reports conflicts for files other than `.gitignore.dev-kit-before-clone`, do not
auto-merge them. Show the conflict list and ask the user whether to move the local files, choose
another directory, or let the local AI inspect and resolve the conflict.

Explain to the user that this `.gitignore` merge prevents local dev-kit files from being
submitted to Maker Git.

## Bundled Skills

When `taptap-maker doctor`, `maker://status`, or `maker_status_lite` reports TapTap bundled workflow
skills, show the skill names and document paths. Do not install or register skills automatically.

`taptap-maker-local` covers Maker local workflow. `taptap-maker-dev-kit-guide` explains the local
AI dev-kit resources installed during clone. `update-taptap-mcp` covers local TapTap MCP cache
updates.

Prefer user/global scope for Maker MCP installation. If a project/local config already exists,
do not block the workflow; just explain that user/global scope is recommended to avoid config
being tied to a specific project folder.

## Remote Sync Status

For a bound Maker project, `maker://status` and `maker_status_lite` include `Maker remote sync`.
Read this section before the user starts editing in a fresh conversation:

- For frequent polling or quick local-only status checks, call `maker_status_lite` with
  `skip_remote_sync: true` to avoid a `git fetch origin` network round trip on every status read.
- `up_to_date`: continue development.
- `needs_pull` with `local_changes: no`: tell the user the workspace is clean and the local AI can
  run `git pull --ff-only origin main` before editing.
- `needs_pull` with `local_changes: yes`: do not pull immediately. Explain that remote changes exist
  and local edits are present; ask the local AI to inspect `git status` and help the user choose
  submit current changes, stash then pull and restore, or cancel.
- `diverged`: do not push or blindly pull. Ask the local AI to plan a rebase or merge of current
  Maker remote changes.
- `branch_not_allowed`: Maker only accepts `main`; switch/migrate local commits to `main` before
  build or submit.
- `remote_unavailable`: follow the failure classification and retry later only for temporary
  5xx/network/timeout failures.

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

Use `maker_build_current_directory` for this path. Do not use generic Git task-id,
branch-creation, or PR rules inside Maker project repositories.

If `maker_build_current_directory` returns a build failure after a successful push, report both:

- submit/push succeeded
- build failed, with the concrete build error

If `maker_build_current_directory` returns a successful remote build, check
`runtime_logs.watch_started`. The MCP starts the local watcher as a detached CLI process. The
standard command is:

```bash
taptap-maker logs watch --target-dir <PROJECT_ROOT> --reset --interval 5s
```

This CLI flow clears old local runtime logs before polling, then appends server-shaped rows to
`.maker/logs/runtime/runtime.log`. Do not start a second watcher unless the first one failed to
start. For gameplay/runtime diagnostics after a successful build, read
`runtime_logs.local_file`. To check whether the watcher is alive or failing, read
`runtime_logs.state_file`.

Watcher protection rules:

- The watcher owns `.maker/logs/runtime/watcher.pid`; a new watcher replaces the old watcher for
  the same project before writing logs.
- Temporary poll failures are retried by default. Treat `logs_poll_error` as diagnostic output,
  not as a final failure, unless the watcher exits.
- If server cursor metadata lags behind returned log timestamps, the local cursor is advanced past
  the newest written log. Local log writing appends server-returned rows as-is.
- `.maker/logs/runtime/state.json` records heartbeat fields including `lastPollAt`,
  `lastSuccessAt`, `lastWrittenLogs`, `consecutiveFailures`, and `lastError`.

If submit created a local commit but push failed because the Maker remote was temporarily
unavailable, do not run a manual generic `git push`. Fix the reported cause if needed, then retry
`maker_build_current_directory`. Maker MCP will detect committed-but-unpushed local commits and push
them before build.

For push failures, use the returned `classification`, `retryable`, `retry_reason`, and
`retry_attempts` fields. Temporary 5xx/network/timeout failures may be retried with the Maker build
tool; `remote_rejected` means remote updates require pull/rebase first; `auth` means refreshing PAT;
`branch_not_allowed` means Maker remote only accepts `main`; `forbidden_path` means the remote
pre-receive hook rejected one or more paths/directories and the forbidden pattern from stderr must
be removed from the unpushed commit before retrying.

When a Maker tool output contains `push_recovery`, follow it exactly:

- Tell the user the local commit is preserved but not yet on Maker remote.
- Do not ask for permission to run a generic `git push`.
- Retry with `maker_build_current_directory` for submit and build requests.
- If the failure is `remote_rejected`, ask before pull/rebase; do not create a new branch or PR.
- If the failure is `branch_not_allowed`, do not pull/rebase. Tell the user Maker only accepts
  `main`, switch back to `main`, cherry-pick the preserved local commit there, then retry.
- If the failure is `forbidden_path`, do not refresh PAT. Read the forbidden pattern in stderr,
  remove those paths from the unpushed commit while keeping local files, then retry after
  `git status` is clean for them.

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
