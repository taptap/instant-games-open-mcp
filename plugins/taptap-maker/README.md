# TapTap Maker Codex Plugin

This plugin bundles TapTap Maker 0.0.30: the local MCP runtime, CLI, workflow skills, and
connection troubleshooting guide. Runtime startup uses the host Node.js executable and never
downloads or launches the Maker package through npm or npx.

Existing Maker authentication and project bindings are reused. Before using the plugin alongside
an older standalone Codex MCP registration, inspect and migrate that registration with the bundled
CLI. Migration only sets the old registration to `enabled = false`, keeps a latest backup, and can
be restored.

See `skills/taptap-maker-local/SKILL.md` for the normal Maker development workflow.
