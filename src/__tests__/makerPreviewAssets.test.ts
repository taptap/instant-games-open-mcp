import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startPreviewAssetServer } from '../maker/preview/assets.js';

let root: string;
let server: Awaited<ReturnType<typeof startPreviewAssetServer>> | undefined;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-preview-assets-')));
  fs.mkdirSync(path.join(root, 'dist', '1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist', 'assets'));
  fs.writeFileSync(path.join(root, 'dist', 'latest.json'), '{"version":"1","client":"abcd"}');
  fs.writeFileSync(
    path.join(root, 'dist', '1', 'manifest-abcd.json'),
    JSON.stringify({
      target: 'client',
      files: [{ uuid: 'script', hash: '1234', ext: '.lua' }],
    })
  );
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'script-1234.lua'), 'ROUND_ONE');
  fs.writeFileSync(path.join(root, 'dist', 'project.json'), '{}');
  fs.writeFileSync(path.join(root, 'dist', '1', 'manifest-server.json'), 'PRIVATE_SERVER');
  fs.writeFileSync(path.join(root, 'private.json'), 'PRIVATE');
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

function request(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(url, { headers, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves only the current client build through an ephemeral loopback URL', async () => {
  server = await startPreviewAssetServer(root);
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}\/$/);
  expect(await request(server.url + 'latest.json?_t=123')).toMatchObject({ status: 200 });
  expect(await request(server.url + '1/manifest-abcd.json')).toMatchObject({ status: 200 });
  expect(await request(server.url + 'assets/script-1234.lua')).toEqual({
    status: 200,
    body: 'ROUND_ONE',
  });
  expect(await request(server.url + 'project.json')).toMatchObject({ status: 200 });
  expect(await request(server.url + '1/manifest-server.json')).toMatchObject({ status: 404 });
  expect(await request(server.url + 'private.json')).toMatchObject({ status: 404 });
});

test('rejects unauthenticated, browser-origin, rebound-host and mutation requests', async () => {
  server = await startPreviewAssetServer(root);
  expect(await request(new URL('/latest.json', server.url).href)).toMatchObject({ status: 404 });
  expect(
    await request(server.url + 'latest.json', { Origin: 'https://example.test' })
  ).toMatchObject({
    status: 403,
  });
  expect(await request(server.url + 'latest.json', { Host: 'attacker.test' })).toMatchObject({
    status: 403,
  });
  expect(await request(server.url + 'latest.json', {}, 'POST')).toMatchObject({ status: 405 });
  expect(await request(server.url + '%2e%2e%2fprivate.json')).toMatchObject({ status: 404 });
});

test('supports head and byte ranges without buffering assets', async () => {
  server = await startPreviewAssetServer(root);
  expect(await request(server.url + 'assets/script-1234.lua', {}, 'HEAD')).toEqual({
    status: 200,
    body: '',
  });
  expect(await request(server.url + 'assets/script-1234.lua', { Range: 'bytes=0-4' })).toEqual({
    status: 206,
    body: 'ROUND',
  });
  expect(
    await request(server.url + 'assets/script-1234.lua', { Range: 'bytes=999-' })
  ).toMatchObject({
    status: 416,
  });
});

test('rejects an allowed file replaced with an external symlink', async () => {
  server = await startPreviewAssetServer(root);
  const asset = path.join(root, 'dist', 'assets', 'script-1234.lua');
  fs.unlinkSync(asset);
  fs.symlinkSync(path.join(root, 'private.json'), asset);
  expect(await request(server.url + 'assets/script-1234.lua')).toMatchObject({ status: 404 });
});

test('close is idempotent and releases the listening port', async () => {
  server = await startPreviewAssetServer(root);
  await Promise.all([server.close(), server.close()]);
  await expect(request(server.url + 'latest.json')).rejects.toThrow();
});

test('an already aborted launch does not open a server', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(startPreviewAssetServer(root, abort.signal)).rejects.toThrow('CANCELLED');
});

test('abort closes a running asset endpoint', async () => {
  const abort = new AbortController();
  server = await startPreviewAssetServer(root, abort.signal);
  abort.abort();
  await server.close();
  await expect(request(server.url + 'latest.json')).rejects.toThrow();
});

test('each launch has a new access path and cannot read another project', async () => {
  server = await startPreviewAssetServer(root);
  const second = await startPreviewAssetServer(root);
  try {
    const wrong = new URL(server.url);
    wrong.pathname = new URL(second.url).pathname + 'latest.json';
    expect(await request(wrong.href)).toMatchObject({ status: 404 });
  } finally {
    await second.close();
  }
});
