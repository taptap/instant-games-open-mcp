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

function httpError(status) {
  let cancelled = false;
  return {
    response: {
      ok: false,
      status,
      body: {
        cancel: async () => {
          cancelled = true;
        },
      },
    },
    wasCancelled: () => cancelled,
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

test('retries HTTP 429 and 503, and cancels the error body before retrying', async () => {
  const cancelled = [];
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
      if (calls < 3) {
        const failed = httpError(calls === 1 ? 429 : 503);
        const response = failed.response;
        const original = response.body.cancel;
        response.body.cancel = async () => {
          cancelled.push(response.status);
          await original();
        };
        return response;
      }
      return okResponse();
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(cancelled, [429, 503]);
});

test('does not retry HTTP 404 and still cancels the error body', async () => {
  const failed = httpError(404);
  let calls = 0;
  await assert.rejects(
    () =>
      verifyDemoResourceDownload({
        entry,
        source: 'cdn',
        url,
        localBytes: bytes,
        attempts: 3,
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return failed.response;
        },
      }),
    /HTTP 404/
  );
  assert.equal(calls, 1);
  assert.equal(failed.wasCancelled(), true);
});

test('stops after the attempt limit when HTTP 503 persists', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      verifyDemoResourceDownload({
        entry,
        source: 'cdn',
        url,
        localBytes: bytes,
        attempts: 3,
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return httpError(503).response;
        },
      }),
    /第 3\/3 次[\s\S]*HTTP 503/
  );
  assert.equal(calls, 3);
});
