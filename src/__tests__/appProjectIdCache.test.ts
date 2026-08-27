import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HttpClient } from '../core/network/httpClient';
import { ResolvedContext } from '../core/types/context';
import { clearAppCache, getCachePath, readAppCache, saveAppCache } from '../core/utils/cache';
import { selectApp } from '../features/app/api';
import {
  clearAuthData,
  clearAuthDataRaw,
  getCurrentAppInfo,
  getCurrentAppInfoRaw,
} from '../features/app/handlers';
import { handleGatherGameInfo } from '../features/h5Game/handlers';

function createProjectId(label: string): string {
  return `project-id-${label}-${Date.now()}-${Math.random()}`;
}

function createContext(projectId: string): ResolvedContext {
  return new ResolvedContext({ _project_id: projectId }, {});
}

function seedSelectedApp(projectId: string): void {
  saveAppCache(
    {
      developer_id: 100,
      developer_name: 'developer-100',
      app_id: 200,
      app_title: 'game-200',
      updated_at: Date.now(),
    },
    projectId
  );
}

describe('projectId-only app cache isolation', () => {
  const cacheKeys: string[] = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    jest.restoreAllMocks();
    for (const cacheKey of cacheKeys.splice(0)) {
      clearAppCache(cacheKey);
    }
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('makes a projectId-only select_app visible to H5 upload preparation', async () => {
    const projectId = createProjectId('h5-gather');
    const appId = 987654321;
    cacheKeys.push(projectId);
    const gamePath = fs.mkdtempSync(path.join(os.tmpdir(), 'taptap-h5-project-id-'));
    tempDirs.push(gamePath);
    fs.writeFileSync(path.join(gamePath, 'index.html'), '<!doctype html>');
    jest.spyOn(HttpClient.prototype, 'get').mockResolvedValue({
      level: {
        app_id: appId,
        app_title: `game-${appId}`,
        developer_id: 100,
        developer_name: 'developer-100',
        status: 4,
        data: { title: `Game ${appId}`, screen_orientation: 2 },
      },
    });

    const context = createContext(projectId);
    await selectApp(100, appId, undefined, context);
    const output = await handleGatherGameInfo({ gamePath }, context);

    expect(output).not.toContain('尚未选择应用');
    expect(output).toContain(`game-${appId}`);
    expect(output).toContain(String(appId));
  });

  test('reports the projectId-isolated cache path in text and raw app info', async () => {
    const projectId = createProjectId('cache-path');
    cacheKeys.push(projectId);
    seedSelectedApp(projectId);
    const context = createContext(projectId);

    const textOutput = await getCurrentAppInfo(context);
    const rawOutput = JSON.parse(await getCurrentAppInfoRaw(context));

    expect(textOutput).toContain(getCachePath(projectId));
    expect(rawOutput.cache_path).toBe(getCachePath(projectId));
  });

  test('clears the projectId-isolated cache from both clear auth handlers', async () => {
    const projectId = createProjectId('clear-cache');
    cacheKeys.push(projectId);
    const context = createContext(projectId);

    seedSelectedApp(projectId);
    await clearAuthData({ clear_token: false }, context);
    expect(readAppCache(projectId)).toBeNull();

    seedSelectedApp(projectId);
    await clearAuthDataRaw({ clear_token: false }, context);
    expect(readAppCache(projectId)).toBeNull();
  });
});
