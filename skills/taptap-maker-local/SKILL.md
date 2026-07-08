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

For multiplayer builds, use `maker_build_current_directory` structured parameters instead of
editing project JSON directly. `entry_client` / `entry_server` map to `project.json`
`entry@client` / `entry@server`; `multiplayer.enabled`, `max_players`, `background_match`,
`match_info`, and `persistent_world` map to `.project/settings.json` `@runtime.multiplayer`.
On the first multiplayer build, pass `multiplayer.enabled=true` together with
`entry_client` / `entry_server`; single-player defaults are only injected when no multiplayer entry
is provided. The remote build keeps omitted multiplayer fields unchanged on later builds.

Maker status, status_lite, and doctor run a lightweight `.project/settings.json` health check.
Normal `maker_build_current_directory` blocks before commit/push when settings JSON is invalid or
build-critical fields are damaged. `$schema`, `sources`, and `build` must keep the default build
shape; `build.asset_ignores` only needs to exist. Do not edit settings build fields directly for
feature work; restore only the build-critical fields when the check fails, and preserve valid
`@runtime` config.

## Responsibilities

Keep this split clear:

- Skill: user intent, step order, whether to ask the user, friendly explanations, failure recovery.
- CLI: save PAT, fetch app list, clone, prepare dev kit, install MCP config, verify local setup,
  update the current project's managed `AGENTS.md` policy block, and run the local runtime log
  watcher, including runtime log polling.
- MCP tools/resources: inspect Maker status and run the combined commit/push/build path.

Do not reimplement Maker API calls or Git authentication in shell when the Maker CLI or MCP tool
exists.

## Main Intent Table

| User intent                                               | Required workflow                                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| initialize / configure / continue Maker local development | Run the Maker CLI initialization workflow.                                                                                                      |
| clone / download Maker project locally                    | Follow "Initialization Workflow"; do not ask for app_id directly.                                                                               |
| status / is Maker ready                                   | Read `maker://status`, call `maker_status_lite` if resources are unavailable, then follow `AGENTS.md` and `Maker remote sync` hints if present. |
| upgrade Maker MCP / old project policy                    | Run `taptap-maker upgrade` for the current project directory; do not scan unrelated Maker projects.                                             |
| submit / commit / push to Maker                           | Inspect local Git state, summarize changed files, then call `maker_build_current_directory` unless blocked.                                     |
| pull / update from remote                                 | Inspect local changes first; if dirty, explain options before pulling.                                                                          |
| conflict / merge failed                                   | Explain why the conflict happened, list conflict files, inspect conflict hunks, propose a resolution plan, and ask before editing.              |
| build / preview / run / check game result                 | Use `maker_build_current_directory`; it starts the local runtime log watcher after a successful remote build result.                            |
| generic code validation / tests / lint                    | Do not use Maker remote build unless the user explicitly asks to build, run, or preview the Maker game.                                         |

## Create New Maker Project Intent

Standard initialization, clone, download, continue, or "pull remote project" requests use
`taptap-maker init`; the CLI shows the Maker app list and asks the user to choose an existing app
or `0`/`new`. Add `--create` only when the user clearly asks to create a new Maker project.

Treat these user phrases as an explicit request to create a new Maker project:

- 创建新项目
- 创建项目
- 创建maker项目
- 创建 Maker 项目
- 创建游戏
- 创建新游戏
- 创建新游戏/项目
- 新建项目
- 新建游戏

When this intent is present, project creation has higher priority than matching an existing app by
name. If the current directory is unbound, guide the user into the Maker init creation path:

```bash
taptap-maker init --create
```

If the user already provided a project/game name, pass it explicitly:

```bash
taptap-maker init --create --name "<PROJECT_NAME>"
```

If no name is provided, ask for the project name or suggest the current directory name as the
default, but do not silently invent a name. If the current directory is already bound to a Maker
project, do not create a new project there; tell the user to open or create a new independent
directory first. A same-name app may be shown as an alternative existing-project choice, but a
same-name app must not override the user's explicit create-project intent.

