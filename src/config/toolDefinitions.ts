/**
 * MCP Tool Definitions
 * Centralized tool definitions for the MCP server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Get all tool definitions
 */
export function getToolDefinitions(): Tool[] {
  return [
    // 🎯 Workflow Guidance Tool
    {
      name: 'start_leaderboard_integration',
      description: `⚠️ DEPRECATED: Use Prompt "leaderboard-integration" instead for better experience.

START HERE when user asks about integrating leaderboards, implementing rankings, or "接入排行榜".

This tool guides the complete leaderboard integration workflow:
1. Check if leaderboards already exist on server
2. Guide user to create one if needed (server-side only, via this MCP tool)
3. Provide client-side implementation code and docs

IMPORTANT: TapTap leaderboard integration does NOT require npm packages or external JS SDKs!
- Client code uses the global 'tap' object (provided by TapTap runtime)
- Access via: tap.getLeaderboardManager()
- No imports or dependencies needed
- Works directly in TapTap minigame environment

Use this as the first step for any leaderboard integration request.`,
      inputSchema: {
        type: 'object',
        properties: {
          purpose: {
            type: 'string',
            description: 'What the user wants to do with leaderboards (optional, for context)'
          }
        }
      }
    },

    // 📖 Core LeaderboardManager API Documentation Tools (one tool per API)
    // ⚠️ DEPRECATED: Please use Resources instead for better performance
    {
      name: 'get_leaderboard_manager',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/get-manager" instead.\n\nGet documentation for tap.getLeaderboardManager() - how to obtain the LeaderboardManager instance.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'open_leaderboard',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/open" instead.\n\nGet documentation for leaderboardManager.openLeaderboard() - how to display the TapTap leaderboard UI.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'submit_scores',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/submit-scores" instead.\n\nGet documentation for leaderboardManager.submitScores() - how to submit player scores to leaderboards.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'load_leaderboard_scores',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/load-scores" instead.\n\nGet documentation for leaderboardManager.loadLeaderboardScores() - how to retrieve paginated leaderboard data.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'load_current_player_score',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/load-player-score" instead.\n\nGet documentation for leaderboardManager.loadCurrentPlayerLeaderboardScore() - how to get current player\'s score and rank.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'load_player_centered_scores',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/api/load-centered-scores" instead.\n\nGet documentation for leaderboardManager.loadPlayerCenteredScores() - how to load scores of players near current user.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },

    // 🔍 Helper Tools
    {
      name: 'search_leaderboard_docs',
      description: 'Search all leaderboard documentation by keyword. Use this when user asks a general question or you\'re not sure which specific API they need.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keyword, such as: leaderboard, score, ranking, submission, etc.'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'get_leaderboard_overview',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/overview" instead.\n\nGet comprehensive overview of all TapTap leaderboard APIs and features.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_leaderboard_patterns',
      description: '⚠️ DEPRECATED: Use Resource "docs://leaderboard/patterns" instead.\n\nGet complete implementation examples and best practices for leaderboards.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },

    // 🔧 Environment Check Tool
    {
      name: 'check_environment',
      description: 'Check environment configuration and user authentication status. Use this to verify if TDS_MCP_MAC_TOKEN and TDS_MCP_CLIENT_ID are configured.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },

    // 📱 Developer & App Management Tools
    {
      name: 'list_developers_and_apps',
      description: 'List all developers and their apps/games for the current user. Use this when multiple developers or apps exist and you need to let user/AI choose which one to use.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'select_app',
      description: 'Select a specific developer and app to use for subsequent operations. This will cache the selection. Use this after listing developers and apps with list_developers_and_apps.',
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID to select (required)'
          },
          app_id: {
            type: 'number',
            description: 'App/Game ID to select (required)'
          }
        },
        required: ['developer_id', 'app_id']
      }
    },

    // ⚙️ Leaderboard Management Tools (requires TDS_MCP_MAC_TOKEN, TDS_MCP_CLIENT_ID, TDS_MCP_CLIENT_TOKEN)
    {
      name: 'create_leaderboard',
      description: `Create a new leaderboard on TapTap server.

⚠️ IMPORTANT AI AGENT BEHAVIOR:
DO NOT create a leaderboard without user confirmation!

SMART WORKFLOW (use context to make suggestions):
1. 🔍 **Analyze the context** - Look at project files, code, game name, etc. to infer game type
2. 💡 **Provide intelligent suggestions** - Based on context, suggest appropriate leaderboard configuration
3. ✅ **Get user confirmation** - Present your suggestion and ask user to confirm or modify

Example smart interaction:
User: "I want to create a leaderboard"
AI (after analyzing context): "Based on your project files, I see this is a racing game. I suggest creating a 'Weekly Best Time Leaderboard' with these settings:
- Type: Best time (faster is better)
- Reset: Every Monday at 8:00 AM
- Calculation: Keep best score

Does this work for you? Or would you like to adjust any settings?"

HANDLING USER RESPONSES:
- ✅ If user confirms (e.g., "yes", "okay", "sounds good") → Create leaderboard immediately
- 🔄 If user wants modifications (e.g., "change to daily", "I want high score instead") → Adjust settings and confirm again
- ❌ If user rejects (e.g., "no", "not suitable", "I want something different") → Ask detailed questions to understand their needs:
  1. What type of ranking do they actually want?
  2. What reset period would be better?
  3. Any other specific requirements?
  Then provide a new suggestion based on their feedback.

FALLBACK (when context is unclear or after user rejection):
If you cannot infer the game type from context, ask these questions:
1. 📝 What type of game is this?
2. 🎯 What kind of ranking: high score, best time, or cumulative points?
3. 🔄 Reset period: never, daily, weekly, or monthly?
4. ⏰ Reset time (if applicable)?

⚠️ CRITICAL RULES:
1. ALL enum values CANNOT be 0 (0 = UNSPECIFIED/invalid)! Use values 1-4 only!
2. If period_type is 2/3/4 (Daily/Weekly/Monthly), you MUST provide period_time!
   - Auto-defaults to "08:00:00" (8 AM) if not provided
   - period_type=1 (Always) does NOT need period_time

Parameter mapping based on user answers:
- High score game → period_type=3, score_type=1, score_order=1, calc_type=2
- Racing/Time trial → period_type=3, score_type=2, score_order=2, calc_type=2
- Cumulative points → period_type=1, score_type=1, score_order=1, calc_type=1
- Never reset → period_type=1
- Daily reset → period_type=2, period_time required
- Weekly reset → period_type=3, period_time required
- Monthly reset → period_type=4, period_time required

Auto-fetches developer_id and app_id if not provided. Returns leaderboard_id for client-side APIs.`,
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID (optional, auto-fetched from /level/v1/list API if not provided)'
          },
          app_id: {
            type: 'number',
            description: 'Application/Game ID (optional, auto-fetched from /level/v1/list API if not provided)'
          },
          title: {
            type: 'string',
            description: 'Leaderboard title/name, e.g., "Weekly High Score", "Best Time Trial" (REQUIRED)'
          },
          period_type: {
            type: 'number',
            description: 'Reset period (CANNOT be 0!): 1=Always/永久(never reset), 2=Daily/每天(daily reset), 3=Weekly/每周一(reset every Monday), 4=Monthly/每月1日(reset on 1st). CRITICAL: If NOT 1, you MUST provide period_time! (REQUIRED, must be 1-4)',
            enum: [1, 2, 3, 4]
          },
          score_type: {
            type: 'number',
            description: 'Score data type (CANNOT be 0!): 1=Integer/数值型 (points, kills), 2=Time/时间型 (milliseconds) (REQUIRED, must be 1 or 2)',
            enum: [1, 2]
          },
          score_order: {
            type: 'number',
            description: 'Ranking order (CANNOT be 0!): 1=Descending/降序 (higher is better, e.g., points), 2=Ascending/升序 (lower is better, e.g., time) (REQUIRED, must be 1 or 2)',
            enum: [1, 2]
          },
          calc_type: {
            type: 'number',
            description: 'Score calculation method (CANNOT be 0!): 1=Sum/累计分 (add all), 2=Best/最佳分 (keep best), 3=Latest/最新分 (keep latest) (REQUIRED, must be 1-3)',
            enum: [1, 2, 3]
          },
          display_limit: {
            type: 'number',
            description: 'Maximum number of entries to display in leaderboard UI (optional, default 100, range 1-1000)'
          },
          period_time: {
            type: 'string',
            description: 'Reset time in HH:MM:SS format, e.g., "08:00:00" for 8 AM, "00:00:00" for midnight. REQUIRED when period_type is 2/3/4 (Daily/Weekly/Monthly). Auto-defaults to "08:00:00" if not provided and needed.'
          },
          score_unit: {
            type: 'string',
            description: 'Unit text displayed with score, e.g., "分" (points), "秒" (seconds), "kills" (optional)'
          }
        },
        required: ['title', 'period_type', 'score_type', 'score_order', 'calc_type']
      }
    },
    {
      name: 'list_leaderboards',
      description: 'List all leaderboards created for the current app/game. Use this to check existing leaderboards before creating new ones or when user asks "我有哪些排行榜" or wants to see leaderboard IDs. Auto-fetches developer_id and app_id if not provided.',
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID (optional, will be auto-fetched if not provided)'
          },
          app_id: {
            type: 'number',
            description: 'Application/Game ID (optional, will be auto-fetched if not provided)'
          },
          page: {
            type: 'number',
            description: 'Page number, starts from 1 (optional, default 1)'
          },
          page_size: {
            type: 'number',
            description: 'Results per page (optional, default 10)'
          }
        }
      }
    },
    {
      name: 'publish_leaderboard',
      description: `Publish a leaderboard or set it to whitelist-only mode. Use this when user wants to publish a leaderboard to production or restrict it to whitelist users only.

Usage scenarios:
- Publish leaderboard to production: set publish=true (makes it visible to all users)
- Set to whitelist-only mode: set publish=false (only whitelist users can see it)
- Switch between public and whitelist modes

This is typically used:
1. After creating a new leaderboard to make it live
2. During beta testing to limit access to specific users
3. To temporarily disable public access without deleting the leaderboard

Auto-fetches developer_id and app_id if not provided. Requires leaderboard ID (get from list_leaderboards).`,
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID (optional, will be auto-fetched if not provided)'
          },
          app_id: {
            type: 'number',
            description: 'Application/Game ID (optional, will be auto-fetched if not provided)'
          },
          id: {
            type: 'number',
            description: 'Leaderboard ID (REQUIRED, get from list_leaderboards tool)'
          },
          publish: {
            type: 'boolean',
            description: 'true = publish to production (visible to all users), false = whitelist-only mode (visible to whitelist users only) (REQUIRED)'
          }
        },
        required: ['id', 'publish']
      }
    },

    // 🔑 User Data Tools (requires TDS_MCP_MAC_TOKEN)
    {
      name: 'get_user_leaderboard_scores',
      description: 'Get actual user leaderboard score data from TapTap API (requires user login). Use this when user wants to see their own scores or ranking positions. Falls back to documentation mode if token is not provided.',
      inputSchema: {
        type: 'object',
        properties: {
          leaderboardId: {
            type: 'string',
            description: 'The specific leaderboard ID to query. Leave empty to get all leaderboards associated with the user.'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of score entries to return. Default is 10.',
            default: 10
          }
        }
      }
    }
  ];
}
