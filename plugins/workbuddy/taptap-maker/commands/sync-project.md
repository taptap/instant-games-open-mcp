---
description: 将已有的 TapTap Maker 游戏同步到当前空工作区继续开发
---

Sync an existing TapTap Maker game only into an empty workspace directory.

1. Resolve the current WorkBuddy workspace root and verify that it exists and is empty. Hidden
   project or configuration files count as content. If it is not empty, stop and ask the user to
   open a new empty directory in WorkBuddy.
2. Run the bundled CLI without npm or npx. On Windows use:

```bat
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node.cmd" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" init --skip-mcp-install
```

On macOS or Linux use:

```bash
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" init --skip-mcp-install
```

Keep the command running while Maker prepares and clones the repository. Let the CLI show the app
list and ask the user to choose. Do not select an app automatically and do not install another MCP
registration.
