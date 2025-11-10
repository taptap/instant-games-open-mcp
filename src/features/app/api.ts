/**
 * Application Management API
 * Handles developer and app operations
 */

import { HttpClient } from '../../core/network/httpClient.js';
import { readAppCache, saveAppCache, AppCacheInfo } from '../../core/utils/cache.js';

/**
 * Craft/App item in developer list
 */
export interface CraftItem {
  app_id: number;
  app_title: string;
  miniapp_id?: string;  // Minigame/H5 预览 ID
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
export async function getAppInfo(
  projectPath?: string,
  autoSelect: boolean = true,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<AppCacheInfo> {
  const client = new HttpClient(macToken);

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
      app_title: firstApp.app_title,
      miniapp_id: firstApp.miniapp_id
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
export async function ensureAppInfo(
  projectPath?: string,
  autoSelect: boolean = true,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<AppCacheInfo> {
  // Check cache first
  const cached = readAppCache(projectPath);

  if (cached?.developer_id && cached?.app_id) {
    return cached;
  }

  // No cache, fetch from API
  return await getAppInfo(projectPath, autoSelect, macToken);
}

/**
 * Select and cache a specific developer and app
 * @param developerId - Developer ID to select
 * @param appId - App ID to select
 * @param projectPath - Optional project path for cache storage
 * @returns Selected app information
 */
export async function selectApp(
  developerId: number,
  appId: number,
  projectPath?: string,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<AppCacheInfo> {
  const client = new HttpClient(macToken);

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
      app_title: app.app_title,
      miniapp_id: app.miniapp_id
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
 * @param macToken - Optional MAC Token (overrides global token)
 * @returns List of all developers and their apps
 */
export async function getAllDevelopersAndApps(
  macToken?: import('../../core/types/index.js').MacToken
): Promise<LevelListResponse> {
  const client = new HttpClient(macToken);

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
 * Create Developer Response
 */
export interface CreateDeveloperResponse {
  developer_name: string;
  developer_id: number;
}

/**
 * Create unverified developer
 */
export async function createDeveloper(macToken?: import('../../core/types/index.js').MacToken): Promise<CreateDeveloperResponse> {
  const client = new HttpClient(macToken);
  return await client.post<CreateDeveloperResponse>('/v1/developer/create-register');
}

/**
 * Create App Response
 */
export interface CreateAppResponse {
  app_id: number;
  app_title: string;
  display_app_title: string;
}

/**
 * Create a new app/game
 */
export async function createAppForDeveloper(
  developer_id: number,
  title?: string,
  genre?: string,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<CreateAppResponse> {
  const client = new HttpClient(macToken);
  return await client.post<CreateAppResponse>('/level/v1/create', {
    body: {
      developer_id,
      title,
      category: genre,
    },
  });
}

/**
 * Edit App Response
 */
export interface EditAppResponse {
  app_title?: string;
  display_app_title?: string;
}

/**
 * Edit app/game information
 */
export async function editAppInfo(
  app_id: number,
  developer_id: number,
  package_id?: number,
  appName?: string,
  genre?: string,
  description?: string,
  chatting_label?: string,
  chatting_number?: string,
  screen_orientation?: number,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<EditAppResponse> {
  const client = new HttpClient(macToken);
  return await client.post<EditAppResponse>('/level/v1/submit', {
    body: {
      app_id,
      developer_id,
      package_id,
      title: appName,
      category: genre,
      description,
      chatting_label,
      chatting_number,
      screen_orientation,
    },
  });
}

/**
 * App Status Response
 */
export interface AppStatusResponse {
  review_status: number;
}

/**
 * Get app review status
 */
export async function getAppStatus(app_id: number, macToken?: import('../../core/types/index.js').MacToken): Promise<AppStatusResponse> {
  const client = new HttpClient(macToken);
  return await client.get<AppStatusResponse>('/level/v1/status', {
    params: {
      app_id: app_id.toString(),
    },
  });
}

/**
 * App Detail API Response
 */
export interface AppDetailAPIResponse {
  level?: {
    display_app_title?: string;
    developer_id?: number;
    developer_name?: string;
  };
  upload_level?: {
    app_id: number;
    form_data: {
      info: {
        title: string;
      };
    };
  };
}

/**
 * App Detail
 */
export interface AppDetail {
  appId: number;
  appTitle: string;
  displayAppTitle: string;
  developerId: number;
  developerName: string;
}

/**
 * Get app detail information
 */
export async function getAppDetail(
  appId: number,
  macToken?: import('../../core/types/index.js').MacToken
): Promise<AppDetail | undefined> {
  const client = new HttpClient(macToken);

  try {
    const response = await client.get<AppDetailAPIResponse>('/level/v1/latest', {
      params: {
        app_id: appId.toString(),
      },
    });

    if (response.level && response.upload_level) {
      return {
        appId: response.upload_level.app_id,
        appTitle: response.upload_level.form_data.info.title,
        displayAppTitle: response.level.display_app_title || '',
        developerId: response.level.developer_id || 0,
        developerName: response.level.developer_name || '',
      };
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}