## Maker Git Workflow Policy

This policy overrides generic local Git skills and generic Git workflows whenever the current
directory is a Maker project, which means `.maker-mcp/config.json` exists in the project or one of
its parents.

Use `maker_build_current_directory` for submit, push, build, preview, run, and game result
verification requests in a bound Maker project.
Do not treat generic code checks like "验证代码", "跑测试", "lint", or "检查实现" as Maker
remote build unless the user explicitly asks to build, run, or preview the Maker game.
Do not create feature branches, task branches, PR/MR. Do not create task-id based Git flows for
Maker project submit/build work. Do not run generic Git commit/push helpers as a replacement for
the Maker MCP tool.

`maker_build_current_directory` owns the Maker safety gate. It checks remote sync before creating a
commit and stops when local `main` is behind remote, diverged, not on `main`, or remote sync cannot
be verified.

The root `.gitignore` is a required Maker project file. If it changes after binding or dev-kit
updates, include it with the game changes and mention it in the submit summary. Do not omit it from
selected files.

## Maker Creative Asset Tool Policy

When the current directory is a bound Maker project, use Maker MCP for game asset generation and
editing when possible. Prefer Maker MCP proxy tools over native AI image/video/audio tools. These
Maker tools keep generated files inside the project, record remote mappings for later editing, and
can forward resolvable local reference media as data URLs when the remote tool schema supports it.

This guidance helps users prefer Maker-managed tools for Maker game assets.

- Prefer Maker proxy tools for Maker project asset requests when the Maker proxy tool is callable.
- If the required Maker proxy tool is not exposed in the current AI session, tell the user that
  Maker proxy tools are unavailable in this session.

- Use `generate_image` for one image.
- Use `batch_generate_images` for multiple images.
- Use `edit_image` for modifying project images.
- Use `create_video_task` for game videos and image/video referenced generation.
- Use `query_video_task` to refresh video task status, release completed task quota, and fetch final videos.
- Use `text_to_music` for game music or audio.
- Follow each tool schema for supported local path, remote URL, and data URL inputs.
- Local proxy may convert resolvable local reference media to data URLs before forwarding.
- If a Maker proxy tool returns an error or `isError`, report the full remote result/error payload.
  Include the server response payload so developers can diagnose the issue.
- Use `create_3d_model_task` for game 3D models.
- Use `query_3d_model_task` for polling 3D model tasks.
- For any ad-related request such as 广告, rewarded videos, play ads, ad ID, ad placement,
  ad status, ad config, or `ShowRewardVideoAd`, call `get_ad_config` first to get the
  current project ad activation status and ad config.
- Do not infer ad readiness from local SDK docs, `.maker-mcp/config.json`, or runtime callbacks.
  If `.project/project.json` is missing, build once with `maker_build_current_directory` to
  initialize the project, then call `get_ad_config` again. Implement or test ad code only
  after the config is available.
- If `get_ad_config` reports missing `app_id` or `developer_id`, call `generate_test_qrcode` once
  to generate test QR code metadata, then call `get_ad_config` again. Do not use publish-only tools
  for this recovery path.
- If status or doctor reports `Maker project initialization` with `missing_project_json` or
  `missing_taptap_identity`, follow that `next_action` before using tools that depend on remote
  project config.
- For online player feedback, problem reports, issue reports, debug feedback, real-device logs,
  screenshots, 问题反馈, 问题上报, 真机日志, or 玩家反馈, call the Maker proxy
  `get_debug_feedbacks` tool when available.
- Use local runtime log files only for the current local build/runtime session. Do not use local logs
  as a substitute for remote player-submitted feedback.
