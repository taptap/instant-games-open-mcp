import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ResolvedContext } from '../core/types/context';
import { clearAppCache, saveAppCache, type AppCacheInfo } from '../core/utils/cache';
import { editAppInfo, refreshAppCache } from '../features/app/api';
import { getH5PackageUploadParams } from '../features/h5Game/api';
import { handleUploadGame } from '../features/h5Game/handlers';
import { h5GameTools } from '../features/h5Game/tools';

jest.mock('../features/app/api', () => ({
  editAppInfo: jest.fn(),
  refreshAppCache: jest.fn(),
}));

jest.mock('../features/h5Game/api', () => {
  const actual = jest.requireActual('../features/h5Game/api');
  return {
    ...actual,
    getH5PackageUploadParams: jest.fn(),
  };
});

function appCache(screenOrientation: number): AppCacheInfo {
  return {
    developer_id: 290607,
    app_id: 925728,
    app_title: 'H5 orientation test',
    level: {
      status: 1,
      data: {
        title: 'H5 orientation test',
        screen_orientation: screenOrientation,
      },
    },
    upload_level: {
      status: 1,
      form_data: {
        info: {
          title: 'H5 orientation test',
          screen_orientation: screenOrientation,
        },
      },
    },
  };
}

describe('H5 first upload screen orientation', () => {
  const tempDirs: string[] = [];
  const originalFetch = global.fetch;

  function createProject(screenOrientation: number = 0): {
    projectPath: string;
    context: ResolvedContext;
  } {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'h5-upload-orientation-'));
    tempDirs.push(projectPath);
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>', 'utf8');
    saveAppCache(appCache(screenOrientation), projectPath);
    return {
      projectPath,
      context: new ResolvedContext({ _project_path: projectPath }, {}),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.MockedFunction<typeof fetch>;
    jest.mocked(getH5PackageUploadParams).mockResolvedValue({
      h5_package_id: 41226,
      url: 'https://upload.example/game.zip',
      method: 'PUT',
      headers: {},
    });
    jest.mocked(editAppInfo).mockResolvedValue({
      app_title: 'H5 orientation test',
      display_app_title: 'H5 orientation test',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const projectPath of tempDirs.splice(0)) {
      clearAppCache(projectPath);
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('exposes screenOrientation on upload_h5_game', () => {
    const uploadTool = h5GameTools.find((tool) => tool.definition.name === 'upload_h5_game');
    const property = uploadTool?.definition.inputSchema.properties?.screenOrientation;

    expect(property).toEqual(
      expect.objectContaining({
        type: 'number',
        enum: [1, 2],
      })
    );
  });

  test('blocks upload when neither cached nor provided orientation is valid', async () => {
    const { context } = createProject(0);

    const result = await handleUploadGame({ gamePath: '.', genre: 'casual' }, context);

    expect(result).toContain('请先选择游戏横竖屏');
    expect(result).toContain('screenOrientation: 1');
    expect(result).toContain('screenOrientation: 2');
    expect(getH5PackageUploadParams).not.toHaveBeenCalled();
    expect(editAppInfo).not.toHaveBeenCalled();
  });

  test('submits the selected orientation with the first package and verifies it', async () => {
    const { context } = createProject(0);
    jest.mocked(refreshAppCache).mockResolvedValue(appCache(2));

    const result = await handleUploadGame(
      { gamePath: '.', genre: 'casual', screenOrientation: 2 },
      context
    );

    expect(editAppInfo).toHaveBeenCalledWith(
      925728,
      290607,
      41226,
      undefined,
      'casual',
      undefined,
      undefined,
      undefined,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      context
    );
    expect(result).toContain('发布成功');
  });

  test('does not report success when the refreshed orientation differs', async () => {
    const { context } = createProject(0);
    jest.mocked(refreshAppCache).mockResolvedValue(appCache(0));

    await expect(
      handleUploadGame({ gamePath: '.', genre: 'casual', screenOrientation: 2 }, context)
    ).rejects.toThrow('横竖屏设置未生效');
  });
});
