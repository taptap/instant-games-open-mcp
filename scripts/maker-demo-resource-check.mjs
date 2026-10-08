import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function checkDemoResources(root, { requireCdn = false } = {}) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'src/maker/demoResources.json'), 'utf8')
  );
  const directory = path.join(root, 'resources/maker-demo');
  const resources = manifest.resources;
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  function reference(id) {
    if (!Object.hasOwn(resources, id)) throw new Error('示例资源引用缺失：' + id);
  }
  for (const [id, entry] of Object.entries(resources)) {
    if (
      !/^[a-f0-9]{64}$/.test(id) ||
      entry.sha256 !== id ||
      !['.png', '.jpg', '.jpeg', '.mp4'].some((ext) => entry.file === id + ext)
    )
      throw new Error('资源身份或文件名无效：' + id);
    const bytes = fs.readFileSync(path.join(directory, entry.file));
    if (bytes.length !== entry.size || hash(bytes) !== id)
      throw new Error('本地文件不匹配：' + entry.file);
    if (entry.type.startsWith('image/')) {
      if (
        !['image/png', 'image/jpeg'].includes(entry.type) ||
        !/^[a-f0-9]{64}$/.test(entry.lossless?.pixelSha256 || '') ||
        !Number.isSafeInteger(entry.lossless?.sourceSize) ||
        entry.lossless.sourceSize < entry.size
      )
        throw new Error('图片尚未无损压缩与像素验证，请先运行 optimize：' + entry.file);
    } else if (entry.type !== 'video/mp4' || !entry.file.endsWith('.mp4')) {
      throw new Error('不支持的示例媒体类型：' + entry.file);
    }
    if (entry.thumbnail) reference(entry.thumbnail);
    if (requireCdn && !entry.cdn)
      throw new Error('资源尚未上传 CDN，请先运行 upload：' + entry.file);
    if (entry.cdn && new URL(entry.cdn).origin !== 'https://app-res.tapimg.com')
      throw new Error('CDN 地址无效：' + entry.file);
  }
  // Official templates must reference the checked registry.
  function walk(value) {
    if (typeof value === 'string' && value.startsWith('data:image/'))
      throw new Error('官方模板图片不能内嵌，请通过资源库压缩并上传 CDN。');
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'resourceId') reference(item);
      if (key === 'base64') throw new Error('官方模板不能内嵌媒体，请使用 resourceId。');
      walk(item);
    }
  }
  for (const name of [
    'presetData',
    'assetPresetData',
    'modelPresetData',
    'templateModelData',
    'uiWorkflowData',
  ])
    walk(JSON.parse(fs.readFileSync(path.join(root, 'src/maker/canvas', name + '.json'), 'utf8')));
  return { resources: Object.keys(resources).length };
}
