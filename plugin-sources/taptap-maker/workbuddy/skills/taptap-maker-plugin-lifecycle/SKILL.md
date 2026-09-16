---
name: taptap-maker-plugin-lifecycle
description: Use when WorkBuddy starts TapTap Maker work through the plugin, an older standalone Maker MCP may also be configured, a Maker project needs initialization, the plugin needs an update, or the user plans to remove the plugin.
---

# TapTap Maker WorkBuddy Plugin Lifecycle

Keep exactly one active Maker MCP registration while preserving the user's existing Maker setup.
The plugin owns its bundled runtime; existing PAT, TapTap auth, Maker home, project bindings, and
game files remain shared and unchanged.

## Bundled CLI

Always use the plugin launcher with the bundled runtime. It resolves WorkBuddy's managed Node.js
first and falls back to a system Node.js only when needed. On Windows, use:

```bat
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node.cmd" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" <arguments>
```

On macOS or Linux, use:

```bash
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" <arguments>
```

Both launchers set `TAPTAP_MAKER_DISTRIBUTION=workbuddy_plugin` and
`TAPTAP_MCP_CLIENT_IDE=workbuddy` before starting the bundled runtime.
In the commands below, replace `<PLUGIN_CLI>` with the complete two-part launcher command selected
for the current operating system above.
Do not assume `taptap-maker`, npm, or npx is on `PATH`.

## First Use and Legacy MCP Migration

The plugin SessionStart hook performs a read-only inspection and injects a reminder when an active
standalone registration exists. It never changes MCP configuration. Before the first Maker workflow
in a WorkBuddy plugin session, follow that reminder or inspect standalone registrations directly:

```bash
<PLUGIN_CLI> plugin inspect --client workbuddy --json
```

Act on `status`:

| Status      | Action                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------- |
| `not_found` | Continue. There is no standalone registration to migrate.                                     |
| `active`    | Explain that two active Maker MCPs cause duplicate tools, then ask for explicit confirmation. |
| `disabled`  | Continue. Do not claim, rewrite, or enable a registration disabled outside this plugin.       |
| `ambiguous` | Stop and explain which WorkBuddy config files contain conflicting registrations.              |

Only after explicit confirmation, disable the active standalone registration:

```bash
<PLUGIN_CLI> plugin migrate --client workbuddy --confirm --json
```

Migration only sets `disabled: true`, writes a latest backup, and records plugin ownership for
restoration. Do not delete the old registration, change WorkBuddy connector trust, or remove
credentials, Maker home, or projects. Repeated migration is a safe no-op. WorkBuddy may separately
ask the user to trust or enable the plugin MCP; the user must complete that UI action.

## Initialization

Use the normal `taptap-maker-local` workflow. Run initialization through the bundled CLI with
`--skip-mcp-install`; the plugin already provides the active MCP.

## Plugin Updates

Use `/plugin` to update TapTap Maker, then `/reload-plugins`. Never run the standalone package
upgrade or an npm/npx installation workflow for plugin users.

## Removal or Standalone Rollback

If the user wants to remove the plugin and resume a registration migrated by this plugin, ask for
explicit confirmation, then run:

```bash
<PLUGIN_CLI> plugin restore --client workbuddy --confirm --json
```

Restore only configuration owned by the migration state. Preserve unrelated WorkBuddy settings and
later user edits. Remove the plugin only after restoration succeeds or the user confirms that the
standalone MCP should remain disabled.
