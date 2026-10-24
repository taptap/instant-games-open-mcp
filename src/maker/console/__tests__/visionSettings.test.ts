import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  saveVisionSettings,
  readVisionSettings,
  visionSettingsForDisplay,
  deleteVisionSettings,
  validateVisionEndpoint,
  visionChatCompletionsUrl,
  readModelSettings,
  modelSettingsForDisplay,
  updateModelSettings,
} from '../visionSettings.js';
import { configuredUiVisionModels } from '../canvasRecognition.js';
import { startConsoleServer } from '../server.js';
import { ConsoleProjects } from '../projects.js';

let home: string;
let previous: string | undefined;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-vision-settings-'));
  previous = process.env.TAPTAP_MAKER_HOME;
  process.env.TAPTAP_MAKER_HOME = home;
});
afterEach(() => {
  if (previous === undefined) delete process.env.TAPTAP_MAKER_HOME;
  else process.env.TAPTAP_MAKER_HOME = previous;
  fs.rmSync(home, { recursive: true, force: true });
});
const input = {
  endpoint: 'https://example.invalid/v1/chat/completions',
  model: 'gpt-6.1-sol',
  apiKey: 'fixture-private-key',
};

test.each(['local', 'chatgpt-web'] as const)(
  'retired %s settings resolve to server without rewriting profiles',
  (source) => {
    saveVisionSettings(input);
    const original = readModelSettings();
    const file = path.join(home, 'ui-vision.json');
    const stored = JSON.stringify({ ...original, vision: { source } });
    fs.writeFileSync(file, stored);
    const result = modelSettingsForDisplay();
    expect(result.vision.source).toBe('server');
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
    expect(readVisionSettings()?.source).toBe('server');
    expect(readModelSettings().profiles).toEqual(original.profiles);
    expect(configuredUiVisionModels()).toMatchObject([{ source: 'server' }]);
    expect(() => updateModelSettings({ action: 'select', kind: 'vision', source })).toThrow(
      '模型来源无效'
    );
    expect(() => saveVisionSettings({ source })).toThrow('旧识图来源已停用');
    expect(fs.readFileSync(file, 'utf8')).toBe(stored);
  }
);

test.each([
  ['https://example.invalid', 'https://example.invalid/chat/completions'],
  ['https://example.invalid/', 'https://example.invalid/chat/completions'],
  ['https://example.invalid/v1/', 'https://example.invalid/v1/chat/completions'],
  ['https://example.invalid/v1/chat/completions', 'https://example.invalid/v1/chat/completions'],
])('normalizes the request URL %s', (base, expected) => {
  expect(validateVisionEndpoint(base)).toBe(expected);
  expect(visionChatCompletionsUrl(base)).toBe(expected);
});

test('settings HTTP route works without a project, requires same origin and redacts the key', async () => {
  const server = await startConsoleServer({
    registry: new ConsoleProjects(path.join(home, 'registry.json')),
    execute: async () => ({ ok: true }),
    html: '',
    version: 'test',
  });
  const url = server.origin + '/api/settings/ui-vision';
  try {
    const read = await fetch(url);
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(await read.json()).toMatchObject({ configured: false });
    const foreign = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://foreign.invalid' },
      body: JSON.stringify(input),
    });
    expect(foreign.status).toBe(403);
    const saved = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: server.origin },
      body: JSON.stringify(input),
    });
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain(input.apiKey);
    const status = await fetch(url);
    expect(await status.json()).toMatchObject({ configured: true, source: 'custom' });
    const modelsUrl = server.origin + '/api/settings/models';
    const models = await fetch(modelsUrl);
    const display = await models.json();
    expect(JSON.stringify(display)).not.toContain(input.apiKey);
    expect(display.generation.source).toBe('maker');
    const denied = await fetch(modelsUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://foreign.invalid' },
      body: JSON.stringify({ action: 'select', kind: 'generation', source: 'local' }),
    });
    expect(denied.status).toBe(403);
    const switched = await fetch(modelsUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: server.origin },
      body: JSON.stringify({
        action: 'select',
        kind: 'generation',
        source: 'custom',
        profileId: display.profiles[0].id,
      }),
    });
    expect(switched.status).toBe(200);
    expect((await switched.json()).vision.source).toBe('custom');
    const clear = await fetch(url, { method: 'DELETE', headers: { origin: server.origin } });
    expect(await clear.json()).toMatchObject({ configured: false });
  } finally {
    await server.close();
  }
});

