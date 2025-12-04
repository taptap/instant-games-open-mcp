/**
 * Cloud Save Tools Definitions and Handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedContext } from '../../core/types/context.js';
import type { ToolRegistration } from '../../core/types/index.js';

import { cloudSaveTools } from './docTools.js';

/**
 * Cloud Save Tools
 * Each tool combines its definition and handler in one place
 */
export const cloudSaveToolsList: ToolRegistration[] = [
  // Integration Guide Tool
  {
    definition: {
      name: 'get_cloud_save_integration_guide',
      description: `Get complete Cloud Save integration workflow guide for TapTap Minigame and H5 games.

This tool provides:
- Complete workflow for saving and loading game data to/from cloud
- File system operations (writeFile, readFile) for local storage
- Cloud archive operations (create, update, delete, list)
- Error codes and troubleshooting guide
- Best practices and code examples

Use this tool when user asks about:
- How to implement cloud save in their game
- How to save/load game progress to cloud
- Cloud save architecture and workflow
- File system operations for save data`,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    handler: async (_args: Record<string, unknown>, _context: ResolvedContext) => {
      return cloudSaveTools.getIntegrationWorkflow();
    },
  },
];

// Legacy exports for backward compatibility
export const cloudSaveToolDefinitions: Tool[] = cloudSaveToolsList.map((t) => t.definition);

export const cloudSaveToolHandlers = cloudSaveToolsList.map((t) => t.handler);
