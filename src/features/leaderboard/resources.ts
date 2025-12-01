/**
 * Leaderboard Resources
 * Unified definitions and handlers (no more manual sync required!)
 */

import type { ResourceRegistration } from '../../core/types/index.js';
import { leaderboardTools } from './docTools.js';

/**
 * Leaderboard Resources
 * Each resource combines its definition and handler in one place
 */
export const leaderboardResources: ResourceRegistration[] = [
  // 📖 API: Get Leaderboard Manager
  {
    uri: 'docs://leaderboard/api/get-manager',
    name: 'API: tap.getLeaderboardManager()',
    description:
      'How to get LeaderboardManager instance - READ THIS when user asks how to initialize or access leaderboard system',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.getLeaderboardManager(),
  },

  // 📖 API: Open Leaderboard
  {
    uri: 'docs://leaderboard/api/open',
    name: 'API: openLeaderboard()',
    description:
      'How to display leaderboard UI - READ THIS when user asks how to show/open/display leaderboard to players',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.openLeaderboard(),
  },

  // 📖 API: Submit Scores
  {
    uri: 'docs://leaderboard/api/submit-scores',
    name: 'API: submitScores()',
    description:
      'How to submit player scores - READ THIS when user asks how to upload/submit/save scores to leaderboard',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.submitScores(),
  },

  // 📖 API: Load Leaderboard Scores
  {
    uri: 'docs://leaderboard/api/load-scores',
    name: 'API: loadLeaderboardScores()',
    description:
      'How to load leaderboard data - READ THIS when user asks how to fetch/get/retrieve top scores or ranking list',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.loadLeaderboardScores(),
  },

  // 📖 API: Load Player Score
  {
    uri: 'docs://leaderboard/api/load-player-score',
    name: 'API: loadCurrentPlayerLeaderboardScore()',
    description:
      "How to get current player score and rank - READ THIS when user asks how to get/show player's own score/rank/position",
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.loadCurrentPlayerScore(),
  },

  // 📖 API: Load Centered Scores
  {
    uri: 'docs://leaderboard/api/load-centered-scores',
    name: 'API: loadPlayerCenteredScores()',
    description:
      'How to load scores around current player - READ THIS when user asks how to show nearby/surrounding players or competitors',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.loadPlayerCenteredScores(),
  },

  // 📚 Complete Overview
  {
    uri: 'docs://leaderboard/overview',
    name: 'Leaderboard Complete Overview',
    description:
      'Complete overview of all leaderboard APIs and features - READ THIS when you want to understand what APIs are available',
    mimeType: 'text/markdown',
    handler: async () => leaderboardTools.getLeaderboardOverview(),
  },
];
