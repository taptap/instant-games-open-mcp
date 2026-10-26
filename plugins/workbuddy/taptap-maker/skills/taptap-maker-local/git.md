# Maker Git and Remote Build

Read only for sync, submit, push, remote build, conflict recovery or
`.project/settings.json` repair.

## Maker Git Workflow Policy

This policy overrides generic local Git skills and generic Git workflows whenever the current
directory is a Maker project, which means `.maker-mcp/config.json` exists in the project or one of
its parents.

Use `maker_build_current_directory` for submit, push, build, explicitly remote Web preview, and remote game result
verification requests in a bound Maker project.
Do not treat generic code checks like "验证代码", "跑测试", "lint", or "检查实现" as Maker
remote build unless the user explicitly asks for the remote build workflow. Local preview uses CLI.
Do not create feature branches, task branches, PR/MR. Do not create task-id based Git flows for
Maker project submit/build work. Do not run generic Git commit/push helpers as a replacement for
the Maker MCP tool.

`maker_build_current_directory` owns the Maker safety gate. It checks remote sync before creating a
commit. When local `main` is only behind Maker remote, it fast-forwards before committing. When
local and remote both have new commits, it merges `origin/main` after the local commit. When the
push is rejected because the Maker cloud workspace has uncommitted changes (`Working directory has
unstaged changes` / `Could not update working tree to new HEAD`), it commits the cloud changes
through the cloud Git API, merges them, and pushes once more. Merge conflicts are aborted and
reported as `merge_conflict` with `conflict_files`; resolve them, commit, and retry. It stops when
the branch is not `main`, remote sync cannot be verified, or fast-forward would overwrite local
changes.

Maker Git CLI (all commands print JSON; `--target-dir` defaults to the current directory):

- `taptap-maker git status` - local state and ahead/behind against `origin/main` (fetches).
- `taptap-maker git sync` - fetch, then fast-forward or merge `origin/main`; aborts on conflicts.
- `taptap-maker git push [--message MSG]` - the same sync/commit/push/cloud-repair flow as the
  build tool, without the remote build.
- `taptap-maker git cloud-status` / `cloud-diff [--path PATH] [--staged]` - read the Maker cloud
  workspace state and diff. Untracked cloud files are not in the diff.
- `taptap-maker git cloud-commit --message MSG (--all | PATH...)` - commit cloud workspace changes
  (project owner only). Run it only when the user explicitly asks; the web agent may still be
  editing those files. The automatic cloud commit inside push needs no extra confirmation. Never retry it after a timeout or `outcomeUnknown`; run `cloud-status`
  first, because the commit may already have succeeded.

The root `.gitignore` is a required Maker project file. If it changes after binding or dev-kit
updates, include it with the game changes and mention it in the submit summary. Do not omit it from
selected files.

## Build Settings

For multiplayer builds, use `maker_build_current_directory` structured parameters instead of
editing project JSON directly. `entry_client` / `entry_server` map to `project.json`
`entry@client` / `entry@server`; `multiplayer.enabled`, `max_players`, `background_match`,
`match_info`, and `persistent_world` map to `.project/settings.json` `@runtime.multiplayer`.
On the first multiplayer build, pass `multiplayer.enabled=true` together with
`entry_client` / `entry_server`. Send multiplayer settings only when the user explicitly provides
them; missing local `.project/settings.json` must not inject `enabled=false`. The remote build keeps
omitted multiplayer fields unchanged on later builds.

Maker status, status_lite, and doctor run a lightweight `.project/settings.json` health check.
Normal `maker_build_current_directory` blocks before commit/push when settings JSON is invalid or
build-critical fields are damaged. `$schema`, `sources`, and `build` must keep the default build
shape; `sources.*.tag` must be `stable` for online user projects, and `build.asset_ignores` only
needs to exist. Do not edit settings build fields directly for feature work; restore only the
build-critical fields when the check fails, and preserve valid `@runtime` config.
The health checker itself is read-only. When repair is needed, prefer the exact
file from Git or an intact misplaced copy; only repair fixed fields in a parseable
settings object. Never synthesize project identity, entry, version, publish metadata,
or resource groups from defaults. With user confirmation, missing settings defaults may
be added without overwriting existing intent: `$schema`, `build.output_dir=../dist`,
`build.asset_dirs=["../assets","../scripts"]`, `build.generate_fs_path=true`,
`build.asset_ignores=[]`, `assets_7z_threshold=50`, `preload_include_refs=true`,
`trim_remote_refs=true`, `legacy_binary=false`, and `tags={}`. Do not invent locked
`sources.*.tag` values; recover them from Git or an intact copy. `entry=main.lua`
is only safe after confirming that the project uses that entry script.

