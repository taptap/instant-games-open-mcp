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

    // Complete Overview
    {
      uri: 'docs://leaderboard/overview',
      name: 'Leaderboard Complete Overview',
      description: 'Complete overview of all leaderboard APIs and features - READ THIS when you want to understand what APIs are available',
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
  'docs://leaderboard/overview': 'getLeaderboardOverview'
};
