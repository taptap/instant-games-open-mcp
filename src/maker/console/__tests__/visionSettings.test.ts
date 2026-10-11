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

test('defaults to local source and can store server source without a second key', () => {
  expect(visionSettingsForDisplay()).toMatchObject({
    source: 'local',
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
  saveVisionSettings({ source: 'local', apiKey: '' });
  expect(readVisionSettings()).toMatchObject({
    source: 'local',
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
