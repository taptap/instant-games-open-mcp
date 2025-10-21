/**
 * MCP Resources Definitions
 * Resources expose read-only documentation and reference data
 */

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Get all resource definitions
 */
export function getResourceDefinitions(): ResourceDefinition[] {
  return [
    // LeaderboardManager API Documentation Resources
    // Read these when user asks HOW to implement a specific feature
    {
      uri: 'docs://leaderboard/api/get-manager',
      name: 'API: tap.getLeaderboardManager()',
      description: 'How to get LeaderboardManager instance - READ THIS when user asks how to initialize or access leaderboard system',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/open',
      name: 'API: openLeaderboard()',
      description: 'How to display leaderboard UI - READ THIS when user asks how to show/open/display leaderboard to players',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/submit-scores',
      name: 'API: submitScores()',
      description: 'How to submit player scores - READ THIS when user asks how to upload/submit/save scores to leaderboard',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-scores',
      name: 'API: loadLeaderboardScores()',
      description: 'How to load leaderboard data - READ THIS when user asks how to fetch/get/retrieve top scores or ranking list',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-player-score',
      name: 'API: loadCurrentPlayerLeaderboardScore()',
      description: 'How to get current player score and rank - READ THIS when user asks how to get/show player\'s own score/rank/position',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/api/load-centered-scores',
      name: 'API: loadPlayerCenteredScores()',
      description: 'How to load scores around current player - READ THIS when user asks how to show nearby/surrounding players or competitors',
      mimeType: 'text/markdown'
    },

    // Overview and Best Practices
    // Read these FIRST for general understanding, then read specific APIs above
    {
      uri: 'docs://leaderboard/overview',
      name: 'Leaderboard Complete Overview',
      description: 'Complete overview of all leaderboard APIs - READ THIS FIRST when user wants to understand what leaderboard features are available. Then read specific API docs above for implementation details.',
      mimeType: 'text/markdown'
    },
    {
      uri: 'docs://leaderboard/patterns',
      name: 'Integration Patterns & Best Practices',
      description: 'Common scenarios, integration patterns and best practices - READ THIS after overview for examples. Then read specific API docs above for detailed implementation.',
      mimeType: 'text/markdown'
    },

    // Client-side Integration Guide (static documentation)
    {
      uri: 'docs://leaderboard/guide/quickstart',
      name: 'Client-Side Integration Quick Start',
      description: 'STATIC client-side integration tutorial (assumes you already have leaderboard_id) - READ THIS when user wants to learn how to integrate leaderboard in their game code. For interactive server setup, use Prompt "leaderboard-integration" instead.',
      mimeType: 'text/markdown'
    },

    // Runtime App Information (dynamic data)
    {
      uri: 'app://current-app-info',
      name: 'Current App/Game Information',
      description: 'Currently selected app/game information including developer_id, app_id, app name, and cached leaderboard_id - READ THIS when you need to know which app is currently being used or configured',
      mimeType: 'text/markdown'
    },

    // Complete Integration Workflow (procedural guide)
    {
      uri: 'guide://leaderboard/integration-workflow',
      name: 'Complete Leaderboard Integration Workflow',
      description: 'COMPLETE step-by-step workflow from zero to production - READ THIS FIRST when user wants to integrate/add/setup/implement leaderboard. Covers: server creation, client code (NO SDK!), common pitfalls, testing. Essential reading before starting any leaderboard work.',
      mimeType: 'text/markdown'
    }
  ];
}

/**
 * Resource URI mapping to handler keys
 */
export const RESOURCE_URI_MAP: Record<string, string> = {
  'docs://leaderboard/api/get-manager': 'getLeaderboardManager',
  'docs://leaderboard/api/open': 'openLeaderboard',
  'docs://leaderboard/api/submit-scores': 'submitScores',
  'docs://leaderboard/api/load-scores': 'loadLeaderboardScores',
  'docs://leaderboard/api/load-player-score': 'loadCurrentPlayerScore',
  'docs://leaderboard/api/load-centered-scores': 'loadPlayerCenteredScores',
  'docs://leaderboard/overview': 'getLeaderboardOverview',
  'docs://leaderboard/patterns': 'getLeaderboardPatterns',
  'docs://leaderboard/guide/quickstart': 'getQuickStartGuide',
  'app://current-app-info': 'getCurrentAppInfo',
  'guide://leaderboard/integration-workflow': 'getIntegrationWorkflow'
};
