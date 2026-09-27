import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as luaLsp from '../maker/system/luaLsp.js';
import { ConsoleProjects } from '../maker/console/projects.js';
import { startConsoleServer } from '../maker/console/server.js';

test('slow environment status never blocks console state/health and is cancelled on close', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-probe-'));
  let cancelled = false;
  const probe = jest.spyOn(luaLsp, 'checkMakerLuaLspEnvironmentAsync').mockImplementation(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            cancelled = true;
            reject(new Error('CANCELLED'));
          },
          { once: true }
        );
      })
  );
  const server = await startConsoleServer({
    registry: new ConsoleProjects(path.join(root, 'registry.json')),
    html: '<html></html>',
    version: 'test',
    execute: async () => ({ ok: true }),
  });
  try {
    const state = await fetch(server.origin + '/api/state', { signal: AbortSignal.timeout(2000) });
    expect(await state.json()).toMatchObject({ luaLsp: { ready: false, status: 'checking' } });
    expect(
      (await fetch(server.origin + '/api/health', { signal: AbortSignal.timeout(2000) })).ok
    ).toBe(true);
    await fetch(server.origin + '/api/state', { signal: AbortSignal.timeout(2000) });
    expect(probe).toHaveBeenCalledTimes(1);
  } finally {
    await server.close();
    probe.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
  expect(cancelled).toBe(true);
});
