/**
 * H5 Game API Functions
 * Only H5-specific APIs (upload parameters)
 * All common app management APIs are in app/api.ts
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Upload parameters for H5 game package
 */
export interface UploadParams {
  h5_package_id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * 获取 H5 游戏包上传参数
 * This is H5-specific functionality
 */
export async function getH5PackageUploadParams(
  app_id?: number,
  ctx?: ResolvedContext
): Promise<UploadParams> {
  const client = new HttpClient(ctx);
  const params = app_id ? { app_id: app_id.toString() } : undefined;

  return await client.get<UploadParams>('/level/v1/upload', { params });
}

/**
 * Request payload for debug feedback pulling.
 */
export interface GetDebugFeedbacksRequest {
  developer_id: number;
  app_id: number;
  limit?: number;
  status?: number;
  fetch_and_mark_processed?: boolean;
}

/**
 * Single debug feedback item from server.
 */
export interface FeedbackInfo {
  feedback_id: number;
  version_id: number;
  log_file_urls: string[];
  description: string;
  runtime_version: string;
  screenshots: string[];
  fps: number;
  memory_usage_mb: number;
  device_model: string;
  status: number;
}

/**
 * Response payload for debug feedback list API.
 */
export interface GetDebugFeedbacksResponse {
  list: FeedbackInfo[];
  total: number;
}

/**
 * Pull debug feedback list from TapTap Open API.
 */
export async function getDebugFeedbacks(
  request: GetDebugFeedbacksRequest,
  ctx?: ResolvedContext
): Promise<GetDebugFeedbacksResponse> {
  const client = new HttpClient(ctx);
  const params: Record<string, string> = {
    developer_id: request.developer_id.toString(),
    app_id: request.app_id.toString(),
  };

  if (request.limit !== undefined) {
    params.limit = request.limit.toString();
  }
  if (request.status !== undefined) {
    params.status = request.status.toString();
  }
  if (request.fetch_and_mark_processed !== undefined) {
    params.fetch_and_mark_processed = request.fetch_and_mark_processed ? 'true' : 'false';
  }

  return await client.get<GetDebugFeedbacksResponse>('/open/debug/v1/get-debug-feedbacks', {
    params,
  });
}
