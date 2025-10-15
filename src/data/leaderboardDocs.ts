/**
 * TapTap Minigame Leaderboard API Documentation
 * Based on: https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/
 */

export interface LeaderboardAPI {
  name: string;
  method: string;
  description: string;
  parameters?: Record<string, string>;
  returnValue?: string;
  example: string;
}

export interface LeaderboardCategory {
  title: string;
  description: string;
  apis: LeaderboardAPI[];
}

export interface LeaderboardDocumentation {
  title: string;
  description: string;
  apiReference: string;
  categories: Record<string, LeaderboardCategory>;
}

export const LEADERBOARD_DOCUMENTATION: LeaderboardDocumentation = {
  title: "TapTap Minigame Leaderboard API",
  description: `Complete leaderboard functionality for TapTap minigames, including score submission, ranking queries, and leaderboard display.

⚠️ IMPORTANT:
- NO npm packages or SDK installation required
- NO imports needed
- The 'tap' object is a GLOBAL object provided by TapTap runtime environment
- All APIs are accessed via: tap.getLeaderboardManager()
- Works ONLY in TapTap minigame environment (not in regular web browsers)
- All methods accept a SINGLE object parameter (not multiple parameters)`,
  apiReference: "https://developer.taptap.cn/minigameapidoc/dev/api/open-api/leaderboard/",

  categories: {
    initialization: {
      title: "Initialization",
      description: "Get the LeaderboardManager instance from the global 'tap' object (provided by TapTap runtime)",
      apis: [
        {
          name: "tap.getLeaderboardManager",
          method: "tap.getLeaderboardManager()",
          description: "Get the LeaderboardManager instance to access leaderboard functionality. ⚠️ IMPORTANT: 'tap' is a GLOBAL object provided by TapTap runtime, NO imports or installations needed.",
          returnValue: "LeaderboardManager - The leaderboard manager instance",
          example: `// ⚠️ IMPORTANT: 'tap' is a global object, NO imports needed!
// This works ONLY in TapTap minigame environment

// Get LeaderboardManager instance
const leaderboardManager = tap.getLeaderboardManager();

// Now you can use leaderboardManager to call various methods
// All methods accept a SINGLE object parameter
leaderboardManager.openLeaderboard({
  leaderboardId: "your_id",
  collection: "public",
  callback: { onSuccess: (res) => {}, onFailure: (code, msg) => {} }
});`
        }
      ]
    },

    display: {
      title: "Display Leaderboard",
      description: "Open and display the leaderboard UI page",
      apis: [
        {
          name: "openLeaderboard",
          method: "leaderboardManager.openLeaderboard({ leaderboardId, collection, callback })",
          description: "Opens TapTap's leaderboard page, displaying total and friend leaderboards for the specified leaderboard ID",
          parameters: {
            "leaderboardId": "string (required) - Unique identifier for the leaderboard",
            "collection": "string (optional) - Leaderboard type: 'friends' for friend rankings or 'public' (default) for global rankings",
            "callback.onSuccess": "function (optional) - Success callback function",
            "callback.onFailure": "function (optional) - Failure callback with (code, message) parameters"
          },
          returnValue: "void - Opens native leaderboard UI",
          example: `// Open leaderboard UI
const leaderboardManager = tap.getLeaderboardManager();

// Open global leaderboard
leaderboardManager.openLeaderboard({
  leaderboardId: "weekly_high_score",
  collection: "public",
  callback: {
    onSuccess: function(res) {
      console.log("Leaderboard opened successfully:", res);
    },
    onFailure: function(code, message) {
      console.error(\`Failed to open leaderboard: code=\${code}, message=\${message}\`);
      // Error codes:
      // 500001: Leaderboard ID not found
      // 1025: Friend relationship permissions not declared
      // 104/103: User privacy/authorization issues
    }
  }
});

// Open friend leaderboard
leaderboardManager.openLeaderboard({
  leaderboardId: "friend_ranking",
  collection: "friends",
  callback: {
    onSuccess: function(res) {
      console.log("Friend leaderboard opened");
    },
    onFailure: function(code, message) {
      console.error("Failed:", message);
    }
  }
});`
        }
      ]
    },

    score_submission: {
      title: "Score Submission",
      description: "Submit player scores to leaderboards",
      apis: [
        {
          name: "submitScores",
          method: "leaderboardManager.submitScores({ scores, callback })",
          description: "Batch submit user leaderboard scores. Maximum of 5 scores can be submitted at once.",
          parameters: {
            "scores": "Array<ScoreEntry> (required) - Array of score entries to submit, maximum 5 entries",
            "scores[].leaderboardId": "string (required) - Unique identifier for the leaderboard",
            "scores[].score": "number (required) - Integer score value to submit",
            "callback.onSuccess": "function (optional) - Success callback function",
            "callback.onFailure": "function (optional) - Failure callback with (code, message) parameters"
          },
          returnValue: "void - Submission result is returned via callback",
          example: `// Submit scores to multiple leaderboards
const leaderboardManager = tap.getLeaderboardManager();

leaderboardManager.submitScores({
  scores: [
    {
      leaderboardId: "leaderboard_1",
      score: 1000
    },
    {
      leaderboardId: "leaderboard_2",
      score: 2000
    }
  ],
  callback: {
    onSuccess: function(res) {
      console.log("submitScores success:", res);
    },
    onFailure: function(code, message) {
      console.error(\`submitScores failed: \${code}, \${message}\`);
      // Error codes:
      // 500001: Leaderboard ID not found
      // 500002: Leaderboard parameter error
      // 500199: Invalid number of score entries (exceeds 5)
    }
  }
});

// Submit single score
leaderboardManager.submitScores({
  scores: [
    {
      leaderboardId: "weekly_high_score",
      score: 15000
    }
  ],
  callback: {
    onSuccess: function(res) {
      console.log("Score submitted successfully");
    },
    onFailure: function(code, message) {
      console.error("Failed to submit score:", message);
    }
  }
});`
        }
      ]
    },

    score_query: {
      title: "Score Query",
      description: "Query leaderboard scores and rankings",
      apis: [
        {
          name: "loadLeaderboardScores",
          method: "leaderboardManager.loadLeaderboardScores({ leaderboardId, collection, maxSize, nextPage, periodToken, callback })",
          description: "Retrieve paginated leaderboard data with support for friend and public rankings",
          parameters: {
            "leaderboardId": "string (required) - Unique identifier for the leaderboard",
            "collection": "string (optional) - Leaderboard type: 'friends' or 'public' (default)",
            "maxSize": "number (required) - Limit results between 1-200 entries",
            "nextPage": "string | undefined (optional) - Token for pagination to get next page, pass undefined for first request",
            "periodToken": "string | undefined (optional) - Time period identifier for the leaderboard",
            "callback": "CommonCallback (optional) - Callback object with onSuccess and onFailure",
            "callback.onSuccess": "function (optional) - Success callback function",
            "callback.onFailure": "function (optional) - Failure callback with (code, message) parameters"
          },
          returnValue: "void - Leaderboard data is returned via callback including scores list and pagination details",
          example: `// Load top scores from a leaderboard
const leaderboardManager = tap.getLeaderboardManager();

leaderboardManager.loadLeaderboardScores({
  leaderboardId: "your_leaderboardId",
  collection: "friends",
  maxSize: 10,
  nextPage: undefined,  // undefined for first request
  periodToken: undefined,
  callback: {
    onSuccess: function(res) {
      console.log("Leaderboard scores:", res);
      // res contains:
      // - leaderboard info
      // - scores list
      // - nextPage token for pagination
      // - isTruncated flag
    },
    onFailure: function(code, message) {
      console.error("Load failed:", message);
    }
  }
});

// Load global leaderboard with pagination
let nextPageToken = undefined;

function loadNextPage() {
  leaderboardManager.loadLeaderboardScores({
    leaderboardId: "weekly_high_score",
    collection: "public",
    maxSize: 50,
    nextPage: nextPageToken,
    periodToken: undefined,
    callback: {
      onSuccess: function(res) {
        console.log("Page loaded:", res.scores.length, "entries");

        // Check if there are more pages
        if (res.isTruncated) {
          nextPageToken = res.nextPage;
          // Can load next page with the new token
        }
      },
      onFailure: function(code, message) {
        console.error("Failed to load page:", message);
      }
    }
  });
}`
        },
        {
          name: "loadCurrentPlayerLeaderboardScore",
          method: "leaderboardManager.loadCurrentPlayerLeaderboardScore({ leaderboardId, collection, periodToken, callback })",
          description: "Get the current user's score and ranking position in the specified leaderboard. Requires user to have submitted a score to this leaderboard.",
          parameters: {
            "leaderboardId": "string (required) - Unique identifier for the leaderboard",
            "collection": "string (optional) - Leaderboard type: 'friends' or 'public' (default)",
            "periodToken": "string (optional) - Time period identifier for the leaderboard",
            "callback.onSuccess": "function (optional) - Success callback function",
            "callback.onFailure": "function (optional) - Failure callback with (code, message) parameters"
          },
          returnValue: "void - Current player's score data is returned via callback",
          example: `// Get current player's ranking
const leaderboardManager = tap.getLeaderboardManager();

leaderboardManager.loadCurrentPlayerLeaderboardScore({
  leaderboardId: "weekly_high_score",
  collection: "public",
  periodToken: undefined,
  callback: {
    onSuccess: function(res) {
      console.log("Your score:", res.score);
      console.log("Your rank:", res.rank);
      console.log("Leaderboard:", res.leaderboard);
    },
    onFailure: function(code, message) {
      console.error("Failed to load player score:", message);
    }
  }
});

// Get friend leaderboard ranking
leaderboardManager.loadCurrentPlayerLeaderboardScore({
  leaderboardId: "friend_ranking",
  collection: "friends",
  periodToken: undefined,
  callback: {
    onSuccess: function(res) {
      console.log("Your rank among friends:", res.rank);
    },
    onFailure: function(code, message) {
      console.error("Failed:", message);
    }
  }
});`
        },
        {
          name: "loadPlayerCenteredScores",
          method: "leaderboardManager.loadPlayerCenteredScores({ leaderBoardId, collection, maxCount, periodToken, callback })",
          description: "Retrieve scores for the current user and nearby players on a leaderboard, useful for showing surrounding competitors. ⚠️ NOTE: Parameter name is 'leaderBoardId' (capital B), not 'leaderboardId'.",
          parameters: {
            "leaderBoardId": "string (required) - Unique identifier for the leaderboard (⚠️ Note: capital 'B')",
            "collection": "string (required) - Leaderboard type: 'friends' or 'public'",
            "maxCount": "number (required) - Limit results between 1-25 players",
            "periodToken": "string (required) - Time period identifier for the leaderboard",
            "callback": "CommonCallback (required) - Callback object with onSuccess and onFailure",
            "callback.onSuccess": "function (optional) - Success callback function",
            "callback.onFailure": "function (optional) - Failure callback with (code, message) parameters"
          },
          returnValue: "void - Nearby players' scores are returned via callback",
          example: `// Load nearby players' scores
const leaderboardManager = tap.getLeaderboardManager();

leaderboardManager.loadPlayerCenteredScores({
  leaderBoardId: "your_leaderboardId",  // ⚠️ Note: capital 'B'
  collection: "friends",
  maxCount: 10,
  periodToken: "",
  callback: {
    onSuccess: function(res) {
      console.log("Players around you:", res);
      // res contains current player and nearby players' scores
      res.scores.forEach(score => {
        const marker = score.isCurrentPlayer ? '👉' : '  ';
        console.log(\`\${marker} Rank #\${score.rank}: \${score.playerName} - \${score.score}\`);
      });
    },
    onFailure: function(code, message) {
      console.error("Failed to load nearby scores:", message);
    }
  }
});

// Load surrounding players on global leaderboard
leaderboardManager.loadPlayerCenteredScores({
  leaderBoardId: "global_ranking",  // ⚠️ Note: capital 'B'
  collection: "public",
  maxCount: 20,
  periodToken: "",
  callback: {
    onSuccess: function(res) {
      console.log("Loaded", res.scores.length, "players around you");
    },
    onFailure: function(code, message) {
      console.error("Failed:", message);
    }
  }
});`
        }
      ]
    },

    common_scenarios: {
      title: "Common Implementation Scenarios",
      description: "Complete examples for typical use cases",
      apis: [
        {
          name: "Complete Game Flow",
          method: "N/A",
          description: "Example of integrating leaderboard into a complete game flow",
          example: `// Complete leaderboard integration example
const leaderboardManager = tap.getLeaderboardManager();

// 1. After game ends, submit score
async function submitGameScore(finalScore) {
  try {
    // Use leaderboardId (not leaderboardName!)
    // Wrap in scores array within an object
    await leaderboardManager.submitScores({
      scores: [{
        leaderboardId: 'daily_ranking',  // Use leaderboardId
        score: finalScore
      }]
    });
    console.log('Score submitted!');
    return true;
  } catch (error) {
    console.error('Submit failed:', error);
    return false;
  }
}

// 2. Show player's ranking after submission
async function showPlayerRanking() {
  try {
    // Use object parameter with leaderboardId
    const playerScore = await leaderboardManager.loadCurrentPlayerLeaderboardScore({
      leaderboardId: 'daily_ranking',
      collection: 'public'
    });

    // Display ranking to player
    showMessage(\`Your rank: #\${playerScore.rank}\`);
    showMessage(\`Your score: \${playerScore.score}\`);

    // Show if player improved
    if (playerScore.previousRank && playerScore.rank < playerScore.previousRank) {
      showMessage(\`🎉 You moved up \${playerScore.previousRank - playerScore.rank} positions!\`);
    }
  } catch (error) {
    console.error('Failed to get ranking:', error);
  }
}

// 3. Display nearby competitors
async function showNearbyPlayers() {
  try {
    // Use object parameter with leaderboardId
    const nearby = await leaderboardManager.loadPlayerCenteredScores({
      leaderboardId: 'daily_ranking',
      before: 3,
      after: 3
    });

    // Render leaderboard UI
    renderLeaderboard(nearby.entries);
  } catch (error) {
    console.error('Failed to load nearby players:', error);
  }
}

// 4. Open full leaderboard when player clicks "View All"
function openFullLeaderboard() {
  // Use object parameter with leaderboardId
  leaderboardManager.openLeaderboard({
    leaderboardId: 'daily_ranking',
    collection: 'public'
  });
}

// Complete flow
async function handleGameEnd(finalScore) {
  const submitted = await submitGameScore(finalScore);
  if (submitted) {
    await showPlayerRanking();
    await showNearbyPlayers();
  }
}
`
        },
        {
          name: "Pagination Example",
          method: "N/A",
          description: "Example of implementing paginated leaderboard browsing",
          example: `// Paginated leaderboard implementation
class LeaderboardView {
  constructor() {
    this.leaderboardManager = tap.getLeaderboardManager();
    this.currentPage = 0;
    this.pageSize = 20;
    this.leaderboardName = 'global_ranking';
  }

  async loadPage(page) {
    try {
      const offset = page * this.pageSize;
      const data = await this.leaderboardManager.loadLeaderboardScores(
        this.leaderboardName,
        {
          offset: offset,
          limit: this.pageSize
        }
      );

      this.renderPage(data);
      this.currentPage = page;

      // Calculate total pages
      const totalPages = Math.ceil(data.total / this.pageSize);
      this.updatePagination(page, totalPages);

      return data;
    } catch (error) {
      console.error('Failed to load page:', error);
      throw error;
    }
  }

  async nextPage() {
    await this.loadPage(this.currentPage + 1);
  }

  async previousPage() {
    if (this.currentPage > 0) {
      await this.loadPage(this.currentPage - 1);
    }
  }

  renderPage(data) {
    // Render leaderboard entries
    const listElement = document.getElementById('leaderboard-list');
    listElement.innerHTML = data.entries.map(entry => \`
      <div class="leaderboard-entry">
        <span class="rank">#\${entry.rank}</span>
        <span class="player">\${entry.playerName}</span>
        <span class="score">\${entry.score}</span>
      </div>
    \`).join('');
  }

  updatePagination(current, total) {
    document.getElementById('page-info').textContent = \`Page \${current + 1} of \${total}\`;
    document.getElementById('prev-btn').disabled = current === 0;
    document.getElementById('next-btn').disabled = current === total - 1;
  }
}

// Usage
const leaderboardView = new LeaderboardView();
leaderboardView.loadPage(0);
`
        }
      ]
    }
  }
};

