/**
 * TapTap Leaderboard Management API
 * Server-side leaderboard operations
 */

import { HttpClient } from './httpClient.js';
import { readAppCache, saveAppCache, AppCacheInfo } from '../utils/cache.js';

/**
 * Period types for leaderboard
 */
export enum PeriodType {
  DAILY = 0,
  WEEKLY = 1,
  MONTHLY = 2,
  ALWAYS = 3,
  CUSTOM = 4
}

/**
 * Score types
 */
export enum ScoreType {
  INTEGER = 0,
  FLOAT = 1,
  TIME = 2
}

/**
 * Score order
 */
export enum ScoreOrder {
  ASCENDING = 0,
  DESCENDING = 1,
  NONE = 2
}

/**
 * Calculation types
 */
export enum CalcType {
  BEST = 0,
  LATEST = 1,
  SUM = 2,
  FIRST = 3
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
  leaderboard_id: string;
  open_id: string;
  title: string;
  default_status: number;
}

/**
 * Create a new leaderboard
 * @param params - Leaderboard creation parameters
 * @returns Created leaderboard information
 */
export async function createLeaderboard(params: CreateLeaderboardParams): Promise<CreateLeaderboardResponse> {
  const client = new HttpClient();

  try {
    const result = await client.post<CreateLeaderboardResponse>('/open/leaderboard/v1/create', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: {
        developer_id: params.developer_id,
        app_id: params.app_id,
        title: params.title,
        period_type: params.period_type,
        score_type: params.score_type,
        score_order: params.score_order,
        calc_type: params.calc_type,
        display_limit: params.display_limit,
        period_time: params.period_time,
        score_unit: params.score_unit
      }
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
 * Craft/App item in developer list
 */
export interface CraftItem {
  app_id: number;
  app_title: string;
  category?: string;
  is_published?: boolean;
}

/**
 * Developer with crafts list
 */
export interface DeveloperCraftList {
  developer_id: number;
  developer_name: string;
  crafts: CraftItem[];
}

/**
 * Level list response
 */
export interface LevelListResponse {
  list: DeveloperCraftList[];
}

/**
 * Get app/level list information for current user
 * Returns all developers and their apps/games
 * @param projectPath - Optional project path for cache lookup
 * @returns App information including developer_id and app_id
 */
export async function getAppInfo(projectPath?: string): Promise<AppCacheInfo> {
  const client = new HttpClient();

  try {
    const response = await client.get<LevelListResponse>('/level/v1/list');

    // Get first developer and first app by default
    if (!response.list || response.list.length === 0) {
      throw new Error('No developers or apps found for current user');
    }

    const firstDeveloper = response.list[0];

    if (!firstDeveloper.crafts || firstDeveloper.crafts.length === 0) {
      throw new Error(`Developer ${firstDeveloper.developer_name} has no apps/games`);
    }

    const firstApp = firstDeveloper.crafts[0];

    const appInfo: AppCacheInfo = {
      developer_id: firstDeveloper.developer_id,
      developer_name: firstDeveloper.developer_name,
      app_id: firstApp.app_id,
      app_title: firstApp.app_title
    };

    // Save to cache
    saveAppCache(appInfo, projectPath);

    return appInfo;
  } catch (error) {
    // If API fails, try to use cached data
    const cached = readAppCache(projectPath);
    if (cached?.developer_id && cached?.app_id) {
      return cached;
    }

    if (error instanceof Error) {
      throw new Error(`Failed to get app info: ${error.message}`);
    }
    throw new Error(`Failed to get app info: ${String(error)}`);
  }
}

/**
 * Get or fetch app information with automatic caching
 * @param projectPath - Optional project path
 * @returns App information from cache or API
 */
export async function ensureAppInfo(projectPath?: string): Promise<AppCacheInfo> {
  // Check cache first
  const cached = readAppCache(projectPath);

  if (cached?.developer_id && cached?.app_id) {
    return cached;
  }

  // No cache, fetch from API
  return await getAppInfo(projectPath);
}

/**
 * Get all developers and apps for selection
 * @returns List of all developers and their apps
 */
export async function getAllDevelopersAndApps(): Promise<LevelListResponse> {
  const client = new HttpClient();

  try {
    const response = await client.get<LevelListResponse>('/level/v1/list');
    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get developers and apps list: ${error.message}`);
    }
    throw new Error(`Failed to get developers and apps list: ${String(error)}`);
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
 * @param projectPath - Optional project path for cache lookup
 * @returns List of leaderboards and total count
 */
export async function listLeaderboards(
  params: ListLeaderboardsParams = {},
  projectPath?: string
): Promise<LeaderboardListResponse> {
  const client = new HttpClient();

  try {
    // Ensure developer_id and app_id are available
    let developerId = params.developer_id;
    let appId = params.app_id;

    if (!developerId || !appId) {
      const appInfo = await ensureAppInfo(projectPath);
      if (!developerId) developerId = appInfo.developer_id;
      if (!appId) appId = appInfo.app_id;
    }

    if (!developerId || !appId) {
      throw new Error('developer_id and app_id are required');
    }

    const response = await client.get<LeaderboardListResponse>('/open/leaderboard/v1/list', {
      params: {
        developer_id: developerId.toString(),
        app_id: appId.toString(),
        page: (params.page || 1).toString(),
        page_size: (params.page_size || 10).toString()
      }
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
 * Get enum descriptions for user-friendly display
 */
export const EnumDescriptions = {
  PeriodType: {
    [PeriodType.DAILY]: 'Daily (resets every day)',
    [PeriodType.WEEKLY]: 'Weekly (resets every week)',
    [PeriodType.MONTHLY]: 'Monthly (resets every month)',
    [PeriodType.ALWAYS]: 'Always (never resets)',
    [PeriodType.CUSTOM]: 'Custom (custom reset schedule)'
  },
  ScoreType: {
    [ScoreType.INTEGER]: 'Integer',
    [ScoreType.FLOAT]: 'Float',
    [ScoreType.TIME]: 'Time'
  },
  ScoreOrder: {
    [ScoreOrder.ASCENDING]: 'Ascending (lower is better)',
    [ScoreOrder.DESCENDING]: 'Descending (higher is better)',
    [ScoreOrder.NONE]: 'None'
  },
  CalcType: {
    [CalcType.BEST]: 'Best (keep best score)',
    [CalcType.LATEST]: 'Latest (keep latest score)',
    [CalcType.SUM]: 'Sum (sum all scores)',
    [CalcType.FIRST]: 'First (keep first score)'
  }
};
