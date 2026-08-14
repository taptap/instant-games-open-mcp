---
name: update-taptap-mcp
description: Use when users ask to update, refresh, or upgrade the local TapTap Maker MCP package.
---

# TapTap Maker MCP Upgrade Workflow

Use the CLI upgrade entry instead of hand-writing npm cache or client-config scripts. Maker local
development is published by `@taptap/maker`; do not update the legacy main Open API package for
Maker workflows.

## Scope

This workflow upgrades only the current machine and the current Maker project directory.

- Do not scan unrelated Maker projects.
- Do not batch-upgrade multiple projects.
- Do not delete old config backup files. Historical `.bak.*` files have no reliable ownership
  marker and must be left untouched.
- The MCP status surface only checks the package policy and reports
  `required_upgrade`, `update_available`, `current`, `unavailable`, or `skipped`.
  It never runs `taptap-maker upgrade` by itself.

## Required Steps

1. Read `maker://status`; if resources are unavailable, fall back to `maker_status_lite`.
   Use `maker_status_lite({ detail: true })` only when package or connection diagnostics are explicitly needed.
   If the `Maker MCP package update` section reports `required_upgrade`, explain the version reason
   to the user first.
   Do not run any upgrade command before that explanation and approval step.
2. Identify the current Maker project directory. Use `--target-dir` only when the directory is
   confirmed to be a Maker project, which means it or one of its parents contains
   `.maker-mcp/config.json`. This argument only selects the project whose managed `AGENTS.md` policy
   is updated; it never writes that directory into user-level MCP config.
3. If the AI client has exactly one attached workspace and that workspace is the Maker project, use
   that workspace as `<PROJECT_DIR>`. If there are multiple workspaces, or the current directory is
   not clearly a Maker project, ask the user for the Maker project directory before using
   `--target-dir`.
4. Read the exact target package version from the status result (`latest` or `latest_beta`, matching
   the user's current release channel). After the user approves the upgrade, run that exact package
   version for the confirmed project:

```bash
npx -y -p @taptap/maker@<TARGET_VERSION> taptap-maker upgrade --target-dir <PROJECT_DIR>
```

If the user only wants one client, pass `--ide codex`, `--ide cursor`, or `--ide claude`.

If the user only wants to refresh the machine-level MCP command and no Maker project directory is
confirmed, explain that this refresh will not update project `AGENTS.md`, then run
`npx -y -p @taptap/maker@<TARGET_VERSION> taptap-maker upgrade` without `--target-dir` only after the
user agrees.

5. Tell the user that the current MCP session remains available and continues using the existing
   version and proxy tools. The updated package and `AGENTS.md` take effect on the next MCP start or
   user-requested reconnect; do not require a new conversation.
6. After the next restart/reconnect, verify by reading `maker://status`; if resources are unavailable,
   call `maker_status_lite`.

## Status-Driven Upgrade Notes

- Trigger timing is limited to the startup asynchronous check and the 12-hour TTL lazy check from
  `maker://status` / `maker_status_lite`.
- Business tools do not trigger version checks.
- The remote policy fields are `schema_version`, `latest`, `latest_beta`,
  `minimum_supported`, `blacklist`, and `message`.
- `required_upgrade` means the local AI must explain the reason, ask the user for approval, and only
  then run the appropriate upgrade command.
- After any upgrade, the current session remains usable. Restart or reconnect only when the user wants
  the new package loaded, then verify with `maker://status` or `maker_status_lite`.

## Expected Effects

`taptap-maker upgrade` performs current-directory upgrade work:

- Materializes the exact package version as a stable self runtime and refreshes AI client MCP config
  to use its absolute Node and bundle paths.
- `--launcher npx` is an explicit compatibility mode; it pins the exact package version and uses a
  dedicated writable npm cache instead of becoming the upgrade default.
- User-level MCP config never contains a project `cwd`; unchanged entries are not rewritten.
- `--target-dir` only selects the project whose managed `AGENTS.md` policy is updated.
- Updates the current project's TapTap Maker managed `AGENTS.md` policy block when the directory is
  bound to a Maker project.
- Keeps user-written `AGENTS.md` content outside the managed block.
- Writes only `<config>.taptap-maker.bak.latest` when a client config actually changes.
- Does not create timestamp config backups and does not delete old backups.

## If Upgrade Appears Not To Take Effect

If `maker://status` still shows an old package, an unexpected project context, or missing Maker
proxy tools after restart/reconnect, first inspect MCP Roots and the tool call's `target_dir`. Also
check whether a legacy project-level MCP config is overriding user/global config.
Common project-level files include:

- `.mcp.json`
- `.codex/config.toml`
- `.codex/mcp.json`
- `.cursor/mcp.json`
- `.vscode/mcp.json`
- `codex.toml`

Do not migrate, delete, or edit these project-level files automatically. Explain the finding and
ask the user whether they want to move Maker MCP configuration to user/global scope.

## Old Project Handling

When a user upgrades MCP and later opens an old Maker project:

1. Read `maker://status` first.
2. If the `AGENTS.md` section reports `missing_file`, `missing_block`, or `outdated`, run:

```bash
npx -y -p @taptap/maker@<TARGET_VERSION> taptap-maker agents update --target-dir <PROJECT_DIR>
```

3. Tell the user the current session remains usable. The updated `AGENTS.md` instructions load on the
   next MCP start or user-requested reconnect; do not require a new conversation.

Status reads are intentionally read-only. Do not modify `AGENTS.md` from `maker://status` or
`maker_status_lite`; use the CLI update command.
