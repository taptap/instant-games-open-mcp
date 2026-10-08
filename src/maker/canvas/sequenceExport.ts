declare const document: any;
declare const createImageBitmap: any;
import type { FrameSetInfo } from './sequenceModel.js';
import { createCanvasZip } from './zipArchive.js';

export interface SequenceExportPlayback {
  name: string;
  loop: boolean;
}

export function sequenceExportManifest(
  info: FrameSetInfo,
  width: number,
  height: number,
  playback: SequenceExportPlayback = { name: 'default', loop: true }
) {
  if (
    typeof playback.name !== 'string' ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(playback.name) ||
    typeof playback.loop !== 'boolean'
  )
    throw new Error('动画名称或循环设置无效。');
  const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
  if (
    !info ||
    !positiveInteger(width) ||
    !positiveInteger(height) ||
    width > 4096 ||
    height > 4096 ||
    info.width !== width ||
    info.height !== height ||
    !Array.isArray(info.frames) ||
    !info.frames.length ||
    info.frames.length > 120 ||
    info.frameCount !== info.frames.length ||
    !Number.isFinite(info.fps) ||
    info.fps <= 0 ||
    info.fps > 30
  )
    throw new Error('图集尺寸、帧数或帧率无效，请重新保存序列帧后导出。');
  const first = info.frames[0];
  for (const frame of info.frames) {
    if (
      !frame ||
      !positiveInteger(frame.width) ||
      !positiveInteger(frame.height) ||
      !Number.isSafeInteger(frame.x) ||
      !Number.isSafeInteger(frame.y) ||
      frame.x < 0 ||
      frame.y < 0 ||
      frame.x + frame.width > width ||
      frame.y + frame.height > height ||
      !Number.isSafeInteger(frame.index) ||
      frame.index < 0 ||
      !Number.isFinite(frame.time) ||
      frame.time < 0
    )
      throw new Error('帧坐标或尺寸超出图集范围，未导出文件。');
    if (frame.width !== first.width || frame.height !== first.height)
      throw new Error('帧尺寸不一致，请在序列帧编辑器统一尺寸并保存后导出；不会自动裁边或缩放。');
  }
  if (first.width * first.height * info.frames.length > 48_000_000)
    throw new Error('导出帧的总像素过多，请减少帧数或尺寸后重试。');
  const frames = info.frames.map((frame, index) => ({
    filename: playback.name + '_' + String(index + 1).padStart(4, '0'),
    frame: {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    },
    sourceSize: { w: frame.width, h: frame.height },
    spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
    trimmed: false,
    rotated: false,
    duration: 1000 / info.fps,
  }));
  return {
    frames,
    animations: [
      {
        name: playback.name,
        frames: frames.map((frame) => frame.filename),
        direction: 'forward',
        repeat: playback.loop ? 0 : 1,
        fps: info.fps,
      },
    ],
    meta: { image: 'spritesheet.png', size: { w: width, h: height }, scale: '1' },
  };
}

export function sequenceExportLua(
  info: FrameSetInfo,
  folder: string,
  playback: SequenceExportPlayback = { name: 'default', loop: true }
): string {
  sequenceExportManifest(info, info.width, info.height, playback);
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(folder)) throw new Error('导出目录名称无效。');
  return [
    'return {',
    '    name = "' + playback.name + '",',
    '    framePattern = "image/' + folder + '/frames/frame_%04d.png",',
    '    frameCount = ' + info.frames.length + ',',
    '    fps = ' + info.fps + ',',
    '    loop = ' + String(playback.loop) + ',',
    '    width = ' + info.frames[0].width + ',',
    '    height = ' + info.frames[0].height + ',',
    '}',
    '',
  ].join('\n');
}

