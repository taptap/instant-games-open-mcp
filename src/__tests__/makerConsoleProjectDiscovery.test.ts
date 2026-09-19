import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConsoleProjects } from '../maker/console/projects';
import { discoverConsoleProjects } from '../maker/console/projectDiscovery';

describe('console project discovery', () => {
  let root: string;
  let registry: ConsoleProjects;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-discovery-'));
    registry = new ConsoleProjects(path.join(root, 'registry.json'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  function project(relative: string, id: unknown = relative) {
    const directory = path.join(root, relative);
    fs.mkdirSync(path.join(directory, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: id })
    );
    return directory;
  }
  it('finds nested projects, skips duplicates and invalid bindings', async () => {
    const first = project('games/first');
    project('games/group/second');
    project('games/invalid', '');
    registry.add(first);
    expect(await discoverConsoleProjects(path.join(root, 'games'), registry)).toEqual({
      added: 1,
      existing: 1,
      skipped: 1,
      limited: false,
    });
    expect(registry.list()).toHaveLength(2);
    expect((await discoverConsoleProjects(first, registry)).existing).toBe(1);
  });
  it('does not follow directory links, scan dependencies or import copies within a project', async () => {
    const first = project('games/first');
    project('games/first/cache/copy');
    project('games/node_modules/ignored');
    const outside = project('outside');
    fs.symlinkSync(
      outside,
      path.join(root, 'games/linked'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    expect((await discoverConsoleProjects(path.join(root, 'games'), registry)).added).toBe(1);
    expect(registry.list().map((item) => item.path)).toEqual([fs.realpathSync(first)]);
  });
  it('reports depth truncation instead of silently claiming the entire tree was scanned', async () => {
    project('games/' + Array(10).fill('nested').join('/') + '/deep');
    const result = await discoverConsoleProjects(path.join(root, 'games'), registry);
    expect(result.limited).toBe(true);
    expect(result.added).toBe(0);
  });
});
