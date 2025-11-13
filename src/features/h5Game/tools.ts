/**
 * H5 Game Tools
 * MCP Tool definitions using unified format (ToolRegistration[])
 *
 * Note: Developer and app listing tools are provided by the app module.
 * Use list_developers_and_apps and select_app from app module for those operations.
 */

import type { ToolRegistration } from '../../core/types/index.js';
import { TOOL_DESCRIPTION } from './messages.js';
import {
  handleGatherGameInfo,
  handleUploadGame,
  handleCreateApp,
  handleEditApp,
} from './handlers.js';

/**
 * H5 Game Tools - Unified Format
 * Each tool includes both definition and handler in a single object
 */
export const h5GameTools: ToolRegistration[] = [
  // 1. 收集 H5 游戏信息
  {
    definition: {
      name: 'h5_game_info_gatherer',
      description: `
        [H5 Game Upload Workflow - Step 1]
        Use this tool when user wants to publish/upload/deploy H5 game ('发布', '上传', '部署').

        This tool will:
        1. Verify the game project directory (must contain index.html)
        2. Auto-select developer/app if only one exists
        3. Show developer/app list if multiple exist (user can provide developerId/appId to select)
        4. Use cached selection if available

        After gathering info, use h5_game_uploader to upload the game.

        Note: For general app management (not H5 upload), use list_developers_and_apps and select_app instead.
      `,
      inputSchema: {
        type: 'object',
        properties: {
          gamePath: {
            type: 'string',
            description: 'Relative path to the H5 game directory (e.g., "dist", "build", "."). Must contain index.html. Defaults to current directory if not provided.',
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
      name: 'h5_game_uploader',
      description: `
        When the user confirms the game information from h5_game_info_gatherer, or has previously confirmed it.
        Please use this tool to upload the H5 game to TapTap platform.
      `,
      inputSchema: {
        type: 'object',
        properties: {
          gamePath: {
            type: 'string',
            description: 'Relative path to the H5 game directory (e.g., "dist", "build", "."). Must contain index.html. Defaults to current directory if not provided.',
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

  // 3. 创建 H5 游戏
  {
    definition: {
      name: 'h5_create_app',
      description: 'User wants to create a new H5 game on TapTap platform',
      inputSchema: {
        type: 'object',
        properties: {
          developerId: {
            type: 'number',
            description: 'The developer id of the app. Leave empty if the user has not specified a particular ID',
          },
          appName: {
            type: 'string',
            description: 'The name of the app',
          },
          genre: {
            type: 'string',
            description: TOOL_DESCRIPTION.GENRE_DESCRIPTION,
          },
        },
      },
    },
    handler: async (args, context) => {
      return await handleCreateApp(args, context);
    },
  },

  // 5. 编辑 H5 游戏
  {
    definition: {
      name: 'h5_edit_app',
      description:
        "User wants to edit the H5 game's name, genre, description, chatting_label, chatting_number, screen_orientation on TapTap platform",
      inputSchema: {
        type: 'object',
        properties: {
          developerId: {
            type: 'number',
            description: 'The developer id of the app',
          },
          appId: {
            type: 'number',
            description: 'The app id of the game',
          },
          appName: {
            type: 'string',
            description: 'The name of the app, if not provided, can be empty',
          },
          genre: {
            type: 'string',
            description: TOOL_DESCRIPTION.GENRE_DESCRIPTION,
          },
          description: {
            type: 'string',
            description: 'The description of the craft, if not provided, can be empty',
          },
          chattingLabel: {
            type: 'string',
            description: 'The name of the QQ group, if not provided, can be empty',
          },
          chattingNumber: {
            type: 'string',
            description: 'The number of the QQ group, if not provided, can be empty',
          },
          screenOrientation: {
            type: 'number',
            description:
              'The screen orientation of the app, 1: vertical, 2: horizontal, if not provided, can be empty',
          },
        },
        required: ['developerId', 'appId'],
      },
    },
    handler: async (args, context) => {
      return await handleEditApp(args, context);
    },
  },
];
