/**
 * TapTap Leaderboard Management API
 * Server-side leaderboard operations
 */

import { HttpClient } from '../../core/network/httpClient.js';
import type { ResolvedContext } from '../../core/types/context.js';
import { readAppCache } from '../../core/utils/cache.js';

/**
 * Period types for leaderboard
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 * IMPORTANT: When period_type is not 1 (ALWAYS), period_time is REQUIRED
 */
export enum PeriodType {
  UNSPECIFIED = 0, // 未指定 - 无效值
  ALWAYS = 1, // 永久（不重置）
  DAILY = 2, // 每天（每天重置）
  WEEKLY = 3, // 每周（每周一重置）
  MONTHLY = 4, // 每月（每月第一天重置）
}

/**
 * Score types
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum ScoreType {
  UNSPECIFIED = 0, // 未指定 - 无效值
  INTEGER = 1, // 数值型
  TIME = 2, // 时间型
}

/**
 * Score order
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum ScoreOrder {
  UNSPECIFIED = 0, // 未指定 - 无效值
  DESCENDING = 1, // 降序（数值越大越好）
  ASCENDING = 2, // 升序（数值越小越好）
}

/**
 * Calculation types
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum CalcType {
  UNSPECIFIED = 0, // 未指定 - 无效值
  SUM = 1, // 累计分
  BEST = 2, // 最佳分
  LATEST = 3, // 最新分
}

/**
 * Create leaderboard parameters
 */
export interface CreateLeaderboardParams {
  developer_id: number;
  app_id: number;
  title: string;
  period_type: PeriodType;
  score_type: ScoreType;
  score_order: ScoreOrder;
  calc_type: CalcType;
  display_limit?: number;
  period_time?: string;
  score_unit?: string;
}

/**
 * Create leaderboard response
 */
export interface CreateLeaderboardResponse {
  id: number; // 排行榜 ID (实际的数据库 ID)
  leaderboard_open_id: string; // 排行榜开放 ID (用于客户端调用)
  title: string;
  is_default: boolean;
}

/**
 * Create a new leaderboard
 * @param params - Leaderboard creation parameters
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns Created leaderboard information
 */
export async function createLeaderboard(
  params: CreateLeaderboardParams,
  ctx?: ResolvedContext
): Promise<CreateLeaderboardResponse> {
  const client = new HttpClient(ctx);

  try {
    // CRITICAL: When period_type is not 1 (ALWAYS), period_time is REQUIRED
    // Default to 08:00:00 if not provided and period_type requires it
    let periodTime = params.period_time;
    if (params.period_type !== PeriodType.ALWAYS && !periodTime) {
      periodTime = '08:00:00'; // Default: 8 AM reset time
    }

    // Use form-urlencoded format (server prefers this over JSON)
    // All parameters are sent as form fields with numeric values
    // IMPORTANT: Enum values must be >= 1 (0 = UNSPECIFIED/invalid)
    const result = await client.post<CreateLeaderboardResponse>('/open/leaderboard/v1/create', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        developer_id: params.developer_id,
        app_id: params.app_id,
        title: params.title,
        period_type: params.period_type, // number (must be 1-4, not 0)
        score_type: params.score_type, // number (must be 1-2, not 0)
        score_order: params.score_order, // number (must be 1-2, not 0)
        calc_type: params.calc_type, // number (must be 1-3, not 0)
        display_limit: params.display_limit,
        period_time: periodTime, // Required when period_type != 1
        score_unit: params.score_unit,
      },
    });

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create leaderboard: ${error.message}`);
    }
    throw new Error(`Failed to create leaderboard: ${String(error)}`);
  }
}

/**
 * Leaderboard item in list
 */
export interface LeaderboardItem {
  id: number;
  leaderboard_open_id: string;
  title: string;
  is_default: boolean;
  period: string;
  whitelist_only: boolean;
}

/**
 * Leaderboard list response
 */
export interface LeaderboardListResponse {
  list: LeaderboardItem[];
  total: number;
}

/**
 * List leaderboards query parameters
 */
export interface ListLeaderboardsParams {
  developer_id?: number;
  app_id?: number;
  page?: number;
  page_size?: number;
}

/**
 * List all leaderboards for a specific app
 * @param params - Query parameters (developer_id and app_id will be auto-filled if not provided)
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns List of leaderboards and total count
 */
export async function listLeaderboards(
  params: ListLeaderboardsParams = {},
  ctx?: ResolvedContext
): Promise<LeaderboardListResponse> {
  const client = new HttpClient(ctx);

  try {
    // Resolve developer_id and app_id from context (priority: params > context > cache)
    // 从 context 和缓存解析应用信息
    const cache = readAppCache(ctx?.projectPath);
    const resolved = {
      developerId: ctx?.developerId ?? cache?.developer_id,
      appId: ctx?.appId ?? cache?.app_id,
    };
    const developerId = params.developer_id ?? resolved.developerId;
    const appId = params.app_id ?? resolved.appId;

    if (!developerId || !appId) {
      throw new Error(
        'developer_id and app_id are required. ' +
          'Please either:\n' +
          '1. Pass them via private parameters (_developer_id, _app_id), or\n' +
          '2. Use select_app tool to cache them, or\n' +
          '3. Provide them explicitly in the arguments'
      );
    }

    const response = await client.get<LeaderboardListResponse>('/open/leaderboard/v1/list', {
      params: {
        developer_id: developerId.toString(),
        app_id: appId.toString(),
        page: (params.page || 1).toString(),
        page_size: (params.page_size || 10).toString(),
      },
    });

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to list leaderboards: ${error.message}`);
    }
    throw new Error(`Failed to list leaderboards: ${String(error)}`);
  }
}

