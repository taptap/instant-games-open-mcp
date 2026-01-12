/**
 * Share Tools Definitions and Handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedContext } from '../../core/types/context.js';

import * as handlers from './handlers.js';
import { shareTools } from './docTools.js';

/**
 * Tool 定义数组
 */
export const shareToolDefinitions: Tool[] = [
  // 流程指引工具
  {
    name: 'get_share_integration_guide',
    description:
      '⭐ READ THIS FIRST when user wants to integrate/接入/setup/add share功能. Returns complete step-by-step workflow for TapTap Share API. CRITICAL: Emphasizes NO SDK installation - tap is global object. Use this BEFORE making any implementation plans. Covers: 1) Server-side template creation workflow, 2) Client-side API usage (tap.showShareboard, tap.onShareMessage), 3) Template code mapping, 4) Audit status checking.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // 服务端管理工具
  {
    name: 'create_share_template',
    description:
      "**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user's choice. Create a new share template on TapTap server for minigame sharing feature. Auto-fetches developer_id and app_id from selected app. Returns template_code which is used in client-side tap.showShareboard() API. **IMPORTANT: contents field has strict 21 UTF-8 character limit (including spaces and punctuation). Template needs audit approval (status=1) before use.**",
    inputSchema: {
      type: 'object',
      properties: {
        developer_id: {
          type: 'number',
          description: 'Developer ID (optional, will be auto-filled from context or cache)',
        },
        app_id: {
          type: 'number',
          description: 'App ID (optional, will be auto-filled from context or cache)',
        },
        contents: {
          type: 'string',
          description:
            'Share description content (REQUIRED). STRICT LIMIT: max 21 UTF-8 characters including spaces and punctuation. Example: "分享游戏获得奖励" (12 chars). This is the text shown in share panel.',
        },
        remark: {
          type: 'string',
          description:
            'Internal remark/note for template management (REQUIRED, max 100 characters). Not shown to users, only for developer reference. Used to identify and manage templates.',
        },
      },
      required: ['contents', 'remark'],
    },
  },
  {
    name: 'list_share_templates',
    description:
      "**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ALWAYS call get_current_app_info to verify an app is selected. If not, guide user through: 1) Call list_developers_and_apps, 2) Show list to user and ASK them to choose, 3) Call select_app with user's choice. List all share templates for currently selected app. Auto-fetches developer_id and app_id. Shows template status (0=pending, 1=approved, 2=rejected, 3=audit error). **IMPORTANT: When multiple templates exist, ALWAYS show the complete list to the user and explicitly ASK them which one they want to use - DO NOT automatically choose a template without user confirmation.** NOTE: To modify or delete templates, please use TapTap Developer Center (https://developer.taptap.cn).",
    inputSchema: {
      type: 'object',
      properties: {
        developer_id: {
          type: 'number',
          description: 'Developer ID (optional, will be auto-filled from context or cache)',
        },
        app_id: {
          type: 'number',
          description: 'App ID (optional, will be auto-filled from context or cache)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (optional, default 1, starts from 1)',
        },
        page_size: {
          type: 'number',
          description: 'Number of items per page (optional, default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_share_template_info',
    description:
      '**PREREQUISITE: An app MUST be selected first.** Before calling this tool, ensure an app is selected by calling get_current_app_info. **IMPORTANT: If the template_code is not clear, call list_share_templates first, show the list to the user, and ASK them which template they want to query - DO NOT automatically select a template.** Get detailed information about a specific share template by template_code. Use this to: 1) Check audit status before using template in client, 2) Get template_code details for tap.showShareboard() API, 3) View audit reason if rejected, 4) Verify template is approved (status=1) before implementation. Returns full template info including status, contents, remark, and audit_reason. NOTE: To modify or delete templates, please use TapTap Developer Center (https://developer.taptap.cn).',
    inputSchema: {
      type: 'object',
      properties: {
        developer_id: {
          type: 'number',
          description: 'Developer ID (optional, will be auto-filled from context or cache)',
        },
        app_id: {
          type: 'number',
          description: 'App ID (optional, will be auto-filled from context or cache)',
        },
        template_code: {
          type: 'string',
          description:
            'Template code (REQUIRED). This is the identifier returned by create_share_template. Used as templateId parameter in client-side tap.showShareboard({ templateId: "..." }) API.',
        },
      },
      required: ['template_code'],
    },
  },

  // 文档搜索工具
  {
    name: 'search_share_docs',
    description:
      '[Documentation] Search Share API documentation by keyword. Use this when: 1) User asks about share API usage, 2) Need to find specific API documentation (tap.showShareboard, tap.onShareMessage, etc.), 3) Looking for code examples or integration guides. Returns relevant documentation snippets and suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search keyword (REQUIRED). Examples: "showShareboard", "onShareMessage", "share panel", "分享", "template", etc.',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * Tool 处理器数组（顺序必须与定义数组一致）
 */
export const shareToolHandlers = [
  // get_share_integration_guide
  async (_args: unknown, _context: ResolvedContext) => {
    return shareTools.getIntegrationWorkflow();
  },

  // create_share_template
  async (
    args: {
      developer_id?: number;
      app_id?: number;
      contents?: string;
      remark?: string;
    },
    context: ResolvedContext
  ) => {
    return handlers.createShareTemplate(args, context);
  },

  // list_share_templates
  async (
    args: {
      developer_id?: number;
      app_id?: number;
      page?: number;
      page_size?: number;
    },
    context: ResolvedContext
  ) => {
    return handlers.listShareTemplates(args, context);
  },

  // get_share_template_info
  async (
    args: {
      developer_id?: number;
      app_id?: number;
      template_code: string;
    },
    context: ResolvedContext
  ) => {
    return handlers.getShareTemplateInfo(args, context);
  },

  // search_share_docs
  async (args: { query: string }, _context: ResolvedContext) => {
    return shareTools.searchShareDocs(args);
  },
];