/**
 * Search leaderboard documentation by keyword
 */
export function searchLeaderboardDocs(query: string, category?: string): string[] {
  const results: string[] = [];
  const lowerQuery = query.toLowerCase();

  const categoriesToSearch = category
    ? [LEADERBOARD_DOCUMENTATION.categories[category]]
    : Object.values(LEADERBOARD_DOCUMENTATION.categories);

  for (const cat of categoriesToSearch) {
    if (!cat) continue;

    for (const api of cat.apis) {
      const searchText = `${api.name} ${api.description} ${api.example}`.toLowerCase();
      if (searchText.includes(lowerQuery)) {
        results.push(`
### ${api.name}

**Method:** \`${api.method}\`

**Description:** ${api.description}

${api.parameters ? `**Parameters:**
${Object.entries(api.parameters).map(([key, value]) => `- \`${key}\`: ${value}`).join('\n')}
` : ''}

${api.returnValue ? `**Returns:** ${api.returnValue}\n` : ''}

**Example:**
\`\`\`javascript
${api.example}
\`\`\`
`);
      }
    }
  }

  return results;
}

/**
 * Get overview of leaderboard system
 */
export function getLeaderboardOverview(): string {
  return `# ${LEADERBOARD_DOCUMENTATION.title}

${LEADERBOARD_DOCUMENTATION.description}

**Official API Reference:** ${LEADERBOARD_DOCUMENTATION.apiReference}

## Available Categories

${Object.entries(LEADERBOARD_DOCUMENTATION.categories).map(([key, cat]) => `
### ${cat.title}
${cat.description}

Available methods: ${cat.apis.map(api => `\`${api.name}\``).join(', ')}
`).join('\n')}

## Quick Start

⚠️ **CRITICAL: Use leaderboardId (NOT leaderboardName) and wrap parameters in objects!**

\`\`\`javascript
// 1. Get LeaderboardManager instance
const leaderboardManager = tap.getLeaderboardManager();

// 2. Submit a score (use leaderboardId and wrap in scores array)
await leaderboardManager.submitScores({
  scores: [{
    leaderboardId: 'my_leaderboard',  // Use leaderboardId (not leaderboardName)
    score: 1000
  }]
});

// 3. Query current player's rank (use object parameter)
const playerScore = await leaderboardManager.loadCurrentPlayerLeaderboardScore({
  leaderboardId: 'my_leaderboard',
  collection: 'public'
});
console.log('Your rank:', playerScore.rank);

// 4. Open leaderboard UI (use object parameter)
leaderboardManager.openLeaderboard({
  leaderboardId: 'my_leaderboard'
});
\`\`\`
`;
}

/**
 * Get detailed documentation for a specific category
 */
export function getCategoryDocs(category: string): string {
  const cat = LEADERBOARD_DOCUMENTATION.categories[category];
  if (!cat) {
    return `Category "${category}" not found. Available categories: ${Object.keys(LEADERBOARD_DOCUMENTATION.categories).join(', ')}`;
  }

  return `# ${cat.title}

${cat.description}

${cat.apis.map(api => `
## ${api.name}

**Method:** \`${api.method}\`

**Description:** ${api.description}

${api.parameters ? `### Parameters

${Object.entries(api.parameters).map(([key, value]) => `- **\`${key}\`**: ${value}`).join('\n')}
` : ''}

${api.returnValue ? `### Returns

${api.returnValue}
` : ''}

### Example

\`\`\`javascript
${api.example}
\`\`\`

---
`).join('\n')}
`;
}
