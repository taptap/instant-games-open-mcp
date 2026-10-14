import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as config from '../../config.js';
import * as pat from '../../git/pat.js';
import { saveProjectConfig } from '../../storage.js';
import { serverRecognitionAvailable } from '../serverRecognition.js';
import { resolvedModelSettingsForDisplay, resolvedUiVisionModels } from '../canvasRecognition.js';
import { readModelSettings, saveVisionSettings, updateModelSettings } from '../visionSettings.js';

let root: string;
let previousHome: string | undefined;
let previousConfig: string | undefined;
const appId = '11111111-1111-4111-8111-111111111111';
const available = () =>
  new Response(
    JSON.stringify({
      status: 'failed',
      error: { code: 'MODEL_INFERENCE_NOT_FOUND', retryable: false },
    }),
    { status: 404 }
  );

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-vision-availability-'));
  previousHome = process.env.TAPTAP_MAKER_HOME;
  previousConfig = process.env.TAPTAP_MAKER_VISION_CONFIG;
  process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  delete process.env.TAPTAP_MAKER_VISION_CONFIG;
  saveProjectConfig(root, { project_id: appId });
  jest.spyOn(pat, 'requireMakerPat').mockReturnValue({ token: 'test-private-pat' });
  jest.spyOn(config, 'getMakerApiBaseUrl').mockReturnValue('https://example.invalid/api/v1');
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previousHome;
  if (previousConfig === undefined) delete process.env.TAPTAP_MAKER_VISION_CONFIG;
  else process.env.TAPTAP_MAKER_VISION_CONFIG = previousConfig;
  fs.rmSync(root, { recursive: true, force: true });
});

test.each(['production', 'rnd'] as const)(
  'checks the bound project with a read-only GET in %s',
  async (environment) => {
    jest.spyOn(config, 'getMakerEnvironment').mockReturnValue(environment);
    const fetcher = jest.fn(async () => available());
    expect(await serverRecognitionAvailable(root, fetcher)).toBe(true);
    expect(config.getMakerEnvironment).toHaveBeenCalledWith(undefined, root);
    expect(config.getMakerApiBaseUrl).toHaveBeenCalledWith(environment);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp('/apps/' + appId + '/model-inference/[a-f0-9-]{36}$')),
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: 'Bearer test-private-pat' },
      })
    );
    expect((fetcher.mock.calls as unknown[][])[0][1]).not.toHaveProperty('body');
  }
);

test.each([401, 403, 404, 429, 500, 503, 200])(
  'does not mistake HTTP %s for a usable inference API',
  async (status) => {
    const fetcher = jest.fn(
      async () => new Response(JSON.stringify({ code: 'PROJECT_NOT_FOUND' }), { status })
    );
    expect(await serverRecognitionAvailable(root, fetcher)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
);

test('timeouts, invalid JSON and missing project or PAT disable the capability', async () => {
  expect(
    await serverRecognitionAvailable(root, async () => {
      throw new Error('timeout');
    })
  ).toBe(false);
  expect(
    await serverRecognitionAvailable(root, async () => new Response('not found', { status: 404 }))
  ).toBe(false);
  const fetcher = jest.fn(async () => available());
  expect(await serverRecognitionAvailable(undefined, fetcher)).toBe(false);
  jest.mocked(pat.requireMakerPat).mockImplementation(() => {
    throw new Error('no PAT');
  });
  expect(await serverRecognitionAvailable(root, fetcher)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

test('defaults to server, falls back without saving, and recovers on the next check', async () => {
  const fetcher = jest.fn(async () => new Response('', { status: 503 }));
  expect(readModelSettings().vision.source).toBe('server');
  expect(await resolvedModelSettingsForDisplay(root, fetcher)).toMatchObject({
    vision: { source: 'chatgpt-web', selectedSource: 'server', serverAvailable: false },
  });
  expect(await resolvedUiVisionModels(root, fetcher)).toMatchObject([{ source: 'chatgpt-web' }]);
  fetcher.mockImplementation(async () => available());
  expect(await resolvedModelSettingsForDisplay(root, fetcher)).toMatchObject({
    vision: { source: 'server', serverAvailable: true },
  });
  expect(await resolvedUiVisionModels(root, fetcher)).toMatchObject([{ source: 'server' }]);
  expect(fs.existsSync(path.join(process.env.TAPTAP_MAKER_HOME!, 'ui-vision.json'))).toBe(false);
});

test.each(['custom', 'local', 'chatgpt-web'] as const)(
  'preserves an explicit %s selection when server is unavailable',
  async (source) => {
    saveVisionSettings({
      source: 'custom',
      baseUrl: 'https://custom.invalid/v1',
      apiKey: 'private-custom',
    });
    if (source !== 'custom') updateModelSettings({ action: 'select', kind: 'vision', source });
    const original = fs.readFileSync(
      path.join(process.env.TAPTAP_MAKER_HOME!, 'ui-vision.json'),
      'utf8'
    );
    const fetcher = jest.fn(async () => new Response('', { status: 503 }));
    expect(await resolvedUiVisionModels(root, fetcher)).toMatchObject([{ source }]);
    expect(fetcher).not.toHaveBeenCalled();
    const display = await resolvedModelSettingsForDisplay(root, fetcher);
    expect(display.vision.source).toBe(source);
    expect(JSON.stringify(display)).not.toContain('private-custom');
    expect(
      fs.readFileSync(path.join(process.env.TAPTAP_MAKER_HOME!, 'ui-vision.json'), 'utf8')
    ).toBe(original);
  }
);

test('an unconfigured legacy default does not override the new default', () => {
  updateModelSettings({ action: 'select', kind: 'generation', source: 'local' });
  const filename = path.join(process.env.TAPTAP_MAKER_HOME!, 'ui-vision.json');
  const settings = JSON.parse(fs.readFileSync(filename, 'utf8'));
  settings.vision.source = 'local';
  fs.writeFileSync(filename, JSON.stringify(settings));
  expect(readModelSettings().vision.source).toBe('server');
  updateModelSettings({ action: 'select', kind: 'vision', source: 'local' });
  expect(readModelSettings().vision.source).toBe('local');
});