test('settings are private, take effect immediately and never return the key', () => {
  expect(visionSettingsForDisplay().configured).toBe(false);
  const display = saveVisionSettings(input);
  expect(display).toMatchObject({ configured: true, source: 'custom' });
  expect(JSON.stringify(display)).not.toContain(input.apiKey);
  expect(readVisionSettings()?.apiKey).toBe(input.apiKey);
  if (process.platform !== 'win32')
    expect(fs.statSync(path.join(home, 'ui-vision.json')).mode & 0o777).toBe(0o600);
  expect(configuredUiVisionModels()).toMatchObject([{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol' }]);
  saveVisionSettings({ ...input, apiKey: '' });
  expect(readVisionSettings()?.apiKey).toBe(input.apiKey);
  expect(deleteVisionSettings().configured).toBe(false);
});

test('defaults to server source and can store server source without a second key', () => {
  expect(visionSettingsForDisplay()).toMatchObject({
    source: 'server',
  });
  const display = saveVisionSettings({
    source: 'server',
    endpoint: input.endpoint,
    model: 'another-model',
    apiKey: '',
  });
  expect(display).toMatchObject({ source: 'server', configured: true });
  expect(readVisionSettings()).toMatchObject({
    source: 'server',
  });
});

test('switching away from custom source preserves its private API configuration', () => {
  saveVisionSettings(input);
  saveVisionSettings({ source: 'server', apiKey: '' });
  expect(readVisionSettings()).toMatchObject({
    source: 'server',
    baseUrl: 'https://example.invalid/v1',
    apiKey: input.apiKey,
  });
});

test('changing the base URL cannot silently send an existing key to another service', () => {
  saveVisionSettings(input);
  expect(() =>
    saveVisionSettings({
      ...input,
      endpoint: 'https://other.invalid/v1/chat/completions',
      apiKey: '',
    })
  ).toThrow('重新填写');
  expect(readVisionSettings()?.baseUrl).toBe('https://example.invalid/v1');
});

test.each([
  'https://user:password@example.invalid/v1',
  'https://example.invalid/v1?key=secret',
  'https://example.invalid/v1#secret',
  'http://example.invalid/v1',
  'file:///tmp/key',
])('rejects unsafe endpoint %s', (endpoint) => {
  expect(() => validateVisionEndpoint(endpoint)).toThrow();
});

test('a corrupt settings file can be explicitly replaced using a new key', () => {
  fs.writeFileSync(path.join(home, 'ui-vision.json'), 'invalid JSON');
  expect(() => saveVisionSettings({ ...input, apiKey: '' })).toThrow('无法读取');
  expect(saveVisionSettings(input).configured).toBe(true);
});

test('migrates a legacy API into a shared named profile without changing defaults or exposing keys', () => {
  fs.writeFileSync(path.join(home, 'ui-vision.json'), JSON.stringify(input));
  const display = modelSettingsForDisplay();
  expect(display.vision).toEqual({ source: 'custom', profileId: 'legacy-vision' });
  expect(display.generation).toEqual({ source: 'maker' });
  expect(display.profiles).toMatchObject([
    { name: '识图 API', model: 'gpt-6.1-sol', hasKey: true },
  ]);
  expect(JSON.stringify(display)).not.toContain(input.apiKey);
  updateModelSettings({
    action: 'select',
    kind: 'generation',
    source: 'custom',
    profileId: 'legacy-vision',
  });
  expect(readVisionSettings()?.apiKey).toBe(input.apiKey);
  expect(readModelSettings().generation.profileId).toBe('legacy-vision');
  expect(JSON.parse(fs.readFileSync(path.join(home, 'ui-vision.json'), 'utf8')).version).toBe(2);
});

test('profiles can be edited without retyping a key but not sent silently to another URL', () => {
  const profile = {
    action: 'save-profile',
    name: 'GPT',
    baseUrl: 'https://example.invalid/v1',
    apiKey: input.apiKey,
    model: 'image-model',
  };
  const display = updateModelSettings(profile);
  const id = display.profiles[0].id;
  expect(JSON.stringify(display)).not.toContain(input.apiKey);
  updateModelSettings({ ...profile, id, name: '图片模型', apiKey: '' });
  expect(readModelSettings().profiles[0].apiKey).toBe(input.apiKey);
  expect(() =>
    updateModelSettings({ ...profile, id, baseUrl: 'https://other.invalid', apiKey: '' })
  ).toThrow('重新填写');
  expect(() => updateModelSettings({ ...profile, name: '图片模型' })).toThrow('名称已存在');
  expect(modelSettingsForDisplay().generation.source).toBe('maker');
});

test('selecting and deleting profiles preserves independent choices and rejects dangling references', () => {
  const { profiles } = updateModelSettings({
    action: 'save-profile',
    name: 'GPT',
    baseUrl: 'https://example.invalid',
    apiKey: input.apiKey,
    model: 'gpt-6.1-sol',
  });
  const id = profiles[0].id;
  for (const kind of ['vision', 'generation'])
    updateModelSettings({ action: 'select', kind, source: 'custom', profileId: id });
  expect(() => updateModelSettings({ action: 'delete-profile', id })).toThrow('正在使用');
  updateModelSettings({ action: 'select', kind: 'generation', source: 'local' });
  expect(readVisionSettings()?.source).toBe('custom');
  expect(() =>
    updateModelSettings({
      action: 'select',
      kind: 'generation',
      source: 'custom',
      profileId: 'missing',
    })
  ).toThrow('请选择');
  updateModelSettings({ action: 'select', kind: 'vision', source: 'server' });
  expect(updateModelSettings({ action: 'delete-profile', id }).profiles).toEqual([]);
  expect(readModelSettings().generation).toEqual({ source: 'local' });
});

test('recognition uses the selected custom model instead of the old fixed model', () => {
  const { profiles } = updateModelSettings({
    action: 'save-profile',
    name: '新模型',
    baseUrl: 'https://example.invalid',
    apiKey: input.apiKey,
    model: 'other-model',
  });
  updateModelSettings({
    action: 'select',
    kind: 'vision',
    source: 'custom',
    profileId: profiles[0].id,
  });
  expect(configuredUiVisionModels()).toMatchObject([{ model: 'other-model', source: 'custom' }]);
});
