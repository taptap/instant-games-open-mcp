---
name: update-taptap-mcp
description: Use when users ask to update, refresh, or upgrade TapTap Maker while it is provided by the Codex plugin.
---

# Update TapTap Maker Codex Plugin

Update TapTap Maker through the Codex marketplace so the MCP runtime, CLI, skills, and plugin
metadata stay on the same version.

## Workflow

1. Explain that this Maker installation is owned by the Codex plugin.
2. Open the TapTap Maker plugin in the Codex marketplace and use its update or reinstall action.
3. Keep any disabled standalone `taptap-maker` MCP registration disabled. Do not delete or rewrite
   its configuration, backup, PAT, Maker home, or project bindings.
4. Start a new Codex task or reconnect the plugin MCP after the update, then read `maker://status` or
   call `maker_status_lite` to verify the loaded version.

Do not run npm, npx, the standalone package upgrader, or MCP installation commands for plugin
updates. Project policy or dev-kit maintenance is a separate operation and must target only the
current Maker project.
