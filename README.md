# TapTap Minigame Open API MCP Server

> Model Context Protocol (MCP) server for TapTap minigame leaderboard documentation and management APIs.

🚀 **Auto-fetch IDs** | 📚 **Complete Docs** | 🔧 **Server-side Management**

## Features

### 📖 LeaderboardManager API Documentation

Complete documentation for all 5 LeaderboardManager APIs:
- `tap.getLeaderboardManager()` - Initialize leaderboard system
- `openLeaderboard()` - Display leaderboard UI
- `submitScores()` - Submit player scores
- `loadLeaderboardScores()` - Fetch leaderboard data
- `loadCurrentPlayerLeaderboardScore()` - Get player's rank
- `loadPlayerCenteredScores()` - Load nearby players

Each API includes:
- Method signature
- Parameter descriptions
- Return values
- Complete code examples
- Error handling

### ⚙️ Server-side Management

- **Create Leaderboards** - Create new leaderboards via TapTap API
- **List Leaderboards** - Query existing leaderboards
- **Auto ID Management** - Automatically fetch and cache developer_id and app_id
- **Smart Workflow** - Intelligent guidance for leaderboard integration

### 🎯 Intelligent Workflow

The `start_leaderboard_integration` tool provides step-by-step guidance:
1. Check existing leaderboards
2. Create if needed
3. Guide implementation with docs

## Quick Start

### Installation

```bash
npm install -g minigame-open-mcp
```

Or use directly with npx (no installation needed):

```bash
npx minigame-open-mcp
```

### Configuration

#### For Claude Desktop

Add to `~/.config/claude-desktop/config.json`:

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TAPTAP_CLIENT_ID": "your_client_id",
        "TAPTAP_CLIENT_SECRET": "your_client_secret",
        "TAPTAP_MINIGAME_MCP_VERBOSE": "false"
      }
    }
  }
}
```

**With debugging enabled:**

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MAC_TOKEN": "{\"kid\":\"your_kid\",\"token_type\":\"mac\",\"mac_key\":\"your_key\",\"mac_algorithm\":\"hmac-sha-1\"}",
        "TAPTAP_CLIENT_ID": "your_client_id",
        "TAPTAP_CLIENT_SECRET": "your_client_secret",
        "TAPTAP_MINIGAME_MCP_VERBOSE": "true"
      }
    }
  }
}
```

#### For OpenHands

```json
{
  "mcpServers": {
    "taptap-minigame": {
      "command": "npx",
      "args": ["@mikoto_zero/minigame-open-mcp"],
      "env": {
        "TAPTAP_MAC_TOKEN": "${CURRENT_USER_MAC_TOKEN}",
        "TAPTAP_CLIENT_ID": "your_client_id",
        "TAPTAP_CLIENT_SECRET": "your_client_secret",
        "TAPTAP_PROJECT_PATH": "${CURRENT_PROJECT_PATH}",
        "TAPTAP_MINIGAME_MCP_VERBOSE": "false"
      }
    }
  }
}
```

### Environment Variables

**Required:**
- `TAPTAP_MAC_TOKEN` - MAC Token in JSON format for authentication
- `TAPTAP_CLIENT_ID` - Client ID for API access
- `TAPTAP_CLIENT_SECRET` - Client secret for request signing

**Optional:**
- `TAPTAP_ENV` - Environment: `production` (default) or `rnd`
- `TAPTAP_PROJECT_PATH` - Project path for local caching
- `TAPTAP_MINIGAME_MCP_VERBOSE` - Detailed logging: `true` or `false` (default)

**Debugging:**

Enable detailed logging to see all tool calls, HTTP requests/responses:

```bash
export TAPTAP_MINIGAME_MCP_VERBOSE=true
npm start
```

The verbose mode logs:
- 📥 Tool call inputs and outputs
- 📤 HTTP request headers and body
- 📥 HTTP response status and data
- 🔒 Sensitive data automatically masked

## Usage

### Scenario 1: Getting Started with Leaderboards

```
User: "I want to integrate leaderboards into my game"

AI Agent calls: start_leaderboard_integration

System response:
✅ Checks existing leaderboards
✅ Guides creation if needed
✅ Shows available leaderboard features
✅ Provides next steps
```

### Scenario 2: Get Implementation Code

```
User: "How do I submit scores to the leaderboard?"

AI Agent calls: submit_scores

System returns:
✅ Method signature: leaderboardManager.submitScores(scores, callback)
✅ Parameter documentation
✅ Complete code example
✅ Error handling guide
```

### Scenario 3: Create a Leaderboard

```
User: "Create a weekly high score leaderboard"

AI Agent calls: create_leaderboard
{
  title: "Weekly High Score",
  period_type: 1,
  score_type: 0,
  score_order: 1,
  calc_type: 0
}

System:
✅ Auto-fetches developer_id and app_id
✅ Creates leaderboard
✅ Returns leaderboard_id
✅ Caches for future use
```

## Available Tools (14 total)

### Core API Documentation Tools (6)
- `get_leaderboard_manager`
- `open_leaderboard`
- `submit_scores`
- `load_leaderboard_scores`
- `load_current_player_score`
- `load_player_centered_scores`

### Management Tools (2)
- `create_leaderboard` - Create new leaderboards
- `list_leaderboards` - Query existing leaderboards

### Helper Tools (3)
- `search_leaderboard_docs` - Search documentation
- `get_leaderboard_overview` - System overview
- `get_leaderboard_patterns` - Best practices

### System Tools (2)
- `check_environment` - Environment check
- `start_leaderboard_integration` - Workflow guidance

### User Data Tool (1)
- `get_user_leaderboard_scores` - Query user scores (requires token)

## Technical Details

### Request Signing

All server-side API requests use HMAC-SHA256 signing:

```
Signature = HMAC-SHA256(
  method + "\n" +
  url + "\n" +
  x-tap-headers + "\n" +
  body + "\n",
  TAPTAP_CLIENT_SECRET
)
```

### Auto ID Management

Developer ID and App ID are automatically managed:

1. First call to management tools triggers `/level/v1/list` API
2. Selects first developer and first app
3. Caches to `~/.config/taptap-minigame/app.json`
4. Subsequent calls use cached values
5. No manual ID input needed

### Multi-Environment Support

- **Production** (default): `https://agent.tapapis.cn`
- **RND**: `https://agent.api.xdrnd.cn`

Switch via `TAPTAP_ENV` environment variable.

## Requirements

- Node.js >= 16.0.0
- Valid TapTap user token
- Client ID and secret for API access

## API Reference

Based on TapTap official documentation:
- https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/

## License

MIT

## Links

- [TapTap Developer Portal](https://developer.taptap.cn/)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Issues](https://github.com/taptap/taptap-minigame-mcp-server/issues)
