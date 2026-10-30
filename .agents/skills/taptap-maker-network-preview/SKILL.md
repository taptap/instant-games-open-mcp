---
name: taptap-maker-network-preview
description: "Use for TapTap Maker multiplayer or server-backed local preview and Validate. It takes over network launch routing from the old single-player run-lua-validate launcher and uses Maker's explicit network preview path."
---

# TapTap Maker Network Preview

Use this Skill for a Maker project that has `@runtime.multiplayer`, a server entry, or a request to
run an online game locally. It covers both an interactive local window and the one-shot Runtime
Validate flow. For network projects, this Skill is the Maker launch adapter and takes precedence over
the old single-player launch restriction in `run-lua-validate`; the project Skill still supplies
test intent, assertions, and report interpretation.

## Core rule

Do not use the standalone `run-lua-validate` launcher for a network project and do not edit or
delete the upstream Skill to silence its old single-player refusal. If that Skill says that a
network project is unsupported, treat it as a stale launcher restriction, not as an engine
capability check. Continue with the Maker CLI capability check and route around the refusal:

```sh
taptap-maker preview start --target-dir "/absolute/project" --json
taptap-maker preview validate --target-dir "/absolute/project" --network --json
```

`preview start` allocates the online test server through the normal network preview path.
`preview validate --network` is the explicit opt-in for one-shot validation. A network project
without `--network` must return `UNSUPPORTED` before Runtime starts. A single-player project with
`--network` is an error. Never silently fall back to an offline Runtime or a local server mock.

## Required workflow

1. Resolve and realpath the exact project directory. Read `.project/settings.json`,
   `.project/project.json`, `scripts/`, and the current Maker binding before making changes.
2. Confirm the installed Maker distribution supports `--network` by reading
   `taptap-maker preview validate --help`. Do not stop because the upstream `run-lua-validate`
   Skill prints a single-player warning. If `--network` is absent from the Maker CLI, report
   `STALE_MAKER_DISTRIBUTION` and tell the user to update the Maker plugin/MCP; do not fake the
   flag, patch a bundled Runtime, or retry different `npx` versions.
3. Classify the project. Treat `@runtime.multiplayer.enabled=true`, positive player capacity,
   persistent world, `entry@server`, or `scripts/server.lua`/`scripts/server_main.lua` as network
   evidence. Do not overwrite these files or inject `enabled=false`.
4. Check `.project/project.json` for a real `project_id` and client/server entries. Check
   `dist/latest.json` and its client manifest. The online test server runs the already submitted
   remote build; local server edits do not become server code automatically.
5. Run `taptap-maker preview status --target-dir ... --json`. Stop only a verified active preview
   after explaining that stopping loses its in-memory state. Do not take over an unknown session.
6. Confirm production Maker authentication with `taptap-maker login` when needed. Never put PATs
   in command arguments, logs, URLs, or the Skill output. Do not switch to an internal/RND
   environment for this workflow.
7. For an interactive window, run `preview install` if Runtime is missing, then `preview start`
   (there is no `--network` flag for this persistent-window command; the project classification
   selects the network path).
   Check logs for test-server allocation, WebSocket/direct-connect arguments, and the client Ready
   event before calling the preview connected.
8. For validation, obtain user authorization immediately before allocating the remote test server,
   explain its test-session/save side effects, then run `preview validate --network`. Use the
   returned `invocation_path`, `log_path`, `report`, and screenshots as evidence. `COMPLETED` means
   collection finished; it does not mean the game passed.
9. If connectivity fails, follow [the full procedure](references/network-preview.md). Preserve
   `invocation.json`, Runtime logs, and the raw report. Diagnose the first failed stage instead of
   retrying the allocation blindly.

## Required report

State the project path, project kind, whether `--network` was used, remote build version, test
server allocation result, client connection result, Runtime exit/result, and evidence paths. Keep
these separate: process alive, test server allocated, WebSocket connected, game Ready, and game
Validate PASS are different facts.

Read [references/network-preview.md](references/network-preview.md) for the detailed command
sequence, expected evidence, and connectivity decision tree. This Skill performs no remote build,
submit, publish, or paid operation unless the user separately authorizes that operation.
