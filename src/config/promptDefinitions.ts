/**
 * MCP Prompts Definitions
 * Prompts provide reusable templates and workflows
 */

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

/**
 * Get all prompt definitions
 */
export function getPromptDefinitions(): PromptDefinition[] {
  return [
    {
      name: 'leaderboard-integration',
      description: 'INTERACTIVE workflow that EXECUTES operations: checks your server-side leaderboards, guides through creation/selection, and provides personalized setup assistance. Use this when user wants INTERACTIVE help with complete server+client setup. This prompt will CALL TOOLS and perform actions.',
      arguments: []
    },
    {
      name: 'leaderboard-troubleshooting',
      description: 'INTERACTIVE troubleshooting assistant for leaderboard errors - provides solutions and can help diagnose issues. Use this when user encounters errors or problems. Can be parameterized with specific error codes.',
      arguments: [
        {
          name: 'error_code',
          description: 'Optional error code to get specific troubleshooting steps (e.g., 500001, 1025, 104)',
          required: false
        }
      ]
    }
  ];
}
