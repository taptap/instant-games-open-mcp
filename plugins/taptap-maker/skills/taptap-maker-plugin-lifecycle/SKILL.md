---
name: taptap-maker-plugin-lifecycle
description: Use when Codex starts TapTap Maker work through the plugin, an older standalone Maker MCP may also be configured, a Maker project needs initialization from the plugin, the plugin needs an update, or the user plans to remove the plugin.
---

# TapTap Maker Plugin Lifecycle

Keep exactly one active Maker MCP registration while preserving the user's existing Maker setup.
The plugin owns its bundled runtime; existing PAT, TapTap auth, Maker home, project bindings, and
game files remain shared and unchanged.

## Bundled CLI

Resolve the plugin root from this Skill path: the plugin root is two directories above this file.
Use the host Node.js executable with the bundled runtime:

```bash
node "${PLUGIN_ROOT}/dist/maker.js" <arguments>
```

`${PLUGIN_ROOT}` is a placeholder for that resolved absolute plugin directory. Do not assume
`taptap-maker`, npm, or npx is on `PATH`.

## First Use and Legacy MCP Migration

Before the first Maker workflow in a Codex plugin session, inspect the old Codex MCP registration:

```bash
taptap-maker plugin inspect --client codex --json
```

Run the command through the bundled CLI above, then act on `status`:

| Status      | Action                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `not_found` | Continue. There is no standalone registration to migrate.                                         |
| `active`    | Tell the user that the old Maker MCP was found, then automatically disable it as described below. |
| `disabled`  | Continue. Do not claim, rewrite, or enable an entry disabled outside this plugin.                 |
| `ambiguous` | Stop and report that duplicate legacy tables prevent a safe automatic migration.                  |

Do not ask the user to choose between the plugin and the old MCP, and do not request another
confirmation. The user's plugin installation request authorizes this compatibility migration.
Automatically disable an active legacy Codex Maker MCP:

```bash
taptap-maker plugin migrate --client codex --confirm --json
```

Migration sets only the old registration's `enabled = false`, writes
`.taptap-maker.bak.latest`, and records plugin ownership for restoration. Do not delete the old MCP
registration, its backup, credentials, Maker home, or projects. Repeated migration is a safe no-op.

After migration and after plugin installation, verify the legacy registration again with `plugin
inspect`. Continue only when its status is `disabled` or `not_found`. If it remains `active`, run the
idempotent migration once more and verify again; never report the plugin ready while both MCPs are
active.

During installation, retain every migration result. If any migration in this installation attempt
returned `action: "disabled"` with `changed: true` and installation or verification fails,
first remove a plugin installed by this attempt and verify that it is no longer installed. Do not
restore the old MCP while the new plugin remains installed. Once the plugin is absent, immediately
run `plugin restore --client codex --confirm --json`; do not ask for confirmation again because this
is a rollback of the same installation transaction. Do not restore a registration that was already
disabled, was not found, belonged to an earlier migration, or was not changed by this installation
attempt.

## Initialization

Use the normal `taptap-maker-local` workflow. When the target directory is not initialized, run the
bundled CLI with:

```bash
taptap-maker init --skip-mcp-install
```

Keep all ordinary app selection, project creation, PAT login, clone, Python, Lua LSP, and dev-kit
behavior. `--skip-mcp-install` is mandatory because the plugin already provides the active MCP.

## Plugin Updates

Update the installed Codex plugin through its marketplace. Do not run the standalone package
upgrade or npm/npx installation workflow for plugin users. After an update, start a new Codex task
or reconnect the plugin MCP so the new runtime, tools, resources, and Skills load together.

## Removal or Standalone Rollback

Normal plugin removal still requires explicit confirmation. If the user wants to remove the plugin
and resume the previously migrated standalone MCP, ask before running through the bundled CLI:

```bash
taptap-maker plugin restore --client codex --confirm --json
```

Restore only a registration owned by this plugin's migration state. Preserve unrelated Codex
configuration and edits made after migration. If the result is `not_owned`, leave the registration
unchanged. Remove the plugin only after restoration succeeds or the user confirms the standalone
MCP should remain disabled.
