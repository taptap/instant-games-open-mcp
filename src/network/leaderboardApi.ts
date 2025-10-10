/**
 * TapTap Leaderboard Management API
 * Server-side leaderboard operations
 */

import { HttpClient } from './httpClient.js';
import { readAppCache, saveAppCache, AppCacheInfo } from '../utils/cache.js';

/**
 * Period types for leaderboard
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum PeriodType {
  UNSPECIFIED = 0,  // 未指定 - 无效值
  ALWAYS = 1,       // 永久
  DAILY = 2,        // 每天
  WEEKLY = 3,       // 每周
  MONTHLY = 4       // 每月
}

/**
 * Score types
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum ScoreType {
  UNSPECIFIED = 0,  // 未指定 - 无效值
  INTEGER = 1,      // 数值型
  TIME = 2          // 时间型
}

/**
 * Score order
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum ScoreOrder {
  UNSPECIFIED = 0,  // 未指定 - 无效值
  DESCENDING = 1,   // 降序（数值越大越好）
  ASCENDING = 2     // 升序（数值越小越好）
}

/**
 * Calculation types
 * WARNING: 0 = UNSPECIFIED (invalid), do NOT use 0!
 */
export enum CalcType {
  UNSPECIFIED = 0,  // 未指定 - 无效值
  SUM = 1,          // 累计分
  BEST = 2,         // 最佳分
  LATEST = 3        // 最新分
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
    // Build request body with correct types:
    // - IDs (developer_id, app_id, display_limit) remain as numbers
    // - Enum values (period_type, score_type, etc.) converted to strings
    // - Text fields (title, period_time, score_unit) remain as strings
    const requestBody: Record<string, string | number> = {
      developer_id: params.developer_id,              // number (ID)
      app_id: params.app_id,                          // number (ID)
      title: params.title,                            // string
      period_type: String(params.period_type),        // string (enum)
      score_type: String(params.score_type),          // string (enum)
      score_order: String(params.score_order),        // string (enum)
      calc_type: String(params.calc_type)             // string (enum)
    };

    // Add optional fields only if provided
    if (params.display_limit !== undefined) {
      requestBody.display_limit = params.display_limit;  // number (ID)
    }
    if (params.period_time) {
      requestBody.period_time = params.period_time;      // string
    }
    if (params.score_unit) {
      requestBody.score_unit = params.score_unit;        // string
    }

