/**
 * Maker project API helpers (list, create, base directories).
 *
 * Git operations live in `src/maker/git/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { MakerProjectSummary } from '../types.js';
import { loadPat } from '../storage.js';
import { getUserIdFromMakerJwt, requireMakerJwt } from '../auth/jwt.js';
import { getManualMakerPat, saveManualMakerPat } from '../auth/pat.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';

export interface CreateMakerProjectOptions {
  name: string;
  gameType?: string;
  pat: string;
}

const MAKER_PROJECT_BASE_DIRECTORIES = [
  'assets',
  'assets/image',
  'assets/sprites',
  'assets/video',
  'assets/audio',
  'scripts',
];

export function getConfiguredMakerApiBase(): string | undefined {
  return getMakerEndpoints().apiBase;
}

function getMakerApiBase(): string {
  const apiBase = requireMakerEndpoint('apiBase', getConfiguredMakerApiBase());
  return apiBase.replace(/\/$/, '');
}

function stringField(item: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function nullableStringField(
  item: Record<string, unknown>,
  ...keys: string[]
): string | null | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' || value === null) {
      return value;
    }
  }
  return undefined;
}

function numberField(item: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

export function normalizeProjectsResponse(data: unknown): MakerProjectSummary[] {
  const body = data as Record<string, unknown>;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.apps)
        ? body.apps
        : Array.isArray(body.projects)
          ? body.projects
          : [];

  return list
    .map((item) => item as Record<string, unknown>)
    .map((item) => {
      const userId = stringField(item, 'userId', 'user_id');
      return {
        id: String(item.id || item.app_id || item.project_id || ''),
        name: stringField(item, 'name', 'title'),
        userId,
        user_id: userId,
        createdAt: stringField(item, 'createdAt', 'created_at'),
        archivedAt: nullableStringField(item, 'archivedAt', 'archived_at'),
        deletedAt: nullableStringField(item, 'deletedAt', 'deleted_at'),
        gameType: stringField(item, 'gameType', 'game_type'),
        icon: numberField(item, 'icon'),
        iconColor: numberField(item, 'iconColor', 'icon_color'),
        lastAccessedAt: nullableStringField(item, 'lastAccessedAt', 'last_accessed_at'),
        lastConversationAt: stringField(item, 'lastConversationAt', 'last_conversation_at'),
        metadata: item.metadata,
        pinnedAt: nullableStringField(item, 'pinnedAt', 'pinned_at'),
        stage: stringField(item, 'stage'),
        sce_endpoint: stringField(item, 'sce_endpoint', 'sce_mcp_url'),
        git_url: stringField(item, 'git_url'),
        raw: item,
      };
    })
    .filter((project) => project.id.length > 0);
}

export async function listMakerProjects(options?: {
  jwt?: string;
  pat?: string;
}): Promise<MakerProjectSummary[]> {
  const pat = options?.pat ? saveManualMakerPat(options.pat) : getManualMakerPat() || loadPat();
  const url = new URL(`${getMakerApiBase()}/apps`);

  let authToken = pat?.token;
  if (!authToken) {
    const jwt = requireMakerJwt(options?.jwt);
    const userId = getUserIdFromMakerJwt(jwt);
    authToken = options?.jwt || jwt.token;
    if (userId) {
      url.searchParams.set('userId', userId);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
    },
  });
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker project list failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return normalizeProjectsResponse(json);
}

export async function createMakerProject(
  options: CreateMakerProjectOptions
): Promise<MakerProjectSummary> {
  const name = options.name.trim();
  if (!name) {
    throw new Error('Maker project name is required.');
  }

  const response = await fetch(`${getMakerApiBase()}/apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.pat}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      gameType: options.gameType || 'sce',
    }),
  });
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker project create failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  const body = json as Record<string, unknown>;
  const projects = normalizeProjectsResponse(body.app ? { apps: [body.app] } : json);
  const project = projects[0];
  if (!project?.id) {
    throw new Error(`Maker project create returned no app id: ${JSON.stringify(json)}`);
  }
  return project;
}

export function ensureMakerProjectBaseDirectories(targetDir: string): void {
  for (const relativeDir of MAKER_PROJECT_BASE_DIRECTORIES) {
    fs.mkdirSync(path.join(targetDir, relativeDir), { recursive: true });
  }
}
