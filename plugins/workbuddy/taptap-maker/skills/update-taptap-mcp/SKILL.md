---
name: update-taptap-mcp
description: 当用户需要更新或升级 WorkBuddy 插件内置的 TapTap Maker 时使用。
---

# Update TapTap Maker WorkBuddy Plugin

Update TapTap Maker through WorkBuddy so the MCP runtime, CLI, Skills, and plugin metadata remain on
the same version.

## Workflow

1. Explain that this Maker installation is owned by the WorkBuddy plugin.
2. Open `/plugin`, locate TapTap Maker in the Installed tab, and use its update action. For a local
   development marketplace, refresh the marketplace before updating or reinstalling the plugin.
3. Keep any disabled standalone `taptap-maker` MCP registration disabled. Do not delete or rewrite
   its configuration, backup, PAT, Maker home, or project bindings.
4. Run `/reload-plugins`, then read `maker://status` or call `maker_status_lite` to verify the loaded
   version.

Do not run npm, npx, the standalone package upgrader, or MCP installation commands for plugin
updates. Project policy or dev-kit maintenance is a separate operation and must target only the
current Maker project.
