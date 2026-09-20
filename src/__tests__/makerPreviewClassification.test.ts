import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyPreviewProject } from '../maker/preview/configuration.js';

let root: string;
function config(name: string, value: unknown): void {
  fs.writeFileSync(path.join(root, '.project', name + '.json'), JSON.stringify(value));
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-classification-'));
  fs.mkdirSync(path.join(root, '.project'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts', 'main.lua'), 'function Start() end');
  for (const name of ['project', 'resources', 'settings']) config(name, {});
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('complete single player reads original source', () => {
  expect(classifyPreviewProject(root)).toMatchObject({
    network_required: false,
    preparation_required: false,
    kind: 'single_player',
  });
});

test.each([
  { multiplayer: { enabled: true } },
  { multiplayer: { max_players: 2 } },
  { max_players: 2 },
  { multiplayer: { persistent_world: { enabled: true } } },
])('recognizes network configuration before launch: %j', (runtime) => {
  config('settings', { '@runtime': runtime });
  expect(classifyPreviewProject(root)).toMatchObject({
    network_required: true,
    preparation_required: true,
    kind: 'network',
  });
});

test('explicit disabled multiplayer overrides leftover player count', () => {
  config('settings', { '@runtime': { multiplayer: { enabled: false, max_players: 4 } } });
  expect(classifyPreviewProject(root).network_required).toBe(false);
});

test.each(['project', 'resources'])('server entry in %s selects network pipeline', (name) => {
  fs.writeFileSync(path.join(root, 'scripts', 'server_main.lua'), 'function Start() end');
  config(name, { 'entry@server': 'server_main.lua' });
  expect(classifyPreviewProject(root)).toMatchObject({
    network_required: true,
    preparation_required: true,
    kind: 'server',
    server_entry: 'server_main.lua',
  });
});

test('server files without configuration must not silently run as single player', () => {
  fs.writeFileSync(path.join(root, 'scripts', 'server_main.lua'), 'function Start() end');
  expect(classifyPreviewProject(root)).toMatchObject({
    kind: 'server',
    network_required: true,
    preparation_required: true,
    server_entry: 'server_main.lua',
  });
});

test('new project is prepared without inventing network identity', () => {
  fs.rmSync(path.join(root, '.project'), { recursive: true });
  expect(classifyPreviewProject(root)).toMatchObject({
    network_required: false,
    preparation_required: true,
    kind: 'new_project',
  });
});

test.each(['../escape.lua', '/outside.lua', 'missing.lua'])(
  'rejects invalid server entry %s',
  (entry) => {
    config('project', { 'entry@server': entry });
    expect(() => classifyPreviewProject(root)).toThrow();
  }
);

test('existing malformed settings are rejected before routing', () => {
  fs.writeFileSync(path.join(root, '.project/settings.json'), '{broken');
  expect(() => classifyPreviewProject(root)).toThrow('JSON');
});

test('existing dist does not bypass fresh network preparation', () => {
  config('settings', { '@runtime': { multiplayer: { enabled: true } } });
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/latest.json'), '{"version":"old"}');
  expect(classifyPreviewProject(root).preparation_required).toBe(true);
});

test('Windows single player with stale dist must prepare without modifying it', () => {
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/latest.json'), 'old');
  expect(classifyPreviewProject(root, 'win32')).toMatchObject({
    network_required: false,
    preparation_required: true,
  });
  expect(fs.readFileSync(path.join(root, 'dist/latest.json'), 'utf8')).toBe('old');
});

test.each([
  ['settings', { sources: { 'official-res': { tag: 'stable' } } }],
  ['resources', { aliases: { player: 'uuid://player' } }],
  ['resources', { groups: { default: ['**'] } }],
])('preserves manifest semantics from %s', (name, value) => {
  config(name as string, value);
  expect(classifyPreviewProject(root).preparation_required).toBe(true);
});

test('project metadata requires resource indexing even without resource configuration', () => {
  fs.writeFileSync(path.join(root, 'scripts/main.lua.meta'), '{"uuid":"entry"}');
  expect(classifyPreviewProject(root).preparation_required).toBe(true);
});

test('partial configuration preserves custom server entry and network classification', () => {
  fs.unlinkSync(path.join(root, '.project/resources.json'));
  fs.writeFileSync(path.join(root, 'scripts/custom.lua'), '');
  config('project', { 'entry@server': 'custom.lua' });
  expect(classifyPreviewProject(root)).toMatchObject({
    network_required: true,
    preparation_required: true,
    server_entry: 'custom.lua',
  });
});

test('partial configuration must not hide malformed settings', () => {
  fs.unlinkSync(path.join(root, '.project/resources.json'));
  fs.writeFileSync(path.join(root, '.project/settings.json'), '{bad');
  expect(() => classifyPreviewProject(root)).toThrow('JSON');
});
