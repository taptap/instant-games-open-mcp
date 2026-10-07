import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { uploadCdnFile, uploadDemoResources, uploadEndpoint } from './maker-demo-upload.mjs';

function fixture(t, count = 1) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-upload-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const entries = Array.from({ length: count }, (_, i) => {
    const bytes = Buffer.from('image-' + i);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const entry = {
      file: sha256 + '.png',
      sha256,
      size: bytes.length,
      type: 'image/png',
      lossless: { pixelSha256: 'checked' },
    };
    fs.writeFileSync(path.join(directory, entry.file), bytes);
    return entry;
  });
  return {
    entries,
    directory,
    journalPath: path.join(directory, 'receipts.json'),
    verify: async () => {},
    onVerified: async (entry, url) => {
      entry.cdn = url;
    },
  };
}
const success = () =>
  Response.json({ code: 0, success: true, data: 'https://app-res.tapimg.com/img/test.png' });

test('uses the observed multipart API without browser credentials', async (t) => {
  const f = fixture(t),
    entry = f.entries[0],
    bytes = fs.readFileSync(path.join(f.directory, entry.file));
  const url = await uploadCdnFile(entry, bytes, async (endpoint, request) => {
    assert.equal(endpoint, uploadEndpoint);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers, undefined);
    const file = request.body.get('file');
    assert.equal(file.name, entry.file);
    assert.equal(file.type, entry.type);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    return success();
  });
  assert.equal(url, 'https://app-res.tapimg.com/img/test.png');
  await assert.rejects(
    uploadCdnFile(entry, bytes, async () => new Response(null, { status: 401 })),
    /拒绝授权/
  );
  await assert.rejects(
    uploadCdnFile(entry, bytes, async () =>
      Response.json({ code: 0, success: true, data: 'https://other.test/file.png' })
    ),
    /地址无效/
  );
});

test('bounds concurrent uploads, verifies before registering and skips completed files', async (t) => {
  const f = fixture(t, 11);
  f.entries[0].cdn = 'https://app-res.tapimg.com/already.png';
  let active = 0,
    peak = 0,
    posts = 0;
  const checked = new Set();
  const result = await uploadDemoResources({
    ...f,
    fetchImpl: async () => {
      posts++;
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return success();
    },
    verify: async (entry) => {
      checked.add(entry.file);
    },
    onVerified: async (entry, url) => {
      assert.ok(checked.has(entry.file));
      entry.cdn = url;
    },
  });
  assert.equal(peak, 4);
  assert.equal(posts, 10);
  assert.deepEqual(result, { uploaded: 10, verified: 10, skipped: 1 });
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(f.journalPath))).length, 10);
  assert.equal(fs.existsSync(f.journalPath + '.lock'), false);
});

test('a failed CDN verification resumes from the saved receipt without another POST', async (t) => {
  const f = fixture(t);
  let posts = 0;
  const fetchImpl = async () => {
    posts++;
    return success();
  };
  await assert.rejects(
    uploadDemoResources({
      ...f,
      fetchImpl,
      verify: async () => {
        throw new Error('CDN mismatch');
      },
    }),
    /CDN mismatch/
  );
  assert.equal(f.entries[0].cdn, undefined);
  const result = await uploadDemoResources({ ...f, fetchImpl });
  assert.equal(posts, 1);
  assert.equal(result.uploaded, 0);
  assert.equal(result.verified, 1);
});

test('unknown or interrupted uploads require an explicit retry', async (t) => {
  const f = fixture(t);
  let posts = 0;
  await assert.rejects(
    uploadDemoResources({
      ...f,
      fetchImpl: async () => {
        posts++;
        throw new Error('network timeout');
      },
    }),
    /远端结果未知/
  );
  const fetchImpl = async () => {
    posts++;
    return success();
  };
  await assert.rejects(uploadDemoResources({ ...f, fetchImpl }), /retry-unknown/);
  assert.equal(posts, 1);
  await uploadDemoResources({ ...f, fetchImpl, retryUnknown: true });
  assert.equal(posts, 2);
});

test('authentication failure stops scheduling while in-flight successes are retained', async (t) => {
  const f = fixture(t, 8);
  let posts = 0;
  await assert.rejects(
    uploadDemoResources({
      ...f,
      fetchImpl: async () => {
        const index = posts++;
        if (index === 0) return new Response(null, { status: 403 });
        await new Promise((r) => setTimeout(r, 10));
        return success();
      },
    }),
    /拒绝授权/
  );
  assert.equal(posts, 4);
  assert.equal(f.entries.filter((e) => e.cdn).length, 3);
});

test('rejects changed or unchecked images, respects the lock, and avoids all work for an empty queue', async (t) => {
  const f = fixture(t);
  const fetchImpl = async () => {
    throw new Error('should not POST');
  };
  fs.writeFileSync(f.journalPath + '.lock', 'other process');
  await assert.rejects(uploadDemoResources({ ...f, fetchImpl }), /已锁定/);
  fs.unlinkSync(f.journalPath + '.lock');
  delete f.entries[0].lossless;
  await assert.rejects(uploadDemoResources({ ...f, fetchImpl }), /无损压缩/);
  fs.writeFileSync(path.join(f.directory, f.entries[0].file), 'changed');
  await assert.rejects(uploadDemoResources({ ...f, fetchImpl }), /文件已变化/);
  f.entries[0].cdn = 'https://app-res.tapimg.com/checked.png';
  assert.deepEqual(await uploadDemoResources({ ...f, fetchImpl }), {
    uploaded: 0,
    verified: 0,
    skipped: 1,
  });
});
