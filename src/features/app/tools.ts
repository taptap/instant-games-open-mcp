/**
 * Application Management Tools
 * Unified definitions and handlers for app operations
 */

import type { ToolRegistration } from '../../core/types/index.js';
import * as appHandlers from './handlers.js';
import * as appApi from './api.js';

/**
 * Application Management Tools
 * Each tool combines its definition and handler in one place
 */
export const appTools: ToolRegistration[] = [
  // 📱 Get Current App Info
  {
    definition: {
      name: 'get_current_app_info',
      description:
        '[General] Get currently selected app/game information including developer_id, app_id, miniapp_id, and app name. **CRITICAL: Call this tool FIRST before executing any leaderboard operations (create_leaderboard, list_leaderboards, etc.) to verify that an app has been selected. If no app is selected, guide the user through the selection process using list_developers_and_apps and select_app.** Use this for: 1) Checking current selection before leaderboard operations, 2) Building preview links, 3) Verifying cached app. Not for H5 upload workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          ignore_cache: {
            type: 'boolean',
            description:
              'If true, force refresh data from server regardless of cache TTL. Default false.',
          },
        },
      },
    },
    handler: async (args, context) => {
      return appHandlers.getCurrentAppInfo(context, args.ignore_cache);
    },
  },

  // 📱 Check Environment
  {
    definition: {
      name: 'check_environment',
      description:
        'Check environment configuration and user authentication status. Use this to verify if TAPTAP_MCP_MAC_TOKEN and TAPTAP_MCP_CLIENT_ID are configured.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (args, context) => {
      return appHandlers.checkEnvironment(context);
    },
  },

  // 🔐 Start OAuth Authorization
  {
    definition: {
      name: 'start_oauth_authorization',
      description:
        '[Auth] Start OAuth 2.0 Device Code Flow to get authorization URL. Use this when: 1) User explicitly wants to authorize, 2) User needs to login or switch account, 3) Token expired or invalid. Returns a QR code URL for user to scan with TapTap App.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return appHandlers.startOAuthAuthorization(context);
    },
  },

  // 🔐 Complete OAuth Authorization
  {
    definition: {
      name: 'complete_oauth_authorization',
      description:
        '[Auth] Complete OAuth authorization after user has scanned QR code. Call this after user confirms they have completed authorization in browser. This tool will poll for the authorization result and save the token.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (args, context) => {
      return appHandlers.completeOAuthAuthorization(args, context);
    },
  },

  // 📁 List Developers and Apps
  {
    definition: {
      name: 'list_developers_and_apps',
      description:
        '[General App Management] List all developers and their apps/games for the current user, including both level games and non-level games. **CRITICAL: ALWAYS show the full list to the user and explicitly ASK them to choose which app to use - DO NOT automatically select an app without user confirmation, even if there is only one option.** Use this for: 1) Initial exploration of available apps, 2) Switching between apps, 3) General app management (not H5 upload workflow). For H5 game upload, use prepare_h5_upload instead.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      // Note: Private parameters are handled at Server layer
      return appHandlers.listDevelopersAndApps(context);
    },
    requiresAuth: true,
  },

  // 📁 Select App
  {
    definition: {
      name: 'select_app',
      description:
        '[General] Select a specific developer and app to use for subsequent operations. Supports both level games and non-level games. This will cache the selection for all modules (leaderboard, H5, current-app community tools, etc.). **IMPORTANT: Only call this tool AFTER the user has explicitly confirmed which app they want to use. DO NOT call this tool automatically without user confirmation.** Use this for: 1) General app selection, 2) Switching accounts, 3) After listing with list_developers_and_apps and receiving user confirmation. For H5 upload, you can also pass developerId/appId to prepare_h5_upload directly.',
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID to select (required)',
          },
          app_id: {
            type: 'number',
            description: 'App/Game ID to select (required)',
          },
        },
        required: ['developer_id', 'app_id'],
      },
    },
    handler: async (args: { developer_id: number; app_id: number }, context) => {
      // Private parameter: _mac_token can be injected by MCP Proxy
      return appHandlers.selectApp(args, context);
    },
    requiresAuth: true,
  },

  // 👤 Create Developer
  {
    definition: {
      name: 'create_developer',
      description:
        'Create a new unverified developer identity on TapTap platform. Use this when user wants to create a new developer account.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      // Note: Private parameters are handled at Server layer
      const result = await appApi.createDeveloper(context);
      return (
        `✅ 创建开发者身份成功！\n\n` +
        `📋 开发者信息：\n` +
        `- 名称: ${result.developer_name}\n` +
        `- ID: ${result.developer_id}\n\n` +
        `💡 下一步：使用 create_app 创建应用，或使用 select_app 选择此开发者。`
      );
    },
    requiresAuth: true,
  },

  // 🆕 Create App
  {
    definition: {
      name: 'create_app',
      description:
        'Create a new app/game on TapTap platform. **The newly created app will be automatically selected** - no need to call select_app afterwards. Use this when user wants to create a new app.',
      inputSchema: {
        type: 'object',
        properties: {
          developerId: {
            type: 'number',
            description:
              'The developer id of the app. Leave empty if the user has not specified a particular ID',
          },
          appName: {
            type: 'string',
            description: 'The name of the app',
          },
          genre: {
            type: 'string',
            description: 'Game genre (e.g. rpg, casual, action, strategy, simulation, etc.)',
          },
        },
      },
    },
    handler: async (args: { developerId?: number; appName?: string; genre?: string }, context) => {
      return appHandlers.createApp(args, context);
    },
    requiresAuth: true,
  },

  // ✏️ Update App Info
  {
    definition: {
      name: 'update_app_info',
      description:
        "Update the app's information on TapTap platform including name, genre, description, icon, banner, screenshots, and more.",
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
            description: 'The name of the app',
          },
          genre: {
            type: 'string',
            description: 'Game genre',
          },
          description: {
            type: 'string',
            description: 'The description of the app',
          },
          chattingLabel: {
            type: 'string',
            description: 'The name of the QQ group',
          },
          chattingNumber: {
            type: 'string',
            description: 'The number of the QQ group',
          },
          screenOrientation: {
            type: 'number',
            description: 'The screen orientation of the app, 1: portrait, 2: landscape',
          },
          icon: {
            type: 'string',
            description: 'Icon URL (JPG/PNG, minimum 512x512 pixels)',
          },
          banner: {
            type: 'string',
            description: 'Banner image URL (JPG/PNG, max 4MB, minimum 1920x1080 pixels)',
          },
          screenshots: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Screenshot URLs (up to 4 images). Requirements: 1) Landscape: aspect ratio 8:3 to 8:5, min 1280x720px; 2) Portrait: aspect ratio 3:8 to 5:8, min 720x1280px; 3) All images must have the same aspect ratio as the first one.',
          },
          trialNote: {
            type: 'string',
            description: 'Developer notes for review (trial_note)',
          },
        },
        required: ['developerId', 'appId'],
      },
    },
    handler: async (args, context) => {
      return appHandlers.updateAppInfo(args, context);
    },
    requiresAuth: true,
  },

  // 🎮 Get App Status
  {
    definition: {
      name: 'get_app_status',
      description:
        'Get the review status of an app/game. Use this to check if the app is published, under review, or rejected.',
      inputSchema: {
        type: 'object',
        properties: {
          app_id: {
            type: 'number',
            description: 'App ID to check status for',
          },
          ignore_cache: {
            type: 'boolean',
            description:
              'If true, force refresh data from server regardless of cache TTL. Default false.',
          },
        },
        required: ['app_id'],
      },
    },
    handler: async (args: { app_id: number; ignore_cache?: boolean }, context) => {
      return appHandlers.getAppStatus(args.app_id, context, args.ignore_cache);
    },
    requiresAuth: true,
  },

  // 📷 Upload Image
  {
    definition: {
      name: 'upload_image',
      description:
        'Upload an image to TapTap server and get a URL. Use this to upload icon, banner, or screenshots before calling update_app_info. Accepts either a local file path or base64 encoded image data.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Local file path to the image (relative to workspace or absolute). Supports JPG, PNG, GIF, WebP.',
          },
          base64Data: {
            type: 'string',
            description:
              'Base64 encoded image data. Can include data URL prefix (e.g., "data:image/png;base64,...") or be raw base64 string.',
          },
          filename: {
            type: 'string',
            description:
              'Optional filename for the uploaded image. If not provided, will be derived from filePath or default to "image.png".',
          },
        },
      },
    },
    handler: async (
      args: { filePath?: string; base64Data?: string; filename?: string },
      context
    ) => {
      return appHandlers.uploadImage(args, context);
    },
    requiresAuth: true,
  },

  // 🗑️ Clear Auth Data
  {
    definition: {
      name: 'clear_auth_data',
      description:
        'Clear all cached authentication data and app selection. Use this when: 1) MAC Token expired or invalid, 2) Want to switch accounts, 3) Need to reset authentication. This will clear both OAuth token file and app cache.',
      inputSchema: {
        type: 'object',
        properties: {
          clear_token: {
            type: 'boolean',
            description: 'Clear OAuth token file (default: true)',
          },
          clear_cache: {
            type: 'boolean',
            description: 'Clear app selection cache (default: true)',
          },
        },
      },
    },
    handler: async (args: { clear_token?: boolean; clear_cache?: boolean }, context) => {
      return appHandlers.clearAuthData(args, context);
    },
  },

  // 🤖 Raw Environment Check
  {
    definition: {
      name: 'check_environment_raw',
      description:
        '[Raw JSON] Return structured environment, signer, and authentication status for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return appHandlers.checkEnvironmentRaw(context);
    },
  },

  // 🤖 Raw OAuth Start
  {
    definition: {
      name: 'start_oauth_authorization_raw',
      description:
        '[Raw JSON] Start OAuth 2.0 Device Code Flow and return device_code, qrcode_url, auth_url, and expiry information as structured JSON.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return appHandlers.startOAuthAuthorizationRaw(context);
    },
  },

  // 🤖 Raw OAuth Complete
  {
    definition: {
      name: 'complete_oauth_authorization_raw',
      description:
        '[Raw JSON] Complete OAuth authorization after the user scanned and approved the QR code. Returns structured authorization result JSON.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return appHandlers.completeOAuthAuthorizationRaw({}, context);
    },
  },

  // 🤖 Raw List Apps
  {
    definition: {
      name: 'list_developers_and_apps_raw',
      description:
        '[Raw JSON] List all developers and their apps/games, including level and non-level apps, as structured JSON.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_args, context) => {
      return appHandlers.listDevelopersAndAppsRaw(context);
    },
    requiresAuth: true,
  },

  // 🤖 Raw Select App
  {
    definition: {
      name: 'select_app_raw',
      description:
        '[Raw JSON] Select a specific developer/app pair and return the cached selection payload as structured JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          developer_id: {
            type: 'number',
            description: 'Developer ID to select.',
          },
          app_id: {
            type: 'number',
            description: 'App ID to select.',
          },
        },
        required: ['developer_id', 'app_id'],
      },
    },
    handler: async (args: { developer_id: number; app_id: number }, context) => {
      return appHandlers.selectAppRaw(args, context);
    },
    requiresAuth: true,
  },

  // 🤖 Raw Current App Info
  {
    definition: {
      name: 'get_current_app_info_raw',
      description:
        '[Raw JSON] Return the currently selected app/cache payload as structured JSON for agent/plugin consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          ignore_cache: {
            type: 'boolean',
            description:
              'If true, force refresh data from server regardless of cache TTL. Default false.',
          },
        },
      },
    },
    handler: async (args: { ignore_cache?: boolean }, context) => {
      return appHandlers.getCurrentAppInfoRaw(context, args.ignore_cache);
    },
  },

  // 🤖 Raw Clear Auth
  {
    definition: {
      name: 'clear_auth_data_raw',
      description:
        '[Raw JSON] Clear cached OAuth token and/or selected app cache, returning structured result JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          clear_token: {
            type: 'boolean',
            description: 'Clear OAuth token file (default: true).',
          },
          clear_cache: {
            type: 'boolean',
            description: 'Clear app selection cache (default: true).',
          },
        },
      },
    },
    handler: async (args: { clear_token?: boolean; clear_cache?: boolean }, context) => {
      return appHandlers.clearAuthDataRaw(args, context);
    },
  },
];
