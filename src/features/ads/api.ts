/**
 * 广告模块 API 调用层
 * 负责与服务器端的广告变现业务接口通信
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * 广告开通状态枚举
 */
export enum AdsStatus {
  /** 未开通 */
  NotActivated = 0,
  /** 资料审核中 */
  UnderReview = 1,
  /** 已生效 */
  Activated = 2,
  /** 账号已被封禁 */
  Banned = 3,
}

/**
 * 广告配置查询响应
 * 对应 GET /ad/v1/config 接口
 */
export interface AdConfigResponse {
  /** 广告位ID */
  space_id: string;
  /** 业务状态 */
  status: number;
  /** 引导办理地址 */
  url: string;
}

/**
 * 状态描述映射
 */
export const STATUS_DESCRIPTIONS = {
  [AdsStatus.NotActivated]: '未开通',
  [AdsStatus.UnderReview]: '资料审核中',
  [AdsStatus.Activated]: '已生效',
  [AdsStatus.Banned]: '账号已被封禁',
};

/**
 * 查询广告配置
 *
 * 接口：GET /ad/v1/config
 * 需要认证：是
 *
 * @param ctx - ResolvedContext（自动从缓存获取 developer_id 和 app_id）
 * @returns 广告配置信息
 * @throws Error 当 developer_id 或 app_id 不存在时
 */
export async function getAdConfig(ctx?: ResolvedContext): Promise<AdConfigResponse> {
  const client = new HttpClient(ctx);

  // 从 context 缓存解析应用信息
  const app = ctx?.resolveApp();
  const developerId = app?.developerId;
  const appId = app?.appId;

  if (!developerId || !appId) {
    throw new Error(
      'developer_id and app_id are required. ' +
        'Please use select_app tool to select an app first.'
    );
  }

  // client_id 会在 HttpClient 内部自动添加
  const response = await client.get<AdConfigResponse>('/ad/v1/config', {
    params: {
      developer_id: developerId.toString(),
      app_id: appId.toString(),
    },
  });

  return response;
}
