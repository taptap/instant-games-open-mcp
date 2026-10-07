import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const uploadEndpoint = 'https://tap-android-dev.tapsvc.com/vue-element-admin/uploadCdn';

function failure(message, state) {
  return Object.assign(new Error(message), { uploadState: state });
}

export async function uploadCdnFile(entry, bytes, fetchImpl = fetch) {
  const body = new FormData();
  body.append('file', new Blob([bytes], { type: entry.type }), entry.file);
  let response;
  try {
    response = await fetchImpl(uploadEndpoint, {
      method: 'POST',
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw failure('上传连接中断或超时，远端结果未知。', 'unknown');
  }
  if (response.status === 401 || response.status === 403)
    throw failure('上传接口拒绝授权，请检查网络与接口访问权限。', 'failed');
  if (!response.ok)
    throw failure(
      '上传失败 HTTP ' + response.status,
      response.status >= 500 ? 'unknown' : 'failed'
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw failure('上传响应不完整，远端结果未知。', 'unknown');
  }
  if (!result || typeof result !== 'object')
    throw failure('上传响应格式异常，远端结果未知。', 'unknown');
  if (result.code !== 0 || result.success !== true)
    throw failure('上传接口未返回成功结果，code=' + String(result.code), 'failed');
  let url;
  try {
    url = new URL(result.data);
  } catch {
    /* Validate below. */
  }
  if (!url || url.origin !== 'https://app-res.tapimg.com' || url.username || url.password)
    throw failure('上传返回的 CDN 地址无效，远端结果未知。', 'unknown');
  return url.href;
}

export async function uploadDemoResources({
  entries,
  directory,
  journalPath,
  verify,
  onVerified,
  onProgress = () => {},
  fetchImpl = fetch,
  concurrency = 4,
  retryUnknown = false,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('上传并发数必须为 1～8。');
  const queue = entries.filter((entry) => !entry.cdn);
  if (!queue.length) return { uploaded: 0, verified: 0, skipped: entries.length };
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const lockPath = journalPath + '.lock';
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600);
  } catch {
    throw new Error('上传任务已锁定；请先确认没有其他上传进程：' + lockPath);
  }
  try {
    const journal = fs.existsSync(journalPath)
      ? JSON.parse(fs.readFileSync(journalPath, 'utf8'))
      : {};
    const persist = () => {
      fs.writeFileSync(journalPath + '.tmp', JSON.stringify(journal, null, 2) + '\n', {
        mode: 0o600,
      });
      fs.renameSync(journalPath + '.tmp', journalPath);
    };
    let uploaded = 0,
      verified = 0;
    const errors = [];
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length && !errors.length) {
          const entry = queue.shift();
          try {
            const previous = journal[entry.sha256];
            if (previous?.state === 'unknown' && !retryUnknown)
              throw new Error('上次上传结果未知；核对后使用 upload --retry-unknown 显式重试。');
            let url = previous?.url;
            if (!url) {
              const bytes = fs.readFileSync(path.join(directory, entry.file));
              if (
                bytes.length !== entry.size ||
                createHash('sha256').update(bytes).digest('hex') !== entry.sha256
              )
                throw new Error('本地文件已变化，请重新检查资源。');
              if (entry.type.startsWith('image/') && !entry.lossless?.pixelSha256)
                throw new Error('图片尚未完成无损压缩检查。');
              // Persist before POST: interrupted requests must not be silently resubmitted.
              journal[entry.sha256] = { state: 'unknown', file: entry.file };
              persist();
              try {
                url = await uploadCdnFile(entry, bytes, fetchImpl);
              } catch (error) {
                journal[entry.sha256].state = error.uploadState || 'unknown';
                persist();
                throw error;
              }
              journal[entry.sha256] = { state: 'uploaded', file: entry.file, url };
              persist();
              uploaded++;
            }
            // Keep the receipt if CDN verification fails; the next run only rechecks the URL.
            if (new URL(url).origin !== 'https://app-res.tapimg.com')
              throw new Error('上传记录的 CDN 地址无效。');
            await verify({ ...entry, cdn: url });
            await onVerified(entry, url);
            verified++;
            onProgress({ file: entry.file, uploaded, verified });
          } catch (error) {
            errors.push(entry.file + '：' + error.message);
          }
        }
      })
    );
    if (errors.length) throw new Error(errors.join('\n'));
    return { uploaded, verified, skipped: entries.length - verified };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}
