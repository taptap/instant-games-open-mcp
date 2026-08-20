---
description: 在当前空工作区中创建新的 TapTap Maker 项目
---

Create a new TapTap Maker project only in an empty workspace directory.

1. Resolve the current WorkBuddy workspace root and verify that it exists and is empty. Hidden
   project or configuration files count as content. If it is not empty, stop and ask the user to
   open a new empty directory in WorkBuddy.
2. If the user has not provided a project name, ask for one. Do not invent it.
3. Run the bundled CLI without npm or npx. On Windows use:

```bat
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node.cmd" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" init --create --name "<PROJECT_NAME>" --skip-mcp-install
```

On macOS or Linux use:

```bash
"${CODEBUDDY_PLUGIN_ROOT}/bin/run-node" "${CODEBUDDY_PLUGIN_ROOT}/dist/maker.js" init --create --name "<PROJECT_NAME>" --skip-mcp-install
```

Keep the command running while Maker prepares and clones the repository. Follow the CLI prompts
for login or app selection. Do not install another MCP registration.
