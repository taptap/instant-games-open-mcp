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
      description: 'Complete interactive guide for integrating TapTap leaderboard into your game. Checks existing leaderboards and guides through setup.',
      arguments: []
    },
    {
      name: 'leaderboard-troubleshooting',
      description: 'Common leaderboard issues and troubleshooting guide with solutions for frequent error codes.',
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
