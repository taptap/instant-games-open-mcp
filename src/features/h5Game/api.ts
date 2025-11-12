/**
 * H5 Game API Functions
 * Only H5-specific APIs (upload parameters)
 * All common app management APIs are in app/api.ts
 */

import { HttpClient } from '../../core/network/httpClient.js';

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
  context?: import('../../core/types/index.js').HandlerContext
): Promise<UploadParams> {
  const client = new HttpClient(context);
  const params = app_id ? { app_id: app_id.toString() } : undefined;

  return await client.get<UploadParams>('/level/v1/upload', { params });
}
