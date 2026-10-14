import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyDemoResourceDownload } from './maker-demo-resources.mjs';

const bytes = Buffer.from('demo-resource-bytes');
const entry = {
  file: 'fixture.png',
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const url = 'https://app-res.tapimg.com/img/fixture.png';

function okResponse(body = bytes) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => body,
  };
}

test('retries a transient CDN timeout and then accepts the matching file', async () => {
  let calls = 0;
  await verifyDemoResourceDownload({
    entry,
    source: 'cdn',
    url,
    localBytes: bytes,
    attempts: 3,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        throw error;
      }
      return okResponse();
    },
  });
  assert.equal(calls, 2);
});

test('names the file and URL after repeated fetch failures', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      verifyDemoResourceDownload({
        entry,
        source: 'cdn',
        url,
        localBytes: bytes,
        attempts: 2,
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          const error = new TypeError('fetch failed');
          error.cause = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
          throw error;
        },
      }),
    (error) => {
      assert.match(error.message, /cdn 下载失败（第 2\/2 次）/);
      assert.match(error.message, /fixture\.png/);
      assert.match(error.message, /app-res\.tapimg\.com/);
      assert.match(error.message, /UND_ERR_CONNECT_TIMEOUT/);
      return true;
    }
  );
  assert.equal(calls, 2);
});

test('does not retry a remote content mismatch', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      verifyDemoResourceDownload({
        entry,
        source: 'github',
        url,
        localBytes: bytes,
        attempts: 3,
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return okResponse(Buffer.from('different'));
        },
      }),
    /远端文件不匹配/
  );
  assert.equal(calls, 1);
});
