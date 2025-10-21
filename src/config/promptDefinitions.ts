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
      description: '⭐ START HERE when user wants to integrate leaderboard - INTERACTIVE workflow that checks existing leaderboards, guides through creation, and provides client code examples. ⚠️ CRITICAL: This prompt emphasizes NO SDK INSTALLATION NEEDED - tap object is global. Use this FIRST before making any plans about leaderboard integration.',
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
