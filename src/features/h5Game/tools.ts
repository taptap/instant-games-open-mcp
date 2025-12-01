/**
 * H5 Game Tools
 * MCP Tool definitions using unified format (ToolRegistration[])
 *
 * Note: Developer and app listing tools are provided by the app module.
 * Use list_developers_and_apps and select_app from app module for those operations.
 */

import type { ToolRegistration } from '../../core/types/index.js';
import { TOOL_DESCRIPTION } from './messages.js';
import { handleGatherGameInfo, handleUploadGame } from './handlers.js';

/**
 * H5 Game Tools - Unified Format
 * Each tool includes both definition and handler in a single object
 */
export const h5GameTools: ToolRegistration[] = [
  // 1. 收集 H5 游戏信息
  {
    definition: {
      name: 'prepare_h5_upload',
      description: `
        [H5 Game Upload Workflow - Step 1]
        Use this tool when user wants to publish/upload/deploy H5 game ('发布', '上传', '部署').

        This tool will:
        1. Verify the game project directory (must contain index.html)
        2. Auto-select developer/app if only one exists
        3. Show developer/app list if multiple exist (user can provide developerId/appId to select)
        4. Use cached selection if available

        After gathering info, use upload_h5_game to upload the game.

        Note: For general app management (not H5 upload), use list_developers_and_apps and select_app instead.
      `,
      inputSchema: {
        type: 'object',
        properties: {
          gamePath: {
            type: 'string',
            description: `**MUST be a relative path** to the H5 game build output directory.

✅ Correct: "dist", "build", "output", "."
❌ Wrong: "/workspace/dist", "/tmp/build" (absolute paths not allowed)

**BEHAVIOR:**
- If user specifies directory, pass that relative path
- If user doesn't specify, ASK: "请问游戏构建产物在哪个目录？（如 dist、build）"
- If index.html is in project root, pass "." or leave empty
- DO NOT guess - confirm with user if unsure`,
          },
          genre: {
            type: 'string',
            description: TOOL_DESCRIPTION.GENRE_DESCRIPTION,
          },
          developerName: {
            type: 'string',
            description: 'The name of the developer, if not provided, can be empty',
          },
          developerId: {
            type: 'number',
            description: 'The developer id of the developer, if not provided, can be empty',
          },
          appId: {
            type: 'number',
            description: 'The app id of the game, if not provided, can be empty',
          },
        },
      },
    },
    handler: async (args, context) => {
      return await handleGatherGameInfo(args, context);
    },
  },

  // 2. 上传 H5 游戏
  {
    definition: {
      name: 'upload_h5_game',
      description: `
        [H5 Game Upload Workflow - Step 2]
        When the user confirms the game information from prepare_h5_upload, or has previously confirmed it.
        Please use this tool to upload the H5 game to TapTap platform.
      `,
      inputSchema: {
        type: 'object',
        properties: {
          gamePath: {
            type: 'string',
            description: `**MUST be a relative path** to the H5 game build output directory.

✅ Correct: "dist", "build", "output", "."
❌ Wrong: "/workspace/dist", "/tmp/build" (absolute paths not allowed)

Use the same path confirmed in prepare_h5_upload step.`,
          },
          genre: {
            type: 'string',
            description: TOOL_DESCRIPTION.GENRE_DESCRIPTION,
          },
          developerName: {
            type: 'string',
            description: 'The name of the developer, if not provided, can be empty',
          },
          developerId: {
            type: 'number',
            description: 'The developer id of the developer',
          },
          appId: {
            type: 'number',
            description: 'The app id of the game',
          },
          appName: {
            type: 'string',
            description: 'The name of the app, if not provided, can be empty',
          },
        },
      },
    },
    handler: async (args, context) => {
      return await handleUploadGame(args, context);
    },
  },
];
