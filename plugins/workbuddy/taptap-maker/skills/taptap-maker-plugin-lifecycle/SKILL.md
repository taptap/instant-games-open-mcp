---
name: taptap-maker-plugin-lifecycle
description: 管理 WorkBuddy 中 TapTap Maker 插件的首次使用、旧 MCP 迁移、项目初始化、更新和卸载流程。
---

# TapTap Maker WorkBuddy Plugin Lifecycle

Keep exactly one active Maker MCP registration while preserving the user's existing Maker setup.
The plugin owns its bundled runtime; existing PAT, TapTap auth, Maker home, project bindings, and
game files remain shared and unchanged.

## Bundled CLI

Always use the plugin launcher with the bundled runtime. It resolves WorkBuddy's managed Node.js
first and falls back to a system Node.js only when needed:

```bash
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" <arguments>
```

Do not assume `taptap-maker`, npm, or npx is on `PATH`.

## First Use and Legacy MCP Migration

Before the first Maker workflow in a WorkBuddy plugin session, inspect standalone registrations:

```bash
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" plugin inspect --client workbuddy --json
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
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" plugin migrate --client workbuddy --confirm --json
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
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" plugin restore --client workbuddy --confirm --json
```

Restore only configuration owned by the migration state. Preserve unrelated WorkBuddy settings and
later user edits. Remove the plugin only after restoration succeeds or the user confirms that the
standalone MCP should remain disabled.
