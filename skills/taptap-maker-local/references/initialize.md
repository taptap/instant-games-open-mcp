# Initialize or Clone

Read only for project creation, initialization, clone or login recovery.

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
   User-level MCP config never pins the selected Maker project directory as `cwd`. Clients that
   support MCP Roots should let the current workspace root identify the Maker project. If a client
   does not support MCP Roots, pass the real project directory as `target_dir` on the concrete
   Maker tool call. Never rewrite shared user-level MCP config to switch projects.
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

If clone or fetch fails with Maker Git output, inspect the returned error fields instead of asking
the user to delete local files immediately. Treat `retryable: yes`, `classification:
remote_transient`, or retry reasons such as `remote_http_5xx`, `network_or_timeout`, and
`connection_interrupted` as temporary service/network failures. For first clone, explain that 503
often means the Maker server is still preparing the repository and can take more than 20 seconds.
The CLI already retried these automatically; if it still fails, tell the user they can retry
`taptap-maker init` later or switch to a cleaner independent directory after repeated failures. Do
not retry for auth, permission, repository-not-found, remote-rejected, local file conflict, or local
permission errors until the reported cause is fixed.

If `taptap-maker init` fails and returns `partial_state`, explain the state in plain language:

- `project_bound: no` usually means clone did not finish; retry only for the temporary failures
  above.
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
