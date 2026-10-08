import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { demoResources, downloadDemoResource, readDemoResource } from '../maker/demoResources.js';
import * as storage from '../maker/storage.js';

const bytes = Buffer.from('maker-demo-resource-test');
const id = createHash('sha256').update(bytes).digest('hex');
const entry = {
  file: id + '.png',
  size: bytes.length,
  sha256: id,
  type: 'image/png',
  cdn: 'https://cdn.example.test/demo.png',
};
let home: string;
let request: jest.SpiedFunction<typeof fetch>;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-demo-'));
  jest.spyOn(storage, 'getMakerHome').mockReturnValue(home);
  request = jest.spyOn(globalThis, 'fetch');
  demoResources[id] = entry;
});
afterEach(() => {
  delete demoResources[id];
  jest.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});
test('falls back once after a CDN failure or mismatched contents', async () => {
  request
    .mockResolvedValueOnce(new Response('bad', { status: 503 }))
    .mockResolvedValueOnce(new Response(bytes));
  expect(
    await downloadDemoResource(entry, [entry.cdn, 'https://github.example.test/demo.png'])
  ).toEqual(bytes);
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    entry.cdn,
    'https://github.example.test/demo.png',
  ]);
  request
    .mockReset()
    .mockResolvedValueOnce(new Response('wrong'))
    .mockResolvedValueOnce(new Response(bytes));
  expect(
    await downloadDemoResource(entry, [entry.cdn, 'https://github.example.test/demo.png'])
  ).toEqual(bytes);
});
test('shares downloads, uses cache offline and repairs a corrupt cache', async () => {
  request.mockImplementation(async () => new Response(bytes));
  const results = await Promise.all([readDemoResource(id), readDemoResource(id)]);
  expect(results).toEqual([bytes, bytes]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(await readDemoResource(id)).toEqual(bytes);
  expect(request).toHaveBeenCalledTimes(1);
  fs.writeFileSync(path.join(home, 'cache/demo-resources', entry.file), 'corrupt');
  expect(await readDemoResource(id)).toEqual(bytes);
  expect(request).toHaveBeenCalledTimes(2);
  expect(fs.readdirSync(path.join(home, 'cache/demo-resources'))).toEqual([entry.file]);
});
test('failure leaves no partial cache and a later explicit attempt can succeed', async () => {
  request.mockResolvedValue(new Response('missing', { status: 404 }));
  await expect(readDemoResource(id)).rejects.toThrow('CDN 和 GitHub');
  expect(request).toHaveBeenCalledTimes(2);
  expect(fs.existsSync(path.join(home, 'cache/demo-resources', entry.file))).toBe(false);
  request.mockResolvedValue(new Response(bytes));
  expect(await readDemoResource(id)).toEqual(bytes);
  await expect(readDemoResource('../secret')).rejects.toThrow('不存在');
});