## Remote Sync Status

For a bound Maker project, detailed status includes `Maker remote sync`. Read the default local summary
before routine work; use `maker_status_lite` with `detail: true` before explicit sync diagnostics:

- For frequent polling or quick local-only status checks, call the default `maker_status_lite`; it is
  already local-only. In detail mode, pass `skip_remote_sync: true` to avoid `git fetch origin` and
  AI dev kit latest-version network round trips.
- `up_to_date`: continue development.
- For an explicit submit/build request, call `maker_build_current_directory` directly when status is
  `needs_pull`. The tool attempts `git merge --ff-only origin/main` before creating the local commit.
  If Git refuses because remote files overlap local edits, the tool stops and preserves the workspace.
- `needs_pull`: run `taptap-maker git sync --target-dir <PROJECT_DIR>` before editing. Local
  uncommitted edits are kept; if remote changes touch the same files, Git refuses and keeps the
  local files, so commit the local edits first and sync again.
- `diverged`: run `taptap-maker git sync`, or call `maker_build_current_directory` directly for a
  submit/build request; both merge `origin/main`. On conflicts the merge is aborted and the
  conflict files are listed.
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

For normal remote build/Web-preview/game-result verification requests, a clean workspace still goes through
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

`maker_build_current_directory` owns the safety gate before commit/push. When local `main` is only
behind Maker remote, it automatically fast-forwards before creating a local commit. When history is
diverged, it merges `origin/main` after the local commit. When the Maker cloud workspace blocks the
push, it commits the cloud changes, merges them and pushes once more. It stops when the branch is
not `main`, remote sync cannot be verified, fast-forward would overwrite local changes, or a merge
conflicts (the merge is aborted). Do not work around this by creating a new branch,
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
tool; `remote_rejected` means run `taptap-maker git sync` and retry; `cloud_workspace_blocked` means
the automatic cloud commit did not finish (follow `next_action`); `merge_conflict` means resolve
`conflict_files`, commit, and retry; `auth` means refreshing PAT;
`branch_not_allowed` means Maker remote only accepts `main`; `forbidden_path` means the remote
pre-receive hook rejected one or more paths/directories and the forbidden pattern from stderr must
be removed from the unpushed commit before retrying.

When a Maker tool output contains `push_recovery`, follow it exactly:

- Tell the user the local commit is preserved but not yet on Maker remote.
- Do not ask for permission to run a generic `git push`.
- Retry with `maker_build_current_directory` for submit and build requests.
- If the failure is `remote_rejected`, run `taptap-maker git sync`, then retry; do not create a new
  branch or PR.
- If the failure is `merge_conflict`, the merge was already aborted. Explain both sides of each
  `conflict_files` entry, ask before editing, commit the resolution, then retry.
- If the failure is `branch_not_allowed`, do not sync or merge. Tell the user Maker only accepts
  `main`, switch back to `main`, cherry-pick the preserved local commit there, then retry.
- If the failure is `forbidden_path`, do not refresh PAT. Read the forbidden pattern in stderr,
  remove those paths from the unpushed commit while keeping local files, then retry after
  `git status` is clean for them.

## Pull And Conflict Handling

To pull, run `taptap-maker git sync --target-dir <PROJECT_DIR>`. It fetches, then fast-forwards or
merges `origin/main`, and keeps local uncommitted edits. If Git refuses because remote changes touch
locally edited files, commit the local edits first and sync again. Do not stash or rebase.

If sync returns `outcome: "conflict"`, the merge was already aborted. The working tree has no
conflict markers and `git status` will not show `UU`, `AA`, `DU`, or `UD`. Do not look for those
states.

1. Use `conflictFiles` from the sync JSON. Do not invent paths that are not listed.
2. For each path, compare the local file with `origin/main` (`git show origin/main:<path>`). The
   local file is unchanged because the merge was aborted.
3. Explain both sides and why they conflict, in plain language.
4. Propose a resolution that keeps the needed parts of both sides.
5. Ask for confirmation before editing files.
6. After the user confirms, edit the files, commit the resolution, then run sync again.

If sync returns `outcome: "blocked"` because the merge could not be aborted, stop. Inspect
`git status` and ask the user; do not sync again and do not treat leftover markers as a normal
conflict result.

Do not hide unresolved conflicts. Only submit after the listed files are resolved and committed.

## User Communication

Maker users may not understand Git terminology. Prefer concrete wording:

- "本地改动" instead of "working tree"
- "提交到 Maker" instead of "commit and push"
- "远端版本" instead of "origin/main"
- "冲突文件" instead of "unmerged paths"

Always explain the next irreversible step before taking it.
