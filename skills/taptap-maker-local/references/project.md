# Project Context

Read when selecting a workspace, checking status or resuming after an upgrade.

## Project Detection

A directory is a Maker project when the user's current project directory or one of its parents contains:

```text
.maker-mcp/config.json
```

When this file exists, explain that the directory is already bound to a Maker project.

For a bound project, always inspect `maker://status` or `maker_status_lite` before continuing
development after an MCP/package or plugin upgrade. If the status includes an `AGENTS.md` section
with `status: missing_file`, `missing_block`, or `outdated`, run
`taptap-maker agents update --target-dir <project dir>` before making gameplay/code changes. After
updating `AGENTS.md`, tell the user the current session remains usable; updated instructions load on
the next MCP start or user-requested reconnect. Do not require a new conversation. Package or plugin
updates are a separate workflow and must follow the active distribution's update skill.

If status or doctor reports a `.project/settings.json` health problem, read Build Settings in
[Maker Git and Remote Build](git.md) before any repair. It limits which fields may be restored and
which missing defaults need user confirmation.

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

DeepSeek Harness (DSH) uses `@deepseek-ai/dsh-mcp-client` and currently does not advertise MCP
Roots. In DSH, resolve the active game workspace from the conversation/IDE context and pass that
absolute directory as `target_dir` on every project-related Maker call. Never persist it as plugin
`cwd`; multiple DSH projects share the same user-level plugin configuration.

## Bundled Skills

When `taptap-maker doctor`, `maker://status`, or `maker_status_lite` reports TapTap bundled workflow
skills, show the skill names and document paths. Do not install or register skills automatically.

`taptap-maker-local` covers Maker local workflow. `taptap-maker-dev-kit-guide` explains the local
AI dev-kit resources installed during clone. `update-taptap-mcp` covers the active distribution's
supported update workflow.

Prefer user/global scope for Maker MCP installation. If a project/local config already exists,
do not block the workflow; just explain that user/global scope is recommended to avoid config
being tied to a specific project folder.