- Before `edit_image`, resolve dragged or referenced images to a local project image path or CDN
  URL. If the user references an attached/local image, inspect the attachment or workspace file path
  first. If the image is under `assets/image`, pass that path. If only a file name is given, search
  `assets/image` for the matching file.
- Do not call `edit_image` without an image path or CDN URL.

Generated assets should be saved by Maker MCP under `assets/image`, `assets/video`, or
`assets/audio`; generated 3D model outputs save the original GLB/FBX and MDL zip under
`assets/model`, then extract MDL contents into `assets/Meshes`, `assets/Materials`,
`assets/Textures`, and `assets/Prefabs`. Do not prefer client-native image generation when the user
is asking for Maker game assets in a bound project.

## Project Detection

A directory is a Maker project when the user's current project directory or one of its parents contains:

```text
.maker-mcp/config.json
```

When this file exists, explain that the directory is already bound to a Maker project.

For a bound project, always inspect `maker://status` or `maker_status_lite` before continuing
development after an MCP/package upgrade. If the status includes an `AGENTS.md` section with
`status: missing_file`, `missing_block`, or `outdated`, run
`taptap-maker agents update --target-dir <project dir>` or `taptap-maker upgrade --target-dir
<project dir>` before making gameplay/code changes. After updating `AGENTS.md`, tell the user to
restart/reconnect the AI client or open a new conversation so the updated instructions are loaded.

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

### Proxy Tools Missing From The Current Session

If the user is in a bound Maker project but `generate_image`, `batch_generate_images`, `edit_image`,
`create_video_task`, `query_video_task`, `text_to_music`, `create_3d_model_task`,
`query_3d_model_task`, `generate_test_qrcode`, `get_ad_config`, or `get_debug_feedbacks`
are missing from the current AI tool list, diagnose the MCP cwd before
suggesting repeated restarts:

1. Read `maker://status` or call `maker_status_lite` without `target_dir` to see the MCP server cwd.
2. If the user provides or the client exposes the real Maker project directory, call
   `maker_status_lite` with that directory as `target_dir`.
3. If the status output includes `MCP tool registration cwd` with `status: mismatch`, explain that
   `tools/list` ran from the MCP server cwd, not the Maker project directory. Passing `target_dir`
   to `maker_status_lite` proves the project is valid, but it does not dynamically add proxy tools
   to the already-started MCP session.
4. Tell the user to start the AI client from the Maker project directory, or update the
   `taptap-maker` MCP config `cwd` to the Maker project directory, then reconnect `taptap-maker`
   from the client's MCP UI such as `/mcp`.

When Maker proxy tools are missing, explain that this is likely a session/configuration problem and
that Maker tools are preferred for Maker game assets.

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
4. Python plus `maker-lua-lsp` is the local Lua diagnostics prerequisite for Maker local
   development. `taptap-maker init` checks Python before PAT, app list, clone, and MCP config
   installation. If Python is not ready, init tries `taptap-maker python setup` up to 3 total
   attempts. After Python is ready, setup best-effort creates a Maker private LSP venv,
   installs/upgrades `maker-lua-lsp` there, and runs
   `maker-lua-lsp install --ide codex,cursor,claude`; LSP failure should be reported but must not
   block remote build. If Python setup still fails, explain that init has paused before
   login/project clone/MCP config, then guide the user to retry `taptap-maker python setup` with
   the current AI or install Python 3.12 manually and run `taptap-maker python doctor`.
