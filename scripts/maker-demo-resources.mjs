#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { uploadDemoResources } from './maker-demo-upload.mjs';
import { checkDemoResources } from './maker-demo-resource-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src/maker/demoResources.json');
const directory = path.join(root, 'resources/maker-demo');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const types = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
};
function save() {
  fs.writeFileSync(manifestPath + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(manifestPath + '.tmp', manifestPath);
}
function checkLocal() {
  checkDemoResources(root);
}
function add(filename) {
  const bytes = fs.readFileSync(filename),
    ext = path.extname(filename).toLowerCase();
  if (!types[ext]) throw new Error('仅支持 PNG/JPEG/MP4 素材');
  const id = hash(bytes),
    file = id + ext;
  fs.mkdirSync(directory, { recursive: true });
  if (!manifest.resources[id]) {
    const target = path.join(directory, file);
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' });
    else if (hash(fs.readFileSync(target)) !== id) throw new Error('已有文件校验失败：' + file);
    manifest.resources[id] = { file, size: bytes.length, sha256: id, type: types[ext] };
  }
  return id;
}
async function verify(entry, source) {
  const local = fs.readFileSync(path.join(directory, entry.file));
  if (hash(local) !== entry.sha256 || local.length !== entry.size)
    throw new Error('本地文件不匹配：' + entry.file);
  const url = source === 'github' ? manifest.githubBaseUrl + entry.file : entry.cdn;
  if (!url || new URL(url).protocol !== 'https:') throw new Error('缺少 HTTPS 地址：' + entry.file);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('下载失败 HTTP ' + response.status + '：' + entry.file);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== entry.size || hash(bytes) !== entry.sha256)
    throw new Error('远端文件不匹配：' + entry.file);
}
try {
  const [command, input, extra] = process.argv.slice(2);
  if (command === 'add' && input) {
    const id = add(path.resolve(input));
    if (extra) manifest.resources[id].thumbnail = add(path.resolve(extra));
    save();
    console.log(JSON.stringify({ resourceId: id, ...manifest.resources[id] }));
  } else if (command === 'optimize') {
    execFileSync('python3', [path.join(root, 'scripts/optimize-maker-demo.py')], {
      stdio: 'inherit',
    });
  } else if (command === 'check') {
    if ((input && input !== '--release') || extra) throw new Error('用法：check [--release]');
    checkDemoResources(root, { requireCdn: input === '--release' });
    console.log('本地资源与无损压缩记录校验通过');
  } else if (command === 'pending') {
    checkLocal();
    console.log(
      JSON.stringify(
        {
          uploadPage: 'https://tap-android-dev.tapsvc.com/v3/tools/upload',
          files: Object.values(manifest.resources)
            .filter((e) => !e.cdn)
            .map((e) => path.join(directory, e.file)),
        },
        null,
        2
      )
    );
  } else if (command === 'upload') {
    if ((input && input !== '--retry-unknown') || extra)
      throw new Error('用法：upload [--retry-unknown]；默认 4 个文件并发。');
    checkLocal();
    const result = await uploadDemoResources({
      entries: Object.values(manifest.resources),
      directory,
      journalPath: path.join(root, '.maker/demo-resource-upload.json'),
      retryUnknown: input === '--retry-unknown',
      verify: (entry) => verify(entry, 'cdn'),
      onVerified: (entry, url) => {
        entry.cdn = url;
        try {
          save();
        } catch (error) {
          delete entry.cdn;
          throw error;
        }
      },
      onProgress: ({ file, verified }) => console.log('已校验并登记 ' + verified + '：' + file),
    });
    console.log(JSON.stringify(result));
  } else if (command === 'record' && input) {
    checkLocal();
    const records = JSON.parse(fs.readFileSync(input, 'utf8'));
    for (const record of records) {
      // Accept either explicit mappings or the upload page's per-file success records.
      const file = record.file || record.files?.[0];
      const url = record.url || (record.result?.success && record.result?.data);
      const entry = Object.values(manifest.resources).find((e) => e.file === file);
      if (!entry || !url || new URL(url).origin !== 'https://app-res.tapimg.com')
        throw new Error('无效的上传结果：' + file);
      await verify({ ...entry, cdn: url }, 'cdn');
      entry.cdn = url;
    }
    save();
    console.log('已登记 ' + records.length + ' 个 CDN 地址');
  } else if (command === 'verify') {
    checkLocal();
    if (input && input !== 'github' && input !== 'cdn')
      throw new Error('verify 仅支持 cdn 或 github');
    const queue = Object.values(manifest.resources);
    let complete = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length) {
          await verify(queue.shift(), input || 'cdn');
          complete++;
        }
      })
    );
    console.log('已校验 ' + complete + ' 个 ' + (input || 'cdn') + ' 文件（大小与 SHA-256 一致）');
  } else {
    throw new Error(
      '用法：node scripts/maker-demo-resources.mjs add <文件> [缩略图] | optimize | check [--release] | pending | upload [--retry-unknown] | record <结果.json> | verify [cdn|github]'
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
