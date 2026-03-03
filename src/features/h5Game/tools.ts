/**
 * H5 Game Tools
 * MCP Tool definitions using unified format (ToolRegistration[])
 *
 * Note: Developer and app listing tools are provided by the app module.
 * Use list_developers_and_apps and select_app from app module for those operations.
 */

import type { ToolRegistration } from '../../core/types/index.js';
import { TOOL_DESCRIPTION } from './messages.js';
import { handleGatherGameInfo, handleGetDebugFeedbacks, handleUploadGame } from './handlers.js';

/**
 * H5 Game Tools - Unified Format
 * Each tool includes both definition and handler in a single object
 *
 * 设计原则：
 * - App 信息统一从缓存读取（通过 ctx.resolveApp()）
 * - 不再通过参数传递 developerId/appId
 * - 使用前必须先通过 select_app 选择应用
 */
export const h5GameTools: ToolRegistration[] = [
  // 1. 收集 H5 游戏信息
  {
    definition: {
      name: 'prepare_h5_upload',
      description: `
        [H5 Game Upload Workflow - Step 1]
        Use this tool when user wants to publish/upload/deploy H5 game ('发布', '上传', '部署').

        **PREREQUISITE: An app MUST be selected first.**
        Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected.
        If not selected, guide user through:
        1) Call list_developers_and_apps to show available apps
        2) Show list to user and ASK them to choose
        3) Call select_app with user's choice
        4) Then call this tool

        This tool will:
        1. Verify the game project directory (must contain index.html)
        2. Read app info from cache (selected via select_app)
        3. Return confirmation info for user to review

        After gathering info, use upload_h5_game to upload the game.
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
        Upload the H5 game to TapTap platform after user confirms info from prepare_h5_upload.

        **PREREQUISITE: An app MUST be selected first.**
        This tool reads app info from cache (selected via select_app or create_app).
        If no app is selected, it will return an error guiding user to select one first.
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
        },
      },
    },
    handler: async (args, context) => {
      return await handleUploadGame(args, context);
    },
  },

  // 3. 拉取用户调试反馈
  {
    definition: {
      name: 'get_debug_feedbacks',
      description: `
        [H5 Debug Workflow]
        Pull user debug feedback records for the selected app, download artifacts (screenshots/logs),
        and generate AI-ready debug context files.

        **PREREQUISITE: An app MUST be selected first.**
        Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected.
        If not selected, guide user through:
        1) Call list_developers_and_apps to show available apps
        2) Show list to user and ASK them to choose
        3) Call select_app with user's choice
        4) Then call this tool

        **DEFAULT BEHAVIOR:**
        - fetch_and_mark_processed defaults to true
        - download_assets defaults to true
        - downloaded files are saved under logs/feed_back/feedback_{id}/

        **CALLING POLICY FOR AGENTS:**
        - If user says "拉取/查看反馈" without explicit read-only intent, DO NOT pass fetch_and_mark_processed.
          Let default behavior (true) apply.
        - ONLY pass fetch_and_mark_processed=false when user explicitly requests read-only
          behavior (e.g. "只查看，不标记处理").
      `,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'How many feedback records to pull (1-10, default 3).',
          },
          status: {
            type: 'number',
            description: TOOL_DESCRIPTION.DEBUG_FEEDBACK_STATUS_DESCRIPTION,
          },
          fetch_and_mark_processed: {
            type: 'boolean',
            description:
              'Pull unprocessed records and mark them processed on server. Default true. ' +
              'Set false only for explicit read-only requests. When true, status is ignored.',
          },
          download_assets: {
            type: 'boolean',
            description:
              'Whether to download feedback JSON/screenshot/log files to local workspace. Default true.',
          },
        },
      },
    },
    handler: async (
      args: {
        limit?: number;
        status?: number;
        fetch_and_mark_processed?: boolean;
        download_assets?: boolean;
      },
      context
    ) => {
      return await handleGetDebugFeedbacks(args, context);
    },
    requiresAuth: true,
  },
];
