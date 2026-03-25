/**
 * Application Management API
 * Handles developer and app operations
 */

import { HttpClient } from '../../core/network/httpClient.js';
import {
  readAppCache,
  saveAppCache,
  AppCacheInfo,
  CachedLevelInfo,
} from '../../core/utils/cache.js';
import type { ResolvedContext } from '../../core/types/context.js';

/**
 * Craft/App item in developer list
 */
export interface CraftItem {
  app_id: number;
  app_title: string;
  miniapp_id?: string; // Minigame/H5 预览 ID
  category?: string;
  is_published?: boolean;
  is_level?: boolean;
  app_kind?: 'level' | 'non_level';
}

/**
 * Developer with levels/apps list
 */
export interface DeveloperCraftList {
  developer_id: number;
  developer_name: string;
  apps: CraftItem[];
  levels: CraftItem[]; // API returns 'levels' not 'crafts'
  crafts?: CraftItem[]; // Keep for backward compatibility
}

/**
 * Level list response
 */
export interface LevelListResponse {
  list: DeveloperCraftList[];
}

/**
 * Non-level app item returned by /level/v1/non-level-list
 */
export interface NonLevelItem {
  app_id: number;
  app_title: string;
  category?: string;
  is_published?: boolean;
}

/**
 * Developer with non-level apps list
 */
export interface DeveloperNonLevelList {
  developer_id: number;
  developer_name: string;
  apps: NonLevelItem[];
}

/**
 * Non-level list response
 */
export interface NonLevelListResponse {
  list: DeveloperNonLevelList[];
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

function normalizeLevelApp(item: CraftItem): CraftItem {
  return {
    ...item,
    is_level: true,
    app_kind: 'level',
  };
}

function normalizeNonLevelApp(item: NonLevelItem): CraftItem {
  return {
    ...item,
    is_level: false,
    app_kind: 'non_level',
  };
}

function buildDeveloperEntry(developer_id: number, developer_name: string): DeveloperCraftList {
  return {
    developer_id,
    developer_name,
    apps: [],
    levels: [],
    crafts: [],
  };
}

function appendApp(target: DeveloperCraftList, app: CraftItem): void {
  if (target.apps.some((existing) => existing.app_id === app.app_id)) {
    return;
  }

  target.apps.push(app);
  if (app.is_level !== false) {
    target.levels.push(app);
  }
  target.crafts = target.levels;
}

function mergeDeveloperLists(
  levelResponse: LevelListResponse,
  nonLevelResponse: NonLevelListResponse
): LevelListResponse {
  const developerMap = new Map<number, DeveloperCraftList>();
  const orderedDeveloperIds: number[] = [];

  const ensureDeveloper = (developer_id: number, developer_name: string): DeveloperCraftList => {
    const existing = developerMap.get(developer_id);
    if (existing) {
      if (!existing.developer_name && developer_name) {
        existing.developer_name = developer_name;
      }
      return existing;
    }

    const created = buildDeveloperEntry(developer_id, developer_name);
    developerMap.set(developer_id, created);
    orderedDeveloperIds.push(developer_id);
    return created;
  };

  for (const developer of levelResponse.list || []) {
    const entry = ensureDeveloper(developer.developer_id, developer.developer_name);
    for (const app of developer.levels || developer.apps || developer.crafts || []) {
      appendApp(entry, normalizeLevelApp(app));
    }
  }

  for (const developer of nonLevelResponse.list || []) {
    const entry = ensureDeveloper(developer.developer_id, developer.developer_name);
    for (const app of developer.apps || []) {
      appendApp(entry, normalizeNonLevelApp(app));
    }
  }

  return {
    list: orderedDeveloperIds.map((developerId) => developerMap.get(developerId)!),
  };
}

/**
 * Get all developers and apps for selection
 * @param ctx - Optional resolved context
 * @returns List of all developers and their apps
 */
export async function getAllDevelopersAndApps(ctx?: ResolvedContext): Promise<LevelListResponse> {
  const client = new HttpClient(ctx);

  try {
    const [levelResponse, nonLevelResponse] = await Promise.all([
      client.get<LevelListResponse>('/level/v1/list'),
      client.get<NonLevelListResponse>('/level/v1/non-level-list'),
    ]);
    return mergeDeveloperLists(levelResponse, nonLevelResponse);
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
export async function createDeveloper(ctx?: ResolvedContext): Promise<CreateDeveloperResponse> {
  const client = new HttpClient(ctx);
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
  ctx?: ResolvedContext
): Promise<CreateAppResponse> {
  const client = new HttpClient(ctx);
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
  icon?: string,
  banner?: string,
  screenshots?: string[],
  trial_note?: string,
  ctx?: ResolvedContext
): Promise<EditAppResponse> {
  const client = new HttpClient(ctx);
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
      icon,
      banner,
      screenshots,
      trial_note,
    },
  });
}

