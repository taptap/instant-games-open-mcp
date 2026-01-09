/**
 * Share API Calls
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Share template status
 * 状态：0-待审核，1-已通过，2-已拒绝，3-审核异常
 */
export enum ShareTemplateStatus {
  PENDING = 0, // 待审核
  APPROVED = 1, // 已通过
  REJECTED = 2, // 已拒绝
  AUDIT_ERROR = 3, // 审核异常
}

/**
 * Create share template parameters
 */
export interface CreateShareTemplateParams {
  developer_id?: number;
  app_id?: number;
  contents?: string; // 描述，最多21个UTF-8字符（包括空格和标点）
  remark?: string; // 备注，最多100个字符
}

/**
 * Share template info
 */
export interface ShareTemplateInfo {
  id: number; // 分享模版 ID
  miniapp_id: string; // 小程序 ID
  contents: string; // 描述内容
  remark: string; // 备注
  status: number; // 状态：0-待审核，1-已通过，2-已拒绝，3-审核异常
  template_code: string; // 模版代码
  audit_reason?: string; // 审核理由
}

/**
 * Create share template response
 */
export interface CreateShareTemplateResponse {
  info: ShareTemplateInfo; // 分享模板信息
}

/**
 * Create a new share template
 * @param params - Share template creation parameters
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns Created share template information
 */
export async function createShareTemplate(
  params: CreateShareTemplateParams,
  ctx?: ResolvedContext
): Promise<CreateShareTemplateResponse> {
  const client = new HttpClient(ctx);

  try {
    // Resolve developer_id and app_id from context cache
    // 从 context 缓存解析应用信息
    const app = ctx?.resolveApp();
    const developerId = params.developer_id ?? app?.developerId;
    const appId = params.app_id ?? app?.appId;

    if (!developerId || !appId) {
      throw new Error(
        'developer_id and app_id are required. ' +
          'Please either:\n' +
          '1. Use select_app tool to select an app first, or\n' +
          '2. Provide them explicitly in the arguments'
      );
    }

    // Use form-urlencoded format (server prefers this over JSON)
    const response = await client.post<CreateShareTemplateResponse>(
      '/open/miniapp/share/v1/create-share-template',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: {
          developer_id: developerId,
          app_id: appId,
          contents: params.contents,
          remark: params.remark,
        },
      }
    );

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create share template: ${error.message}`);
    }
    throw new Error(`Failed to create share template: ${String(error)}`);
  }
}

/**
 * List share templates query parameters
 */
export interface ListShareTemplatesParams {
  developer_id?: number;
  app_id?: number;
  page?: number; // 页码，从1开始，默认1
  page_size?: number; // 每页大小，默认10
}

/**
 * Share template list response
 */
export interface ShareTemplateListResponse {
  list: ShareTemplateInfo[];
  total: number;
}

/**
 * List all share templates for a specific app
 * @param params - Query parameters (developer_id and app_id will be auto-filled if not provided)
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns List of share templates and total count
 */
export async function listShareTemplates(
  params: ListShareTemplatesParams = {},
  ctx?: ResolvedContext
): Promise<ShareTemplateListResponse> {
  const client = new HttpClient(ctx);

  try {
    // Resolve developer_id and app_id from context cache
    // 从 context 缓存解析应用信息
    const app = ctx?.resolveApp();
    const developerId = params.developer_id ?? app?.developerId;
    const appId = params.app_id ?? app?.appId;

    if (!developerId || !appId) {
      throw new Error(
        'developer_id and app_id are required. ' +
          'Please either:\n' +
          '1. Use select_app tool to select an app first, or\n' +
          '2. Provide them explicitly in the arguments'
      );
    }

    const response = await client.get<ShareTemplateListResponse>(
      '/open/miniapp/share/v1/list-share-template',
      {
        params: {
          developer_id: developerId.toString(),
          app_id: appId.toString(),
          page: (params.page || 1).toString(),
          page_size: (params.page_size || 10).toString(),
        },
      }
    );

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to list share templates: ${error.message}`);
    }
    throw new Error(`Failed to list share templates: ${String(error)}`);
  }
}

/**
 * Get share template info query parameters
 */
export interface GetShareTemplateInfoParams {
  developer_id?: number;
  app_id?: number;
  template_code: string; // 模版代码（必填）
}

/**
 * Get share template info response
 */
export interface GetShareTemplateInfoResponse {
  info: ShareTemplateInfo; // 分享模板信息
}

/**
 * Get share template information by template code
 * @param params - Query parameters (developer_id and app_id will be auto-filled if not provided)
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns Share template information
 */
export async function getShareTemplateInfo(
  params: GetShareTemplateInfoParams,
  ctx?: ResolvedContext
): Promise<GetShareTemplateInfoResponse> {
  const client = new HttpClient(ctx);

  try {
    // Resolve developer_id and app_id from context cache
    // 从 context 缓存解析应用信息
    const app = ctx?.resolveApp();
    const developerId = params.developer_id ?? app?.developerId;
    const appId = params.app_id ?? app?.appId;

    if (!developerId || !appId) {
      throw new Error(
        'developer_id and app_id are required. ' +
          'Please either:\n' +
          '1. Use select_app tool to select an app first, or\n' +
          '2. Provide them explicitly in the arguments'
      );
    }

    if (!params.template_code) {
      throw new Error('template_code is required');
    }

    const response = await client.get<GetShareTemplateInfoResponse>(
      '/open/miniapp/share/v1/share-template-info',
      {
        params: {
          developer_id: developerId.toString(),
          app_id: appId.toString(),
          template_code: params.template_code,
        },
      }
    );

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get share template info: ${error.message}`);
    }
    throw new Error(`Failed to get share template info: ${String(error)}`);
  }
}

/**
 * Get status descriptions for user-friendly display
 */
export const ShareTemplateStatusDescriptions = {
  [ShareTemplateStatus.PENDING]: 'Pending/待审核',
  [ShareTemplateStatus.APPROVED]: 'Approved/已通过',
  [ShareTemplateStatus.REJECTED]: 'Rejected/已拒绝',
  [ShareTemplateStatus.AUDIT_ERROR]: 'Audit Error/审核异常',
};