export function sequenceExportInstructions(
  folder: string,
  mode: 'atlas' | 'frames',
  playback: SequenceExportPlayback
): string {
  const destination = 'assets/image/' + folder + '/';
  const lines = [
    '# Maker 序列帧动画',
    '',
    '将本目录完整放到项目的 ' + destination + '，保持目录名称不变。',
    'Lua 中引用资源时不带 assets/ 前缀。若移动或重命名目录，请同步修改接入代码中的路径。',
    '动画名：' +
      playback.name +
      '；播放方式：' +
      (playback.loop ? '循环播放' : '播放一次后停在末帧') +
      '。',
    '保留已保存的帧尺寸和透明边距，不裁边、不旋转、不缩放；四方向应使用一致的帧尺寸和对齐。',
    '',
  ];
  if (mode === 'atlas') {
    lines.push(
      '## 图集播放',
      '需要项目运行环境提供 urhox-libs/Sprite 和 UI.Sprite；旧环境缺少该组件时请使用 Maker 单图包。',
      '使用现有 UI 容器加入下面的 sprite，无需自行编写逐帧计时器。',
      '',
      '    local UI = require("urhox-libs/UI")',
      '    local sprite = UI.Sprite {',
      '        src = "image/' + folder + '/spritesheet.json",',
      '        defaultAnimation = "' + playback.name + '",',
      '    }',
      '',
      '多个方向各自保留一个目录，可通过 UI.Sprite 的 animations 映射注册多个图集。',
      '注册图集时名称应与各 JSON 的 animations[1].name 一致，使用 sprite:Play("left") 等切换。',
      '单个无方向动画默认名为 default；同一组件注册多个 default 动作时，请在各 JSON 中将动画 name 改成不同的动作名。',
      '不需要更改帧 key 或重新打包 PNG；这是 Maker SpriteSheet 读取格式，不是任意 JSON 播放器格式。'
    );
  } else {
    lines.push(
      '## 单图播放',
      'animation.lua 是动画数据配置，不是自动运行的播放器。复用游戏已有的逐张换图播放器。',
      '将 animation.lua 移到 scripts/animations/' +
        folder +
        '.lua；frames 目录继续保留在 ' +
        destination +
        '。',
      '读取配置：',
      '',
      '    local clip = require("animations.' + folder + '")',
      '    local firstFrame = string.format(clip.framePattern, 1)',
      '',
      '把 clip 接入现有动画目录；播放器按 fps 计时、frameCount 控制帧数、loop 控制循环。',
      '帧号从 1 开始，使用 string.format(clip.framePattern, frameIndex) 获取图片路径。',
      '也可用 clip.width/height 设置显示尺寸。首次播放前复用游戏现有资源预加载，避免图片尚未加载时出现空白。'
    );
  }
  return lines.join('\n') + '\n';
}

export async function createSequenceExport(
  sourceUrl: string,
  info: FrameSetInfo,
  mode: 'atlas' | 'frames',
  folder: string,
  progress?: (message: string) => void,
  playback: SequenceExportPlayback = { name: 'default', loop: true }
): Promise<Blob> {
  sequenceExportManifest(info, info.width, info.height, playback);
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(folder)) throw new Error('导出目录名称无效。');
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error('图集读取失败，未导出文件。');
  const source = await response.blob();
  if (source.size > 128 * 1024 * 1024) throw new Error('图集过大，无法导出。');
  const signature = new Uint8Array(await source.slice(0, 24).arrayBuffer());
  if (signature.length < 24) throw new Error('图集文件不完整，未导出文件。');
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => signature[index] !== value))
    throw new Error('图集不是有效的 PNG 文件，请重新保存后导出。');
  const header = new DataView(signature.buffer);
  sequenceExportManifest(info, header.getUint32(16), header.getUint32(20), playback);
  const bitmap = await createImageBitmap(source);
  try {
    const manifest = sequenceExportManifest(info, bitmap.width, bitmap.height, playback);
    const entries = [
      {
        name: folder + '/README.md',
        blob: new Blob([sequenceExportInstructions(folder, mode, playback)], {
          type: 'text/markdown;charset=utf-8',
        }),
      },
      {
        name: folder + (mode === 'atlas' ? '/spritesheet.json' : '/animation.lua'),
        blob: new Blob(
          [
            mode === 'atlas'
              ? JSON.stringify(manifest, null, 2)
              : sequenceExportLua(info, folder, playback),
          ],
          { type: mode === 'atlas' ? 'application/json' : 'text/plain;charset=utf-8' }
        ),
      },
    ];
    let totalBytes = entries.reduce((size, entry) => size + entry.blob.size, 0);
    if (mode === 'atlas') {
      entries.push({ name: folder + '/spritesheet.png', blob: source });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = info.frames[0].width;
      canvas.height = info.frames[0].height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建序列帧导出画布。');
      for (let index = 0; index < info.frames.length; index++) {
        const frame = info.frames[index];
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          bitmap,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          0,
          0,
          frame.width,
          frame.height
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value: Blob | null) =>
              value ? resolve(value) : reject(new Error('序列帧编码失败，未导出文件。')),
            'image/png'
          )
        );
        totalBytes += blob.size;
        if (totalBytes > 128 * 1024 * 1024)
          throw new Error('导出包超过 128 MiB，请减少帧数或尺寸后重试。');
        entries.push({
          name: folder + '/frames/frame_' + String(index + 1).padStart(4, '0') + '.png',
          blob,
        });
        if (index % 10 === 0 || index === info.frames.length - 1)
          progress?.('正在打包序列帧：' + (index + 1) + '/' + info.frames.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return await createCanvasZip(entries);
  } finally {
    bitmap.close();
  }
}