5. Run `taptap-maker init` in the user's intended Maker directory. The CLI will request PAT if
   missing, fetch TapTap token, show a paged app preview, ask the user to choose or create a Maker
   project, clone the Maker project, prepare the AI dev kit, and install/verify MCP config.
   For ordinary init/clone/download requests, use `taptap-maker init` so the CLI shows the app
   list first. Add `--create` only when the user clearly asks to create a new Maker project.
   The app preview always includes `0，创建新项目 / 0. Create a new Maker project`. This row must
   remain visible when an AI summarizes or truncates a long app list, even if another app name
   appears to match the current directory. Users can choose `0`/`new` and enter a project name,
   or use `taptap-maker init --create --name "my-local-game"` for non-interactive runs.
   The generated user-level MCP config does not pin the selected Maker project directory as `cwd`
   by default. Clients that support MCP Roots should let the current workspace root identify the
   Maker project, so multiple AI clients or Maker projects do not overwrite one shared cwd. If a
   client does not support MCP Roots, the user can explicitly run
   `taptap-maker mcp install --target-dir <PROJECT_DIR>` as a compatibility fix.
   Tell the user that the first Maker clone can take 20+ seconds because the server may be
   preparing the repository, and that they should keep the command running while the CLI retries
   transient 503/5xx failures.
6. If the CLI reports ordinary local files or parent Git repository risk, explain the warning and
   ask whether the user wants to continue in this directory or switch to a clean independent one.
7. After clone succeeds, run `taptap-maker doctor` again or explain that `.maker-mcp/config.json`
   now binds the directory to the Maker project.
8. Tell the local AI/Agent to use the `taptap-maker-dev-kit-guide` skill for the installed dev-kit
   resources, especially `CLAUDE.md`, `examples/`, `templates/`, and `urhox-libs/`.

Keep the user-facing explanation short:

```text
我会先用 Maker CLI 检查本机 Git、PAT 和当前目录是否已绑定 Maker 项目。
如果还没有本地鉴权，CLI 会打开 Maker 授权页；授权完成后拿到项目列表，你选游戏，我再拉代码。
```

## AI Dev Kit Preparation

`taptap-maker init` checks out the Maker project before preparing local development environment
files in the current working directory. Init reinstalls the dev kit after checkout and allows
dev-kit files to overwrite same-path local helper files; the managed `.gitignore` block keeps
those files local-only. The `.gitignore` file itself is a required Maker project file that should be
submitted to Maker Git.

`taptap-maker doctor`, `maker://status`, and `maker_status_lite` check the dev-kit top-level
entries and version state for an already bound Maker project. If `CLAUDE.md`, `examples/`,
`templates/`, or `urhox-libs/` are missing, or if the status reports `update_available: yes`, run
`taptap-maker dev-kit update` to refresh the managed dev kit files and the managed `.gitignore`
block. The update command replaces dev-kit managed entries so version metadata and local files stay
consistent. Do not call the version API directly from the skill; use the CLI/MCP status output.

The CLI checks the latest AI dev kit version for the current environment, downloads that version,
and records the installed version locally. If the version check is temporarily unavailable, the CLI
falls back to its built-in default download URL instead of blocking initialization.

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
- refresh the checked-out `.gitignore` managed block for installed dev-kit entries
- keep the dev-kit helper files ignored while submitting the `.gitignore` rules to Maker Git

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

If local Maker auth is missing or expired, run `taptap-maker login`. The CLI opens the Maker auth
page and polls the authorization result; do not ask the user to open a PAT page or manually paste a
PAT for normal local development. `taptap-maker pat set <PAT>`, `--pat PAT`, and `--pat-stdin` are
compatibility fallbacks for CI or emergency debugging only. Do not put PAT directly in argv unless
the user explicitly accepts the ps/shell-history exposure. If the directory is already bound, treat
`taptap-maker apps` output as account reference only and continue the user's current bound-project
task.

If PAT exchange fails:

1. Ask the user to run `taptap-maker login` again.
2. Do not switch to JWT/OAuth fallback or manual PAT fallback unless the user explicitly asks for
   CI/emergency debugging.

## App Selection

Use app selection only when the current directory is unbound and the user is initializing or cloning
a Maker project, or when the user explicitly asks to switch or re-clone.

If the current directory is already bound, app lists from `taptap-maker apps` are reference only.
Continue operating on the current bound project. When the user explicitly requests a different
project or wants to create a new project, require a new independent directory before starting the
project selection or creation flow.

