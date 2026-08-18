# TapTap Maker WorkBuddy Plugin

This plugin bundles TapTap Maker 0.0.30: the local MCP runtime, CLI, workflow Skills, commands,
and connection troubleshooting guide. Its launcher prefers WorkBuddy's managed Node.js, falls back
to a system Node.js when needed, and never downloads or launches Maker through npm or npx.

Use `/taptap-maker:create-project` to create a new game in an empty workspace, or
`/taptap-maker:sync-project` to sync an existing Maker game into an empty workspace. Existing
Maker authentication and project bindings are reused.