/**
 * Publish leaderboard parameters
 */
export interface PublishLeaderboardParams {
  developer_id?: number;
  app_id?: number;
  id: number; // leaderboard_id
  whitelist_only: boolean; // false = 发布上线, true = 仅白名单可见
}

/**
 * Publish leaderboard response
 */
export interface PublishLeaderboardResponse {
  id: number;
  whitelist_only: boolean;
}

/**
 * Publish a leaderboard or set it to whitelist-only mode
 * @param params - Publish parameters
 * @param ctx - Optional resolved context (for macToken and projectPath)
 * @returns Updated leaderboard status
 */
export async function publishLeaderboard(
  params: PublishLeaderboardParams,
  ctx?: ResolvedContext
): Promise<PublishLeaderboardResponse> {
  const client = new HttpClient(ctx);

  try {
    // Resolve developer_id and app_id from context (priority: params > context > cache)
    // 从 context 和缓存解析应用信息
    const cache = readAppCache(ctx?.projectPath);
    const resolved = {
      developerId: ctx?.developerId ?? cache?.developer_id,
      appId: ctx?.appId ?? cache?.app_id,
    };
    const developerId = params.developer_id ?? resolved.developerId;
    const appId = params.app_id ?? resolved.appId;

    if (!developerId || !appId) {
      throw new Error(
        'developer_id and app_id are required. ' +
          'Please either:\n' +
          '1. Pass them via private parameters (_developer_id, _app_id), or\n' +
          '2. Use select_app tool to cache them, or\n' +
          '3. Provide them explicitly in the arguments'
      );
    }

    const response = await client.post<PublishLeaderboardResponse>(
      '/open/leaderboard/v1/set-whitelist-only',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: {
          developer_id: developerId,
          app_id: appId,
          id: params.id,
          whitelist_only: params.whitelist_only,
        },
      }
    );

    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to publish leaderboard: ${error.message}`);
    }
    throw new Error(`Failed to publish leaderboard: ${String(error)}`);
  }
}

/**
 * Get enum descriptions for user-friendly display
 */
export const EnumDescriptions = {
  PeriodType: {
    [PeriodType.ALWAYS]: 'Always/永久 (never resets)',
    [PeriodType.DAILY]: 'Daily/每天 (resets every day)',
    [PeriodType.WEEKLY]: 'Weekly/每周 (resets every week)',
    [PeriodType.MONTHLY]: 'Monthly/每月 (resets every month)',
  },
  ScoreType: {
    [ScoreType.INTEGER]: 'Integer/数值型',
    [ScoreType.TIME]: 'Time/时间型',
  },
  ScoreOrder: {
    [ScoreOrder.DESCENDING]: 'Descending/降序 (higher is better)',
    [ScoreOrder.ASCENDING]: 'Ascending/升序 (lower is better)',
  },
  CalcType: {
    [CalcType.SUM]: 'Sum/累计分 (add all scores)',
    [CalcType.BEST]: 'Best/最佳分 (keep best score)',
    [CalcType.LATEST]: 'Latest/最新分 (keep latest score)',
  },
};