/**
 * 关卡游戏状态
 * @see https://agent.api.xdrnd.cn/_docs#/level/get_level_v1_status
 */
export enum AppStatus {
  /** 未上线 */
  Offline = 0,
  /** 已上线 */
  Online = 1,
}

/**
 * 审核状态
 * @see https://agent.api.xdrnd.cn/_docs#/level/get_level_v1_status
 */
export enum ReviewStatus {
  /** 未发布 */
  Unpublished = 0,
  /** 审核中 */
  UnderReview = 1,
  /** 审核失败 */
  Rejected = 2,
  /** 已上线 */
  Published = 4,
}

/**
 * App Status Response
 * @see https://agent.api.xdrnd.cn/_docs#/level/get_level_v1_status
 */
export interface AppStatusResponse {
  /** 关卡游戏状态 */
  app_status: number;
  /** 审核状态 */
  review_status: number;
}

/**
 * Get app review status
 */
export async function getAppStatus(
  app_id: number,
  ctx?: ResolvedContext
): Promise<AppStatusResponse> {
  const client = new HttpClient(ctx);
  return await client.get<AppStatusResponse>('/level/v1/status', {
    params: {
      app_id: app_id.toString(),
    },
  });
}

/**
 * App Detail API Response (from /level/v1/latest)
 */
export interface AppDetailAPIResponse {
  level?: {
    id?: number;
    app_id: number;
    app_title: string;
    developer_id: number;
    developer_name: string;
    miniapp_id?: string;
    version?: string;
    status: number;
    data: {
      title: string;
      description?: string;
      category?: string;
      screen_orientation?: number;
      icon?: string;
      banner?: string;
      screenshots?: string[];
      trial_note?: string;
    };
  };
  upload_level?: {
    id?: number;
    app_id: number;
    app_title?: string;
    developer_id?: number;
    developer_name?: string;
    miniapp_id?: string;
    version?: string;
    status: number;
    form_data: {
      info: {
        title: string;
        description?: string;
        category?: string;
        screen_orientation?: number;
        icon?: string;
        banner?: string;
        screenshots?: string[];
        trial_note?: string;
      };
    };
  };
}

/**
 * App Detail (parsed from API response)
 */
export interface AppDetail {
  appId: number;
  appTitle: string;
  displayAppTitle: string;
  developerId: number;
  developerName: string;
  miniappId?: string;
  // Raw data for cache
  level?: CachedLevelInfo;
  uploadLevel?: CachedLevelInfo;
}

/**
 * Fetch app detail information from API
 * @param appId - App ID to fetch
 * @param ctx - Optional resolved context
 * @returns App detail or undefined if not found
 */