When app selection is needed, show the returned app preview and total count, then ask the user to
choose by index, app id, or name. The default preview shows the 40 most recently active apps.
If the target is not visible, ask the user to type `all` inside `taptap-maker init` to expand the
full list, or run `taptap-maker apps --all` for a one-shot human-readable dump; use
`taptap-maker apps --json` only when AI / scripts need the machine-readable list. If the
chat/client width is enough, you may present the preview as a compact two-column layout;
otherwise keep a single column. Keep app_id visible in every app row, and include the preview
details instead of only a summary such as "40 apps are available". Always preserve and show
`0，创建新项目 / 0. Create a new Maker project`, because it is the supported creation entry even
when the app preview is cropped or a same-name app exists.

Selection confirmation:

- Ask the user to choose by index, app id, or name.
- If the user wants a new project, tell them to choose `0`/`new` in `taptap-maker init` and enter a
  project name; do not invent a project name unless the user explicitly asks the AI to name it.
- Treat the user's explicit reply as the selected app.
- If there is only one app, still ask for confirmation before selecting it.

After the user chooses or creates a project, route the next action to `taptap-maker init` so the
Maker initialization workflow can continue. For non-interactive CLI runs, pass the selected app id
through the supported CLI option, or use `--create --name <NAME>` for creation.

## Working Directory Compliance Check

Before every clone attempt, run `taptap-maker doctor` for the user's intended Maker development
directory. Use that result as the source of truth for Git availability, existing Maker binding,
outer Git repository detection, and AI dev-kit status.

### Directory Suitability Decision

After `taptap-maker doctor`, decide whether the directory is suitable for clone:

- If the directory is already bound to a Maker project, do not clone again unless the user
  explicitly asks to switch or re-clone.
- If the directory is already bound to a Maker project and the user wants a new project, stop and
  require a new independent directory; do not create a new Maker project into the existing binding.
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

### `.gitignore` Managed Block

The CLI refreshes the checked-out `.gitignore` managed block for local dev-kit files, Agent skill
discovery directories, and Maker runtime state.

If clone reports conflicts for project files, do not auto-merge them. Show the conflict list and
ask the user whether to move the local files, choose another directory, or let the local AI inspect
and resolve the conflict.

Explain to the user that this `.gitignore` managed block prevents local dev-kit files from being
submitted to Maker Git, while the `.gitignore` file itself should be submitted.

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
  `skip_remote_sync: true` to avoid `git fetch origin` and AI dev kit latest-version network round
  trips on every status read.
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

For normal build/preview/game-result verification requests, a clean workspace still goes through
`maker_build_current_directory`; Maker MCP creates and pushes an empty
`chore: wake maker build server` commit before remote build to wake the Maker server.
Only skip submit/push when the user explicitly asks to build the committed remote version.

## Submit And Push

For Maker projects, user words like "提交", "提交代码", "推送", "push", or "提交到 Maker"
mean:

```text
commit + push + Maker build
```

Use `maker_build_current_directory` for this path. Do not use generic Git task-id,
branch-creation, or PR rules inside Maker project repositories.

`maker_build_current_directory` owns the safety gate before commit/push. It checks Maker remote
sync and stops before creating a local commit when local `main` is behind remote, diverged, not on
`main`, or remote sync cannot be verified. Do not work around this by creating a new branch,
requesting a task id, running generic Git commit/push, or opening a PR/MR.

If `.gitignore` changed after Maker binding or dev-kit update, include it in the submit summary.
The root `.gitignore` is a Maker project file generated/maintained by the local workflow and must
be submitted with the game changes; do not omit it from selected files.

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

If the user explicitly asks "不提交", "直接构建", or "构建云端版本", call
`maker_build_current_directory` with `confirm_remote_build_without_submit=true`. In that mode, Maker
MCP builds the committed remote version only and does not auto-open Maker pages.

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