    const result = await client.post<CreateLeaderboardResponse>('/open/leaderboard/v1/create', {
      headers: {
        'Content-Type': 'application/json'
      },
      body: requestBody
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
 * Developer with levels/apps list
 */
export interface DeveloperCraftList {
  developer_id: number;
  developer_name: string;
  levels: CraftItem[];  // API returns 'levels' not 'crafts'
  crafts?: CraftItem[]; // Keep for backward compatibility
}

/**
 * Level list response
 */
export interface LevelListResponse {
  list: DeveloperCraftList[];
}

/**
 * Selection required error - thrown when multiple options exist
 */
export class SelectionRequiredError extends Error {
  constructor(
    message: string,
    public readonly developers: DeveloperCraftList[]
  ) {
    super(message);
    this.name = 'SelectionRequiredError';
  }
}

/**
 * Get app/level list information for current user
 * Returns all developers and their apps/games
 * @param projectPath - Optional project path for cache lookup
 * @param autoSelect - If true, automatically selects first option. If false, throws SelectionRequiredError when multiple options exist
 * @returns App information including developer_id and app_id
 * @throws SelectionRequiredError when multiple developers/apps exist and autoSelect is false
 */
export async function getAppInfo(projectPath?: string, autoSelect: boolean = true): Promise<AppCacheInfo> {
  const client = new HttpClient();

  try {
    const response = await client.get<LevelListResponse>('/level/v1/list');

    // Get first developer and first app by default
    if (!response.list || response.list.length === 0) {
      throw new Error('No developers or apps found for current user');
    }

    // Count total developers and apps
    const totalDevelopers = response.list.length;
    const totalApps = response.list.reduce((sum, dev) => sum + (dev.levels?.length || dev.crafts?.length || 0), 0);

    // If multiple options exist and autoSelect is false, throw error for AI to decide
    if (!autoSelect && (totalDevelopers > 1 || totalApps > 1)) {
      let errorMsg = `Multiple options found:\n`;
      errorMsg += `- ${totalDevelopers} developer(s)\n`;
      errorMsg += `- ${totalApps} app(s) in total\n\n`;
      errorMsg += `Please use 'list_developers_and_apps' tool to see all options and 'select_app' to make a selection.`;
      throw new SelectionRequiredError(errorMsg, response.list);
    }

    const firstDeveloper = response.list[0];

    // Support both 'levels' (actual API response) and 'crafts' (backward compatibility)
    const apps = firstDeveloper.levels || firstDeveloper.crafts || [];

    if (apps.length === 0) {
      throw new Error(`Developer ${firstDeveloper.developer_name} has no apps/games`);
    }

    const firstApp = apps[0];

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
    // Re-throw SelectionRequiredError
    if (error instanceof SelectionRequiredError) {
      throw error;
    }

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
 * @param autoSelect - If true, automatically selects first option. If false, throws SelectionRequiredError when multiple options exist
 * @returns App information from cache or API
 * @throws SelectionRequiredError when multiple developers/apps exist and autoSelect is false
 */
export async function ensureAppInfo(projectPath?: string, autoSelect: boolean = true): Promise<AppCacheInfo> {
  // Check cache first
  const cached = readAppCache(projectPath);

  if (cached?.developer_id && cached?.app_id) {
    return cached;
  }

  // No cache, fetch from API
  return await getAppInfo(projectPath, autoSelect);
}

/**
 * Select and cache a specific developer and app
 * @param developerId - Developer ID to select
 * @param appId - App ID to select
 * @param projectPath - Optional project path for cache storage
 * @returns Selected app information
 */
export async function selectApp(developerId: number, appId: number, projectPath?: string): Promise<AppCacheInfo> {
  const client = new HttpClient();

  try {
    // Fetch full list to validate selection
    const response = await client.get<LevelListResponse>('/level/v1/list');

    if (!response.list || response.list.length === 0) {
      throw new Error('No developers or apps found for current user');
    }

    // Find the selected developer and app
    const developer = response.list.find(dev => dev.developer_id === developerId);
    if (!developer) {
      throw new Error(`Developer with ID ${developerId} not found`);
    }

    // Support both 'levels' (actual API response) and 'crafts' (backward compatibility)
    const apps = developer.levels || developer.crafts || [];
    const app = apps.find(craft => craft.app_id === appId);
    if (!app) {
      throw new Error(`App with ID ${appId} not found for developer ${developer.developer_name}`);
    }

    const appInfo: AppCacheInfo = {
      developer_id: developer.developer_id,
      developer_name: developer.developer_name,
      app_id: app.app_id,
      app_title: app.app_title
    };

    // Save to cache
    saveAppCache(appInfo, projectPath);

    return appInfo;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to select app: ${error.message}`);
    }
    throw new Error(`Failed to select app: ${String(error)}`);
  }
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
    [PeriodType.ALWAYS]: 'Always/永久 (never resets)',
    [PeriodType.DAILY]: 'Daily/每天 (resets every day)',
    [PeriodType.WEEKLY]: 'Weekly/每周 (resets every week)',
    [PeriodType.MONTHLY]: 'Monthly/每月 (resets every month)'
  },
  ScoreType: {
    [ScoreType.INTEGER]: 'Integer/数值型',
    [ScoreType.TIME]: 'Time/时间型'
  },
  ScoreOrder: {
    [ScoreOrder.DESCENDING]: 'Descending/降序 (higher is better)',
    [ScoreOrder.ASCENDING]: 'Ascending/升序 (lower is better)'
  },
  CalcType: {
    [CalcType.SUM]: 'Sum/累计分 (add all scores)',
    [CalcType.BEST]: 'Best/最佳分 (keep best score)',
    [CalcType.LATEST]: 'Latest/最新分 (keep latest score)'
  }
};