export async function fetchAppDetail(
  appId: number,
  ctx?: ResolvedContext
): Promise<AppDetail | undefined> {
  const client = new HttpClient(ctx);

  try {
    const response = await client.get<AppDetailAPIResponse>('/level/v1/latest', {
      params: {
        app_id: appId.toString(),
      },
    });

    // Convert API response to CachedLevelInfo format
    const convertToCachedLevel = (
      apiLevel: NonNullable<AppDetailAPIResponse['level']>
    ): CachedLevelInfo => ({
      id: apiLevel.id,
      app_id: apiLevel.app_id,
      app_title: apiLevel.app_title,
      developer_id: apiLevel.developer_id,
      developer_name: apiLevel.developer_name,
      miniapp_id: apiLevel.miniapp_id,
      version: apiLevel.version,
      status: apiLevel.status,
      data: apiLevel.data,
    });

    const convertUploadToCachedLevel = (
      apiUpload: NonNullable<AppDetailAPIResponse['upload_level']>
    ): CachedLevelInfo => ({
      id: apiUpload.id,
      app_id: apiUpload.app_id,
      app_title: apiUpload.app_title || apiUpload.form_data.info.title,
      developer_id: apiUpload.developer_id,
      developer_name: apiUpload.developer_name,
      miniapp_id: apiUpload.miniapp_id,
      version: apiUpload.version,
      status: apiUpload.status,
      form_data: apiUpload.form_data,
    });

    // 优先使用已上线的 level 信息，如果不存在则回退到 upload_level
    if (response.level) {
      return {
        appId: response.level.app_id,
        appTitle: response.level.app_title, // System name
        displayAppTitle: response.level.data.title, // Display name
        developerId: response.level.developer_id,
        developerName: response.level.developer_name,
        miniappId: response.level.miniapp_id,
        level: convertToCachedLevel(response.level),
        uploadLevel: response.upload_level
          ? convertUploadToCachedLevel(response.upload_level)
          : undefined,
      };
    }

    if (response.upload_level) {
      return {
        appId: response.upload_level.app_id,
        appTitle: response.upload_level.app_title || response.upload_level.form_data.info.title,
        displayAppTitle: response.upload_level.form_data.info.title,
        developerId: response.upload_level.developer_id || 0,
        developerName: response.upload_level.developer_name || '',
        miniappId: response.upload_level.miniapp_id,
        level: undefined,
        uploadLevel: convertUploadToCachedLevel(response.upload_level),
      };
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Refresh application cache immediately
 * @param projectPath - Optional project path
 * @param ctx - Resolved context
 * @returns Updated app information
 */
export async function refreshAppCache(
  projectPath?: string,
  ctx?: ResolvedContext
): Promise<AppCacheInfo> {
  const cached = readAppCache(projectPath);
  if (!cached?.app_id || !cached?.developer_id) {
    throw new Error('No app selected to refresh');
  }

  // Reuse selectApp to fetch fresh data and update cache
  // But allow developerId mismatch if it was 0 (from initial upload_level only cache)
  return await selectApp(cached.developer_id, cached.app_id, projectPath, ctx);
}

// TTL Constants
const INFO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for basic info

/**
 * Get cached app information with automatic TTL check and refresh
 *
 * @param projectPath - Optional project path for cache lookup
 * @param ctx - Optional resolved context for API calls
 * @param forceRefresh - If true, ignores cache TTL and fetches fresh data
 * @returns Cached app information, or null if no app has been selected
 *
 * @description
 * This function does NOT auto-select an app. If no app has been selected,
 * it returns null. The caller should guide the user to:
 * 1. Call list_developers_and_apps to see available options
 * 2. Call select_app to choose an app
 */
export async function ensureAppInfo(
  projectPath?: string,
  ctx?: ResolvedContext,
  forceRefresh: boolean = false
): Promise<AppCacheInfo | null> {
  // Check cache first
  const cached = readAppCache(projectPath);

  // No cache - return null (do not auto-select)
  if (!cached?.developer_id || !cached?.app_id) {
    return null;
  }

  // Check if refresh is needed
  const now = Date.now();
  const isExpired = !cached.updated_at || now - cached.updated_at > INFO_TTL_MS;

  if (forceRefresh || isExpired) {
    try {
      // Try to refresh
      return await refreshAppCache(projectPath, ctx);
    } catch {
      // Refresh failed, return stale cache with warning flag
      return { ...cached, is_stale: true };
    }
  }

  return cached;
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
  ctx?: ResolvedContext
): Promise<AppCacheInfo> {
  try {
    const appDetail = await fetchAppDetail(appId, ctx);

    if (!appDetail) {
      throw new Error(`App with ID ${appId} not found`);
    }

    // Allow developerId mismatch if cached developerId is 0 (from upload_level only)
    if (developerId !== 0 && appDetail.developerId !== 0 && appDetail.developerId !== developerId) {
      throw new Error(
        `App ${appId} belongs to developer ${appDetail.developerId}, not ${developerId}`
      );
    }

    // Preserve existing developer_name from cache if API returns empty
    const existingCache = readAppCache(projectPath);
    const appInfo: AppCacheInfo = {
      developer_id: appDetail.developerId || developerId, // Use passed ID if detail has 0
      developer_name: appDetail.developerName || existingCache?.developer_name,
      app_id: appDetail.appId,
      app_title: appDetail.appTitle,
      miniapp_id: appDetail.miniappId,
      level: appDetail.level,
      upload_level: appDetail.uploadLevel,
      updated_at: Date.now(),
      status_updated_at: Date.now(),
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
 * Upload Image Response
 */
export interface UploadImageResponse {
  url: string;
}

/**
 * Upload image to TapTap server
 * @param imageData - Image data as Buffer
 * @param filename - Original filename (used for MIME type detection)
 * @param ctx - Optional resolved context
 * @returns Uploaded image URL
 */
export async function uploadImage(
  imageData: Buffer,
  filename: string,
  ctx?: ResolvedContext
): Promise<string> {
  const client = new HttpClient(ctx);

  // Determine MIME type from filename
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

  try {
    const response = await client.postMultipart<UploadImageResponse>('/v1/upload-image', [
      {
        name: 'image',
        value: imageData,
        filename: filename,
        contentType: mimeType,
      },
    ]);
    return response.url;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to upload image: ${error.message}`);
    }
    throw new Error(`Failed to upload image: ${String(error)}`);
  }
}
