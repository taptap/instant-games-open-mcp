# TapTap MCP Server - AI Setup Guide

> This document is for AI Agents. Follow these steps to help users set up TapTap Minigame MCP Server.

## What You Are Setting Up

- **Package:** `@taptap/minigame-open-mcp`
- **Transport:** stdio (via `npx`)
- **Prerequisite:** Node.js >= 18

---

## Step 1: Check Node.js

Run `node -v`. Version must be >= 18. If missing or too old, direct the user to install LTS from https://nodejs.org/zh-cn and restart the editor.

---

## Step 2: Write MCP Config

Determine the config file path based on the user's client:

| Client                   | Config File        | Location                               |
| ------------------------ | ------------------ | -------------------------------------- |
| **Cursor**               | `mcp.json`         | `~/.cursor/mcp.json` (global config)   |
| Claude Code              | `.mcp.json`        | Project root directory                 |
| VS Code + Copilot        | `.vscode/mcp.json` | `.vscode/` under project root          |
| Claude Desktop (macOS)   | `config.json`      | `~/.config/claude-desktop/config.json` |
| Claude Desktop (Windows) | `config.json`      | `%APPDATA%\Claude\config.json`         |

> **Cursor note:** Cursor loads MCP config from `~/.cursor/mcp.json`.

Read the existing file first (it may contain other MCP servers). Add the `taptap-minigame` entry into the existing `mcpServers` object without removing other entries. If the file does not exist, create it.

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@taptap/minigame-open-mcp"]
    }
  }
}
```

---

## Step 3: Restart & Verify

Ask the user to fully restart the editor. After restart, confirm the MCP server shows as connected (green status).

---

## Step 4: OAuth Authentication

On first use, authentication is required. The flow is:

1. Call `start_oauth_authorization` → returns a verification URL for the user to scan with TapTap App
2. User scans the QR code and confirms on their phone
3. After user confirms, call `complete_oauth_authorization` to finalize

Token is persisted automatically. Re-authentication is only needed if the token expires.

---

## Troubleshooting

If MCP fails to connect, check in order:

1. Config file is in the correct location (Cursor uses `~/.cursor/mcp.json`, not project root) and JSON is valid
2. `npx --version` works in terminal
3. Network can reach npm registry (`npm ping`). If blocked, set mirror: `npm config set registry https://registry.npmmirror.com`

If the user encounters file path errors (e.g., H5 upload), add `env` to the config:

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["-y", "@taptap/minigame-open-mcp"],
      "env": {
        "TAPTAP_MCP_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```
